/**
 * TEST ONLY: two real localhost HTTP servers exercise client/BFF/SDK boundaries.
 * The second server is an explicit protocol fixture, not Hupu platform validate.
 */
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {createServer,type Server,type IncomingMessage,type ServerResponse} from 'node:http';
import {createHmac} from 'node:crypto';
import {mkdir,mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {createGymAuthorityStore,type GymAuthorityTransport} from '../src/platform/gymAuthority';
import {createGymStore} from '../src/gymStore';
import {dispatchGym,newGym,type GymAction,type GymState} from '../src/game/gym/engine';
import {offlineLimitMs,settleOfflineGym} from '../src/game/gym/offline';
import {gymSaveKeys,validGym,writeGym,type GymStorage} from '../src/game/gym/save';
import {createGymAuthorityService} from '../server/gymAuthorityService';
import {createFileGymAuthorityRepository,type AuthorityDocument} from '../server/gymAuthorityRepository';
import {createGymAuthorityHttpHandler} from '../server/gymAuthorityHttp';
import {createGymClock,gymClockMaxOfflineMs} from '../server/gymTimeflowClock.mjs';

const app='app_847cdb589a',token='test-only-timeflow-hmac-not-a-production-credential';
const gatewaySession='test-only-verified-gateway-session',gatewayActor={id:'normalized-fixture-user-a'};
const testRoot=resolve('.tmp/gym-authority-http-e2e');
let directory:string,servers:Server[]=[];
beforeEach(async()=>{await mkdir(testRoot,{recursive:true});directory=await mkdtemp(resolve(testRoot,'case-'));});
afterEach(async()=>{
 for(const server of servers.reverse())await new Promise<void>((done,reject)=>{server.close(error=>error?reject(error):done());server.closeAllConnections?.();});servers=[];
 if(!resolve(directory).startsWith(testRoot+sep))throw Error('Unsafe fixture path');await rm(directory,{recursive:true,force:true});
});
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const memory=():GymStorage=>{const data=new Map<string,string>();return{getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,value);}};};
const listen=async(handler:(request:IncomingMessage,response:ServerResponse)=>void|Promise<void>)=>{
 const server=createServer(handler);servers.push(server);await new Promise<void>((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
 return'http://127.0.0.1:'+(server.address() as {port:number}).port;
};

type ProtocolRequest={method:string;path:string;body:string;key:string;headers:IncomingMessage['headers']};
async function startProtocolFixture(){
 let time=1_800_000_000_000,sequence=0,dropAck=false,capStyle:'prefix'|'suffix'='prefix';
 const cursors=new Map<string,number>(),clockStarts=new Map<string,number>(),receipts=new Map<string,Record<string,unknown>>();
 const ledger=new Map<string,{body:string;data:unknown}>(),requests:ProtocolRequest[]=[],acknowledged=new Set<string>(),signatureFailures:string[]=[];
 const base=await listen(async(request,response)=>{
  const raw=await new Promise<string>((done,reject)=>{const chunks:Buffer[]=[];request.on('data',chunk=>chunks.push(Buffer.from(chunk)));request.on('end',()=>done(Buffer.concat(chunks).toString('utf8')));request.on('error',reject);});
  const path=request.url??'/',method=request.method??'GET',key=String(request.headers['x-idempotency-key']??'');
  const headers=request.headers,canonical=[method,path,String(headers['x-timestamp']??''),key,raw].join('\n');
  const signature=createHmac('sha256',token).update(canonical).digest('hex');
  const send=(status:number,data:unknown,replayed=false)=>{response.writeHead(status,{'Content-Type':'application/json'});response.end(JSON.stringify({ok:status===200,data,...(status!==200?{error:data}:{}),replayed,requestId:headers['x-request-id']}));};
  if(headers['x-shaper-token']!==token||headers['x-workspace-id']!==app||headers['x-protocol-version']!=='1'
   ||headers['x-signature']!==signature||!headers['x-request-id']||Math.abs(Number(headers['x-timestamp'])-time)>300_000){signatureFailures.push(path);send(403,{code:'SIGNATURE_INVALID',retryable:false});return;}
  let body:Record<string,unknown>={};try{body=raw?JSON.parse(raw):{};}catch{send(400,{code:'BODY_INVALID',retryable:false});return;}
  if(!object(body)||method!=='GET'&&!key){send(400,{code:'REQUEST_INVALID',retryable:false});return;}
  requests.push({method,path,body:raw,key,headers:{...headers}});
  // Live sync settle advances the cursor even when a caller repeats its key.
  // Only the documented stream/lifecycle/receipt writes use this replay cache.
  const settlementPost=method==='POST'&&/^\/shaper\/timeflow\/v1\/gym\/\d+\/settlements(?:\/async)?$/.test(path);
  const identity=method+':'+path+':'+key,prior=method==='GET'||settlementPost?null:ledger.get(identity);
  if(prior){if(prior.body!==raw){send(409,{code:'IDEMPOTENCY_KEY_MISMATCH',retryable:false});return;}send(200,prior.data,true);return;}
  let data:unknown={};
  if(path==='/shaper/timeflow/v1/scopes/register'&&method==='POST'){
   if(body.requestId!==key||body.scopeType!=='gym'||!/^\d{1,20}$/.test(String(body.scopeId))){send(400,{code:'SCOPE_INVALID',retryable:false});return;}
   data={scopeType:'gym',scopeId:body.scopeId,state:'active',replayed:false};
   if(!cursors.has(String(body.scopeId))){cursors.set(String(body.scopeId),time);time+=55;}
  }else if(/^\/shaper\/timeflow\/v1\/gym\/\d+\/stream$/.test(path)&&method==='POST'){
   if(body.requestId!==key||body.streamKey!=='clock:main'||body.value!=='0'||body.rate!=='1'||body.capacity!==null||body.expectedVersion!==0){send(400,{code:'STREAM_INVALID',retryable:false});return;}
   const scope=path.split('/')[5];if(clockStarts.has(scope)){send(409,{code:'VERSION_CONFLICT',retryable:false});return;}
   clockStarts.set(scope,time);time+=35; // Match live scope-before-stream initialization semantics.
   data={version:1};
  }else if(/^\/shaper\/timeflow\/v1\/gym\/\d+\/settlements$/.test(path)&&method==='POST'){
   if(Object.keys(body).some(name=>name!=='trigger')||!['foreground','login'].includes(String(body.trigger))){send(400,{code:'SETTLEMENT_INVALID',retryable:false});return;}
   const scope=path.split('/')[5],from=cursors.get(scope);if(from===undefined){send(404,{code:'SCOPE_UNKNOWN',retryable:false});return;}
   const duration=time-from,effective=Math.min(duration,gymClockMaxOfflineMs),start=capStyle==='prefix'?from:time-effective;
   const produced=Math.max(0,effective-Math.max(0,(clockStarts.get(scope)??from)-start));
   const report={settlementId:'fixture-report-'+(++sequence),realDuration:duration,effectiveDuration:effective,
    segments:effective?[{from:start,to:start+effective,streamKey:'clock:main',metricId:'elapsed_ms',phaseIndex:0,rate:1,produced,capped:0,netChange:produced}]:[],
    gains:effective?{elapsed_ms:produced}:{},losses:{},capped:{},events:[],ruleVersions:effective?{gym_clock_ms:1}:{},definitionVersion:1,replayed:false,approximated:false,cappedByTime:duration>effective};
   data=report;receipts.set(report.settlementId,report);cursors.set(scope,time);
  }else if(/^\/shaper\/timeflow\/v1\/settlements\/[^/]+\/ack$/.test(path)&&method==='POST'){
   const id=path.split('/')[5];if(body.settlementId!==id||key!==id||!receipts.has(id)||!/^sha256:[0-9a-f]{64}$/.test(String(body.appliedDigest))){send(400,{code:'RECEIPT_INVALID',retryable:false});return;}
   acknowledged.add(id);data={acknowledged:true};ledger.set(identity,{body:raw,data});
   if(dropAck){dropAck=false;response.destroy();return;}
  }else if(/^\/shaper\/timeflow\/v1\/settlements\/[^/]+$/.test(path)&&method==='GET'){
   data=receipts.get(path.split('/')[5])??null;
  }else{send(404,{code:'NOT_FOUND',retryable:false});return;}
  if(method!=='GET'&&!settlementPost)ledger.set(identity,{body:raw,data});send(200,data);
 });
 const transport={async send(request:{method:string;path:string;body?:string;headers:Record<string,string>}){
  const response=await fetch(base+request.path,{method:request.method,headers:request.headers,body:request.body,signal:AbortSignal.timeout(5000)});
  return{status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()};
 }};
 return{base,transport,requests,acknowledged,signatureFailures,ledger,get time(){return time;},advance(ms:number){time+=ms;},failNextAck(){dropAck=true;},setCapStyle(style:'prefix'|'suffix'){capStyle=style;}};
}

async function stack(initial?:GymState){
 const platform=await startProtocolFixture(),repository=createFileGymAuthorityRepository(directory);
 const service=createGymAuthorityService({repository,environmentId:'http-e2e-test',now:()=>3,randomSeed:()=>415,
  clockFactory:binding=>createGymClock({binding,token,transport:platform.transport,now:()=>platform.time})});
 const bff=await listen(createGymAuthorityHttpHandler({service,authenticate:async request=>request.headers['x-test-gateway-session']===gatewaySession?gatewayActor:null}));
 const storage=memory();if(initial)writeGym(storage,initial);
 let clientTime=initial?.updatedAt??20,serial=0;
 const local=createGymStore(storage,73,()=>clientTime);await local.getState().hydrate();
 const frontendRequests:{route:string;method:string;body?:Record<string,unknown>}[]=[],httpResponses:unknown[]=[];
 const request=async(route:string,method:'GET'|'POST',body?:Record<string,unknown>)=>{
  frontendRequests.push({route,method,body:body?structuredClone(body):undefined});
  const response=await fetch(bff+'/api/gym'+route,{method,headers:{'X-Test-Gateway-Session':gatewaySession,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(5000)});
  const value=await response.json();httpResponses.push(value);
  if(!response.ok)throw Object.assign(Error(value.message),{statusCode:response.status,code:value.code,retryable:value.retryable});
  return value.data;
 };
 const transport:GymAuthorityTransport={enabled:()=>true,account:async()=> 'display-puid-a',request};
 const remote=createGymAuthorityStore(local,storage,transport,{requestId:()=>`browser-${++serial}`,now:()=>clientTime,heartbeatMs:2000});
 return{platform,repository,service,bff,storage,local,remote,request,frontendRequests,httpResponses,clientTime(value:number){clientTime=value;}};
}
async function stored(){const name=(await readdir(directory)).find(name=>name.endsWith('.json'))!;return JSON.parse(await readFile(resolve(directory,name),'utf8')) as {document:AuthorityDocument};}
function legacy(){
 const at=1_700_000_000_000;let state=newGym(at,992);state.gymLevel=3;state.credits=120;
 for(let shot=0;shot<9;shot++)state=dispatchGym(state,state.revision,{type:'train',id:state.player!.id},at+shot*1000).state;
 state.inventory.chalk=1;state.projects.automation=1;state.player!.nextShotAt=state.updatedAt+1000;
 expect(validGym(state)).toBe(true);return state;
}
const act=async(test:Awaited<ReturnType<typeof stack>>,action:GymAction)=>{const result=await test.remote.getState().act(action);expect(result.error).toBeUndefined();return result;};

describe('TEST-ONLY full localhost Timeflow authority integration',()=>{
 it('starts through client + HTTP + signed SDK, persists the real gym and rejects reopening',async()=>{
  const test=await stack();await test.remote.getState().hydrate();expect(test.remote.getState().hasSave).toBe(false);
  const start=await test.remote.getState().start();expect(start.error).toBeUndefined();expect(start.state.createdAt).toBe(test.platform.time);expect(start.state.seed).toBe(415);
  expect(test.storage.getItem(gymSaveKeys.main)).toBeNull();expect((await stored()).document.provenance).toBe('server-created');
  const epoch=String(test.frontendRequests.find(r=>r.route==='/start')!.body!.epoch);
  await expect(test.request('/start','POST',{epoch,requestId:'raw-reopen'})).rejects.toMatchObject({code:'GYM_ALREADY_EXISTS'});
  const count=test.frontendRequests.length;expect((await test.remote.getState().start()).error).toContain('已在经营');expect(test.frontendRequests).toHaveLength(count);
  expect(test.platform.signatureFailures).toEqual([]);expect(test.platform.acknowledged.size).toBe(1);
  expect(JSON.stringify(test.httpResponses)).not.toMatch(/scopeId|workspaceId|actorId|X-Shaper|settlementId/);
 },20_000);

 it('preserves actual cooldown, course, RNG, attributes and chalk through adoption and capped offline replay',async()=>{
  const source=legacy(),test=await stack(source);await test.remote.getState().hydrate();const initial=structuredClone(test.remote.getState().state);
  expect(initial.player!.training.shots).toBe(9);expect(initial.rng).toEqual(source.rng);expect(initial.player!.nextShotAt-initial.updatedAt).toBe(1000);
  expect((await stored()).document.provenance).toBe('legacy-unverified');
  await act(test,{type:'use-consumable',id:'chalk',playerId:initial.player!.id});
  const early=await test.remote.getState().act({type:'train',id:initial.player!.id});expect(early.error).toBeTruthy();expect(early.state.player!.shots).toBe(initial.player!.shots);
  await act(test,{type:'set-auto',id:initial.player!.id,enabled:true});
  await test.remote.getState().suspend();const before=structuredClone(test.remote.getState().state);
  const expectedChalk=before.player!.greatShotsRemaining!;expect(expectedChalk).toBe(30);
  test.platform.advance(2*60*60*1000);test.clientTime(1); // A deliberately wrong browser clock must have no effect.
  const expected=settleOfflineGym(before,test.platform.time,offlineLimitMs(before));
  await test.remote.getState().retryAuthority!();const resumed=await test.remote.getState().resume();
  expect(resumed.error).toBeUndefined();expect(resumed.state).toEqual(expected.state);
  expect(test.remote.getState().pendingOfflineReport).toEqual(expected.report);expect(expected.report!.creditedMs).toBe(30*60*1000);
  expect(resumed.state.rng).toEqual(expected.state.rng);expect(resumed.state.player!.stats).toEqual(expected.state.player!.stats);
  expect(resumed.state.player!.training).toEqual(expected.state.player!.training);expect(resumed.state.player!.greatShotsRemaining??0).toBe(0);
  expect(test.local.getState().state.player!.shots).toBe(source.player!.shots);expect(test.platform.signatureFailures).toEqual([]);
  for(const req of test.frontendRequests.filter(r=>r.route!=='/adopt'))for(const key of Object.keys(req.body??{}))expect(['from','to','clientAt','puid','scopeId','workspaceId','seed','state','score']).not.toContain(key);
 },20_000);

 it('retries an ACK lost after platform acceptance without reapplying state or advancing RNG',async()=>{
  const test=await stack(legacy());await test.remote.getState().hydrate();const id=test.remote.getState().state.player!.id;
  await act(test,{type:'set-auto',id,enabled:true});await test.remote.getState().suspend();const before=structuredClone(test.remote.getState().state);
  test.platform.advance(60_000);test.clientTime(10_000);test.platform.failNextAck();
  const first=await test.remote.getState().resume();expect(first.error).toBeUndefined();expect(test.remote.getState().isSuspended).toBe(true);
  const expected=settleOfflineGym(before,test.platform.time,Math.min(offlineLimitMs(before),test.platform.time-before.updatedAt));expect(first.state).toEqual(expected.state);
  const afterWrite=await stored();expect(Object.values(afterWrite.document.settlements).some(r=>r.status==='applied')).toBe(true);
  const settlementCount=test.platform.requests.filter(r=>r.path.endsWith('/settlements')).length;
  await test.remote.getState().retryAuthority!();expect(test.remote.getState().state).toEqual(first.state);expect(test.remote.getState().state.rng).toEqual(first.state.rng);
  expect(test.platform.requests.filter(r=>r.path.endsWith('/settlements'))).toHaveLength(settlementCount);
  expect(Object.values((await stored()).document.settlements).every(r=>r.status==='acked')).toBe(true);
  const repeated=test.frontendRequests.filter(r=>r.route==='/resume');expect(repeated.at(-1)!.body).toEqual(repeated.at(-2)!.body);
 },20_000);

 it.each(['prefix','suffix'] as const)('does not assume %s platform cap placement when consuming the full authoritative interval',async style=>{
  const test=await stack(legacy());await test.remote.getState().hydrate();
  await act(test,{type:'set-auto',id:test.remote.getState().state.player!.id,enabled:true});
  await test.remote.getState().suspend();const before=structuredClone(test.remote.getState().state);
  test.platform.setCapStyle(style);test.platform.advance(35*24*60*60*1000);test.clientTime(99_000);
  const expected=settleOfflineGym(before,test.platform.time,offlineLimitMs(before));
  const received=await test.remote.getState().resume();expect(received.error).toBeUndefined();expect(received.state).toEqual(expected.state);
  expect(received.state.updatedAt-before.updatedAt).toBe(35*24*60*60*1000);
  expect(test.remote.getState().pendingOfflineReport?.creditedMs).toBe(30*60*1000);
 },20_000);

 it('rejects client identity/time/scope injection at the real BFF and invalid HMAC at the protocol boundary',async()=>{
  const test=await stack();await test.remote.getState().hydrate();await test.remote.getState().start();
  const state=test.remote.getState().state,epoch=String(test.frontendRequests.find(r=>r.route==='/start')!.body!.epoch);
  for(const injected of [{puid:'someone'},{scopeId:'1001'},{workspaceId:app},{from:0},{to:9e14},{clientAt:1}])await expect(test.request('/resume','POST',{epoch,requestId:'inject',expectedRevision:state.revision,...injected})).rejects.toMatchObject({code:'REQUEST_INVALID'});
  expect((await fetch(test.bff+'/api/gym/session')).status).toBe(401);
  expect((await fetch(test.bff+'/api/gym/session?puid=someone',{headers:{'X-Test-Gateway-Session':gatewaySession}})).status).toBe(400);
  const invalid=await fetch(test.platform.base+'/shaper/timeflow/v1/gym/1001/settlements',{method:'POST',headers:{'Content-Type':'application/json','X-Shaper-Token':token,'X-Workspace-Id':app,'X-Protocol-Version':'1','X-Request-Id':'invalid-signature','X-Timestamp':String(test.platform.time),'X-Idempotency-Key':'bad','X-Signature':'0'.repeat(64)},body:'{"trigger":"foreground"}'});
  expect(invalid.status).toBe(403);expect(test.platform.signatureFailures).toHaveLength(1);expect((await stored()).document.state).toEqual(state);
  const previous=test.platform.requests.find(request=>request.path.endsWith('/stream'))!;
  const changed=JSON.stringify({...JSON.parse(previous.body),value:'1'}),stamp=String(test.platform.time);
  const canonical=['POST',previous.path,stamp,previous.key,changed].join('\n');
  const mismatch=await fetch(test.platform.base+previous.path,{method:'POST',headers:{'Content-Type':'application/json','X-Shaper-Token':token,'X-Workspace-Id':app,'X-Protocol-Version':'1','X-Request-Id':'mismatch-logical-body','X-Timestamp':stamp,'X-Idempotency-Key':previous.key,'X-Signature':createHmac('sha256',token).update(canonical).digest('hex')},body:changed});
  expect(mismatch.status).toBe(409);expect((await mismatch.json()).error.code).toBe('IDEMPOTENCY_KEY_MISMATCH');
 },20_000);
});
