import {useId,useRef,type ReactNode} from 'react';

export function SlidingTabs({labels,label,index,onChange,children}:{labels:[string,string];label:string;index:number;onChange:(index:number)=>void;children:ReactNode}){
 const id=useId(),buttons=useRef<(HTMLButtonElement|null)[]>([]);
 return <div className="collection-sections">
  <div className="leaderboard-tabs" data-index={index} role="tablist" aria-label={label}>
   {labels.map((name,i)=><button key={name} ref={el=>{buttons.current[i]=el;}} id={`${id}-tab-${i}`} data-tab-index={i} role="tab" aria-selected={index===i} aria-controls={`${id}-panel`} tabIndex={index===i?0:-1} onClick={()=>onChange(i)} onKeyDown={event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?1:1-i;onChange(next);buttons.current[next]?.focus();
   }}>{name}</button>)}
  </div>
  <section className="collection-tab-panel" id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${index}`}>{children}</section>
 </div>;
}
