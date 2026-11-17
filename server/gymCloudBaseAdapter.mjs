import {gunzipSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolveGymRdbServiceToken,resolveGymServerToken} from './gymAuthorityRuntime.mjs';

const unavailable=()=>Object.assign(Error('球馆云端服务尚未启用'),{code:'GYM_AUTHORITY_NOT_CONFIGURED',statusCode:503,retryable:false});

/** This decoder is usable only inside a deployment whose authenticated gateway
 * overwrites context and whose direct function URL is disabled. It is not a
 * token verifier and is deliberately unavailable without explicit host mode. */
export function createCloudBaseGatewayAuthenticator(env,applicationId){
 if(env.GYM_AUTHORITY_AUTH_MODE!=='cloudbase-gateway'||env.BUSINESS_ACTIVITY_ID!==applicationId)throw unavailable();
 return async request=>{
  try{
   const raw=request.headers['x-cloudbase-context'];
   if(typeof raw!=='string'||raw.length>32768||raw.length%4!==0||! /^[A-Za-z0-9+/]+={0,2}$/.test(raw))return null;
   let bytes=Buffer.from(raw,'base64');
   if(bytes[0]===31&&bytes[1]===139)bytes=gunzipSync(bytes,{maxOutputLength:65536});
   if(bytes.length>65536)return null;
   const context=JSON.parse(bytes.toString('utf8'));
   if(!context||typeof context!=='object'||Array.isArray(context)||context.applicationId&&context.applicationId!==applicationId)return null;
   const value=context.customUserId||context.userId||context.uid;
   const id=typeof value==='string'?value:typeof value==='number'&&Number.isSafeInteger(value)?String(value):'';
   if(!id||id.trim()!==id||id.length>200||/[\u0000-\u001f\u007f]/.test(id))return null;
   const name=typeof context.nickname==='string'?Array.from(context.nickname.replace(/[\u0000-\u001f\u007f]/g,'').trim()).slice(0,60).join(''):'';
   return{id,name:name||'虎扑训练师'};
  }catch{return null;}
 };
}

export function createCloudBaseGymRpc({app,environmentId,env=process.env,fetchImpl=globalThis.fetch}){
 if(!app||!/^[A-Za-z0-9-]+$/.test(environmentId??'')||typeof fetchImpl!=='function')throw unavailable();
 return async(name,data)=>{
  if(!/^gym_authority_[a-z_]+$/.test(name))throw unavailable();
  const authorization=await resolveGymRdbServiceToken(app,env);
  const response=await fetchImpl(`https://${environmentId}.api.tcloudbasegateway.com/v1/rdb/rest/rpc/${name}`,{
   method:'POST',headers:{Authorization:authorization,'X-Db-Instance':'default','Accept-Profile':'public','Content-Profile':'public','Content-Type':'application/json'},
   body:JSON.stringify(data),signal:AbortSignal.timeout(15000),
  });
  const result=await response.json();
  if(!response.ok){const message=String(result?.message??''),code=['GYM_BUSY','RATE_LIMITED','LEASE_EXPIRED','REVISION_CONFLICT'].find(value=>message.includes(value));throw Object.assign(Error(code?'球馆正在保存或请求过于频繁，请稍后重试':'共享数据库暂不可用'),{code:code??'REPOSITORY_UNAVAILABLE',statusCode:code==='RATE_LIMITED'?429:code?409:503,retryable:!!code});}
  return result;
 };
}

/** Reuses the existing activity_api SDK instance and HTTP listener. */
export async function createGymCloudBaseGatewayHandler({app,env=process.env,runtimeRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..')}){
 if(env.GYM_AUTHORITY_TEST_ONLY)throw unavailable();
 const identity=JSON.parse(await readFile(resolve(runtimeRoot,'hupu-skills/activity.json'),'utf8'));
 const authenticate=createCloudBaseGatewayAuthenticator(env,identity.activityId);
 const token=await resolveGymServerToken(env,runtimeRoot);
 if(!token||!env.GYM_AUTHORITY_ENVIRONMENT||!env.CLOUDBASE_ENV_ID)throw unavailable();
 const {createGymAuthorityService,createCloudBaseGymAuthorityRepository,createGymAuthorityHttpHandler}=await import(pathToFileURL(resolve(runtimeRoot,'server/main.mjs')).href);
 const {createGymClock}=await import(pathToFileURL(resolve(runtimeRoot,'server/gymTimeflowClock.mjs')).href);
 const repository=createCloudBaseGymAuthorityRepository(createCloudBaseGymRpc({app,environmentId:env.CLOUDBASE_ENV_ID,env}));
 const service=createGymAuthorityService({repository,environmentId:env.GYM_AUTHORITY_ENVIRONMENT,allowNativeRewards:true,clockFactory:binding=>createGymClock({binding,token,baseUrl:env.TIMEFLOW_BASE_URL??'https://relay.hupu.com'})});
 // Gateway owns CORS. No user identity is taken from body/query/Authorization.
 return createGymAuthorityHttpHandler({service,authenticate});
}
