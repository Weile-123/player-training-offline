import { config } from '../game/config';
export function HeatMeter({heat,maximum,hotShots}:{heat:number;maximum:number;hotShots:number}){
 const hot=hotShots>0,count=hot?config.feel.hotShots:maximum,filled=hot?hotShots:heat;
 return <aside className={`heat-panel ${hot?'is-hot':''}`} aria-label={hot?`火热保护剩余 ${hotShots} 次`:`手感 ${heat}/${maximum}`}>
  <div className="heat-panel-heading"><strong>{hotShots?'火热':'手感'}</strong><svg className="heat-flame" viewBox="0 0 24 32" aria-hidden="true"><path d="M13 2C17 9 11 10 18 14L20 9C29 24 19 31 12 30 1 30-2 19 6 12L7 19C11 15 8 9 13 2Z"/><path d="M13 18C19 25 15 29 11 28 6 27 9 22 13 18Z"/></svg></div>
  <div className="heat-charge" role="progressbar" aria-label={hot?'免重伤保护次数':'手感积累'} aria-valuemin={0} aria-valuemax={count} aria-valuenow={filled}>
   {Array.from({length:count},(_,i)=><i key={i} className={i<filled?'filled':''}/>)}
  </div>
  <b className="heat-counter">{hotShots||heat}<small>{hotShots?'次':`/${maximum}`}</small></b>
  {hot&&<span className="heat-protection-label">免重伤</span>}
 </aside>;
}
