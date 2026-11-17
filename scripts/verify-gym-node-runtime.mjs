/** Local fixtures only: execute this file with the exact deployed Node version. */
import assert from 'node:assert/strict';
import {createHmac,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
assert.equal(process.version,'v18.15.0');
const root=resolve(process.argv[2]??'outputs/home-timeflow-20261117/backend-package'),dependencyRoot=resolve('.tmp/gym-cloudbase-production-deps');
const {startGymAuthorityRuntime}=await import(pathToFileURL(resolve(root,'server/gymAuthorityRuntime.mjs')));
const {createGymClock}=await import(pathToFileURL(resolve(root,'server/gymTimeflowClock.mjs')));
const appId='app_847cdb589a',token='node18-fixture-token-not-a-production-token';
let cursor=100_000,to=100_001,serial=0,posts=0,acks=0,failAck=false;
const transport={async send(request){
 const canonical=[request.method,request.path,request.headers['X-Timestamp'],request.headers['X-Idempotency-Key']??'',request.body??''].join('\n');assert.equal(request.headers['X-Signature'],createHmac('sha256',token).update(canonical).digest('hex'));
 const body=request.body?JSON.parse(request.body):{};let data={};
 if(request.path.endsWith('/scopes/register'))data={scopeType:'gym',scopeId:body.scopeId,state:'active',replayed:false};
 else if(request.path.endsWith('/stream'))data={version:1};
 else if(/\/settlements(?:\/async)?$/.test(request.path)){posts++;const from=cursor;cursor=to;const settlementId='node18-'+(++serial),amount=to-from;data={settlementId,realDuration:amount,effectiveDuration:amount,segments:[{from,to,streamKey:'clock:main',metricId:'elapsed_ms',phaseIndex:0,rate:1,produced:amount,capped:0,netChange:amount}],gains:{elapsed_ms:amount},losses:{},capped:{},events:[],ruleVersions:{gym_clock_ms:1},definitionVersion:1,replayed:false,approximated:false};if(request.path.endsWith('/async'))data={settlementId,accepted:true,async:false,report:data};}
 else if(request.path.endsWith('/ack')){acks++;if(failAck){failAck=false;throw Object.assign(Error('local fixture dropped ACK response'),{retryable:true});}data={acknowledged:true};}
 else throw Error('Unexpected local protocol fixture request');
 return{status:200,headers:{},body:JSON.stringify({ok:true,data})};
}};
const runtime=await startGymAuthorityRuntime({runtimeRoot:root,env:{GYM_AUTHORITY_MODE:'development',GYM_AUTHORITY_TEST_ONLY:'1',GYM_AUTHORITY_ENVIRONMENT:'node18-fixture',SHAPER_TOKEN:token,GYM_DEV_SESSION:'node18-fixture-local-session',GYM_AUTHORITY_DATA_DIR:resolve('.tmp/node18-runtime-data-'+Date.now()),PORT:'0'},testClockFactory:binding=>createGymClock({binding,token,transport})});
const clientFetch=globalThis.fetch,base='http://127.0.0.1:'+runtime.port,headers={'Content-Type':'application/json','X-Gym-Dev-Session':'node18-fixture-local-session'};
const request=async(path,body)=>{const response=await clientFetch(base+'/api/gym/'+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined});assert.equal(response.status,200);return(await response.json()).data;};
try{
 assert.equal((await clientFetch(base+'/api/gym/session')).status,401);
 const session=await request('session'),started=await request('start',{epoch:session.epoch,requestId:'node18-start'});assert.equal(started.state.createdAt,100_001);
 to+=1000;failAck=true;
 const action={epoch:session.epoch,requestId:'node18-shot',expectedRevision:started.revision,action:{type:'train',id:started.state.player.id}},trained=await request('actions',action);assert.equal(trained.state.player.shots,1);assert.equal(trained.pending.stage,'ack');
 const recovered=await request('actions',action);assert.equal(recovered.pending,undefined);assert.deepEqual(recovered.state,trained.state);assert.equal(posts,2);assert.equal(acks,3);
}finally{await new Promise(done=>{runtime.server.close(done);runtime.server.closeAllConnections();});}
const require=createRequire(resolve(dependencyRoot,'package.json')),sdk=require('@cloudbase/node-sdk');
const app=sdk.init({env:'node18-fixture-env',accessKey:'node18-fixture-access-key'});
assert.equal(await app.auth().getClientCredential(),'node18-fixture-access-key');
const {createGymCloudBaseGatewayHandler}=await import(pathToFileURL(resolve(root,'server/gymCloudBaseAdapter.mjs')));
let document=null,version=0,dbCalls=0;
globalThis.fetch=async(url,options)=>{assert.match(String(url),/^https:\/\/node18-fixture-env\.api\.tcloudbasegateway\.com\/v1\/rdb\/rest\/rpc\/gym_authority_/);dbCalls++;const body=JSON.parse(options.body);let data;if(String(url).endsWith('gym_authority_claim'))data={document,version,fence:1};else if(String(url).endsWith('gym_authority_commit')){document=body.p_document;data={version:++version};}else data={};return new Response(JSON.stringify(data));};
const handler=await createGymCloudBaseGatewayHandler({app,runtimeRoot:root,env:{BUSINESS_ACTIVITY_ID:appId,GYM_AUTHORITY_AUTH_MODE:'cloudbase-gateway',CLOUDBASE_ENV_ID:'node18-fixture-env',GYM_AUTHORITY_ENVIRONMENT:'node18-fixture',SHAPER_TOKEN:token}}),server=createServer(handler);
await new Promise(done=>server.listen(0,'127.0.0.1',done));
try{const context=Buffer.from(JSON.stringify({applicationId:appId,customUserId:'node18-gateway-fixture'})).toString('base64'),response=await clientFetch('http://127.0.0.1:'+server.address().port+'/api/gym/session',{headers:{'x-cloudbase-context':context}});assert.equal(response.status,200);assert.equal((await response.json()).data.hasSave,false);assert.equal(dbCalls,3);}finally{globalThis.fetch=clientFetch;await new Promise(done=>{server.close(done);server.closeAllConnections();});}
const evidence={runtime:process.version,platform:process.platform,officialBinarySha256:createHash('sha256').update(await readFile(process.execPath)).digest('hex'),builtAuthorityLoaded:true,signedSdkProtocolFixture:true,baselineAndTrainingPassed:true,ackRecoveryWithoutNewSettlement:true,actualCloudBaseSdkVersion:require('@cloudbase/node-sdk/package.json').version,sharedRpcGatewayAdapterPassed:true,standaloneLocalHttpPassed:true,remoteCalls:false};
const evidenceFile=resolve('outputs/home-timeflow-20261117/review/node18-runtime-verification.json');await mkdir(dirname(evidenceFile),{recursive:true});await writeFile(evidenceFile,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
