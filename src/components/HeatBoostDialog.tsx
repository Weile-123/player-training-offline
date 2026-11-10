import {ComicDialog} from './ComicDialog';
import {RewardedAdButton} from './RewardedAdButton';
import './InjuryRewindDialog.css';
import './HeatBoostDialog.css';

export function HeatBoostDialog({playerId,heat,onClose}:{playerId:string;heat:number;onClose:()=>void}){
 const after=Math.min(10,heat+3);
 return <ComicDialog title="加速火热" onClose={onClose} className="injury-rewind-dialog heat-boost-dialog">
  <div className="injury-rewind-benefit">
   <p className="injury-rewind-description">为当前球员积蓄手感，<br/>向火热状态再进一步<strong>增加 <b>3</b> 格火热槽。</strong></p>
   <svg className="injury-rewind-emblem" viewBox="0 0 120 150" aria-hidden="true" fill="none" stroke="#102633" strokeWidth="5" strokeLinejoin="round">
    <path d="M65 8c8 34-19 43-11 62 11-5 19-15 23-27 24 24 34 44 29 65-5 23-24 35-47 35-29 0-48-20-46-45 1-18 13-35 28-48-1 15 2 23 7 26C36 47 58 33 65 8Z" fill="#f6c94d"/>
    <path d="M65 78c-1 17-17 24-17 37 0 10 6 18 16 18 13 0 22-10 20-23-2-10-10-22-19-32Z" fill="#fff0b2" strokeWidth="3"/>
   </svg>
  </div>
  <div className="heat-boost-preview" aria-label={`火热槽从${heat}格增加至${after}格`}>
   <div className="heat-boost-cells" aria-hidden="true">{Array.from({length:10},(_,i)=><i key={i} className={i<heat?'is-filled':i<after?'is-added':''}/>)}</div>
   <p><span>{heat}/10 → {after}/10</span><strong>{after===10?'立即进入火热':'手感加速积累'}</strong></p>
  </div>
  <p className="injury-rewind-hint">每月可加速一次；满 10 格立即进入火热，超出部分不保留。</p>
  <div className="injury-rewind-actions">
   <RewardedAdButton reward="heat" playerId={playerId} label="加速火热" gold onReward={onClose}/>
   <button type="button" className="injury-rewind-dismiss" onClick={onClose}>暂不加速</button>
  </div>
 </ComicDialog>;
}
