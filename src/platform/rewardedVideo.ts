import {ensureColorboxSdk,type HupuSdk} from './hupuSdk';
import {assertHupuProject} from './hupuProject';

/** Native SDK acknowledgement only; the platform does not return a signed server receipt. */
export type RewardedVideoConfirmation = {rewarded: true; confirmation: 'native-sdk-confirmation' | 'local-debug-confirmation'};

let pending=false;
const listeners=new Set<()=>void>();
export const rewardVideoPending=()=>pending;
export const subscribeRewardVideo=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
const setPending=(value:boolean)=>{pending=value;listeners.forEach(fn=>fn());};
export const rewardVideoTimeoutMs=120000;
async function bounded<T>(task:Promise<T>):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([task,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('广告响应超时，未领取奖励，可继续游玩')),rewardVideoTimeoutMs);})]);}
 finally{clearTimeout(timer);}
}

/** One user-triggered flow, including the atomic game reward, shared by every entry. */
export async function completeRewardedVideo(grant:()=>void|Promise<void>,options:{mock?:boolean;load?:()=>Promise<HupuSdk|undefined>;onTaskStateError?:(message:string)=>void}={}):Promise<RewardedVideoConfirmation>{
 if(pending)throw Error('广告正在进行，请稍候');
 setPending(true);
 try{
  if(import.meta.env.DEV&&options.mock){await new Promise(resolve=>setTimeout(resolve,1000));await grant();return {rewarded:true,confirmation:'local-debug-confirmation'};}
  assertHupuProject();
  const sdk=await bounded((options.load??(async()=>{await ensureColorboxSdk();return window.ColorboxAI;}))());
  assertHupuProject();
  if(!sdk?.vatask?.completeRewardVideo)throw Error('当前环境不支持激励广告，请在虎扑 App 内打开');
  // A lost native callback must not lock the whole game indefinitely. Late
  // responses after the deadline cannot reach grant() or reward a different career.
  const response=await bounded(sdk.vatask.completeRewardVideo());
  assertHupuProject();
  if(response?.code!==200||response.data?.rewarded!==true){
   const reasons:Record<string,string>={APP_REQUIRED:'请在虎扑 App 内观看激励广告',LOGIN_REQUIRED:'请先登录虎扑，再领取广告奖励',UNAVAILABLE:'当前广告任务不可用或已完成，请稍后再试',NOT_REWARDED:'未完整观看广告，奖励未领取',REQUEST_FAILED:'广告任务查询失败，请稍后重试',REWARD_FLOW_FAILED:'广告未能拉起，请稍后重试'};
   throw Error(response?.message||reasons[response?.data?.reason??'']||'未完成广告观看，奖励未领取');
  }
  // Refresh platform state, but a query failure cannot revoke a confirmed reward.
  const refreshFailed=(error:unknown)=>options.onTaskStateError?.(error instanceof Error?error.message:'任务状态刷新失败，奖励已确认');
  try{void bounded(sdk.vatask.getActivityTaskState()).then(result=>{
   const response=result as {code?:number;message?:string}|null;
   if(response?.code!==undefined&&response.code!==200)refreshFailed(Error(response.message||'任务状态刷新失败，奖励已确认'));
  }).catch(refreshFailed);}catch(error){refreshFailed(error);}
  await grant();
  return {rewarded:true,confirmation:'native-sdk-confirmation'};
 }finally{setPending(false);}
}
