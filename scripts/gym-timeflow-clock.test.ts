import {describe,it,expect,vi} from 'vitest';
import {createGymClock,extractGymClockInterval,gymClockMaxOfflineMs,gymClockStreamKey} from '../server/gymTimeflowClock.mjs';

const binding={applicationId:'app_847cdb589a',workspaceId:'app_847cdb589a',environmentId:'test',scopeType:'gym',scopeId:'1001',state:'active'};
const report=(patch:Record<string,unknown>={})=>({settlementId:'settlement-1',realDuration:60_000,effectiveDuration:60_000,
  segments:[{from:100_000,to:160_000,streamKey:gymClockStreamKey,metricId:'elapsed_ms',phaseIndex:0,rate:'1',produced:'60000',capped:'0',netChange:'60000',valueStart:'0',valueEnd:'60000'}],
  gains:{elapsed_ms:'60000'},losses:{},capped:{},events:[],ruleVersions:{gym_clock_ms:1},definitionVersion:1,replayed:false,approximated:false,...patch});
function fixture(responses:unknown[]=[report()]) {
  const requests:any[]=[];
  const transport={send:vi.fn(async(request:any)=>{requests.push(request);const value=responses.shift();if(value instanceof Error)throw value;return{status:200,headers:{},body:JSON.stringify({ok:true,data:value})};})};
  const sleep=vi.fn(async()=>{});
  const options={binding,token:'unit-test-secret',transport,sleep,now:()=>1_793_260_800_000};
  return{clock:createGymClock(options),transport,requests,sleep,options};
}

