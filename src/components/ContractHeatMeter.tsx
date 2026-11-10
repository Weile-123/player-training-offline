import type {CSSProperties,ReactNode} from 'react';
import type {heatMeter} from '../presentation/heatMeter';
import './ContractHeatMeter.css';

export function ContractHeatMeter({meter,heat,action}:{meter:ReturnType<typeof heatMeter>;heat:number;action?:ReactNode}){
 const {hot,remaining,total}=meter,count=hot?remaining:heat,max=hot?total:10;
 return <aside className={`contract-heat energy-meter ${hot?'active':''} ${action?'has-ad':''}`} aria-label={hot?`火热剩余 ${remaining} 次`:`手感 ${heat}/10`} style={{'--energy-steps':Math.max(1,max)} as CSSProperties}>
  <div className="energy-housing" aria-hidden="true"/>
  <div className="energy-crest" aria-hidden="true"><i className="energy-flame"/></div>
  <div className="contract-heat-track" role="progressbar" aria-label={hot?'火热剩余投篮次数':'手感积累'} aria-valuemin={0} aria-valuemax={max} aria-valuenow={count}>{Array.from({length:max},(_,i)=><span key={i} aria-hidden="true" className={`energy-cell${i<count?' is-filled':''}`} style={{'--cell-tint':`${i/Math.max(1,max-1)*100}%`} as CSSProperties}/>)}</div>
  <div className="energy-readout" aria-hidden="true"><b>{count}</b><small>{hot?'次':'/10'}</small></div>
  {action}
 </aside>;
}
