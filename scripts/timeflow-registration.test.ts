import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {provisionGymTimeflow,readGymReplayEvidence,resolveGymShaperCredential} from './timeflow-register.mjs';
const cases=['1h','1d','30d','window','segment-equivalence','receipt-replay'];
const validation=()=>({passed:true,scenarios:cases.map(name=>({name,passed:true}))});
const definition=JSON.parse(readFileSync('activity/timeflow.definition.json','utf8'));
function fixture(overrides:any={}){
  const calls:any[]=[];const evidence:any[]=[];
  const client={call:vi.fn(async(path:string,options:any)=>{calls.push({path,options});return{ok:true,data:path.endsWith('/validate')?validation():{},replayed:false};})};
  const options={token:'unit-test-secret',client,definition,writeEvidence:vi.fn(async(_file:string,value:any)=>evidence.push(structuredClone(value))),...overrides};
  return{options,calls,evidence,client};
}
describe('trusted Timeflow provisioning',()=>{
  it('uses real protocol route sequence and requires all six cases before activation',async()=>{
    const test=fixture();const result=await provisionGymTimeflow(test.options);
    expect(test.calls.map(r=>r.path)).toEqual(['/shaper/timeflow/v1/workspaces','/shaper/timeflow/v1/scope-types','/shaper/timeflow/v1/definitions','/shaper/timeflow/v1/definitions/1/validate','/shaper/timeflow/v1/definitions/1/activate']);
    expect(result.activated).toBe(true);expect(result.verifiedByPlatform).toBe(false);expect(result.source).toBe('injected-test-transport');
    expect(result.validation).toEqual(cases.map(scenario=>({scenario,passed:true})));
    for(const call of test.calls.slice(0,2))expect(call.options.body.requestId).toBe(call.options.idempotencyKey);
    expect(JSON.stringify(test.evidence)).not.toContain('unit-test-secret');
    expect(test.calls[2].options.body).toEqual(definition);
  });
  it.each([{}, {passed:false}, {passed:true}, {passed:true,scenarios:cases.slice(1).map(name=>({name,passed:true}))},
    {passed:true,scenarios:cases.map(name=>({name,passed:name!=='window'}))}])('does not activate incomplete or failed validation %j',async value=>{
    const test=fixture();test.client.call.mockImplementation(async(path:string,options:any)=>{test.calls.push({path,options});return{ok:true,data:path.endsWith('/validate')?value:{},replayed:false};});
    await expect(provisionGymTimeflow(test.options)).rejects.toThrow();expect(test.calls.some(c=>c.path.endsWith('/activate'))).toBe(false);
    expect(test.evidence.at(-1).activated).toBe(false);
  });
  it('recognizes explicit passed case maps without inventing a response container DTO',()=>{
    const value={passed:true,result:Object.fromEntries(cases.map(name=>[name,{passed:true}]))};expect(readGymReplayEvidence(value)).toHaveLength(6);
    expect(()=>readGymReplayEvidence({passed:true,result:cases})).toThrow();
  });
  it('rejects conflicting case evidence and root failure even if another record passed',()=>{
    expect(()=>readGymReplayEvidence({...validation(),extra:{name:'1h',passed:false}})).toThrow();
    expect(()=>readGymReplayEvidence({...validation(),passed:false})).toThrow();
  });
  it('does not leak an upstream credential in failure evidence or error messages',async()=>{
    const test=fixture();test.client.call.mockRejectedValue(Object.assign(new Error('unit-test-secret'),{code:'unit-test-secret'}));
    await expect(provisionGymTimeflow(test.options)).rejects.toThrow('did not complete');expect(JSON.stringify(test.evidence)).not.toContain('unit-test-secret');
  });
  it('resolves only the documented environment/credential field and refuses deployment keys',async()=>{
    const read=vi.fn(async()=>JSON.stringify({apiKey:'unrelated-deploy-key',token:'another-deploy-key'}));
    await expect(resolveGymShaperCredential({env:{},read})).rejects.toMatchObject({code:'MISSING_SHAPER_TOKEN'});
    const direct=await resolveGymShaperCredential({env:{SHAPER_TOKEN:' unit-timeflow-token '},read});expect(direct.source).toBe('environment.SHAPER_TOKEN');
    const file=await resolveGymShaperCredential({env:{},read:async()=>JSON.stringify({shaperToken:'unit-timeflow-token'})});expect(file.source).toContain('shaperToken');
  });
  it('rejects a definition that could silently change gameplay or clock semantics',async()=>{
    const test=fixture({definition:{...definition,workspaceId:'other'}});await expect(provisionGymTimeflow(test.options)).rejects.toMatchObject({code:'INVALID_GYM_DEFINITION'});expect(test.calls).toHaveLength(0);
    const modified=structuredClone(definition);modified.stream[0].phases[0].baseRate='2';const changed=fixture({definition:modified});await expect(provisionGymTimeflow(changed.options)).rejects.toThrow();
  });
  it('limits evidence to project outputs and refuses a missing protocol acknowledgement',async()=>{
    const outside=fixture({outFile:'../credentials.json'});await expect(provisionGymTimeflow(outside.options)).rejects.toThrow('outputs');expect(outside.calls).toHaveLength(0);
    const invalid=fixture({client:{call:async()=>({data:{}})}});await expect(provisionGymTimeflow(invalid.options)).rejects.toThrow();
  });
});
