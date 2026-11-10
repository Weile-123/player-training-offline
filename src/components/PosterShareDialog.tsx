import {cloneData} from '../utils/cloneData';
import {useEffect,useRef,useState} from 'react';
import {ComicDialog} from './ComicDialog';
import {generatePoster,posterDescription,playerPosterData,type PosterSpec} from '../presentation/completionPoster';
import {useContract} from '../contractStore';
import type {Athlete,Contract} from '../game/contract/engine';
import {rules} from '../game/contract/rules';
import {createPosterPosting,type PostingStage} from '../platform/posterPosting';
import '../completion.css';

export function PosterShareDialog({spec,onClose,rewardText,onShared}:{spec:PosterSpec;onClose:()=>void;rewardText?:string;onShared?:()=>string}){
 const mockShare=useContract(s=>import.meta.env.DEV&&s.debug.mockPosterShare);
 const [snapshot]=useState(()=>cloneData(spec)),info=posterDescription(snapshot);
 const [image,setImage]=useState<{url:string;blob:Blob}|null>(null),[rendering,setRendering]=useState(true),[stage,setStage]=useState<PostingStage>('idle'),[message,setMessage]=useState('');
 const posting=useRef(createPosterPosting()),lock=useRef(false),alive=useRef(true),imageUrl=useRef(''),abort=useRef<AbortController|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;abort.current?.abort();if(imageUrl.current)URL.revokeObjectURL(imageUrl.current);};},[]);
 useEffect(()=>{
  let cancelled=false;setRendering(true);setMessage('');
  void generatePoster(snapshot).then(blob=>{if(cancelled)return;const url=URL.createObjectURL(blob);imageUrl.current=url;setImage({url,blob});}).catch(()=>{if(!cancelled)setMessage('海报暂未生成，点击「发帖分享」可重试。');}).finally(()=>{if(!cancelled)setRendering(false);});
  return()=>{cancelled=true;};
 },[snapshot]);
 const busy=(!mockShare&&rendering)||stage==='uploading'||stage==='opening';
 const close=()=>{abort.current?.abort();onClose();};
 const share=async()=>{
  if(lock.current)return;lock.current=true;setMessage('');abort.current=new AbortController();
  try{
   if(import.meta.env.DEV&&useContract.getState().debug.mockPosterShare){setStage('opening');await new Promise(resolve=>setTimeout(resolve,1000));if(!alive.current||abort.current.signal.aborted)return;setStage('idle');const reward=onShared?.();setMessage(`本地测试：${reward||'已模拟打开发帖编辑器，未实际发帖。'}`);return;}
   let ready=image;
   if(!ready){setRendering(true);const blob=await generatePoster(snapshot);if(!alive.current||abort.current.signal.aborted)return;const url=URL.createObjectURL(blob);imageUrl.current=url;ready={url,blob};setImage(ready);setRendering(false);}
   await posting.current(ready.blob,`王牌训练师｜${info.title}`,info.content,value=>{if(alive.current)setStage(value);},abort.current.signal);
   const reward=onShared?.();if(alive.current)setMessage(reward||'已打开发帖编辑器。');
  }catch(error){if(alive.current)setMessage(error instanceof Error?error.message:'分享失败，请稍后手动重试');}
  finally{lock.current=false;if(alive.current)setRendering(false);}
 };
 return <ComicDialog className="poster-share-dialog" title={info.title} onClose={close} footer={<footer className="poster-share-footer"><button className="primary" disabled={busy} onClick={()=>void share()}>{stage==='opening'?'正在打开发帖…':mockShare?'发帖分享':rendering?'正在生成海报…':stage==='uploading'?'正在上传海报…':'发帖分享'}</button></footer>}>
  <div className="poster-share-content">
   {mockShare&&<p className="poster-share-notice">本地测试：免上传、免打开发帖编辑器，点击发帖分享测试领奖。</p>}
   {rewardText&&<p className="poster-reward-note">{rewardText}</p>}
   {rendering&&!image?<div className="poster-preview-loading" role="status">正在绘制球星海报…</div>:image&&<img className="poster-preview-image" src={image.url} alt={info.content}/>}
   {message&&<p className="poster-share-notice" role="status" aria-live="polite">{message}</p>}
  </div>
 </ComicDialog>;
}
export function PlayerShareDialog({game,player,onClose}:{game:Contract;player:Athlete;onClose:()=>void}){
 const live=useContract(),current=live.state.careerId===game.careerId?live.state.players.find(p=>p.id===player.id):undefined;
 const rewardText=current?.shareRewardClaimed?'这名球员已领取分享奖励，再次分享不再奖励。':(current?.level??player.level)>=rules.trainingLevelCap?'已达 99 级上限，分享不再增加等级。':'首次分享可免费升一级，每名球员限一次';
 const reward=()=>{
  const store=useContract.getState(),p=store.state.players.find(p=>p.id===player.id);
  if(store.state.careerId!==game.careerId||!p||store.state.status!=='playing')return '球员或生涯已变化，本次未发放奖励。';
  if(p.shareRewardClaimed)return '这名球员已领取过奖励，本次不重复发放。';
  if(p.level>=rules.trainingLevelCap)return '球员已达满级，不再增加等级。';
  const result=store.act({type:'share-reward',playerId:player.id,careerId:game.careerId??''});
  return result.error?'奖励未发放，请返回游戏检查球员状态。':'首次分享奖励已到账，按一次成功投篮结算。';
 };
 return <PosterShareDialog spec={{kind:'player',player:playerPosterData(game,player)}} rewardText={rewardText} onShared={reward} onClose={onClose}/>;
}
