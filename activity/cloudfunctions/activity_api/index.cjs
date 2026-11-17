const http=require('node:http');
const tcb=require('@cloudbase/node-sdk');
const {createHandler}=require('./rankings.cjs');
const {applicationId}=require('./project.json');
const env=process.env.CLOUDBASE_ENV_ID||process.env.TCB_ENV;
if(!env||process.env.BUSINESS_ACTIVITY_ID!==applicationId)throw Error('Missing project-specific activity binding');
const app=tcb.init({env,accessKey:process.env.COLORBOX__ACCESS_KEY});
const handle=createHandler({rpc:async(name,data)=>{
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
http.createServer(async(req,res)=>{
 // Gateway owns CORS and overwrites x-cloudbase-context. Disable the direct
 // public function URL; gateway auth is mandatory for /me and /submit.
 res.setHeader('Content-Type','application/json; charset=utf-8');
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
 try{
  let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>16384)throw Object.assign(Error('请求内容过大'),{statusCode:413});}
  let body;try{body=text?JSON.parse(text):undefined;}catch{throw Object.assign(Error('请求格式无效'),{statusCode:400});}
  const url=new URL(req.url,'http://localhost');
  const data=await handle({method:req.method,path:url.pathname.replace(/^\/api(?=\/|$)/,''),query:Object.fromEntries(url.searchParams),context:req.headers['x-cloudbase-context'],body});
  res.writeHead(200);res.end(JSON.stringify({code:0,data}));
 }catch(error){const status=error.statusCode||503;res.writeHead(status);res.end(JSON.stringify({code:status,message:error.statusCode?error.message:'排行榜服务暂不可用'}));}
}).listen(Number(process.env.PORT||9000),'0.0.0.0');
