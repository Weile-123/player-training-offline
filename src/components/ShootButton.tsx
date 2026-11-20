import {useEffect, useMemo, useState, type CSSProperties} from 'react';
import './ShootButton.css';

type Props = {
 disabled: boolean;
 reduced: boolean;
 onShoot: () => void;
 cooldownUntil?: number;
 cooldownDurationMs?: number;
 mode?: 'shoot' | 'recruit';
};

const timeUntil = (deadline:number) => Math.max(0,deadline-Date.now());

export function ShootButton({disabled,reduced,onShoot,cooldownUntil,cooldownDurationMs=1000,mode='shoot'}:Props){
 const recruiting=mode==='recruit';
 const deadline=recruiting?0:cooldownUntil??0;
 const [,refresh]=useState(0);
 const startingTime=useMemo(()=>timeUntil(deadline),[deadline]);
 useEffect(()=>{
  if(!startingTime)return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const schedule=()=>{
   const time=timeUntil(deadline);
   const remaining=Math.min(cooldownDurationMs,time);
   if(remaining===0)return;
   // The mask moves in CSS. Wake React only when the tenths label changes, or at the exact deadline.
   const toNextTenth=(remaining+50)%100||100;
   timer=setTimeout(update,time-remaining+Math.min(remaining,toNextTenth+1));
  };
  const update=()=>{clearTimeout(timer);refresh(value=>value+1);schedule();};
  document.addEventListener('visibilitychange',update);
  if(timeUntil(deadline)>0)schedule();
  else update();
  return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',update);};
 },[deadline,cooldownDurationMs,startingTime]);
 const remaining=Math.min(cooldownDurationMs,timeUntil(deadline));
 const cooling=remaining>0;
 const sweepTime=Math.min(startingTime,cooldownDurationMs);
 const sweep={'--shoot-cooldown-height':`${sweepTime/Math.max(1,cooldownDurationMs)*100}%`,
  '--shoot-cooldown-duration':`${sweepTime}ms`,'--shoot-cooldown-delay':`${startingTime-sweepTime}ms`} as CSSProperties;
 const button=<button className={`dock-control dock-shoot${recruiting?' is-recruiting':''}${cooling?' is-cooling':''}`} aria-label={recruiting?'招募球员':'投篮训练'} disabled={disabled||cooling} title={cooling?`冷却中 ${(remaining/1000).toFixed(1)} 秒`:undefined} data-cooldown-ms={cooldownUntil===undefined?undefined:Math.ceil(remaining)} onClick={event=>{
  const face=event.currentTarget.firstElementChild;
  if(!reduced&&face&&typeof face.animate==='function'){
   face.getAnimations?.().forEach(animation=>animation.cancel());
   face.animate([
    {transform:'translateY(6px) scale(.93)',filter:'brightness(.72)'},
    {transform:'translateY(6px) scale(.93)',filter:'brightness(.72)',offset:.23},
    {transform:'translateY(-1px) scale(1.015)',filter:'brightness(1.05)',offset:.75},
    {transform:'translateY(0) scale(1)',filter:'brightness(1)'},
   ],{duration:230,easing:'ease-out'});
  }
  onShoot();
 }}><span className="dock-shoot-face" aria-hidden="true">{recruiting&&<><span className="dock-recruit-surface"><span className="dock-recruit-infill"/></span><svg className="dock-recruit-art" viewBox="0 0 318 300"><g transform="translate(111 35) scale(2)"><circle cx="18" cy="13" r="8"/><circle cx="34" cy="15" r="5"/><path d="M4 43V32a14 14 0 0 1 28 0v11ZM34 26q11 0 11 17h-9"/></g><text x="159" y="213" textAnchor="middle">招募</text></svg></>}{cooling&&<span key={`${deadline}:${cooldownDurationMs}`} className="dock-shoot-cooldown" style={sweep}/>}</span></button>;
 return cooldownUntil===undefined?button:<>{button}{cooling&&<span className="dock-shoot-timer" aria-hidden="true">{(remaining/1000).toFixed(1)}s</span>}</>;
}
