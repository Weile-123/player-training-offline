import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import {createServer,type Server} from 'node:http';
import {gzipSync} from 'node:zlib';
import {mkdir,mkdtemp,readFile,rm} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createCloudBaseGatewayAuthenticator,createCloudBaseGymRpc} from '../server/gymCloudBaseAdapter.mjs';
import {prepareGymAuthority,prepareGymCloudBase} from './prepare-gym-authority.mjs';
import {createGymAuthorityService} from '../server/gymAuthorityService';
import {createFileGymAuthorityRepository} from '../server/gymAuthorityRepository';
import {createGymAuthorityHttpHandler} from '../server/gymAuthorityHttp';
import {newGym} from '../src/game/gym/engine';
import {encodeGym} from '../src/game/gym/save';
const require=createRequire(import.meta.url),{createActivityRequestHandler}=require('../activity/cloudfunctions/activity_api/activityHost.cjs');
const applicationId='app_847cdb589a',mode={GYM_AUTHORITY_AUTH_MODE:'cloudbase-gateway',BUSINESS_ACTIVITY_ID:applicationId};
const context=(id='gateway-player-a',gzip=false)=>{const value=Buffer.from(JSON.stringify({applicationId,customUserId:id,nickname:'训练师'}));return(gzip?gzipSync(value):value).toString('base64');};
const clientFetch=globalThis.fetch,base=resolve('.tmp/gym-cloudbase-adapter-tests');
let directory:string,servers:Server[];
beforeEach(async()=>{await mkdir(base,{recursive:true});directory=await mkdtemp(resolve(base,'case-'));servers=[];});
afterEach(async()=>{vi.unstubAllGlobals();await Promise.all(servers.map(server=>new Promise<void>((done)=>{server.close(()=>done());server.closeAllConnections();})));if(!resolve(directory).startsWith(base+sep))throw Error('Unsafe cleanup');await rm(directory,{recursive:true,force:true});});
async function listen(handler:Parameters<typeof createServer>[0]){const server=createServer(handler);servers.push(server);await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();if(!address||typeof address==='string')throw Error();return'http://127.0.0.1:'+address.port;}

it('enables context identity only in the explicitly configured authenticated gateway host',async()=>{
 expect(()=>createCloudBaseGatewayAuthenticator({},applicationId)).toThrow('尚未启用');
 expect(()=>createCloudBaseGatewayAuthenticator({...mode,BUSINESS_ACTIVITY_ID:'other'},applicationId)).toThrow('尚未启用');
 const auth=createCloudBaseGatewayAuthenticator(mode,applicationId);
 for(const zipped of [false,true])expect(await auth({headers:{'x-cloudbase-context':context('gateway-player-a',zipped)}})).toEqual({id:'gateway-player-a',name:'训练师'});
 expect(await auth({headers:{authorization:'Bearer client-reported',puid:'client-reported'}})).toBeNull();
 expect(await auth({headers:{'x-cloudbase-context':Buffer.from(JSON.stringify({applicationId:'other',customUserId:'wrong-app'})).toString('base64')}})).toBeNull();
 expect(await auth({headers:{'x-cloudbase-context':context()+'!'}})).toBeNull();
 expect(await auth({headers:{'x-cloudbase-context':gzipSync(Buffer.alloc(70_000,32)).toString('base64')}})).toBeNull();
});

it('keeps existing health available while unconfigured gym endpoints fail closed',async()=>{
 const url=await listen(createActivityRequestHandler({legacyHandle:async()=>({version:'legacy'})}));
 expect((await(await clientFetch(url+'/api/health')).json()).data.version).toBe('legacy');
 const response=await clientFetch(url+'/api/gym/session',{headers:{'x-cloudbase-context':context()}});
 expect(response.status).toBe(503);expect(await response.json()).toMatchObject({code:'GYM_AUTHORITY_NOT_CONFIGURED',retryable:false});
});

it('routes a real large legacy adoption before the old 16KiB parser on the same HTTP listener',async()=>{
 let cursor=100_000,serial=0;
 const service=createGymAuthorityService({repository:createFileGymAuthorityRepository(resolve(directory,'data')),environmentId:'host-test',clockFactory:()=>({streamKey:'clock:main',ensure:async()=>({}),settle:async()=>{const from=cursor,to=++cursor,settlementId='host-'+(++serial);return{status:'ready',settlementId,report:{settlementId,realDuration:1,effectiveDuration:1,segments:[{from,to,streamKey:'clock:main',metricId:'elapsed_ms',phaseIndex:0,rate:'1',produced:'1',capped:'0',netChange:'1'}],gains:{elapsed_ms:'1'},losses:{},capped:{},events:[],ruleVersions:{gym_clock_ms:1},definitionVersion:1,replayed:false,approximated:false}};},resume:async()=>{throw Error('not pending');},ack:async()=>({})})});
 const authorityHandle=createGymAuthorityHttpHandler({service,authenticate:createCloudBaseGatewayAuthenticator(mode,applicationId)});
 const url=await listen(createActivityRequestHandler({legacyHandle:async()=>({health:true}),authorityHandle}));
 expect((await(await clientFetch(url+'/api/health')).json()).data.health).toBe(true);
 expect((await clientFetch(url+'/api/gym/session')).status).toBe(401);
 const headers={'Content-Type':'application/json','x-cloudbase-context':context()},session=(await(await clientFetch(url+'/api/gym/session',{headers})).json()).data;
 const local=newGym(99_000,44);local.alumni=Array.from({length:113},(_,index)=>({...structuredClone(local.player!),id:'past-'+index,recommendedAt:local.updatedAt,rewardCredits:0,rewardFame:0,finalValue:'320'}));
 const archive=JSON.stringify({format:'legend-gym-cloud-v1',applicationId,uploadedAt:local.updatedAt,gym:encodeGym(local)}),body=JSON.stringify({epoch:session.epoch,requestId:'large-host-adopt',archive});
 expect(Buffer.byteLength(body)).toBeGreaterThan(16384);
 const adopted=await clientFetch(url+'/api/gym/adopt',{method:'POST',headers,body});expect(adopted.status).toBe(200);expect((await adopted.json()).data.hasSave).toBe(true);
 const legacyLarge=await clientFetch(url+'/api/legacy',{method:'POST',headers,body});expect(legacyLarge.status).toBe(413);
 const spoofed=await clientFetch(url+'/api/gym/resume',{method:'POST',headers,body:JSON.stringify({epoch:session.epoch,requestId:'spoofed',puid:'someone-else'})});expect(spoofed.status).toBe(400);
});

