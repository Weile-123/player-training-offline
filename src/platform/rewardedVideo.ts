import {ensureColorboxSdk,type HupuSdk} from './hupuSdk';

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
export async function completeRewardedVideo(grant:()=>void,options:{mock?:boolean;load?:()=>Promise<HupuSdk|undefined>;onTaskStateError?:(message:string)=>void}={}):Promise<void>{
 if(pending)throw Error('广告正在进行，请稍候');
 setPending(true);
 try{
  if(import.meta.env.DEV&&options.mock){await new Promise(resolve=>setTimeout(resolve,1000));grant();return;}
  const sdk=await bounded((options.load??(async()=>{await ensureColorboxSdk();return window.ColorboxAI;}))());
  if(!sdk?.vatask?.completeRewardVideo)throw Error('当前环境不支持激励广告，请在虎扑 App 内打开');
  // A lost native callback must not lock the whole game indefinitely. Late
  // responses after the deadline cannot reach grant() or reward a different career.
  const response=await bounded(sdk.vatask.completeRewardVideo());
  if(response.code!==200||response.data?.rewarded!==true)throw Error(response.message||'未完成广告观看，奖励未领取');
  // Refresh platform state, but a query failure cannot revoke a confirmed reward.
  const refreshFailed=(error:unknown)=>options.onTaskStateError?.(error instanceof Error?error.message:'任务状态刷新失败，奖励已确认');
  try{void bounded(sdk.vatask.getActivityTaskState()).then(result=>{
   const response=result as {code?:number;message?:string}|null;
   if(response?.code!==undefined&&response.code!==200)refreshFailed(Error(response.message||'任务状态刷新失败，奖励已确认'));
  }).catch(refreshFailed);}catch(error){refreshFailed(error);}
  grant();
 }finally{setPending(false);}
}
