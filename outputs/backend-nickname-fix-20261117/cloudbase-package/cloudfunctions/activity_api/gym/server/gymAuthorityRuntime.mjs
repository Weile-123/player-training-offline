import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export async function resolveGymServerToken(env,root){
 if(typeof env.SHAPER_TOKEN==='string'&&env.SHAPER_TOKEN.trim())return env.SHAPER_TOKEN.trim();
 const names=env.GYM_AUTHORITY_CREDENTIALS_FILE?[resolve(root,env.GYM_AUTHORITY_CREDENTIALS_FILE)]:[
  resolve(root,'hupu-skills/credentials.json'),resolve(root,'hupu-skills/skills/credentials.json'),resolve(root,'hupu-skills/skills/shaper-timeflow/credentials.json'),
 ];
 for(const path of names){try{const value=JSON.parse(await readFile(path,'utf8'));if(typeof value.shaperToken==='string'&&value.shaperToken.trim())return value.shaperToken.trim();}catch(error){if(error.code!=='ENOENT')throw Error('Configured server credentials file is invalid');}}
 return undefined;
}

/** CloudBase accessKey mode returns a string, unlike the access_token object mode. */
export async function resolveGymRdbServiceToken(app,env){
 const credential=await app.auth().getClientCredential();
 const token=typeof credential==='string'?credential:credential?.access_token;
 const access=typeof token==='string'&&token.trim()?token.trim():env.COLORBOX__ACCESS_KEY?.trim();
 if(!access)throw Error('CloudBase service credential unavailable');
 return /^Bearer\s+/i.test(access)?access:`Bearer ${access}`;
}

/** Installed runtime: no esbuild, TypeScript, repository paths or permissive production auth fallback. */
export async function startGymAuthorityRuntime({env=process.env,runtimeRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..'),testClockFactory}={}){
 const mode=env.GYM_AUTHORITY_MODE??'production';
 if(!['production','development'].includes(mode))throw Error('GYM_AUTHORITY_MODE must be production or development');
 if(mode==='production'&&(testClockFactory||env.GYM_AUTHORITY_TEST_ONLY))throw Error('Test-only overrides are forbidden in production');
 if(testClockFactory&&(mode!=='development'||env.GYM_AUTHORITY_TEST_ONLY!=='1'))throw Error('A clock fixture requires explicit local test-only mode');
 const token=await resolveGymServerToken(env,runtimeRoot),environmentId=env.GYM_AUTHORITY_ENVIRONMENT;
 if(!token||!environmentId)throw Error('Missing server SHAPER_TOKEN or GYM_AUTHORITY_ENVIRONMENT');
 if(mode==='production'&&((!env.GYM_AUTHORITY_AUTH_MODULE&&env.GYM_AUTHORITY_AUTH_MODE!=='cloudbase-gateway')||!env.CLOUDBASE_ENV_ID))throw Error('Production requires a verified authentication module or cloudbase-gateway mode and shared CloudBase database');
 if(mode==='development'&&(!env.GYM_DEV_SESSION||env.GYM_DEV_SESSION.length<16))throw Error('Explicit local-only GYM_DEV_SESSION of at least sixteen characters is required');
 const {createGymAuthorityService,createFileGymAuthorityRepository,createCloudBaseGymAuthorityRepository,createGymAuthorityHttpHandler}=await import(pathToFileURL(resolve(runtimeRoot,'server/main.mjs')).href);
 const {createGymClock}=await import(pathToFileURL(resolve(runtimeRoot,'server/gymTimeflowClock.mjs')).href);
 let repository,authenticate;
 if(mode==='development'){
  repository=createFileGymAuthorityRepository(env.GYM_AUTHORITY_DATA_DIR??resolve(runtimeRoot,'data'));
  const secret=Buffer.from(env.GYM_DEV_SESSION);
  authenticate=async request=>{if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(request.socket.remoteAddress))return null;const supplied=Buffer.from(typeof request.headers['x-gym-dev-session']==='string'?request.headers['x-gym-dev-session']:'');return supplied.length===secret.length&&timingSafeEqual(supplied,secret)?{id:'development-local-player',name:'本地测试训练师'}:null;};
 }else{
  if(env.GYM_AUTHORITY_AUTH_MODE==='cloudbase-gateway'){
   const {createCloudBaseGatewayAuthenticator}=await import('./gymCloudBaseAdapter.mjs');
   const identity=JSON.parse(await readFile(resolve(runtimeRoot,'hupu-skills/activity.json'),'utf8'));
   authenticate=createCloudBaseGatewayAuthenticator(env,identity.activityId);
  }else{
   const auth=await import(pathToFileURL(resolve(runtimeRoot,env.GYM_AUTHORITY_AUTH_MODULE)).href);if(typeof auth.authenticate!=='function')throw Error('Authentication module must export authenticate');authenticate=auth.authenticate;
  }
  const require=createRequire(pathToFileURL(resolve(runtimeRoot,'package.json'))),sdk=require('@cloudbase/node-sdk'),database=env.CLOUDBASE_ENV_ID;
  if(!/^[A-Za-z0-9-]+$/.test(database))throw Error('Invalid CloudBase environment');
  const app=sdk.init({env:database,...(env.COLORBOX__ACCESS_KEY?{accessKey:env.COLORBOX__ACCESS_KEY}:{})});
  repository=createCloudBaseGymAuthorityRepository(async(name,data)=>{
   const authorization=await resolveGymRdbServiceToken(app,env);
   const response=await fetch(`https://${database}.api.tcloudbasegateway.com/v1/rdb/rest/rpc/${name}`,{method:'POST',headers:{Authorization:authorization,'X-Db-Instance':'default','Accept-Profile':'public','Content-Profile':'public','Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(15000)});
   const result=await response.json();if(!response.ok){const message=String(result?.message??''),code=['GYM_BUSY','RATE_LIMITED','LEASE_EXPIRED','REVISION_CONFLICT'].find(value=>message.includes(value));throw Object.assign(Error(code?'球馆正在保存或请求过于频繁，请稍后重试':'共享数据库暂不可用'),{code:code??'REPOSITORY_UNAVAILABLE',statusCode:code==='RATE_LIMITED'?429:code?409:503,retryable:!!code});}return result;
  });
 }
 const service=createGymAuthorityService({repository,environmentId,clockFactory:testClockFactory??(binding=>createGymClock({binding,token,baseUrl:env.TIMEFLOW_BASE_URL??'https://relay.hupu.com'}))});
 const handle=createGymAuthorityHttpHandler({service,authenticate,allowedOrigin:env.GYM_AUTHORITY_ALLOWED_ORIGIN});
 const port=Number(env.PORT??9001);if(!Number.isInteger(port)||port<(mode==='development'?0:1)||port>65535)throw Error('Invalid port');
 const host=mode==='development'?'127.0.0.1':(env.HOST??'127.0.0.1');
 const server=createServer(handle);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
 return{server,service,mode,port:server.address().port,host,repository:repository.kind,liveTimeflow:!testClockFactory};
}
