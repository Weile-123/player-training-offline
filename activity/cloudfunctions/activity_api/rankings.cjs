const {gunzipSync}=require('node:zlib');
const {applicationId}=require('./project.json');
const fail=(message,statusCode=400)=>Object.assign(Error(message),{statusCode});
const cleanName=value=>typeof value==='string'?Array.from(value
 .replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,'')
 .replace(/[\ud800-\udfff]/gu,'').trim()).slice(0,60).join(''):'';

// This header is trusted only behind the authenticated project gateway.
function identity(raw){
 try{
  if(typeof raw!=='string'||raw.length>32768||raw.length%4!==0||! /^[A-Za-z0-9+/]+={0,2}$/.test(raw))throw Error();
  let bytes=Buffer.from(raw,'base64');if(bytes[0]===31&&bytes[1]===139)bytes=gunzipSync(bytes,{maxOutputLength:65536});
  if(bytes.length>65536)throw Error();
  const context=JSON.parse(bytes.toString('utf8'));
  if(!context||typeof context!=='object'||Array.isArray(context))throw Error();
  // Keep this mapping identical to createCloudBaseGatewayAuthenticator: cloud
  // identities are opaque strings, and older gateways may encode numeric uid.
  const value=context.customUserId||context.userId||context.uid;
  const puid=typeof value==='string'?value:typeof value==='number'&&Number.isSafeInteger(value)?String(value):'';
  if(!puid||puid.trim()!==puid||puid.length>200||/[\u0000-\u001f\u007f]/.test(puid))throw Error();
  if(context.applicationId&&context.applicationId!==applicationId)throw Error();
  // Missing gateway presentation data must not pretend to be the user's name.
  return {puid,name:cleanName(context.nickname)};
 }catch{throw fail('请先登录虎扑',401);}
}
function progressReference(body){
 if(!body||Array.isArray(body)||Object.keys(body).some(key=>!['event','runId','revision','nickname'].includes(key))
   ||body.event!=='gym-progress'||typeof body.runId!=='string'||!/^\d{1,16}-\d{1,10}$/.test(body.runId)
   ||!Number.isSafeInteger(body.revision)||body.revision<0||body.nickname!==undefined&&typeof body.nickname!=='string')throw fail('球馆成绩引用无效');
 const nickname=cleanName(body.nickname);
 return {runId:body.runId,revision:body.revision,...(nickname?{nickname}:{})};
}
function profileNickname(body){
 if(!body||Array.isArray(body)||body.event!=='gym-profile'||Object.keys(body).some(key=>!['event','nickname'].includes(key))||typeof body.nickname!=='string')throw fail('排行昵称参数无效');
 const nickname=cleanName(body.nickname);
 if(!nickname)throw fail('排行昵称无效');
 return nickname;
}
function localProgressReference(body){
 if(!body||Array.isArray(body)||Object.keys(body).some(key=>!['event','runId','revision','nickname','archive'].includes(key))
  ||body.event!=='gym-local-progress'||typeof body.archive!=='string'||Buffer.byteLength(body.archive,'utf8')>2*1024*1024
  ||typeof body.runId!=='string'||!/^\d{1,16}-\d{1,10}$/.test(body.runId)||!Number.isSafeInteger(body.revision)||body.revision<0
  ||body.nickname!==undefined&&typeof body.nickname!=='string')throw fail('本地球馆成绩档案无效');
 return{runId:body.runId,revision:body.revision,nickname:cleanName(body.nickname),archive:body.archive};
}
function createHandler({rpc,now=Date.now,validateLocalProgress}){
 const publicCache=new Map();
 return async({method,path,query={},context,body})=>{
  if(method==='GET'&&path==='/health')return {applicationId,version:'gym-rankings-v1',boards:['player','fame','challenge']};
  if(method==='POST'&&path==='/leaderboard/submit'){
   const user=identity(context);
   if(body?.event==='gym-local-progress'){
    const submission=localProgressReference(body);
    if(typeof validateLocalProgress!=='function')throw fail('本地成绩同步服务尚未更新，请稍后重试',503);
    let progress;try{progress=await validateLocalProgress(submission.archive,submission,now());}
    catch(error){throw fail(error instanceof Error?error.message:'本地球馆成绩未通过校验');}
    if(!Number.isSafeInteger(progress?.challenge)||progress.challenge<0)throw fail('挑战成绩校验服务尚未更新，请稍后重试',503);
    const result=await rpc('submit_local_gym_rank_v2',{p_puid:user.puid,p_name:user.name||submission.nickname||'匿名训练师',
     p_run:progress.runId,p_revision:progress.revision,p_updated:progress.updatedAt,p_evidence:progress.evidenceId,p_fame:progress.fame,p_best:progress.best,p_challenge:progress.challenge});
    if(!result||result.accepted!==true||result.source!=='local-validated')throw fail('本地成绩同步尚未确认，原进度已保留',503);
    publicCache.clear();return result;
   }
   if(body?.event==='gym-profile'){
    const nickname=profileNickname(body);
    const result=await rpc('update_gym_rank_name',{p_puid:user.puid,p_name:user.name||nickname});
    if(!result||result.accepted!==true)throw fail('排行昵称同步尚未确认，请稍后刷新',503);
    publicCache.clear();return result;
   }
   const reference=progressReference(body);
   // The RPC resolves a previously verified server progress record. The browser
   // cannot supply a score, a player's value/stats or an account ID.
   // A real gateway nickname wins; otherwise the SDK-uploaded nickname is a
   // display label only. Actor identity always comes solely from the gateway.
   const result=await rpc('submit_gym_rank',{p_puid:user.puid,p_name:user.name||reference.nickname||'匿名训练师',p_run:reference.runId,p_revision:reference.revision});
   if(!result||result.accepted!==true)throw fail('排行同步尚未确认，请稍后刷新',503);
   publicCache.clear();return result;
  }
  if(method==='GET'&&['/leaderboard','/leaderboard/me'].includes(path)){
   if(Object.keys(query).some(key=>!['board','limit','fresh','levels'].includes(key))||query.fresh!==undefined&&query.fresh!=='1')throw fail('排行查询参数无效');
   const board=query.board??'player',limit=Number(query.limit??50);
   if(!['player','fame','challenge'].includes(board)||!Number.isInteger(limit)||limit<1||limit>100)throw fail('排行查询参数无效');
   if(query.levels!==undefined&&(board!=='player'||query.levels!=='extended'))throw fail('排行查询参数无效');
   const extended=query.levels==='extended';
   const read=(puid)=>extended
    ?rpc('read_gym_rank_v2',{p_board:board,p_limit:limit,p_puid:puid,p_extended:true})
    :rpc('read_gym_rank',{p_board:board,p_limit:limit,p_puid:puid});
   if(path.endsWith('/me'))return read(identity(context).puid);
   const key=`${board}:${limit}:${extended}`,cached=publicCache.get(key);
   if(query.fresh!=='1'&&cached&&cached.until>now())return cached.value;
   const result=await read(null);
   publicCache.set(key,{value:result,until:now()+3000});return result;
  }
  throw fail('接口不存在',404);
 };
}
module.exports={createHandler,identity,progressReference,localProgressReference,profileNickname,cleanName};
