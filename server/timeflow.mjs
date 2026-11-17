/**
 * Server-side protocol adapter, not an HTTP BFF or a browser reward source.
 * A production host must verify identity, persist actor/scope bindings and
 * commit gym state + settlement IDs atomically before enabling this adapter.
 */
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

const require = createRequire(import.meta.url);
// Use the supplied SDK's public package entry, never its private dist files.
const {ProtocolClient, FetchTransport, createHmacSigner, appliedDigest} = require(
  '../hupu-skills/skills/shaper-timeflow/sdk/typescript',
);
const activity = JSON.parse(readFileSync(new URL('../hupu-skills/activity.json', import.meta.url), 'utf8'));
export const timeflowApplicationId = activity.activityId;

function identifier(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_:-]{1,128}$/.test(value)) throw new Error(`Invalid ${label}`);
  return value;
}

function assertReport(value, settlementId) {
  if (!value || typeof value !== 'object' || value.settlementId !== settlementId
    || !Number.isSafeInteger(value.realDuration) || value.realDuration < 0
    || !Number.isSafeInteger(value.effectiveDuration) || value.effectiveDuration < 0
    || value.effectiveDuration > value.realDuration
    || !Number.isSafeInteger(value.definitionVersion) || value.definitionVersion < 1
    || !Array.isArray(value.segments) || !Array.isArray(value.events)
    || typeof value.replayed !== 'boolean' || typeof value.approximated !== 'boolean') {
    throw new Error('Incomplete Timeflow settlement report');
  }
  for (const field of ['gains', 'losses', 'capped', 'ruleVersions']) {
    if (!value[field] || typeof value[field] !== 'object' || Array.isArray(value[field])) {
      throw new Error('Incomplete Timeflow settlement report');
    }
  }
  for (const segment of value.segments) {
    if (!segment || !Number.isSafeInteger(segment.from) || !Number.isSafeInteger(segment.to)
      || segment.from < 0 || segment.to < segment.from) throw new Error('Invalid Timeflow segment');
  }
  return value;
}

/**
 * scope is supplied by the trusted BFF's persistent binding, never by a browser.
 * This object has no public generic call/path method and performs no retries.
 * applyOnce must atomically save game progress and the settlement ID, returning
 * 'applied' or 'replayed'. A browser/localStorage implementation is insufficient.
 */
export function createGymTimeflowProtocol({
  token = process.env.SHAPER_TOKEN,
  baseUrl = process.env.TIMEFLOW_BASE_URL ?? 'https://relay.hupu.com',
  scope, applyOnce, transport, now, requestIdFactory,
} = {}) {
  if (typeof window !== 'undefined') throw new Error('Timeflow credentials are server-only');
  if (typeof token !== 'string' || !token.trim()) throw new Error('Missing server SHAPER_TOKEN');
  if (!scope || scope.applicationId !== timeflowApplicationId || scope.workspaceId !== timeflowApplicationId
    || scope.state !== 'active' || !scope.environmentId) throw new Error('Missing active project scope binding');
  if (typeof applyOnce !== 'function') throw new Error('Missing atomic settlement consumer');
  const scopeType = identifier(scope.scopeType, 'scope type');
  const scopeId = identifier(scope.scopeId, 'scope ID');
  const origin = new URL(baseUrl);
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash
    || origin.username || origin.password) throw new Error('TIMEFLOW_BASE_URL must be an HTTPS origin');
  const client = new ProtocolClient({
    workspaceId: timeflowApplicationId, protocolVersion: 1, accessToken: token,
    signer: createHmacSigner(token), transport: transport ?? new FetchTransport(origin.origin),
    ...(now ? {now} : {}), ...(requestIdFactory ? {requestIdFactory} : {}),
  });
  const path = `/shaper/timeflow/v1/${scopeType}/${scopeId}`;
  const binding = Object.freeze({...scope});

  async function consume(report, expectedId) {
    assertReport(report, expectedId);
    // Persistence completes before ACK. The host owns its database transaction
    // and must enforce UNIQUE(workspace, scope, settlementId) in applyOnce.
    const committed = await applyOnce(binding, report);
    if (committed !== 'applied' && committed !== 'replayed') throw new Error('Settlement was not committed');
    await client.call(`/shaper/timeflow/v1/settlements/${expectedId}/ack`, {
      body: {settlementId: expectedId, appliedDigest: appliedDigest(report)}, idempotencyKey: expectedId,
    });
    return {status: 'applied', replayed: committed === 'replayed', report};
  }

  return Object.freeze({
    /** requestId must be allocated/persisted by the BFF before this call. */
    async settle({requestId, trigger = 'foreground'} = {}) {
      identifier(requestId, 'settlement request ID');
      if (!['login', 'foreground'].includes(trigger)) throw new Error('Unsupported gym settlement trigger');
      // No from/to/client time: the platform owns the settlement interval.
      const response = await client.call(`${path}/settlements`, {body: {trigger}, idempotencyKey: requestId});
      const report = response.data;
      if (!report || typeof report.settlementId !== 'string') throw new Error('Missing Timeflow settlement report');
      const settlementId = identifier(report.settlementId, 'settlement ID');
      return consume(report, settlementId);
    },
    /** The BFF must resolve this ID from its own pending ledger, not a URL body. */
    async resume({settlementId} = {}) {
      identifier(settlementId, 'settlement ID');
      const response = await client.call(`/shaper/timeflow/v1/settlements/${settlementId}`, {method: 'GET'});
      if (response.data === null) return {status: 'pending'};
      return consume(response.data, settlementId);
    },
  });
}
