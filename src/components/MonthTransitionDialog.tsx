import {gameAudio} from '../presentation/audio';
import {soundEnabled} from '../presentation/sampleAudio';
import {useEffect,useRef,type CSSProperties} from 'react';
import {ComicDialog} from './ComicDialog';
import {monthDigits,monthTransitionTiming as timing,type MonthChange} from '../presentation/monthTransition';
import './MonthTransitionDialog.css';

export function MonthTransitionDialog({change,reduced,onComplete}:{change:MonthChange;reduced:boolean;onComplete:()=>void}){
 const complete=useRef(onComplete);complete.current=onComplete;
 useEffect(()=>{
  const timer=setTimeout(()=>complete.current(),reduced?timing.reduced:timing.total);
  return()=>clearTimeout(timer);
 },[change.from,change.to,reduced]);
 useEffect(()=>{const timer=setTimeout(()=>void gameAudio.play('month',soundEnabled()),reduced?0:timing.delay);return()=>clearTimeout(timer);},[change.from,change.to]);
 const digits=monthDigits(change.from,change.to);
 return <ComicDialog title="新的征程" className={`month-transition-dialog${reduced?' is-reduced':''}`} dismissible={false} onClose={onComplete}>
  <div className="month-transition-content">
   <p className="month-transition-eyebrow">本月已结算 · 迈向新一个月</p>
   <div className="month-transition-number" role="status" aria-live="polite" aria-label={`第${change.from}月已结算，进入第${change.to}月`} style={{'--month-digits':digits.length} as CSSProperties}>
    <span className="month-transition-unit" aria-hidden="true">第</span>
    <span className="month-transition-digits" aria-hidden="true">{digits.map((digit,index)=><span key={index} className={`month-transition-digit${digit.changed&&!reduced?' is-moving':''}`}>
     <span className="month-transition-track" style={{animationDuration:`${timing.roll}ms`,animationDelay:`${timing.delay+(digits.length-index-1)*timing.stagger}ms`}}>
      {digit.changed&&!reduced?<><span>{digit.from===' '?'\u00a0':digit.from}</span><span>{digit.to}</span></>:<span>{digit.to}</span>}
     </span>
    </span>)}</span>
    <span className="month-transition-unit" aria-hidden="true">月</span>
   </div>
   <p className="month-transition-route" aria-hidden="true">第 {change.from} 月 <span>→</span> 第 {change.to} 月</p>
   <div className="month-transition-divider" aria-hidden="true"><i/>★<i/></div>
   <p className="month-transition-caption">新的一个月，继续培养王牌</p>
  </div>
 </ComicDialog>;
}
