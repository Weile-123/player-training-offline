import {cloneData} from '../utils/cloneData';
import type {Contract,CareerBestPlayer} from '../game/contract/engine';
import {getHupuUser} from './hupuAccount';
import {ensureColorboxSdk,sdkDeadline,type HupuSdk} from './hupuSdk';
import {statKeys} from '../game/types';

export type FinalScore={careerId:string;month:number;credit:0;status:'over';shots:number;best:CareerBestPlayer|null};
export type RankingRow={id:string;coach:string;avatar?:string;score:string;best:CareerBestPlayer|null};
export type Ranking={entries:RankingRow[];me:{rank:number;entry:RankingRow}|null;personalError?:string;personalPending?:boolean};
type Pending={owner:string|null;score:FinalScore};
function validRow(row:RankingRow){return !!row&&typeof row.id==='string'&&typeof row.coach==='string'&&typeof row.score==='string'&&/^\d{1,200}$/.test(row.score)&&(!row.best||(typeof row.best.templateId==='string'&&Number.isInteger(row.best.level)&&!!row.best.stats&&statKeys.every(k=>Number.isInteger(row.best!.stats[k])&&row.best!.stats[k]>=0&&row.best!.stats[k]<=99)));}
type StoragePort=Pick<Storage,'getItem'|'setItem'>;
export const leaderboardQueueKey='player-training.leaderboard.pending.v1';
export function finalScore(state:Contract):FinalScore|null{
 if(state.status!=='over'||state.credit!==0||!state.careerId)return null;
 return {careerId:state.careerId,month:state.month,credit:0,status:'over',shots:state.totalShots,best:state.bestPlayer?cloneData(state.bestPlayer):null};
}
export const leaderboardConfig={apiBase:import.meta.env.VITE_LEADERBOARD_API_BASE??'',envId:import.meta.env.VITE_LEADERBOARD_ENV_ID??''};
export function leaderboardConfigured(){return /^https:\/\//.test(leaderboardConfig.apiBase)&&!!leaderboardConfig.envId;}
type RankingUser={puid?:string;nickname?:string};
const nicknameOf=(user:RankingUser|null)=>typeof user?.nickname==='string'?Array.from(user.nickname.replace(/[\u0000-\u001f\u007f]/g,'').trim()).slice(0,60).join(''):'';
type Dependencies={storage:StoragePort;enabled:()=>boolean;user:()=>Promise<RankingUser|null>;request:(path:string,method:'GET'|'POST',data?:Record<string,unknown>,auth?:boolean)=>Promise<unknown>;wait?:(ms:number)=>Promise<void>};
/** Separate outbox. Never writes a game save, profile or cloud archive. */
export function createLeaderboardClient(deps:Dependencies){
 let pending:Pending[]=[];try{const raw=JSON.parse(deps.storage.getItem(leaderboardQueueKey)??'[]');if(Array.isArray(raw))pending=raw.filter(x=>(x?.owner===null||typeof x?.owner==='string')&&x?.score?.status==='over'&&x.score.credit===0&&typeof x.score.careerId==='string');}catch{/* optional storage */}
 let message='',running:Promise<boolean>|null=null,nextSubmitAt=0;const listeners=new Set<()=>void>();
 const wait=deps.wait??(ms=>new Promise<void>(resolve=>setTimeout(resolve,ms)));
 const update=(value:string)=>{message=value;listeners.forEach(fn=>fn());};
 const persist=()=>{try{deps.storage.setItem(leaderboardQueueKey,JSON.stringify(pending));}catch{/* retain in memory; never block local finish */}};
 const drain=async()=>{
  let submitted=false;
  try{
   const user=await deps.user();if(!user?.puid){update('请登录虎扑后重试排行上传，本地记录已保留');return false;}
   for(let item=pending.find(p=>p.owner===user.puid);item;item=pending.find(p=>p.owner===user.puid)){
    if(nextSubmitAt>Date.now())await wait(nextSubmitAt-Date.now());
    const current=await deps.user();if(current?.puid!==item.owner)throw Error('账号已切换，请使用原账号重试');
    const nickname=nicknameOf(current);
    const send=()=>deps.request('/leaderboard/submit','POST',{event:'career-finished',...item!.score,...(nickname?{nickname}:{})},true);
    let result:{accepted?:boolean};
    try{result=await send() as {accepted?:boolean};}
    catch(e){
     if((e as {statusCode?:number})?.statusCode!==429)throw e;
     await wait(3100);
     if((await deps.user())?.puid!==item.owner)throw Error('账号已切换，请使用原账号重试');
     result=await send() as {accepted?:boolean};
    }
    if(result?.accepted!==true)throw Error('排行提交未确认，请稍后重试');
    nextSubmitAt=Date.now()+3100;submitted=true;
    pending=pending.filter(p=>p!==item);persist();update('排行榜成绩已提交');
   }
  }catch(e){update(e instanceof Error?e.message:'排行榜提交失败，本地记录已保留');}
  return submitted;
 };
 const retry=():Promise<boolean>=>{
  if(running)return running;
  if(!deps.enabled()||!pending.length)return Promise.resolve(false);
  running=drain().finally(()=>{running=null;});return running;
 };
 const finish=async(state:Contract)=>{
  const score=finalScore(state);if(!score||!deps.enabled())return;
  // Durable snapshot comes before the first async identity request. Never assign
  // an unresolved record to whichever account happens to log in after a reload.
  let item=pending.find(p=>p.score.careerId===score.careerId);
  if(!item){item={owner:null,score};pending.push(item);persist();}
  try{
   const user=await deps.user();if(!user?.puid){update('当前未登录虎扑，本局仅保留本地记录');return;}
   if(item.owner!==null&&item.owner!==user.puid)throw Error('账号已切换，请使用原账号重试');
   item.owner=user.puid;persist();
   await retry();
  }catch(e){update(e instanceof Error?e.message:'排行服务暂不可用，本地记录已保留');}
 };
 const list=async(board:'endless'|'player',onPublic?:(data:Ranking)=>void):Promise<Ranking>=>{
  if(!deps.enabled())throw Error('线上排行榜暂不可用，本地游玩与记录不受影响');
  // Identity/private-query failures must not discard an available public board.
  const identity=deps.user().then(user=>({user,error:''}),()=>({user:null,error:'暂未获取个人排名，请刷新重试'}));
  const publicData=await deps.request(`/leaderboard?board=${board}&limit=50`,'GET') as {entries:RankingRow[]};
  if(!Array.isArray(publicData?.entries)||publicData.entries.length>50||!publicData.entries.every(validRow))throw Error('排行榜返回格式异常');
  onPublic?.({entries:publicData.entries,me:null,personalPending:true});
  const {user,error}=await identity;
  try{
   if(error)throw Error(error);
   const personal=user?.puid?await deps.request(`/leaderboard/me?board=${board}`,'GET',undefined,true) as {me:Ranking['me']}:{me:null};
   if(!personal||personal.me&&(!Number.isSafeInteger(personal.me.rank)||personal.me.rank<1||!validRow(personal.me.entry)))throw Error('个人排名返回格式异常');
   if(user?.puid&&(await deps.user())?.puid!==user.puid)throw Error('账号已切换，请刷新排行榜');
   return {entries:publicData.entries,me:personal.me};
  }catch{return {entries:publicData.entries,me:null,personalError:'暂未获取个人排名，请刷新重试'};}
 };
 const claim=async(owner:string)=>{
  if(!deps.enabled()||!owner||(await deps.user())?.puid!==owner)throw Error('账号已切换，请刷新排行榜');
  for(const item of pending)if(item.owner===null)item.owner=owner;
  persist();update('已确认成绩所属账号，正在补传');return retry();
 };
 return {finish,retry,list,claim,getUnassignedCount:()=>pending.filter(p=>p.owner===null).length,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},getMessage:()=>message};
}
function browserStorage():StoragePort{try{return window.localStorage;}catch{return {getItem:()=>null,setItem:()=>{}};}}
function enabled(){return !import.meta.env.DEV&&leaderboardConfigured()&&typeof window!=='undefined'&&!['localhost','127.0.0.1','::1','[::1]'].includes(window.location.hostname);}
export async function leaderboardRequest(path:string,method:'GET'|'POST',data?:Record<string,unknown>,auth=false,api: HupuSdk['cloud']=window.ColorboxAI?.cloud){
 if(!api){await ensureColorboxSdk();api=window.ColorboxAI?.cloud;}
 if(!api)throw Error('当前环境不支持在线排行榜');
 const r=await sdkDeadline(api.request({url:leaderboardConfig.apiBase.replace(/\/$/,'')+path,method,data,envId:leaderboardConfig.envId,auth}),'排行请求超时，本地记录已保留');
 if(r.statusCode<200||r.statusCode>=300||![0,200].includes(r.code))throw Object.assign(Error(r.message||'排行服务暂不可用，请稍后重试'),{statusCode:r.statusCode===429||r.code===429?429:r.statusCode});
 return r.data;
}
export const leaderboard=createLeaderboardClient({storage:browserStorage(),enabled,user:getHupuUser,request:leaderboardRequest});
