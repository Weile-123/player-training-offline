import {useEffect, useState} from 'react';
import './ShootButton.css';

type Props = {
 disabled: boolean;
 reduced: boolean;
 onShoot: () => void;
 cooldownUntil?: number;
 cooldownDurationMs?: number;
};

function CooldownShootButton(props: Props){
 const {cooldownUntil=0,cooldownDurationMs=1000}=props;
 const [now,setNow]=useState(Date.now);
 useEffect(()=>{
  let frame=0;
  const update=()=>{
   const time=Date.now();
   setNow(time);
   if(time<cooldownUntil)frame=requestAnimationFrame(update);
  };
  update();
  return()=>cancelAnimationFrame(frame);
 },[cooldownUntil]);
 const remaining=Math.max(0,Math.min(cooldownDurationMs,cooldownUntil-now));
 return shootButton(props,remaining);
}

function shootButton({disabled,reduced,onShoot,cooldownUntil,cooldownDurationMs=1000}:Props,remaining:number){
 const cooling=remaining>0;
 const button=<button className={`dock-control dock-shoot${cooling?' is-cooling':''}`} aria-label="投篮训练" disabled={disabled||cooling} title={cooling?`冷却中 ${(remaining/1000).toFixed(1)} 秒`:undefined} data-cooldown-ms={cooldownUntil===undefined?undefined:Math.ceil(remaining)} onClick={event=>{
  const face=event.currentTarget.firstElementChild;
  if(!reduced&&face&&typeof face.animate==='function'){
   face.getAnimations().forEach(animation=>animation.cancel());
   face.animate([
    {transform:'translateY(6px) scale(.93)',filter:'brightness(.72)'},
    {transform:'translateY(6px) scale(.93)',filter:'brightness(.72)',offset:.23},
    {transform:'translateY(-1px) scale(1.015)',filter:'brightness(1.05)',offset:.75},
    {transform:'translateY(0) scale(1)',filter:'brightness(1)'},
   ],{duration:230,easing:'ease-out'});
  }
  onShoot();
 }}><span className="dock-shoot-face" aria-hidden="true">{cooling&&<span className="dock-shoot-cooldown" style={{height:`${remaining/cooldownDurationMs*100}%`}}/>}</span></button>;
 return cooldownUntil===undefined?button:<>{button}{cooling&&<span className="dock-shoot-timer" aria-hidden="true">{(remaining/1000).toFixed(1)}s</span>}</>;
}

export function ShootButton(props:Props){
 return props.cooldownUntil===undefined?shootButton(props,0):<CooldownShootButton {...props}/>;
}
