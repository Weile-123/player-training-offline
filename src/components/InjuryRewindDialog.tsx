import {ComicDialog} from './ComicDialog';
import {RewardedAdButton} from './RewardedAdButton';
import {useContract} from '../contractStore';
import './InjuryRewindDialog.css';

export function InjuryRewindDialog({kind,playerId,onClose}:{kind:'stopwatch'|'ad';playerId:string;onClose:()=>void}){
 const store=useContract(),stopwatch=kind==='stopwatch';
 return <ComicDialog title="重伤回溯" onClose={onClose} className="injury-rewind-dialog">
  <div className="injury-rewind-benefit">
   <p className="injury-rewind-description">回到本次投篮前，<br/>球员重新留营{stopwatch?'。':'，并获得'}{stopwatch?<strong>消耗 <b>1</b> 个秒表</strong>:<strong><b>1</b> 次免重伤保护。</strong>}</p>
   <svg className="injury-rewind-emblem" viewBox="0 0 120 150" aria-hidden="true" fill="none" stroke="#102633" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round">
    <path d="M46 12 12 39l34 25V49c30-6 46 2 56 18 6-29-18-45-56-40Z" fill="#f6c94d"/>
    <path d="m46 22-23 17 17 12" stroke="#fff0ac" strokeWidth="3"/>
    {stopwatch?<><path d="M52 60h18v12H52z" fill="#eebc3d"/><circle cx="61" cy="108" r="35" fill="#fff0b2"/><path d="M61 84v24l16 12M31 77l-7 7m67-7 7 7"/></>:<><path d="M61 62c15 11 28 13 44 14v25c0 19-20 35-44 44-24-9-44-25-44-44V76c16-1 29-3 44-14Z" fill="#fff0b2"/>
    <path d="M61 73c11 7 21 10 33 12v16c0 13-14 25-33 33-19-8-33-20-33-33V85c12-2 22-5 33-12Z" fill="#eebc3d" stroke="none"/>
    <path d="M61 73v61c19-8 33-20 33-33V85c-12-2-22-5-33-12Z" fill="#d99b2a" stroke="none"/>
    <path d="M53 88h16v12h12v16H69v12H53v-12H41v-16h12Z" fill="#fff6d7" strokeWidth="4"/></>}
    <path d="m7 90-5-3m108 34 7 3m-8-29 8-4" stroke="#dba22a" strokeWidth="5"/>
   </svg>
  </div>
  <p className="injury-rewind-hint">{stopwatch?<>当前持有 <b>{store.state.commerce.inventory.item_002}</b> 个秒表；确认后消耗 1 个。</>:<>仅在出现重伤时消耗保护。<strong className="injury-rewind-ad-limit">每名球员仅可用广告回溯一次</strong></>}</p>
  {store.actionError&&<p role="alert">{store.actionError}</p>}
  <div className="injury-rewind-actions">
   {stopwatch?<span className="reward-ad-control is-gold"><button type="button" className="reward-ad-button injury-rewind-stopwatch" onClick={()=>store.act({type:'rewind'})}>使用秒表回溯 · 消耗1个</button></span>:<RewardedAdButton reward="injury-rewind" playerId={playerId} label="回溯并获得保护" gold/>}
   <button type="button" className="injury-rewind-dismiss" onClick={onClose}>放弃回溯</button>
  </div>
 </ComicDialog>;
}
