import {gameAudio} from '../presentation/audio';
import {soundEnabled} from '../presentation/sampleAudio';
import './TemplatePortraitReveal.css';
import {assetUrl} from '../presentation/assetUrls';
import { useEffect,useLayoutEffect,useRef,useState,type ReactNode } from 'react';
import { statLabels } from '../game/config';
import { rating } from '../game/engine';
import { positionLabels, templateById } from '../game/templates';
import { statKeys, type Player } from '../game/types';
import type { ShotFeedback } from '../presentation/feedback';
import { AnimatedNumber } from './AnimatedNumber';
import { usePlayerProfile } from '../platform/usePlayerProfile';
import { fallbackProfile } from '../platform/hupuPlayers';
import { SchemeArt } from './SchemeArt';
import { TierBadge } from './TierBadge';

export function templatePortrait(id:string|null|undefined) {
 return fallbackProfile(id)?.avatar ?? null;
}

export function StarPortrait(props:{src:string|null;fallbackSrc?:string|null;name:string;highPotential?:boolean}) {
 // A failed previous player must not poison the next player's image.
 return <PortraitContent key={`${props.src??''}|${props.fallbackSrc??''}`} {...props}/>;
}
function PortraitContent({src,fallbackSrc,name,highPotential=false}:{src:string|null;fallbackSrc?:string|null;name:string;highPotential?:boolean}) {
 const [failures,setFailures]=useState(0);
 const [retry,setRetry]=useState(0);
 const retryTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>()=>{if(retryTimer.current!==null)clearTimeout(retryTimer.current);},[]);
 const backup=fallbackSrc&&fallbackSrc!==src?fallbackSrc:null;
 const imageSource=failures===0?src:failures===1?backup:null;
 if(!src&&highPotential)return <img className="rookie-portrait high-potential-portrait" src={assetUrl(`art/players/high-potential-rookie.png`)} alt="高潜力新人头像"/>;
 if(!src)return <SchemeArt name="rookie" className="rookie-portrait" label="待发掘球员头像"/>;
 if(!imageSource)return <span className="template-silhouette" aria-label={src?'球星头像暂不可用':'尚未匹配球星模板'}>
  <svg viewBox="0 0 100 120" preserveAspectRatio="xMidYMax meet" aria-hidden="true"><circle cx="50" cy="34" r="22"/><path d="M10 120V99c0-28 18-43 40-43s40 15 40 43v21Z"/></svg><span>{src?'头像暂不可用':'待发掘'}</span>
 </span>;
 return <img key={`${imageSource}|${retry}`} className="template-portrait-photo" src={imageSource} alt={`${name}模板头像`} referrerPolicy="no-referrer" onError={()=>{
  if(retryTimer.current!==null)return;
  if(retry===0){retryTimer.current=setTimeout(()=>{retryTimer.current=null;setRetry(1);},500);}
  else {setRetry(0);setFailures(v=>v+1);}
 }}/>;
}

