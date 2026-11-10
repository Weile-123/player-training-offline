import {ComicDialog} from './ComicDialog';
import {CreditHearts} from './CreditHearts';
import {rules} from '../game/contract/rules';
import './TutorialWelcome.css';

/** Small vector illustrations keep the comic artwork sharp at phone sizes. */
function WelcomeArt({kind}:{kind:'coach'|'ball'|'player'|'calendar'|'trophy'|'check'}){
 const ball=<g stroke="#102633" strokeWidth="4" strokeLinecap="round" fill="none"><circle cx="48" cy="53" r="34" fill="#ef6824"/><path d="M16 42q38 20 60-9M23 77q20-43 47-48M24 28q44 24 34 57M15 59q36-5 62 13"/><path d="m28 33 9-5" stroke="#fff0c7" strokeWidth="5"/></g>;
 return <svg className={`welcome-art welcome-art-${kind}`} viewBox={kind==='coach'?'0 0 150 125':'0 0 100 100'} aria-hidden="true" stroke="#102633" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" fill="none">
  {kind==='ball'&&<><path d="m5 34 13-7M2 54l11-5M4 73l12-7" stroke="#d3a13f"/>{ball}</>}
  {kind==='coach'&&<><path d="m13 49 100-40-43 49 64-9-76 48" stroke="#f2c252" strokeWidth="10"/><g transform="rotate(12 104 61)"><rect x="66" y="17" width="70" height="99" rx="6" fill="#fff0cf"/><path d="M73 29h56v79H73Z" strokeWidth="2"/><path d="M88 15v-4a12 12 0 0 1 24 0v4h9v17H80V15Z" fill="#78909a"/><circle cx="100" cy="11" r="4" fill="#fff0cf" strokeWidth="2"/><path d="m84 47 11 11m0-11L84 58m29 31 9 9m0-9-9 9M91 94q28-16 23-47m-6 7 6-7 7 8" strokeWidth="3"/><circle cx="89" cy="78" r="6" strokeWidth="3"/></g><g transform="translate(0 31)">{ball}</g></>}
  {kind==='player'&&<><rect x="15" y="20" width="58" height="69" rx="4" transform="rotate(-12 44 55)" fill="#7993a1"/><rect x="27" y="9" width="60" height="76" rx="5" transform="rotate(8 57 47)" fill="#fff0cf"/><circle cx="55" cy="34" r="12" fill="#102633"/><path d="M34 69V57q21-21 42 0v12Z" fill="#102633"/><path d="m78 57 5 11 12 1-9 8 3 12-11-6-10 6 2-12-9-8 12-1Z" fill="#f7bf37" strokeWidth="3"/></>}
  {kind==='calendar'&&<><rect x="15" y="17" width="72" height="70" rx="6" fill="#fff0cf"/><path d="M15 38h72V23q0-6-6-6H21q-6 0-6 6Z" fill="#d83329"/><path d="M33 10v18M68 10v18" strokeWidth="7"/><path d="M27 48h8m6 0h8m-22 12h8m6 0h8m-22 12h8" stroke="#c3b18a" strokeWidth="5"/><g transform="translate(37 33) scale(.54)">{ball}</g></>}
  {kind==='trophy'&&<><path d="M27 22H9v15q0 23 29 24m35-39h18v15q0 23-29 24" strokeWidth="7" stroke="#102633"/><path d="M27 22H9v15q0 23 29 24m35-39h18v15q0 23-29 24" strokeWidth="3" stroke="#edb634"/><path d="M26 12h48v24q0 25-19 30v14h18v10H27V80h18V66Q26 61 26 36Z" fill="#f9bd30"/><path d="M34 19v19q0 14 10 18" stroke="#fff2b3"/><path d="m50 23 6 11 13 2-9 9 2 13-12-6-12 6 2-13-9-9 13-2Z" fill="#102633" strokeWidth="2"/><path d="M32 85h36" strokeWidth="3"/></>}
  {kind==='check'&&<><circle cx="48" cy="53" r="35" fill="#ffdc70"/><circle cx="48" cy="53" r="28" stroke="#fff0bd" strokeWidth="2"/><path d="m29 53 13 13 28-30" strokeWidth="9"/><path d="m80 15 4-9m6 22 8-3M65 8l-1-6" strokeWidth="3"/></>}
 </svg>;
}

export function TutorialWelcome({onStart}:{onStart:()=>void}){
 return <ComicDialog title="欢迎成为训练师" className="tutorial-intro-dialog" dismissible={false} onClose={()=>{}} footer={<footer className="welcome-footer"><button type="button" className="tutorial-intro-start" onClick={onStart}>开始我的第一投 <span aria-hidden="true">›</span></button></footer>}>
  <div className="welcome-content">
   <div className="welcome-hero"><h3>把潜力新人，<br/>练成明日球星。</h3><WelcomeArt kind="coach"/></div>
   <p className="welcome-story">经营你的训练营，培养并交付球员，完成每月委托。</p>
   <ol className="welcome-steps">{(['ball','player','calendar'] as const).map((kind,i)=><li key={kind}><span className="welcome-step-number">0{i+1}</span><WelcomeArt kind={kind}/><strong>{['投篮培养','加入交付','月底结算'][i]}</strong>{i<2&&<span className="welcome-step-arrow" aria-hidden="true">›</span>}</li>)}</ol>
   <section className="welcome-target"><div><h4 className="welcome-label">每月目标</h4><strong className="welcome-equation">交付总价值 <em>≥</em> 本月指标</strong></div><WelcomeArt kind="check"/><p>达到指标，本月达标；经费不能代替交付。</p></section>
   <section className="welcome-rules">
    <div className="welcome-credit"><h4 className="welcome-label">守住你的信用</h4><CreditHearts credit={rules.credit} total={rules.credit}/><p>每月未达标扣 1 颗，信用归零则本局结束。</p></div>
    <div className="welcome-victory"><WelcomeArt kind="trophy"/><div><h4 className="welcome-label">坚持到第 <em>{rules.contractMonths}</em> 月</h4><p>完成结算且仍有信用，即可通关并开启无尽挑战。</p></div></div>
   </section>
   <p className="welcome-note">先练习，再开营 · 不消耗正式生涯资源</p>
  </div>
 </ComicDialog>;
}