describe('single authoritative Timeflow clock',()=>{
  it.each([true,false])('retains a documented in-flight handle and retry decision (%s) without another POST',async retryable=>{
    const call=vi.fn().mockRejectedValueOnce(Object.assign(Error('in-flight'),{code:'SETTLE_IN_PROGRESS',retryable,retryAfterMs:1700,details:{settlementId:'settlement-1'}})).mockResolvedValueOnce({ok:true,data:report()});
    const clock=createGymClock({binding,client:{call}});
    expect(await clock.settle({requestId:'inflight'})).toEqual({status:'pending',settlementId:'settlement-1',pollAfterMs:1700,retryable});
    const ready=await clock.resume({settlementId:'settlement-1'});expect(ready.status).toBe('ready');
    expect(call.mock.calls.map(args=>[args[0],args[1].method??'POST'])).toEqual([['/shaper/timeflow/v1/gym/1001/settlements','POST'],['/shaper/timeflow/v1/settlements/settlement-1','GET']]);
  });
  it('registers numeric scope then initializes the one clock with stable signed request keys',async()=>{
    const test=fixture([{}, {}, {}, {}]);
    expect(await test.clock.ensure({requestId:'initialize-1',initializedAt:100_000})).toEqual({streamKey:'clock:main',scopeRegistered:true,streamInitialized:true});
    await test.clock.ensure({requestId:'initialize-1',initializedAt:100_000});
    expect(test.requests.map(r=>r.path)).toEqual(['/shaper/timeflow/v1/scopes/register','/shaper/timeflow/v1/gym/1001/stream','/shaper/timeflow/v1/scopes/register','/shaper/timeflow/v1/gym/1001/stream']);
    const first=JSON.parse(test.requests[1].body);
    expect(first).toMatchObject({streamKey:'clock:main',value:'0',rate:'1',capacity:null,expectedVersion:0});
    expect(first).not.toHaveProperty('initializedAt');
    expect(first.requestId).toBe(test.requests[1].headers['X-Idempotency-Key']);
    expect(test.requests[1].body).toBe(test.requests[3].body);
    expect(test.requests[0].headers['X-Shaper-Token']).toBe('unit-test-secret');
  });
  it('retrieves without applying or ACKing, leaving commit and ACK to the owner',async()=>{
    const test=fixture([report(),{}]);
    const ready=await test.clock.settle({requestId:'settle-1',from:0,to:9e14,path:'/definitions'});
    expect(ready).toEqual({status:'ready',settlementId:'settlement-1',report:report()});
    expect(test.requests).toHaveLength(1);expect(JSON.parse(test.requests[0].body)).toEqual({trigger:'foreground'});
    await test.clock.ack(ready.report);
    expect(test.requests[1].path).toBe('/shaper/timeflow/v1/settlements/settlement-1/ack');
    expect(JSON.parse(test.requests[1].body).appliedDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
  it('takes full real time only from the previous platform cursor, allowing either capped prefix or suffix',()=>{
    const prefix=report({realDuration:90_000,cappedByTime:true});
    expect(()=>extractGymClockInterval(prefix,'clock:main')).toThrow('previous platform cursor');
    expect(extractGymClockInterval(prefix,'clock:main',100_000)).toEqual({from:100_000,to:190_000,effectiveFrom:100_000,effectiveTo:160_000,realDuration:90_000,effectiveDuration:60_000,streamKey:'clock:main'});
    const suffix=report({realDuration:90_000,cappedByTime:true,segments:[{...prefix.segments[0],from:130_000,to:190_000}]});
    expect(extractGymClockInterval(suffix,'clock:main',100_000)).toEqual({...extractGymClockInterval(prefix,'clock:main',100_000),effectiveFrom:130_000,effectiveTo:190_000});
    expect(()=>extractGymClockInterval(suffix,'clock:main',90_000)).toThrow('outside');
  });
  it('reconciles several contiguous segments and cumulative values',()=>{
    const base=report();base.segments=[{...base.segments[0],to:120_000,produced:'20000',netChange:'20000',valueEnd:'20000'},
      {...base.segments[0],from:120_000,produced:'40000',netChange:'40000',valueStart:'20000'}];
    expect(extractGymClockInterval(base).to).toBe(160_000);
  });
  it('accepts live precision-zero JSON numbers without coercing unsafe or fractional values',()=>{
    const live=report({gains:{elapsed_ms:60_000}});
    live.segments=[{...live.segments[0],rate:1,produced:60_000,capped:0,netChange:60_000,valueStart:0,valueEnd:60_000} as any];
    expect(extractGymClockInterval(live,'clock:main',100_000)).toMatchObject({from:100_000,to:160_000,effectiveDuration:60_000});
    for(const invalid of [0.5,-1,Number.MAX_SAFE_INTEGER+1,NaN,Infinity]){
      expect(()=>extractGymClockInterval({...live,gains:{elapsed_ms:invalid}},'clock:main',100_000)).toThrow();
    }
  });
  it('uses a live first-report initialization gap only to establish a baseline, never as a training budget',async()=>{
    const first=report({realDuration:90,effectiveDuration:90,gains:{elapsed_ms:35},segments:[{from:100_000,to:100_090,streamKey:'clock:main',metricId:'elapsed_ms',phaseIndex:0,rate:1,produced:35,capped:0,netChange:35,valueStart:0,valueEnd:35}]});
    expect(extractGymClockInterval(first)).toEqual({from:100_000,to:100_090,effectiveFrom:100_000,effectiveTo:100_090,realDuration:90,effectiveDuration:0,streamKey:'clock:main',baselineOnly:true});
    expect(()=>extractGymClockInterval(first,'clock:main',100_000)).toThrow('gain does not match');
    const test=fixture([first,{}]);const ready=await test.clock.settle({requestId:'baseline-live'});
    expect(ready.status).toBe('ready');await test.clock.ack(ready.report);expect(test.requests).toHaveLength(2);
  });
  it('retains a zero receipt without inventing an absolute timestamp, and permits its ACK',async()=>{
    const zero=report({realDuration:0,effectiveDuration:0,segments:[],gains:{},ruleVersions:{}});
    expect(extractGymClockInterval(zero)).toBeNull();
    const test=fixture([zero,{}]);expect((await test.clock.settle({requestId:'baseline-1'})).status).toBe('ready');
    await test.clock.ack(zero);expect(test.requests).toHaveLength(2);
  });
  it('does not accept nonzero net changes hidden in a zero receipt',()=>{
    expect(()=>extractGymClockInterval(report({realDuration:0,effectiveDuration:0,segments:[],gains:{},netChange:{elapsed_ms:'9'}}))).toThrow();
  });
  it.each([
    {segments:[]},{approximated:true},{clockRegression:true},{gains:{elapsed_ms:'59999'}},{gains:{elapsed_ms:'60000',xp:'1'}},
    {losses:{elapsed_ms:'1'}},{capped:{elapsed_ms:'1'}},{events:[{kind:'reset'}]},
    {definitionVersion:2},{ruleVersions:{gym_clock_ms:2}},{netChange:{elapsed_ms:'0'}},
  ])('rejects malformed, modified, approximated, or unrelated reports %j',patch=>{
    expect(()=>extractGymClockInterval(report(patch))).toThrow();
  });
  it.each([
    {streamKey:'clock:other'},{metricId:'xp'},{phaseIndex:1},{rate:'2'},{produced:'1'},{netChange:'1'},
    {capped:'1'},{valueStart:'1'},{valueEnd:undefined},{from:160_000,to:100_000},
  ])('rejects a clock segment that does not reconcile %j',patch=>{
    const base=report();base.segments=[{...base.segments[0],...patch}];expect(()=>extractGymClockInterval(base)).toThrow();
  });
  it('rejects duplicated overlapping clock streams instead of double-counting duration',()=>{
    const base=report();base.segments.push({...base.segments[0]});expect(()=>extractGymClockInterval(base)).toThrow('overlap');
  });
  it('refuses time above its configured cap and unsafe absolute boundaries',()=>{
    expect(()=>extractGymClockInterval(report({effectiveDuration:gymClockMaxOfflineMs+1,realDuration:gymClockMaxOfflineMs+1}))).toThrow();
    const base=report();base.segments=[{...base.segments[0],from:Number.MAX_SAFE_INTEGER-60_000,to:Number.MAX_SAFE_INTEGER}];
    expect(()=>extractGymClockInterval({...base,realDuration:60_001},'clock:main',Number.MAX_SAFE_INTEGER-60_000)).toThrow('boundary');
  });
  it('submits an async receipt then polls only the explicit documented report route',async()=>{
    const test=fixture([{async:true,settlementId:'settlement-1'},null,report()]);
    expect(await test.clock.settle({requestId:'long-1',async:true})).toEqual({status:'pending',settlementId:'settlement-1',pollAfterMs:250});
    expect(await test.clock.resume({settlementId:'settlement-1',async:true,maxPolls:1})).toMatchObject({status:'ready'});
    expect(test.requests.map(r=>r.path)).toEqual(['/shaper/timeflow/v1/gym/1001/settlements/async','/shaper/timeflow/v1/settlements/async/settlement-1','/shaper/timeflow/v1/settlements/async/settlement-1']);
    expect(test.sleep).toHaveBeenCalledOnce();
  });
  it('accepts the live async endpoint inline-completion DTO only with a complete matching report',async()=>{
    const test=fixture([{accepted:true,async:false,settlementId:'settlement-1',report:report()}]);
    expect(await test.clock.settle({requestId:'short-async',async:true})).toMatchObject({status:'ready',settlementId:'settlement-1'});
    const unaccepted=fixture([{accepted:false,async:false,settlementId:'settlement-1',report:report()}]);
    await expect(unaccepted.clock.settle({requestId:'short-async',async:true})).rejects.toThrow('Invalid asynchronous');
    const mismatched=fixture([{accepted:true,async:false,settlementId:'settlement-1',report:report({settlementId:'other'})}]);
    await expect(mismatched.clock.settle({requestId:'short-async',async:true})).rejects.toThrow('Unexpected clock');
  });
  it('bounds null-result polling and never turns pending into a zero reward',async()=>{
    const test=fixture([null,null,null]);expect(await test.clock.resume({settlementId:'settlement-1',maxPolls:2})).toEqual({status:'pending',settlementId:'settlement-1',pollAfterMs:250});
    expect(test.requests).toHaveLength(3);expect(test.requests.every(r=>r.method==='GET')).toBe(true);
  });
  it('rejects a wrong resumed receipt and never retries a transport failure',async()=>{
    const wrong=fixture([report({settlementId:'other'})]);await expect(wrong.clock.resume({settlementId:'settlement-1'})).rejects.toThrow();
    const failed=fixture([new Error('offline')]);await expect(failed.clock.resume({settlementId:'settlement-1',maxPolls:2})).rejects.toThrow('offline');expect(failed.requests).toHaveLength(1);
  });
  it('rejects unknown scope, request IDs, and policies before network use',async()=>{
    const test=fixture();for(const bad of ['gym-test-1','../other','00','18446744073709551616'])expect(()=>createGymClock({...test.options,binding:{...binding,scopeId:bad}})).toThrow();
    expect(()=>createGymClock({...test.options,binding:{...binding,applicationId:'another'}})).toThrow();
    await expect(test.clock.ensure({requestId:'x',initializedAt:-1})).rejects.toThrow();
    await expect(test.clock.settle({requestId:'../evil'})).rejects.toThrow();
    await expect(test.clock.resume({settlementId:'x',maxPolls:21})).rejects.toThrow();
    expect(test.requests).toHaveLength(0);
  });
  it('rejects successful HTTP JSON that omits the public protocol ok field',async()=>{
    const transport={send:vi.fn(async()=>({status:200,headers:{},body:JSON.stringify({data:report()})}))};
    const clock=createGymClock({binding,token:'unit-test-secret',transport});await expect(clock.settle({requestId:'settle-1'})).rejects.toThrow('Malformed');
  });
});