type PortraitSnapshot={templateId:string|null|undefined;src:string|null;fallbackSrc:string|null;name:string;highPotential?:boolean};
export function TemplatePortraitReveal({tier,reduced=false,...current}:PortraitSnapshot&{tier:string;reduced?:boolean}){
 const previous=useRef(current),[old,setOld]=useState<PortraitSnapshot|null>(null);
 const revealSoundPlayed=useRef(false);
 const incoming=useRef<HTMLSpanElement>(null),cover=useRef<HTMLSpanElement>(null),line=useRef<HTMLSpanElement>(null);
 useLayoutEffect(()=>{
  const before=previous.current;previous.current=current;
  if(before.templateId!==current.templateId){
   revealSoundPlayed.current=false;
   if(current.templateId&&(reduced||window.matchMedia('(prefers-reduced-motion: reduce)').matches)){revealSoundPlayed.current=true;void gameAudio.play('evolution',soundEnabled());}
   setOld(reduced||window.matchMedia('(prefers-reduced-motion: reduce)').matches?null:before);
  }
 },[current.templateId,current.src,current.fallbackSrc,current.name,current.highPotential,reduced]);
 useEffect(()=>{
  if(!old)return;
  if(reduced||window.matchMedia('(prefers-reduced-motion: reduce)').matches||!cover.current?.animate){setOld(null);return;}
  let started=false,active=true;
  const animations:Animation[]=[];
  let finishTimer:ReturnType<typeof setTimeout>|undefined;
  const finish=()=>{if(active)setOld(null);};
  const start=()=>{
   if(started||!active||!cover.current||!line.current)return;
   started=true;
   if(current.templateId&&!revealSoundPlayed.current){revealSoundPlayed.current=true;void gameAudio.play('evolution',soundEnabled());}
   const options={duration:720,easing:'cubic-bezier(.3,0,.2,1)',fill:'forwards' as const};
   animations.push(cover.current.animate([{clipPath:'inset(0% 0 0 0)'},{clipPath:'inset(100% 0 0 0)'}],options));
   animations.push(line.current.animate([{top:'0%',opacity:1},{top:'100%',opacity:1}],options));
   animations[0].onfinish=finish;
   finishTimer=setTimeout(finish,800);
  };
  // Keep the old portrait visible while the replacement image is loading.
  const layer=incoming.current;
  const checkReady=()=>{const image=layer?.querySelector('img');if(!image||image.complete&&image.naturalWidth>0)start();};
  layer?.addEventListener('load',checkReady,true);
  checkReady();
  // Failed/slow images must not leave an obsolete portrait covering the fallback forever.
  const waitTimer=setTimeout(start,1600);
  return()=>{active=false;clearTimeout(waitTimer);clearTimeout(finishTimer);layer?.removeEventListener('load',checkReady,true);animations.forEach(animation=>animation.cancel());};
 },[old,reduced,current.src]);
 const surface=(snapshot:PortraitSnapshot)=>`template-portrait-content ${snapshot.templateId?'album-portrait-surface':''}`;
 return <span className="template-portrait-slot tier-portrait-frame" data-tier={tier}>
  <span ref={incoming} className={surface(current)}><StarPortrait {...current}/></span>
  {old&&<><span ref={cover} className={`${surface(old)} portrait-reveal-cover`} aria-hidden="true"><StarPortrait {...old}/></span><span className="portrait-reveal-track" aria-hidden="true"><span ref={line} className="portrait-reveal-line"/></span></>}
 </span>;
}

export function PlayerTemplatePanel({player,feedback,reduced=false,disabled,onDetails,onShare,showTrainingLevel=true,showLevelBeforeTier=false,identityAction,showPosition=true}:{player:Player|undefined;feedback:ShotFeedback|null;reduced?:boolean;disabled:boolean;onDetails?:()=>void;onShare?:()=>void;showTrainingLevel?:boolean;showLevelBeforeTier?:boolean;identityAction?:ReactNode;showPosition?:boolean}) {
 const t=templateById(player?.templateId),profile=usePlayerProfile(t?.id),name=profile?.name??t?.name??'待发掘';
 const changes=feedback?.player.id===player?.id?feedback?.changes:undefined;
 const tone=(delta=0)=>delta>0?'up' as const:delta<0?'down' as const:'neutral' as const;
 const Tag=onDetails&&!onShare&&!identityAction?'button':'div';
 return <Tag className={`star-template-panel ${t?.tier??'undiscovered'}`} data-tier={t?.tier??'undiscovered'} {...(onDetails?{disabled:disabled||!player,onClick:onDetails}:{})} aria-label={`${onDetails?'查看球员档案':'当前球星模板'}：${name}`}>
  <TemplatePortraitReveal key={player?.id??'empty'} templateId={player?.templateId} tier={t?.tier??'undiscovered'} src={profile?.avatar??templatePortrait(t?.id)} fallbackSrc={templatePortrait(t?.id)} highPotential={player?.highPotential} name={name} reduced={reduced}/>
  <span className="template-main-identity"><strong style={{fontSize:`min(${Math.min(6.6,43/name.length)}cqw,var(--template-name-max,6.6cqw))`}} title={name}>{name}</strong><span className="template-identity-meta">{showLevelBeforeTier && player && <span className="template-player-level">Lv.{player.level}</span>}<TierBadge tier={t?.tier}/>{onShare&&t?<button type="button" className="template-share-button" disabled={disabled||!player} onClick={event=>{event.stopPropagation();onShare();}}>训练{player?.level??'—'} | 分享+1</button>:<span className={identityAction ? 'template-position-action' : undefined}>{showTrainingLevel && <>训练{player?.level??'—'} | </>}{showPosition && (t?positionLabels[t.position]:'等待匹配')}{identityAction}</span>}</span></span>
  <span className="template-live-rating"><small>综合评分</small>{player?<AnimatedNumber key={player.id} value={rating(player)} decimals={1} reduced={reduced} tone={tone(statKeys.reduce((sum,k)=>sum+(changes?.[k]??0),0))}/>:<b>—</b>}</span>
  <span className="template-live-stats">{statKeys.map(k=><span key={k}><small>{statLabels[k]}</small>{player?<AnimatedNumber key={player.id} value={player.stats[k]} reduced={reduced} tone={tone(changes?.[k])}/>:<b>—</b>}</span>)}</span>
 </Tag>;
}
