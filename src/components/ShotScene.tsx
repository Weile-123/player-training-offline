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
 const [painted,setPainted]=useState(false);
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
  if(!hot)return;
  let active=true;
  const load=(name:string)=>new Promise<HTMLImageElement|null>(resolve=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src=assetUrl('art/heat/'+name);});
  void Promise.all([load('backboard-flame.png'),load('ball-flame.png')]).then(([board,ball])=>{if(active)setHeatImages({board,ball});});
  return()=>{active=false;};
 },[hot]);
 useEffect(()=>{if(error&&shots.length)onFinish();},[error,shots,onFinish]);
 useEffect(()=>{
  if(!assets)return;
  const context=canvas.current?.getContext('2d');if(!context){setError(true);return;}
  const active=new ConcurrentShots();let request=0,layoutRetry:ReturnType<typeof setTimeout>|undefined,previous=performance.now(),cancelled=false,hasPainted=false,lastSignature='',heatLevel=0;
  let lastFrames:ShotFrame[]=[],lastShots:ShotFeedback[]|undefined,lastReduced:boolean|undefined;
  let schedule=()=>{};
  const element=canvas.current!;
  const measure=()=>{
   const rect=element.getBoundingClientRect(),density=Math.min(window.devicePixelRatio||1,2);
   // A newly displayed WebView can report zero before its first layout. Do not
   // paint/cache a 1px idle scene and then wait for the player's first shot.
   if(rect.width<=0||rect.height<=0)return false;
   const width=Math.max(1,Math.round(rect.width*density)),height=Math.max(1,Math.round(rect.height*density));
   if(element.width!==width||element.height!==height){element.width=width;element.height=height;lastSignature='';}
   return true;
  };
  const invalidate=()=>{lastSignature='';schedule();};
  const resize=()=>{measure();invalidate();};
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;
  observer?.observe(element);window.addEventListener('resize',resize);
  const tick=(now:number)=>{
   request=0;
   if(cancelled)return;
   clearTimeout(layoutRetry);
   try{
   if(!measure()){
    // ResizeObserver is absent/unreliable in some native WebViews. Retry layout
    // independently of gameplay, while the static court remains visible.
    layoutRetry=setTimeout(schedule,100);return;
   }
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
    if(!hasPainted){hasPainted=true;setPainted(true);}
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
  wake.current=invalidate;
  const visibility=()=>{if(document.hidden){cancelAnimationFrame(request);request=0;clearTimeout(layoutRetry);}else invalidate();};
  const unsubscribe=subscribeAnimationConfig(invalidate);
  document.addEventListener('visibilitychange',visibility);window.addEventListener('pageshow',invalidate);element.addEventListener('contextrestored',invalidate);schedule();
  return ()=>{cancelled=true;wake.current=()=>{};cancelAnimationFrame(request);clearTimeout(layoutRetry);unsubscribe();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pageshow',invalidate);element.removeEventListener('contextrestored',invalidate);observer?.disconnect();window.removeEventListener('resize',resize);};
 },[assets]);
 return <div className={`front-shot-court ${hot?'hot-court':''}`} aria-label="正面投篮动画">
  {/* A local vector court is visible even before the first image response. Keep
      the real backdrop underneath until a decoded, full-size canvas is painted. */}
  <svg className="front-shot-backdrop" viewBox="0 0 720 540" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
   <defs><linearGradient id="shot-fallback-sky" x2="0" y2="1"><stop stopColor="#d2a979"/><stop offset="1" stopColor="#f3d5a0"/></linearGradient></defs>
   <path fill="url(#shot-fallback-sky)" d="M0 0h720v540H0z"/>
   <path fill="#486068" d="M0 176h45v-52h55v31h54v-69h58v84h55v-39h76v45h104v-78h61v47h45v-26h63v57h48v-71h56v435H0z"/>
   <path fill="#ac7953" stroke="#26383a" strokeWidth="5" d="M0 269h720v271H0z"/>
   <path fill="none" stroke="#edd5ac" strokeWidth="4" d="M0 310h720M180 540l113-230h134l113 230M242 410h236M0 471q360-163 720 0"/>
   <path stroke="#283c41" strokeWidth="11" d="M360 78v232"/>
   <path fill="#d7cdb4" stroke="#22383e" strokeWidth="7" d="M290 28h140v85H290z"/>
   <path fill="none" stroke="#9f4930" strokeWidth="4" d="M331 70h58v42h-58z"/>
   <path fill="none" stroke="#efe3c4" strokeWidth="3" d="M316 114l14 67h60l14-67M327 114l12 67m0-67 9 67m0-67 3 67m10-67-3 67m15-67-6 67m17-67-9 67m18-67-11 67m-61-44h78m-73 22h68"/>
   <ellipse cx="360" cy="113" rx="45" ry="7" fill="none" stroke="#8d3725" strokeWidth="6"/>
  </svg>
  <img className="front-shot-backdrop" src={shotArt('court-clean.png')} alt="夕阳下正对篮筐的美漫篮球场"/>
  <canvas ref={canvas} className="front-shot-canvas" width={720} height={540} style={{opacity:painted&&!error?1:0}} aria-hidden="true"/>
  {error&&<span className="shot-load-status" role="status">动画暂不可用，训练结果已结算</span>}
 </div>;
}
export function ShotResult({feedback}:{feedback:ShotFeedback}){
 return <div className={`shot-result ${feedback.outcome}`} role="status" aria-live="polite"><strong>{outcomeLabels[feedback.outcome]}{feedback.outcome==='severe'&&` · +$${feedback.saleIncome.toLocaleString('en-US')}`}</strong><span>{feedback.player.name} · {feedback.levelGain>0?`等级 +${feedback.levelGain}`:feedback.outcome==='severe'?'已按最低价强制出售':'继续判断下一步'}{feedback.heatGain!==0?` · 手感 ${feedback.heatGain>0?'+':''}${feedback.heatGain}`:''}</span>{feedback.evolution&&<div className={`evolution-banner ${feedback.evolution.kind==='实力降档'||feedback.evolution.kind==='模板失去'?'downgrade':''}`}><b>{feedback.evolution.kind}</b><span>{feedback.evolution.from} → {feedback.evolution.to}</span></div>}</div>;
}
