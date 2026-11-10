import {assetUrl} from '../presentation/assetUrls';
import { useEffect, useRef, useState } from 'react';
import { outcomeLabels, type ShotFeedback } from '../presentation/feedback';
import { ConcurrentShots, loadShotAnimation, shotArt, shotPlayback } from '../presentation/shotAnimation';
import { drawMultiScene } from '../presentation/shotRenderer.js';
import { getAnimationConfig,subscribeAnimationConfig } from '../presentation/animationConfig';
import type {ShotFrame} from '../presentation/shotRenderer.js';
import {stepHeat,type HeatVisual} from '../presentation/heatRenderer.js';
export function ShotScene({feedback,shots=[],hot,reduced=false,hideOutcomeLabel=false,onFinish}:{feedback:ShotFeedback|null;shots?:ShotFeedback[];busy:boolean;hot:boolean;reduced?:boolean;hideOutcomeLabel?:boolean;onFinish:(id?:number)=>void}){
 const canvas=useRef<HTMLCanvasElement>(null);
 const [heatImages,setHeatImages]=useState<HeatVisual['images']>(null);
 const live=useRef({shots,feedback,hot,reduced,heatImages,hideOutcomeLabel,onFinish});live.current={shots,feedback,hot,reduced,heatImages,hideOutcomeLabel,onFinish};
 const wake=useRef(()=>{});
 useEffect(()=>wake.current(),[shots,feedback,hot,reduced,heatImages,hideOutcomeLabel]);
 const [assets,setAssets]=useState<Awaited<ReturnType<typeof loadShotAnimation>>|null>(null),[error,setError]=useState(false);
 useEffect(()=>{
  let cancelled=false;
  void loadShotAnimation().then(value=>{if(!cancelled)setAssets(value);}).catch(()=>{if(!cancelled)setError(true);});
  return ()=>{cancelled=true;};
 },[]);
 useEffect(()=>{
  let active=true;
  const load=(name:string)=>new Promise<HTMLImageElement|null>(resolve=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src=assetUrl('art/heat/'+name);});
  void Promise.all([load('backboard-flame.png'),load('ball-flame.png')]).then(([board,ball])=>{if(active)setHeatImages({board,ball});});
  return()=>{active=false;};
 },[]);
 useEffect(()=>{if(error&&shots.length)onFinish();},[error,shots,onFinish]);
 useEffect(()=>{
  if(!assets)return;
  const context=canvas.current?.getContext('2d');if(!context){setError(true);return;}
  const active=new ConcurrentShots();let request=0,previous=performance.now(),cancelled=false,lastSignature='',heatLevel=0;
  let lastFrames:ShotFrame[]=[],lastShots:ShotFeedback[]|undefined,lastReduced:boolean|undefined;
  let schedule=()=>{};
  const element=canvas.current!;
  const resize=()=>{
   const rect=element.getBoundingClientRect(),density=Math.min(window.devicePixelRatio||1,2);
   const width=Math.max(1,Math.round(rect.width*density)),height=Math.max(1,Math.round(rect.height*density));
   if(element.width!==width||element.height!==height){element.width=width;element.height=height;lastSignature='';schedule();}
  };
  resize();
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;
  observer?.observe(element);window.addEventListener('resize',resize);
  const tick=(now:number)=>{
   request=0;
   if(cancelled)return;
   try{
   const props=live.current;
   if(props.shots!==lastShots||props.reduced!==lastReduced){active.sync(props.reduced?[]:props.shots);lastShots=props.shots;lastReduced=props.reduced;}
   const playbackRate=shotPlayback.duration/(getAnimationConfig().shotAnimationDurationSeconds*1000);
   const delta=Math.min(100,now-previous);
   const {frames,finished}=active.step(now-previous,playbackRate,assets.timeline);previous=now;
   heatLevel=stepHeat(heatLevel,props.hot,delta,props.reduced);
   const heatMarker=heatLevel.toFixed(3);
   if(element.dataset.heatLevel!==heatMarker)element.dataset.heatLevel=heatMarker;
   // No React state updates per animation frame, and no repeated idle canvas paints.
   const hoopScale=getAnimationConfig().hoopScale;
   const heatTime=props.reduced?0:Math.floor(now/33)*33;
   const signature=hoopScale+':'+heatLevel.toFixed(2)+':'+props.hideOutcomeLabel+':'+(heatLevel>0?heatTime+String(!!props.heatImages):'');
   const ready=!props.feedback&&!props.shots.length;
   if(signature+ready!==lastSignature||frames.length!==lastFrames.length||frames.some((frame,i)=>frame!==lastFrames[i])){
    drawMultiScene(context,assets.images,ready?[assets.timeline.outcomes.great.frames[0]]:props.hideOutcomeLabel?frames.map(f=>({...f,label:null})):frames,shotPlayback.ballScale,element.width,element.height,hoopScale,{level:heatLevel,time:heatTime,reduced:props.reduced,images:props.heatImages});
    lastSignature=signature+ready;
    lastFrames=frames;
   }
   finished.forEach(id=>props.onFinish(id));
   if(frames.length||(!props.reduced&&(props.hot||heatLevel>0)))request=requestAnimationFrame(tick);
   }catch{
    // A broken canvas must not leave the page locked on a severe shot.
    setError(true);live.current.onFinish();
   }
  };
  schedule=()=>{if(!cancelled&&!request&&!document.hidden){previous=performance.now();request=requestAnimationFrame(tick);}};
  wake.current=schedule;
  const visibility=()=>{if(document.hidden){cancelAnimationFrame(request);request=0;}else schedule();};
  const unsubscribe=subscribeAnimationConfig(schedule);
  document.addEventListener('visibilitychange',visibility);schedule();
  return ()=>{cancelled=true;wake.current=()=>{};cancelAnimationFrame(request);unsubscribe();document.removeEventListener('visibilitychange',visibility);observer?.disconnect();window.removeEventListener('resize',resize);};
 },[assets]);
 return <div className={`front-shot-court ${hot?'hot-court':''}`} aria-label="正面投篮动画">
  {(!assets||error)&&<img className="front-shot-backdrop" src={shotArt('court-clean.png')} alt="夕阳下正对篮筐的美漫篮球场"/>}
  <canvas ref={canvas} className="front-shot-canvas" width={720} height={540} style={{opacity:assets&&!error?1:0}} aria-hidden="true"/>
  {error&&<span className="shot-load-status" role="status">动画暂不可用，训练结果已结算</span>}
 </div>;
}
export function ShotResult({feedback}:{feedback:ShotFeedback}){
 return <div className={`shot-result ${feedback.outcome}`} role="status" aria-live="polite"><strong>{outcomeLabels[feedback.outcome]}{feedback.outcome==='severe'&&` · +$${feedback.saleIncome.toLocaleString('en-US')}`}</strong><span>{feedback.player.name} · {feedback.levelGain>0?`等级 +${feedback.levelGain}`:feedback.outcome==='severe'?'已按最低价强制出售':'继续判断下一步'}{feedback.heatGain!==0?` · 手感 ${feedback.heatGain>0?'+':''}${feedback.heatGain}`:''}</span>{feedback.evolution&&<div className={`evolution-banner ${feedback.evolution.kind==='实力降档'||feedback.evolution.kind==='模板失去'?'downgrade':''}`}><b>{feedback.evolution.kind}</b><span>{feedback.evolution.from} → {feedback.evolution.to}</span></div>}</div>;
}