it('reuses the host SDK credential in shared PostgreSQL REST RPC and sanitizes upstream errors',async()=>{
 const calls:{url:string;options:RequestInit}[]=[];
 const app={auth:()=>({getClientCredential:async()=>null})},rpc=createCloudBaseGymRpc({app,environmentId:'fixture-env',env:{COLORBOX__ACCESS_KEY:'fixture-access-key'},fetchImpl:async(url:string,options:RequestInit)=>{calls.push({url,options});return new Response(JSON.stringify({version:1}),{status:200});}});
 expect(await rpc('gym_authority_claim',{p_actor_key:'abc'})).toEqual({version:1});
 expect(calls[0].url).toBe('https://fixture-env.api.tcloudbasegateway.com/v1/rdb/rest/rpc/gym_authority_claim');expect(calls[0].options.headers).toMatchObject({Authorization:'Bearer fixture-access-key','X-Db-Instance':'default'});
 const denied=createCloudBaseGymRpc({app,environmentId:'fixture-env',env:{COLORBOX__ACCESS_KEY:'fixture-access-key'},fetchImpl:async()=>new Response(JSON.stringify({message:'secret database stack fixture-access-key'}),{status:500})});
 await expect(denied('gym_authority_claim',{})).rejects.toMatchObject({code:'REPOSITORY_UNAVAILABLE',retryable:false,message:'共享数据库暂不可用'});
});

it('builds the integrated activity_api package and instantiates its official gateway adapter without an external auth module',async()=>{
 const authority=await prepareGymAuthority({outDir:resolve(directory,'authority')}),output=await prepareGymCloudBase({authorityDir:authority.outDir,outDir:resolve(directory,'cloudbase')});
 const manifest=JSON.parse(await readFile(resolve(output.outDir,'manifest.json'),'utf8')),routes=JSON.parse(await readFile(resolve(output.outDir,'routes.json'),'utf8'));
 expect(manifest.remoteDeployed).toBe(false);expect(manifest.sourceCredentialsIncluded).toBe(false);
 const gymRoutes=routes.routes.filter((route:{path:string})=>route.path.startsWith('/api/gym/'));
 expect(gymRoutes).toHaveLength(8);expect(gymRoutes.every((route:{auth:boolean})=>route.auth)).toBe(true);
 expect(routes.routes.find((route:{path:string})=>route.path==='/api/leaderboard')?.auth).toBe(false);
 expect(routes.routes.find((route:{path:string})=>route.path==='/api/leaderboard/submit')?.auth).toBe(true);
 expect(routes.upstreamResourceType).toBe('WEB_SCF');expect(routes.requiredNodeVersion).toBe('>=18.15');expect(routes.deploymentRuntime).toBe('Nodejs18.15');
 expect(manifest.files.some((file:{path:string})=>file.path.endsWith('/activityHost.cjs'))).toBe(true);
 expect(manifest.files.some((file:{path:string})=>/credentials\.json$|node_modules\//.test(file.path))).toBe(false);
 const runtimeRoot=resolve(output.outDir,'cloudfunctions/activity_api/gym'),{createGymCloudBaseGatewayHandler}=await import(pathToFileURL(resolve(runtimeRoot,'server/gymCloudBaseAdapter.mjs')).href);
 let document:unknown=null,version=0,dbCalls=0;
 vi.stubGlobal('fetch',async(url:string,options:RequestInit)=>{
  expect(String(url)).toMatch(/^https:\/\/fixture-env\.api\.tcloudbasegateway\.com\/v1\/rdb\/rest\/rpc\/gym_authority_/);dbCalls++;
  const body=JSON.parse(String(options.body));let result;
  if(String(url).endsWith('gym_authority_claim'))result={document,version,fence:1};
  else if(String(url).endsWith('gym_authority_commit')){document=body.p_document;result={version:++version};}
  else result={};return new Response(JSON.stringify(result));
 });
 const handler=await createGymCloudBaseGatewayHandler({runtimeRoot,app:{auth:()=>({getClientCredential:async()=>'fixture-only-db-token'})},env:{...mode,CLOUDBASE_ENV_ID:'fixture-env',GYM_AUTHORITY_ENVIRONMENT:'fixture',SHAPER_TOKEN:'fixture-only-timeflow-token'}});
 const url=await listen(createActivityRequestHandler({legacyHandle:async()=>({legacy:true}),authorityHandle:handler}));
 const response=await clientFetch(url+'/api/gym/session',{headers:{'x-cloudbase-context':context()}});expect(response.status).toBe(200);expect((await response.json()).data.hasSave).toBe(false);expect(dbCalls).toBe(3);
});
