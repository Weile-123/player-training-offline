import {useEffect, useRef, useState} from 'react';
import {playerLevelCap} from '../game/gym/progression';
import {cloneData} from '../utils/cloneData';
import {generateGymSharePoster, gymShareCopy, type GymSharePoster} from '../presentation/gymSharePoster';
import {openGymPost, type GymPostingStage} from '../platform/gymPosting';
import {useGymDebug} from '../platform/gymDebug';
import {ComicDialog} from './ComicDialog';
import {ActionNotice} from './ActionNotice';
import '../completion.css';
import './GymRewards.css';

type Props = GymSharePoster & {onClose:()=>void; onGranted:()=>Promise<boolean>; onBeforeOpen?:()=>Promise<void>; allowSimulated?:boolean};

export function GymShareDialog({onClose,onGranted,onBeforeOpen,allowSimulated=true,...source}:Props) {
 const [snapshot] = useState(() => cloneData(source));
 const reason = snapshot.reason;
 const copy = gymShareCopy(snapshot), debug = useGymDebug();
 const [busy, setBusy] = useState(false), [rendering, setRendering] = useState(true), [message, setMessage] = useState(''), [done, setDone] = useState(false);
 const [image, setImage] = useState<{url: string; blob: Blob} | null>(null), [stage, setStage] = useState<GymPostingStage | null>(null);
 const lock = useRef(false), alive = useRef(true), controller = useRef<AbortController>(), imageUrl = useRef('');
 const reward = reason === 'revive' ? '分享奖励：复活并获得一次引援机会，必定出现一名巨星。'
  : reason === 'levels' ? `分享奖励：等级 +3（最高 ${playerLevelCap} 级）` : '分享奖励：当前球员体力回满';
 useEffect(() => {alive.current = true; return () => {alive.current = false; controller.current?.abort(); if (imageUrl.current) URL.revokeObjectURL(imageUrl.current);};}, []);
 useEffect(() => {
  let cancelled = false;
  void generateGymSharePoster(snapshot).then(blob => {
   if (cancelled) return;
   const url = URL.createObjectURL(blob); imageUrl.current = url; setImage({url, blob});
  }).catch(() => {if (!cancelled) setMessage('海报暂未生成，点击「发帖分享」重试。');}).finally(() => {if (!cancelled) setRendering(false);});
  return () => {cancelled = true;};
 }, [snapshot]);
 const share = async () => {
  if (lock.current || done) return;
  lock.current = true; controller.current = new AbortController(); setBusy(true); setMessage('');
  try {
   if (debug.skipPosting && !allowSimulated) throw Error('请先关闭免发帖测试，或切换到独立测试球馆');
   let ready = image;
   if (!ready && !debug.skipPosting) {
    setRendering(true);
    const blob = await generateGymSharePoster(snapshot);
    if (!alive.current || controller.current.signal.aborted) return;
    const url = URL.createObjectURL(blob); imageUrl.current = url; ready = {url, blob}; setImage(ready); setRendering(false);
   }
   await onBeforeOpen?.();
   if (!alive.current || controller.current.signal.aborted) return;
   const acknowledgement = await openGymPost(copy.title, copy.content, controller.current.signal, ready ? {blob: ready.blob, onStage: next => {if (alive.current) setStage(next);}} : undefined);
   if (acknowledgement.simulated && !allowSimulated) throw Error('测试分享不能领取正式球馆奖励');
   if (!alive.current || controller.current.signal.aborted) return;
   const granted = await onGranted();
   if (alive.current) {
    if (granted) {setDone(true); onClose();}
    else setMessage(reason==='revive'?'挑战状态已变化，复活奖励未领取':'球员状态已变化，奖励未领取，请返回球场查看');
   }
  } catch (error) {if (alive.current) setMessage(error instanceof Error ? error.message : '分享失败，请稍后重试');}
  finally {lock.current = false; if (alive.current) {setBusy(false); setRendering(false); setStage(null);}}
 };
 const disabled = busy || done || rendering && !debug.skipPosting;
 const label = done ? '已领取' : stage === 'uploading' ? '正在上传海报…' : stage === 'opening' ? '正在打开发帖…' : rendering && !debug.skipPosting ? '正在生成海报…' : busy ? '正在打开发帖…' : '发帖分享';
 return <ComicDialog title="发帖分享" priority={reason==='revive'?2:0} className="gym-management-dialog poster-share-dialog gym-share-dialog" onClose={() => {controller.current?.abort(); onClose();}} footer={<footer className="poster-share-footer"><button type="button" className="primary" disabled={disabled} onClick={() => void share()}>{label}</button></footer>}><div className="gym-share-content poster-share-content">
  <p className="gym-share-reward poster-reward-note">{reward}</p>
  {rendering && !image ? <div className="poster-preview-loading" role="status">正在绘制海报…</div> : image && <img className="poster-preview-image gym-share-poster" src={image.url} alt={copy.content}/>}
  {debug.skipPosting && allowSimulated && <p className="poster-share-notice">本地测试：免上传、免打开发帖编辑器。</p>}
  <ActionNotice message={message} role="alert" className="poster-share-notice"/>
 </div></ComicDialog>;
}
