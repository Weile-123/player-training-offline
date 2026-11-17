const {gunzipSync}=require('node:zlib');
const {applicationId}=require('./project.json');
const fail=(message,statusCode=400)=>Object.assign(Error(message),{statusCode});
const cleanName=value=>typeof value==='string'?Array.from(value.replace(/[\u0000-\u001f\u007f]/g,'').trim()).slice(0,60).join(''):'';

// This header is trusted only behind the authenticated project gateway.
function identity(raw){
 try{
  if(typeof raw!=='string'||raw.length>32768)throw Error();
  let bytes=Buffer.from(raw,'base64');if(bytes[0]===31&&bytes[1]===139)bytes=gunzipSync(bytes,{maxOutputLength:65536});
  const context=JSON.parse(bytes.toString('utf8')),puid=context.customUserId||context.userId||context.uid;
  if(typeof puid!=='string'||!puid||puid.length>200)throw Error();
  if(context.applicationId&&context.applicationId!==applicationId)throw Error();
  return {puid,name:cleanName(context.nickname)||'虎扑训练师'};
 }catch{throw fail('请先登录虎扑',401);}
}
function progressReference(body){
 if(!body||Array.isArray(body)||Object.keys(body).some(key=>!['event','runId','revision'].includes(key))
   ||body.event!=='gym-progress'||typeof body.runId!=='string'||!/^\d{1,16}-\d{1,10}$/.test(body.runId)
   ||!Number.isSafeInteger(body.revision)||body.revision<0)throw fail('球馆成绩引用无效');
 return {runId:body.runId,revision:body.revision};
}
function createHandler({rpc,now=Date.now}){
 const publicCache=new Map();
 return async({method,path,query={},context,body})=>{
  if(method==='GET'&&path==='/health')return {applicationId,version:'gym-rankings-v1',boards:['player','fame']};
  if(method==='POST'&&path==='/leaderboard/submit'){
   const user=identity(context),reference=progressReference(body);
   // The RPC resolves a previously verified server progress record. The browser
   // cannot supply a score, a player's value/stats or an account ID.
   const result=await rpc('submit_gym_rank',{p_puid:user.puid,p_name:user.name,p_run:reference.runId,p_revision:reference.revision});
   publicCache.clear();return result;
  }
  if(method==='GET'&&['/leaderboard','/leaderboard/me'].includes(path)){
   if(Object.keys(query).some(key=>!['board','limit'].includes(key)))throw fail('排行查询参数无效');
   const board=query.board??'player',limit=Number(query.limit??50);
   if(!['player','fame'].includes(board)||!Number.isInteger(limit)||limit<1||limit>100)throw fail('排行查询参数无效');
   if(path.endsWith('/me'))return rpc('read_gym_rank',{p_board:board,p_limit:limit,p_puid:identity(context).puid});
   const key=`${board}:${limit}`,cached=publicCache.get(key);
   if(cached&&cached.until>now())return cached.value;
   const result=await rpc('read_gym_rank',{p_board:board,p_limit:limit,p_puid:null});
   publicCache.set(key,{value:result,until:now()+3000});return result;
  }
  throw fail('接口不存在',404);
 };
}
module.exports={createHandler,identity,progressReference};
