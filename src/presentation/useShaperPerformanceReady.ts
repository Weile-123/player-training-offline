import {useEffect,useRef} from 'react';

declare global {
 interface Window {ShaperPerformance?: {markReady?: () => unknown};}
}

/** Report committed, usable UI once per platform measurement cycle. The reset
 * event also covers BFCache restoration; readiness is checked again at paint. */
export function useShaperPerformanceReady(ready:boolean,checkReady?:()=>boolean){
 const current=useRef({ready,checkReady});current.current={ready,checkReady};
 const reported=useRef(false),frame=useRef<number|null>(null);
 useEffect(()=>{
  const cancel=()=>{if(frame.current!==null){cancelAnimationFrame(frame.current);frame.current=null;}};
  const schedule=()=>{
   cancel();
   if(reported.current||!current.current.ready)return;
   frame.current=requestAnimationFrame(()=>{
    frame.current=null;
    if(reported.current||!current.current.ready||current.current.checkReady?.()===false)return;
    const sdk=window.ShaperPerformance;
    if(typeof sdk?.markReady!=='function')return;
    try{sdk.markReady();reported.current=true;}catch{/* Optional telemetry cannot interrupt play. */}
   });
  };
  const reset=()=>{reported.current=false;schedule();};
  window.addEventListener('shaper:performance:reset',reset);
  schedule();
  return()=>{cancel();window.removeEventListener('shaper:performance:reset',reset);};
 },[ready]);
}
