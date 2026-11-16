import {useEffect, useState} from 'react';
import './ShootButton.css';

type Props = {
 disabled: boolean;
 reduced: boolean;
 onShoot: () => void;
 cooldownUntil?: number;
 cooldownDurationMs?: number;
 mode?: 'shoot' | 'recruit';
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

function shootButton({disabled,reduced,onShoot,cooldownUntil,cooldownDurationMs=1000,mode='shoot'}:Props,remaining:number){
 const recruiting=mode==='recruit';
 const cooling=!recruiting&&remaining>0;
 const button=<button className={`dock-control dock-shoot${recruiting?' is-recruiting':''}${cooling?' is-cooling':''}`} aria-label={recruiting?'招募球员':'投篮训练'} disabled={disabled||cooling} title={cooling?`冷却中 ${(remaining/1000).toFixed(1)} 秒`:undefined} data-cooldown-ms={cooldownUntil===undefined?undefined:Math.ceil(remaining)} onClick={event=>{
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
 }}><span className="dock-shoot-face" aria-hidden="true">{recruiting&&<><span className="dock-recruit-surface"><span className="dock-recruit-infill"/></span><svg className="dock-recruit-art" viewBox="0 0 318 300"><g transform="translate(111 35) scale(2)"><circle cx="18" cy="13" r="8"/><circle cx="34" cy="15" r="5"/><path d="M4 43V32a14 14 0 0 1 28 0v11ZM34 26q11 0 11 17h-9"/></g><text x="159" y="213" textAnchor="middle">招募</text></svg></>}{cooling&&<span className="dock-shoot-cooldown" style={{height:`${remaining/cooldownDurationMs*100}%`}}/>}</span></button>;
 return cooldownUntil===undefined?button:<>{button}{cooling&&<span className="dock-shoot-timer" aria-hidden="true">{(remaining/1000).toFixed(1)}s</span>}</>;
}

export function ShootButton(props:Props){
 // Keep the observed button node stable when automatic training removes its cooldown.
 return <CooldownShootButton {...props}/>;
}
