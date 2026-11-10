import {CreditHearts} from './CreditHearts';
import type {CSSProperties} from 'react';

export function CareerStartCard({month,credit,onResume,onStart,error}:{month:number;credit:number;onResume:()=>void;onStart:()=>void;error?:string}){
 return <div className="career-start-content">
  <section className="career-save-card" aria-label="本地生涯档案">
   <header className="career-save-heading"><span aria-hidden="true">★</span><h3>本地生涯档案</h3><strong>进行中</strong></header>
   <div className="career-save-details">
    <div className="career-save-month"><span className="career-save-label">当前月份</span><div className="career-save-month-value" style={{'--month-digits':Math.max(2,String(month).length)} as CSSProperties}><span>第</span><b>{month}</b><span>月</span></div></div>
    <div className="career-save-credit"><span className="career-save-label">剩余信用</span><CreditHearts credit={credit}/><p>继续你的球星培养之路</p></div>
   </div>
   <p className="career-save-caption"><span>你的生涯，等待继续。</span></p>
  </section>
  <div className="career-start-actions"><button className="primary" onClick={onResume}>继续生涯 <span aria-hidden="true">→</span></button><button className="secondary" onClick={onStart}>放弃存档，开始新合同</button></div>
  {error&&<p role="alert">{error}</p>}
 </div>;
}
