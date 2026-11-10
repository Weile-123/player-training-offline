import {useEffect,useState,useSyncExternalStore} from 'react';
import {useContract} from '../contractStore';
import {legendaryAdCooldown,adRewardUnavailable,type AdReward} from '../game/contract/engine';
import {completeRewardedVideo,rewardVideoPending,subscribeRewardVideo} from '../platform/rewardedVideo';
import './RewardedAdButton.css';

export const adReason=(reason:string|null)=>reason?({
 'ad-already-used':'本次机会已使用','no-ad-legendary':'第2月起开放；需有尚未持有的已解锁传说器械',
 'already-hot':'已可进入火热','missing-player':'请先选择可训练球员','level-cap':'球员已满级',
 'normal-shot-item-already-armed':'请先完成已预备道具的普通投篮','game-over':'本局已结束',
 'no-ad-injury':'这次重伤已无法回溯','merchant-unavailable':'球探尚未到访',
 'stopwatch-available':'请优先使用秒表回溯',
 'completion-pending':'请先处理通关结算','ad-context-changed':'进度已变化，未在新进度发放奖励',
 'revive-not-needed':'当前无需复活',
 }[reason]??reason):'';

export function RewardedAdButton({reward,playerId,label,gold=false,onReward}:{reward:AdReward;playerId?:string;label:string;gold?:boolean;onReward?:()=>void}){
 const store=useContract(),[message,setMessage]=useState(''),[loading,setLoading]=useState(false);
 const busy=useSyncExternalStore(subscribeRewardVideo,rewardVideoPending,rewardVideoPending);
 useEffect(()=>setMessage(''),[store.state.careerId,store.state.month,playerId]);
 const reason=adRewardUnavailable(store.state,reward,playerId);
 const cooldown=reward==='legendary-shop'?legendaryAdCooldown(store.state):0;
 const displayLabel=cooldown>0?`冷却·剩余${cooldown}个月`:reward==='revive'&&store.state.adRewards?.revived?'复活·已使用':label;
 const watch=async()=>{
  const before=useContract.getState(),state=before.state;
  const unavailable=adRewardUnavailable(state,reward,playerId);if(unavailable){setMessage(adReason(unavailable));return;}
  setMessage('');setLoading(true);
  try{
   await completeRewardedVideo(()=>{
    const result=useContract.getState().act({type:'ad-reward',reward,playerId,careerId:state.careerId??'',revision:state.revision});
    if(result.error)throw Error(adReason(result.error));
    onReward?.();
   },{mock:import.meta.env.DEV&&before.debug.mockRewardedAds});
  }catch(error){setMessage(error instanceof Error?error.message:'广告暂不可用，请稍后重试');}finally{setLoading(false);}
 };
 return <><span className={`reward-ad-control${gold?' is-gold':''}`}>
  <button type="button" className="reward-ad-button" aria-busy={loading} title={message||undefined} disabled={busy||!!reason} onClick={()=>void watch()}>
   <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/>{reward==='injury-rewind'?<path d="m10 7-4 4 4 4m-4-4h7a5 5 0 0 1 5 5"/>:<path d="m9 6 8 6-8 6Z"/>}</svg>
   <span>{loading?'加载中…':message?'重试 · '+displayLabel:displayLabel}</span>
  </button>
 </span></>;
}
