import {FittedAmount} from './FittedAmount';
import {useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {money} from '../presentation/money';

export function SponsorTicket({star=false}:{star?:boolean}){
 return <svg className={`sponsor-ticket${star?' ticket-star':''}`} viewBox={star?'-8 -10 80 64':'0 0 64 44'} aria-hidden="true">{star&&<path d="m1 0-5-7m21 6-2-8m36 9 5-7m7 27 8-2M3 43l-7 5m27-4-2 8m37-11 7 6" fill="none" stroke="currentColor" strokeWidth="2"/>}<path d="M5 5h54v9a8 8 0 0 0 0 16v9H5v-9a8 8 0 0 0 0-16Z" fill="currentColor" stroke="#102737" strokeWidth="2"/><path d="M15 9v26M49 9v26" stroke="#102737" strokeWidth="2" strokeDasharray="3 2"/>{star?<path d="m32 11 3.6 7.3 8.1 1.2-5.9 5.7 1.4 8.1-7.2-3.8-7.2 3.8 1.4-8.1-5.9-5.7 8.1-1.2Z" fill="#102737"/>:<><circle cx="32" cy="22" r="10" fill="none" stroke="#102737" strokeWidth="2"/><path d="M22 22h20M32 12v20m-7-17q14 7 0 14m14-14q-14 7 0 14" fill="none" stroke="#102737" strokeWidth="1.5"/></>}</svg>;
}

function ScoreboardArtwork(){
 return <svg className="scoreboard-art" viewBox="0 0 720 180" preserveAspectRatio="none" aria-hidden="true">
  <g fill="none" stroke="#31556d" strokeWidth="2" opacity=".55"><path d="m-20 180 174-144 80 19 135 128M154 36l-9 119M234 55l30-72M-15 70l394 96M364 0l-74 179M380 0l113 180M427 165l95-144 104 61M522 21l15 159M628 0l-67 180"/><circle cx="205" cy="127" r="47"/><path d="M161 110q70-20 89 25m-51-55q-3 42 43 78M485 35l61 22-23 47-61-21Z"/></g>
  <g fill="#6890a3" opacity=".22">{Array.from({length:90},(_,i)=><circle key={i} cx={8+(i%15)*8} cy={140+Math.floor(i/15)*7} r={1.4}/>)}</g>
  <g fill="#5685a0" opacity=".26">{Array.from({length:96},(_,i)=><circle key={i} cx={615+(i%12)*9} cy={86+Math.floor(i/12)*10} r={1.7}/>)}</g>
 </svg>;
}

type ScoreboardLabels = {value:string;required:string;section:string;progress:string};
export function DeliveryScoreboard({value,required,credits,rosterControls,labels,formatAmount=money,progressText}:{value:string;required:string;credits:number;rosterControls?:ReactNode;labels?:Partial<ScoreboardLabels>;formatAmount?:(value:string)=>string;progressText?:ReactNode}){
 const board=useRef<HTMLDivElement>(null),[showProgress,setShowProgress]=useState(true);
 const couponText=credits.toLocaleString();

 useLayoutEffect(()=>{
  const root=board.current;if(!root)return;
  const numbers=[...root.querySelectorAll<HTMLElement>('.score-number>b')];
  const labels=[...root.querySelectorAll<HTMLElement>('.score-value>small,.score-target>small')];
  // Decide from intrinsic content sizes, not the bar's current position. Hiding it
  // removes its grid row without triggering a show/hide measurement loop.
  const measure=()=>{
   const css=getComputedStyle(root),inset=parseFloat(css.paddingTop)+parseFloat(css.paddingBottom);
   const titleHeight=Math.max(...labels.map(el=>el.getBoundingClientRect().height));
   const numberHeight=Math.max(...numbers.map(el=>el.getBoundingClientRect().height));
   const progressHeight=Math.max(12,Math.min(13,root.clientWidth*.018))+5;
   setShowProgress(root.clientHeight-inset-titleHeight-numberHeight-4>=progressHeight);
  };
  const observer=new ResizeObserver(measure);
  [root,...labels,...numbers].forEach(el=>observer.observe(el));measure();
  let active=true;void document.fonts.ready.then(()=>{if(active)measure();});
  return()=>{active=false;observer.disconnect();};
 },[value,required,labels?.value,labels?.required]);
 const actual=BigInt(value),target=BigInt(required),met=actual>=target;
 const percent=target===0n?100:Number((actual>target?target:actual)*10000n/target)/100;
 const difference=met?actual-target:target-actual;
 const numberStyle=(text:string,isTarget=false)=>({'--number-size':`${Math.min(8.3,52/Math.max(6,text.length))*(isTarget ? .92 : 1)}cqw`} as CSSProperties);
 return <section className="game-finance" aria-label={labels?.section??'本月球员交付'}>
  <div ref={board} className={`delivery-scoreboard ${met?'is-met':''} ${showProgress?'':'progress-hidden'}`}>
   <ScoreboardArtwork/>
   <div className="score-value"><small>{labels?.value??'当前交付价值'}</small><span className="score-number"><FittedAmount style={numberStyle(formatAmount(value))} text={formatAmount(value)}/></span></div>
   <div className="score-target"><small>{labels?.required??'指标'}</small><span className="score-number"><FittedAmount style={numberStyle(formatAmount(required),true)} text={formatAmount(required)}/></span></div>
   {rosterControls?<div className="score-roster-controls">{rosterControls}</div>:<div className={`score-coupons${couponText.length>4?' many-coupons':''}`}><small>赞助券</small><div><SponsorTicket star/><FittedAmount text={couponText}/></div></div>}
   <div className="score-progress" aria-hidden={!showProgress}><div role="progressbar" aria-label={labels?.progress??'本月交付达成率'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{width:`${percent}%`}}/></div><span title={formatAmount(String(difference))}>{progressText??(met?difference===0n?'已达标':`超出 ${formatAmount(String(difference))}`:`距达标还差 ${formatAmount(String(difference))}`)}</span></div>
  </div>
 </section>;
}
