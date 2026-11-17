import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {once} from 'node:events';
import http from 'node:http';
const directory=resolve('activity/cloudfunctions/activity_api'),port=19483;
const child=spawn(process.execPath,['index.cjs'],{cwd:directory,env:{...process.env,BUSINESS_ACTIVITY_ID:'app_847cdb589a',CLOUDBASE_ENV_ID:'local-contract-test',COLORBOX__ACCESS_KEY:'local-not-a-real-credential',PORT:String(port)},stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});
function request(path,method='GET',body){return new Promise((resolve,reject)=>{
 const req=http.request({hostname:'127.0.0.1',port,path,method,headers:{'Content-Type':'application/json'}},res=>{let text='';res.on('data',chunk=>{text+=chunk;});res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text)}));});
 req.on('error',reject);if(body)req.write(JSON.stringify(body));req.end();
});}
try{
 let health;
 for(let attempt=0;attempt<40;attempt++){
  if(child.exitCode!==null)throw Error(`Local function exited: ${output}`);
  try{health=await request('/api/health');break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}
 }
 if(health?.status!==200||health.body?.data?.applicationId!=='app_847cdb589a')throw Error(`Invalid local health response: ${JSON.stringify(health)}`);
 const rejected=await request('/api/leaderboard/submit','POST',{event:'gym-progress',runId:'1800000000000-23',revision:0});
 if(rejected.status!==401)throw Error('Unauthenticated local write was not rejected');
 console.log(JSON.stringify({localHealth:true,unauthenticatedWriteRejected:true,applicationId:'app_847cdb589a',cloudRequests:false}));
}finally{if(child.exitCode===null){child.kill();await once(child,'exit');}}
