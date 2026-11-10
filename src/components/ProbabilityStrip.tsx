import type { CSSProperties } from 'react';
import type { Outcome } from '../game/types';

export const probabilityEvents: readonly {id:Outcome; label:string; color:string}[] = [
 {id:'severe',label:'重伤',color:'#a82c27'}, {id:'minor',label:'轻伤',color:'#c75b27'},
 {id:'hold',label:'维持',color:'#2f6083'}, {id:'success',label:'成功',color:'#217844'},
 {id:'great',label:'大成功',color:'#bd831d'},
];
const percent = (n:number) => `${Number((n*100).toFixed(1))}%`;

/** Equal tiles, with the three impossible outcomes collapsed while supplement is armed. */
export function ProbabilityStrip({chances,onDetails,supplement=false}:{chances:Record<Outcome,number>|null;onDetails:()=>void;supplement?:boolean}) {
 return <button className={`probability-panel${supplement?' supplement-active':''}`} onClick={onDetails} aria-label="查看训练概率与保护规则">
  <div className="probability-frame"><div className="probability-track">
   {probabilityEvents.map(({id,label,color})=><div key={id} aria-hidden={supplement&&id!=='severe'&&id!=='great'} className={`probability-segment ${id}`} data-probability={id} data-probability-value={chances?.[id]} style={{'--event-color':color} as CSSProperties}>
    <span>{label}<b>{chances?percent(chances[id]):'—'}</b></span>
   </div>)}
  </div></div>
 </button>;
}
