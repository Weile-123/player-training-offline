/** Timeflow supplies signed, authoritative intervals; Gym remains a business rule consumer. */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {assertGymTimeflowReport, createGymTimeflowUpstream, gymTimeflowAppliedDigest, timeflowApplicationId} from './timeflow.mjs';

const definition = JSON.parse(readFileSync(new URL('../activity/timeflow.definition.json', import.meta.url), 'utf8'));
export const gymClockStreamKey = 'clock:main';
export const gymClockMetricId = 'elapsed_ms';
export const gymClockRuleKey = 'gym_clock_ms';
export const gymClockDefinitionVersion = definition.definitionVersion;
export const gymClockMaxOfflineMs = definition.maxOfflineTime;
const maximumScope = 18_446_744_073_709_551_615n;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function requestKey(value, label = 'request ID') {
  // ReceiptRequest, which consumes settlementId, limits it to 64 characters.
  const pattern=/^[A-Za-z0-9_:-]{1,64}$/;
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(`Invalid ${label}`);
  return value;
}
function derivedKey(requestId, purpose) {
  return `gym-${purpose}-${createHash('sha256').update(requestKey(requestId)).digest('hex').slice(0,40)}`;
}
function unsignedInteger(value, label) {
  // The live platform emits JSON numbers for precision:0 metrics; the public
  // SDK and replay fixtures also use decimal strings. Never coerce a float or
  // a number which JSON has already rounded beyond the safe integer range.
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${label}`);
    return BigInt(value);
  }
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)(?:\.0{1,6})?$/.test(value)) throw new Error(`Invalid ${label}`);
  return BigInt(value.split('.')[0]);
}
function checkZeroMap(value, label) {
  if (!object(value)) throw new Error(`Invalid ${label}`);
  for (const [metric, amount] of Object.entries(value)) {
    if (metric !== gymClockMetricId || unsignedInteger(amount, label) !== 0n) throw new Error(`Unexpected ${label}`);
  }
}
function safeEnd(from, duration) {
  const result = from + duration;
  if (!Number.isSafeInteger(result) || result < from) throw new Error('Invalid authoritative clock boundary');
  return result;
}

/**
 * No Date.now fallback: a report without an unambiguous platform anchor is not
 * enough to issue a reward. The owner must preserve its prior pending request.
 */
function validateClockReport(report, expectedStreamKey = gymClockStreamKey) {
  requestKey(report?.settlementId, 'settlement ID');
  if (typeof expectedStreamKey !== 'string' || !/^clock:[A-Za-z0-9_-]{1,64}$/.test(expectedStreamKey)) throw new Error('Invalid clock stream');
  assertGymTimeflowReport(report, report.settlementId);
  if (report.approximated || report.clockRegression === true) throw new Error('Clock report is approximated or regressed');
  const unanchoredZero=report.realDuration===0&&report.effectiveDuration===0&&report.segments.length===0;
  if (report.definitionVersion !== gymClockDefinitionVersion
    || report.ruleVersions[gymClockRuleKey] !== 1 && !(unanchoredZero&&Object.keys(report.ruleVersions).length===0)
    || Object.keys(report.ruleVersions).some(key => key !== gymClockRuleKey)) throw new Error('Unexpected clock rule version');
  if (report.events.length) throw new Error('Clock report contains unexpected point events');
  if (report.effectiveDuration > gymClockMaxOfflineMs) throw new Error('Clock report exceeds configured time cap');
  if (report.cappedByTime !== undefined && typeof report.cappedByTime !== 'boolean') throw new Error('Invalid clock time cap flag');
  if (report.cappedByTime !== undefined && report.cappedByTime !== (report.realDuration>report.effectiveDuration)) throw new Error('Clock time cap flag does not reconcile');
  checkZeroMap(report.losses, 'clock losses');checkZeroMap(report.capped, 'clock capacity cap');
  const keys = Object.keys(report.gains);
  if (keys.some(key => key !== gymClockMetricId)) throw new Error('Clock report contains another metric');
  const gained = own(report.gains, gymClockMetricId) ? unsignedInteger(report.gains[gymClockMetricId], 'clock gain') : 0n;
  if (gained > BigInt(report.effectiveDuration)) throw new Error('Clock gain exceeds effective duration');
  if (report.netChange !== undefined && (!object(report.netChange)
    || Object.keys(report.netChange).some(key => key !== gymClockMetricId)
    || unsignedInteger(report.netChange[gymClockMetricId] ?? '0', 'clock net change') !== gained)) throw new Error('Clock aggregate values do not reconcile');
  // A truly zero-duration receipt may contain no segment and thus no absolute
  // timestamp. It can be ACKed, but cannot establish a new business cursor.
  if (!report.segments.length) {
    if (report.realDuration===0 && report.effectiveDuration===0) return null;
    throw new Error('Clock report has no authoritative interval');
  }
  let from = null, cursor = null, duration = 0, producedTotal = 0n, previousValueEnd = null;
  for (const segment of report.segments) {
    if (segment.streamKey !== expectedStreamKey || segment.metricId !== gymClockMetricId || segment.phaseIndex !== 0) throw new Error('Clock report contains an unexpected stream');
    if (segment.from < 0 || segment.to < segment.from) throw new Error('Invalid clock segment');
    if (from === null) {from = segment.from;cursor = segment.from;}
    if (segment.from !== cursor) throw new Error('Clock segments overlap or contain a gap');
    const length = segment.to - segment.from;
    duration += length;if (!Number.isSafeInteger(duration)) throw new Error('Invalid clock duration');
    cursor = segment.to;
    if (segment.rate !== undefined && unsignedInteger(segment.rate, 'clock rate') !== 1n) throw new Error('Unexpected clock rate');
    if (segment.modifiers !== undefined && !object(segment.modifiers)) throw new Error('Invalid clock modifier metadata');
    const produced=segment.produced !== undefined ? unsignedInteger(segment.produced,'clock produced')
      : segment.netChange !== undefined ? unsignedInteger(segment.netChange,'clock change')
      : segment.valueStart !== undefined && segment.valueEnd !== undefined ? unsignedInteger(segment.valueEnd,'clock end value')-unsignedInteger(segment.valueStart,'clock start value') : BigInt(length);
    if (produced < 0n || produced > BigInt(length)) throw new Error('Clock production does not match segment');
    producedTotal+=produced;
    if (segment.netChange !== undefined && unsignedInteger(segment.netChange, 'clock change') !== produced) throw new Error('Clock change does not match segment');
    if (segment.capped !== undefined && unsignedInteger(segment.capped, 'clock cap') !== 0n) throw new Error('Unexpected clock segment cap');
    if (own(segment,'valueStart') !== own(segment,'valueEnd')) throw new Error('Incomplete clock value boundaries');
    if (segment.valueStart !== undefined) {
      const start=unsignedInteger(segment.valueStart,'clock start value'),end=unsignedInteger(segment.valueEnd,'clock end value');
      if (end-start !== produced || previousValueEnd !== null && previousValueEnd !== start) throw new Error('Clock segment values do not reconcile');
      previousValueEnd=end;
    }
  }
  if (duration !== report.effectiveDuration) throw new Error('Clock segments do not match effective duration');
  if (producedTotal !== gained) throw new Error('Clock production does not match gain');
  return {segmentFrom:from,segmentTo:cursor,realDuration:report.realDuration,effectiveDuration:report.effectiveDuration,initializationGap:gained!==BigInt(report.effectiveDuration)};
}

/** A capped report needs the previously committed platform cursor, never a guessed prefix. */
export function extractGymClockInterval(report, expectedStreamKey = gymClockStreamKey, expectedFrom) {
  const checked=validateClockReport(report,expectedStreamKey);
  if(checked===null)return null;
  if(expectedFrom!==undefined&&(!Number.isSafeInteger(expectedFrom)||expectedFrom<0))throw new Error('Invalid previous platform cursor');
  const capped=checked.realDuration>checked.effectiveDuration;
  if(capped&&expectedFrom===undefined)throw new Error('Capped clock report requires previous platform cursor');
  // Scope creation precedes the first clock stream upsert. The live platform's
  // first report spans that full interval but only produces after the upsert.
  // It may establish a first anchor and earns nothing. Once a business cursor
  // exists, every millisecond must be present in the clock's gains.
  if(checked.initializationGap&&expectedFrom!==undefined)throw new Error('Clock gain does not match effective duration');
  const from=expectedFrom??checked.segmentFrom,to=safeEnd(from,checked.realDuration);
  if(checked.segmentFrom<from||checked.segmentTo>to)throw new Error('Clock segments are outside the authoritative interval');
  if(!capped&&(checked.segmentFrom!==from||checked.segmentTo!==to))throw new Error('Clock interval does not match previous platform cursor');
  return Object.freeze({from, to, effectiveFrom:checked.segmentFrom,effectiveTo:checked.segmentTo, realDuration: report.realDuration,
    effectiveDuration: checked.initializationGap?0:report.effectiveDuration,streamKey: expectedStreamKey,...(checked.initializationGap?{baselineOnly:true}:{})});
}

/**
 * Recover a lost POST response without replaying its non-idempotent POST or
 * inventing the missing report. Both endpoints of this business catch-up are
 * platform timestamps: our last durable cursor and a new, complete report's
 * end. This is valid only for this immutable, continuous rate-one clock.
 * A capped/empty report cannot prove its absolute end after a lost response;
 * persist and ACK that checkpoint, then obtain a fresh uncapped anchor.
 */
export function extractGymRecoveryClockInterval(report, expectedStreamKey = gymClockStreamKey, expectedFrom) {
  const checked = validateClockReport(report, expectedStreamKey);
  if (!Number.isSafeInteger(expectedFrom) || expectedFrom < 0) throw new Error('Missing durable recovery cursor');
  if (!checked || checked.realDuration > checked.effectiveDuration) return null;
  if (checked.initializationGap || checked.segmentFrom < expectedFrom || checked.segmentTo < expectedFrom) throw new Error('Invalid recovery clock anchor');
  const duration = checked.segmentTo - expectedFrom;
  return Object.freeze({from: expectedFrom, to: checked.segmentTo, effectiveFrom: expectedFrom,
    effectiveTo: checked.segmentTo, realDuration: duration, effectiveDuration: duration,
    streamKey: expectedStreamKey, recoveredGapMs: checked.segmentFrom - expectedFrom});
}

/** Trusted application code supplies this binding from its persistent repository. */
export function createGymClock({binding, expectedWorkspaceId = timeflowApplicationId, token,
  baseUrl, transport, now, requestIdFactory, timeoutMs, client,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms))} = {}) {
  if (typeof window !== 'undefined') throw new Error('Timeflow credentials are server-only');
  if (!binding || binding.applicationId !== timeflowApplicationId || binding.workspaceId !== expectedWorkspaceId
    || !binding.environmentId || binding.state !== 'active' || binding.scopeType !== 'gym'
    || typeof binding.scopeId !== 'string' || !/^(0|[1-9]\d{0,19})$/.test(binding.scopeId)
    || BigInt(binding.scopeId) > maximumScope) throw new Error('Missing active numeric project scope binding');
  const service = client ?? createGymTimeflowUpstream({token,baseUrl,workspaceId:expectedWorkspaceId,transport,now,requestIdFactory,timeoutMs});
  if (typeof service.call !== 'function') throw new Error('Invalid Timeflow protocol client');
  const call=async(path,options)=>{const response=await service.call(path,options);if(response?.ok!==true)throw new Error('Unacknowledged Timeflow protocol response');return response;};
  const scopePath = `/shaper/timeflow/v1/gym/${binding.scopeId}`;
  const streamKey = gymClockStreamKey;
  const displayName = binding.displayName ?? `传奇球馆玩家 ${binding.scopeId}`;
  if (typeof displayName !== 'string' || !displayName.trim() || displayName.length > 128 || /[\u0000-\u001f\u007f]/.test(displayName) || !/\p{L}/u.test(displayName)) throw new Error('Invalid scope display name');
  const validateReady = (report, settlementId) => {
    if (report?.settlementId !== settlementId) throw new Error('Unexpected clock settlement report');
    validateClockReport(report, streamKey);
    return {status:'ready',settlementId,report};
  };
  return Object.freeze({streamKey,
    async ensure({requestId,initializedAt} = {}) {
      requestKey(requestId);if (initializedAt !== undefined && (!Number.isSafeInteger(initializedAt) || initializedAt < 0)) throw new Error('Invalid server initialization time');
      const scopeRequest = derivedKey(requestId,'scope');
      await call('/shaper/timeflow/v1/scopes/register',{body:{scopeType:'gym',scopeId:binding.scopeId,displayName,requestId:scopeRequest},idempotencyKey:scopeRequest});
      const streamRequest = derivedKey(requestId,'stream');
      await call(`${scopePath}/stream`,{body:{streamKey,displayName:'球馆权威时钟',value:'0',rate:'1',phaseIndex:0,capacity:null,expectedVersion:0,requestId:streamRequest},idempotencyKey:streamRequest});
      return {streamKey,scopeRegistered:true,streamInitialized:true};
    },
    async settle({requestId,trigger='foreground',async:asynchronous=false} = {}) {
      requestKey(requestId);if (!['login','foreground'].includes(trigger)) throw new Error('Unsupported gym settlement trigger');
      if (typeof asynchronous !== 'boolean') throw new Error('Invalid asynchronous flag');
      let response;
      try{response=await call(`${scopePath}/settlements${asynchronous?'/async':''}`,{body:{trigger},idempotencyKey:requestId});}
      catch(error){
        // The documented in-flight ID is a recoverable handle, not a reason
        // to issue another settlement. Retain the platform retry decision.
        if(error?.code==='SETTLE_IN_PROGRESS'&&typeof error.details?.settlementId==='string'){
          requestKey(error.details.settlementId,'settlement ID');
          return{status:'pending',settlementId:error.details.settlementId,pollAfterMs:Math.max(250,Math.min(30000,error.retryAfterMs??1000)),retryable:error.retryable===true};
        }
        throw error;
      }
      const data=response.data;
      if (asynchronous) {
        requestKey(data?.settlementId,'settlement ID');
        // Live async endpoint completes short intervals inline. Only its
        // explicit accepted + async:false DTO may carry an immediate report.
        if (data.async === false && data.accepted === true && object(data.report)) return validateReady(data.report,data.settlementId);
        if (data.async !== true) throw new Error('Invalid asynchronous settlement receipt');
        // The public contract guarantees async + settlementId, not a named
        // embedded-report DTO. Retrieve its complete report through GET.
        return {status:'pending',settlementId:data.settlementId,pollAfterMs:250};
      }
      requestKey(data?.settlementId,'settlement ID');return validateReady(data,data.settlementId);
    },
    async resume({settlementId,async:asynchronous=false,maxPolls=0,pollIntervalMs=250} = {}) {
      requestKey(settlementId,'settlement ID');
      if (typeof asynchronous !== 'boolean' || !Number.isSafeInteger(maxPolls) || maxPolls < 0 || maxPolls > 20
        || !Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1 || pollIntervalMs > 1000) throw new Error('Invalid bounded polling policy');
      const deadline=performance.now()+5000;
      for (let attempt=0;attempt<=maxPolls;attempt++) {
        const remaining=Math.floor(deadline-performance.now());
        if (remaining<1) return {status:'pending',settlementId,pollAfterMs:pollIntervalMs};
        const response=await call(`/shaper/timeflow/v1/settlements/${asynchronous?'async/':''}${settlementId}`,{method:'GET',timeoutMs:Math.min(remaining,timeoutMs??10_000)});
        const data=response.data;
        if (data !== null) return validateReady(data,settlementId);
        if (attempt===maxPolls) return {status:'pending',settlementId,pollAfterMs:pollIntervalMs};
        await sleep(pollIntervalMs);
      }
    },
    async ack(report) {
      validateClockReport(report,streamKey);
      const response=await call(`/shaper/timeflow/v1/settlements/${report.settlementId}/ack`,{
        body:{settlementId:report.settlementId,appliedDigest:await gymTimeflowAppliedDigest(report)},
        idempotencyKey:report.settlementId,
      });
      return {acknowledged:true,replayed:response.replayed===true};
    },
  });
}
