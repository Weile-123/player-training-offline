import {useId,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import type {TutorialState,TutorialStep} from '../presentation/tutorial';
import {tutorialGuide} from '../presentation/tutorialGuide';
import {playerValue} from '../game/contract/engine';
import {statKeys} from '../game/types';
import {statLabels} from '../game/config';
import {overallRating} from '../game/matching';
import {money} from '../presentation/money';
import './Onboarding.css';

type Frame={left:number;top:number;width:number;height:number;screenWidth:number;screenHeight:number};
function TrainingComparison({lesson}:{lesson:TutorialState}){
 const before=lesson.beforeTraining,after=lesson.game.players.find(p=>p.id===before.id)!;
 const value=playerValue(lesson.game,after),increase=BigInt(value)-BigInt(lesson.beforeValue);
 return <div className="tutorial-comparison" aria-label="本次训练前后对照">
  <div className="tutorial-growth-summary"><span>训练等级 <b>+{before.level} → +{after.level}</b></span><span>综评 <b>{overallRating(before.stats).toFixed(1)} → {overallRating(after.stats).toFixed(1)}</b></span></div>
  <div className="tutorial-growth-value"><span>球员价值</span><b>{money(lesson.beforeValue)} → {money(value)}</b><em>增加 {money(increase)}</em></div>
  <div className="tutorial-growth-stats">{statKeys.map(key=><div key={key}><span>{statLabels[key]}</span><b>{before.stats[key]} → {after.stats[key]}</b><em>{after.stats[key]>before.stats[key]?`+${after.stats[key]-before.stats[key]}`:'未变化'}</em></div>)}</div>
 </div>;
}

/** Highlights original UI controls; informational steps keep the changed game data visible. */
export function TutorialSpotlight({lesson,advance,onSkip}:{lesson:TutorialState;advance:(step:TutorialStep)=>TutorialState;onSkip:()=>void}){
 const step=lesson.step,guide=tutorialGuide(lesson),maskId=useId(),tip=useRef<HTMLElement>(null),[frame,setFrame]=useState<Frame|null>(null),[tipHeight,setTipHeight]=useState(180);
 const [confirmSkip,setConfirmSkip]=useState(false);
 useLayoutEffect(()=>{
  let target:HTMLElement|null=null,raf=0;
  const focusTarget=()=>confirmSkip?tip.current?.querySelector<HTMLElement>('.tutorial-cancel-skip'):guide.action?target:tip.current?.querySelector<HTMLElement>('.tutorial-next,.tutorial-skip')??tip.current;
  const update=()=>{
   const found=document.querySelector<HTMLElement>(guide.selector);
   if(found!==target){
    target?.removeAttribute('aria-describedby');target=found;
    if(target){target.setAttribute('aria-describedby','tutorial-instruction');target.scrollIntoView({block:'nearest',inline:'nearest'});focusTarget()?.focus({preventScroll:true});}
   }
   if(target){
    const bounds=target.getBoundingClientRect();
    if(bounds.height<innerHeight&&(bounds.top<0||bounds.bottom>innerHeight))target.scrollIntoView({block:'nearest',inline:'nearest'});
    const r=target.getBoundingClientRect(),w=innerWidth,h=innerHeight,pad=7;
    const left=Math.max(0,r.left-pad),top=Math.max(0,r.top-pad),right=Math.min(w,r.right+pad),bottom=Math.min(h,r.bottom+pad);
    const next={left,top,width:Math.max(0,right-left),height:Math.max(0,bottom-top),screenWidth:w,screenHeight:h};
    setFrame(old=>old&&Object.keys(next).every(k=>Math.abs(old[k as keyof Frame]-next[k as keyof Frame])<.5)?old:next);
   }
   if(tip.current)setTipHeight(tip.current.offsetHeight);
   raf=requestAnimationFrame(update);
  };
  const allowed=(node:EventTarget|null)=>node instanceof Node&&(tip.current?.contains(node)||(!confirmSkip&&guide.action&&target?.contains(node)));
  const guard=(event:Event)=>{if(!allowed(event.target)){event.preventDefault();event.stopImmediatePropagation();}};
  const keyboard=(event:KeyboardEvent)=>{
   if(event.key==='Tab'){event.preventDefault();event.stopImmediatePropagation();const items=[...(!confirmSkip&&guide.action&&target?[target]:[]),...Array.from(tip.current?.querySelectorAll<HTMLElement>('button')??[])];const index=items.indexOf(document.activeElement as HTMLElement);items[(index+(event.shiftKey?-1:1)+items.length)%items.length]?.focus({preventScroll:true});}
   else if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(confirmSkip)setConfirmSkip(false);else focusTarget()?.focus({preventScroll:true});}
   else if((event.key==='Enter'||event.key===' ')&&!allowed(event.target))guard(event);
  };
  const focus=(event:FocusEvent)=>{if(target&&!allowed(event.target))focusTarget()?.focus({preventScroll:true});};
  document.addEventListener('click',guard,true);document.addEventListener('pointerdown',guard,true);
  document.addEventListener('keydown',keyboard,true);document.addEventListener('focusin',focus,true);
  update();
  return()=>{cancelAnimationFrame(raf);target?.removeAttribute('aria-describedby');document.removeEventListener('click',guard,true);document.removeEventListener('pointerdown',guard,true);document.removeEventListener('keydown',keyboard,true);document.removeEventListener('focusin',focus,true);};
 },[guide.selector,guide.action,step,confirmSkip]);
 const screenWidth=frame?.screenWidth??innerWidth,screenHeight=frame?.screenHeight??innerHeight,width=Math.min(350,screenWidth-24);
 const clampX=(x:number)=>Math.max(12,Math.min(screenWidth-width-12,x)),clampY=(y:number)=>Math.max(12,Math.min(screenHeight-tipHeight-12,y));
 let left=12,top=12,side='below',maxHeight=screenHeight-24;
 if(frame){
  const x=clampX(frame.left+frame.width/2-width/2),y=clampY(frame.top+frame.height/2-tipHeight/2);
  const candidates=[{side:'below',left:x,top:frame.top+frame.height+18},{side:'above',left:x,top:frame.top-tipHeight-18},{side:'right',left:frame.left+frame.width+18,top:y},{side:'left',left:frame.left-width-18,top:y}];
  const fit=candidates.find(c=>c.left>=12&&c.top>=12&&c.left+width<=screenWidth-12&&c.top+tipHeight<=screenHeight-12);
  const belowSpace=screenHeight-frame.top-frame.height-30,aboveSpace=frame.top-30;
  const fallback=belowSpace>=aboveSpace?{left:x,top:frame.top+frame.height+18,side:'below'}:{left:x,top:12,side:'above'};
  ({left,top,side}=fit??(Math.max(belowSpace,aboveSpace)>=160?fallback:{left:x,top:12,side:'floating'}));
  if(side==='below')maxHeight=belowSpace;
  if(side==='above'){maxHeight=aboveSpace;top=frame.top-18-Math.min(tipHeight,maxHeight);}
 }
 return createPortal(<div className="tutorial-spotlight" data-step={step}>
  {frame&&!confirmSkip?<><svg className="tutorial-mask" width="100%" height="100%" aria-hidden="true"><defs><mask id={maskId}><rect width="100%" height="100%" fill="white"/><rect x={frame.left} y={frame.top} width={frame.width} height={frame.height} rx={step==='train'?frame.width/2:10} ry={step==='train'?frame.height/2:10} fill="black"/></mask></defs><rect className="tutorial-mask-shade" width="100%" height="100%" mask={`url(#${maskId})`}/></svg><div className="tutorial-spotlight-ring" style={{left:frame.left,top:frame.top,width:frame.width,height:frame.height,borderRadius:step==='train'?'50%':10}}/></>:<div className="tutorial-mask-pending"/>}
  <aside ref={tip} className={`tutorial-instruction is-${confirmSkip?'floating':side}`} id="tutorial-instruction" role={confirmSkip?'alertdialog':'status'} aria-modal={confirmSkip||undefined} aria-labelledby={confirmSkip?'tutorial-skip-title':undefined} aria-describedby={confirmSkip?'tutorial-skip-description':undefined} tabIndex={-1} style={{left:confirmSkip?(screenWidth-width)/2:left,top:confirmSkip?clampY((screenHeight-tipHeight)/2):top,width,maxHeight:confirmSkip?screenHeight-24:maxHeight,visibility:frame?'visible':'hidden','--tutorial-arrow-x':`${Math.max(22,Math.min(width-22,(frame?.left??0)+(frame?.width??0)/2-left))}px`} as CSSProperties}>
   {confirmSkip?<><div className="tutorial-instruction-content"><small>新手引导</small><strong id="tutorial-skip-title">确定跳过引导？</strong><p id="tutorial-skip-description">跳过后将进入首月赠礼选择，选好器械后从第 1 月开始正式生涯。</p></div><div className="tutorial-confirm-actions"><button className="tutorial-cancel-skip" onClick={()=>setConfirmSkip(false)}>取消</button><button className="tutorial-confirm-skip" onClick={onSkip}>确认跳过</button></div></>:<>
   <div className="tutorial-instruction-content"><small>新手引导 <b>{guide.chapter}</b></small><strong>{guide.title}</strong><p>{guide.description}</p>
    {step==='growth'&&<TrainingComparison lesson={lesson}/>}
    {step==='settled'&&<div className="tutorial-settled-summary"><span>经营经费 <b>+{money(lesson.deliveryValue??'0')}</b></span><span>信用 <b>{lesson.game.credit} 点 · 未扣减</b></span><span>营内球员 <b>{lesson.game.players.length} 人（2 人保留 + 3 名新人）</b></span></div>}
    {step==='flight'&&<div className="tutorial-wait">正在播放投篮…</div>}
   </div>
   {guide.next&&<button className="tutorial-next" onClick={()=>advance(step)}>{guide.next} <span aria-hidden="true">›</span></button>}
   <button className="tutorial-skip" onClick={()=>setConfirmSkip(true)}>跳过引导</button>
   </>}
  </aside>
 </div>,document.body);
}
