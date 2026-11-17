const http=require('node:http');
const tcb=require('@cloudbase/node-sdk');
const {createHandler}=require('./rankings.cjs');
const {createActivityRequestHandler}=require('./activityHost.cjs');
const {createDemoBaselineHandler}=require('./demoBaseline.cjs');
const {resolve}=require('node:path');
const {applicationId}=require('./project.json');
const env=process.env.CLOUDBASE_ENV_ID||process.env.TCB_ENV;
if(!env||process.env.BUSINESS_ACTIVITY_ID!==applicationId)throw Error('Missing project-specific activity binding');
const app=tcb.init({env,accessKey:process.env.COLORBOX__ACCESS_KEY});
const rankingsHandle=createHandler({rpc:async(name,data)=>{
 const credential=await app.auth().getClientCredential();
 const token=typeof credential==='string'?credential:credential?.access_token;
 if(!token)throw Error('服务暂不可用');
 const response=await fetch(`https://${env}.api.tcloudbasegateway.com/v1/rdb/rest/rpc/${name}`,{
  method:'POST',headers:{Authorization:`Bearer ${token}`,'X-Db-Instance':'default','Accept-Profile':'public','Content-Profile':'public','Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(10000),
 });
 const result=await response.json();
 if(!response.ok){
  const code=String(result.message??'');
  const statusCode=code.includes('rate-limit')?429:code.includes('verified-progress-required')?409:503;
  throw Object.assign(Error(statusCode===429?'提交过于频繁，请稍后重试':statusCode===409?'暂无已验证的球馆成绩，本地进度已保留':'排行榜服务暂不可用'),{statusCode});
 }
 return result;
}});
const demoHandle=createDemoBaselineHandler({rdb:app.rdb({database:'public'})});
const handle=request=>request.path.startsWith('/demo/')?demoHandle(request):rankingsHandle(request);
async function start(){
 let authorityHandle;
 if(process.env.GYM_AUTHORITY_AUTH_MODE){
  if(process.env.GYM_AUTHORITY_AUTH_MODE!=='cloudbase-gateway')throw Error('Unsupported gym identity mode');
  const {createGymCloudBaseGatewayHandler}=await import('./gym/server/gymCloudBaseAdapter.mjs');
  authorityHandle=await createGymCloudBaseGatewayHandler({app,env:process.env,runtimeRoot:resolve(__dirname,'gym')});
 }
 http.createServer(createActivityRequestHandler({legacyHandle:handle,authorityHandle})).listen(Number(process.env.PORT||9000),'0.0.0.0');
}
start().catch(()=>{console.error('activity_api startup failed: verify configured service resources and gateway identity mode');process.exitCode=1;});
