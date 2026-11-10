import {assetUrl} from '../presentation/assetUrls';
import {useEffect,useRef,useState} from 'react';
import type {ShotFeedback} from '../presentation/feedback';
import {sceneProjection} from '../presentation/shotRenderer.js';

const labels={hold:'维持',success:'成功',great:'大成功',minor:'轻伤',severe:'重伤'};
const asset=(outcome:keyof typeof labels)=>assetUrl(`art/shot-status/${outcome}.png`);
type Pop={id:number;outcome:keyof typeof labels;x:number;y:number;width:number;expires:number};
export function ShotStatusPop({feedback,hoopScale,reduced,active=true}:{feedback:ShotFeedback|null;hoopScale:number;reduced:boolean;active?:boolean}){
 const root=useRef<HTMLDivElement>(null),last=useRef<number|null>(null),[pops,setPops]=useState<Pop[]>([]);
 useEffect(()=>{
  // 预加载五种图片，首次命中时不等待网络解码。
  const images=Object.keys(labels).map(outcome=>{const img=new Image();img.src=asset(outcome as keyof typeof labels);return img;});
  return()=>{images.forEach(img=>{img.onload=null;});};
 },[]);
 // Expiry belongs to the displayed queue, not the effect that received feedback.
 // React effect replay / hot reload can then cancel and safely reschedule cleanup.
 useEffect(()=>{
  if(!pops.length)return;
  const prune=()=>setPops(old=>old.filter(p=>p.expires>Date.now()));
  const timer=setTimeout(prune,Math.max(0,Math.min(...pops.map(p=>p.expires))-Date.now()));
  const visibility=()=>{if(document.hidden)setPops([]);else prune();};
  document.addEventListener('visibilitychange',visibility);
  return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);};
 },[pops]);
 useEffect(()=>{
  if(!feedback||!active){if(feedback)last.current=feedback.id;setPops([]);return;}
  if(last.current===feedback.id||!root.current)return;last.current=feedback.id;
  const {width:w,height:h}=root.current.getBoundingClientRect(),view=sceneProjection(w,h,hoopScale);
  const width=Math.min(180,w*.38,h*.58),half=width/2;
  const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
  // 只使用表现层随机数，不消耗决定训练结果的引擎随机序列。
  const x=clamp(view.x(360)*view.scale+(Math.random()<.5?-1:1)*w*(.10+Math.random()*.1),half+5,w-half-5);
  const y=clamp(view.y(112)*view.scale+h*(-.08+Math.random()*.24),width*.28+5,h-width*.28-5);
  const now=Date.now();
  setPops(old=>[...old.filter(p=>p.expires>now).slice(-5),{id:feedback.id,outcome:feedback.outcome,x,y,width,expires:now+(reduced?200:280)}]);
 },[feedback,hoopScale,reduced,active]);
 return <div className={`shot-status-pops ${reduced?'is-reduced':''}`} ref={root} aria-live="polite" aria-atomic="true">
  {active&&pops.map(p=><span key={p.id} className="shot-status-position" data-outcome={p.outcome} style={{left:p.x,top:p.y,width:p.width}} onAnimationEnd={()=>setPops(old=>old.filter(item=>item.id!==p.id))}><img className="shot-status-image" src={asset(p.outcome)} alt={labels[p.outcome]} draggable={false}/></span>)}
 </div>;
}
