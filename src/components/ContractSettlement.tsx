import {templateById} from '../game/templates';
import {isHighPotential} from '../game/contract/recruits';
import {useContract} from '../contractStore';
import {playerValue,previewSettlement,type Contract} from '../game/contract/engine';
import {overallRating} from '../game/matching';
import {StarPortrait,templatePortrait} from './PlayerTemplatePanel';
import {money,playerName} from './ContractPanels';

export function ContractSettlement({onAdjust,onContinue,onConfirm,practice}:{practice?:Contract;onAdjust:()=>void;onContinue:()=>void;onConfirm:()=>void}){
 const saved=useContract(s=>s.state),g=practice??saved,summary=previewSettlement(g),players=g.players.filter(p=>p.queued);
 const difference=BigInt(summary.value)-BigInt(summary.required);
 return <section className={`settlement-confirm ${summary.met?'is-met':'is-unmet'}`} aria-label="交付结算预览">
  <div className="settlement-state" role="status"><span aria-hidden="true">{summary.met?'✓':'!'}</span><strong>{summary.met?'本月达标 · 信用不变':'未达标 · 信用 −1'}</strong></div>
  <div className="settlement-metrics">
   <div className="settlement-metric settlement-value"><span>交付价值</span><b title={money(summary.value)}>{money(summary.value)}</b><small>{difference===0n?'刚好达标':summary.met?`超出 ${money(String(difference))}`:`还差 ${money(String(-difference))}`}</small></div>
   <div className="settlement-metric settlement-target"><span>指标</span><b title={money(summary.required)}>{money(summary.required)}</b><small>第 {g.month} 月交付要求</small></div>
  </div>
  <div className="settlement-list-heading"><h3 id="settlement-list-title">交付名单 · {players.length}人</h3><small>上下滑动查看</small></div>
  <div className="settlement-player-list" role="region" aria-labelledby="settlement-list-title" tabIndex={0}>
   {players.length?<ul>{players.map(p=><li key={p.id} data-player-id={p.id}>
    <span className="settlement-portrait tier-portrait-frame" data-tier={templateById(p.templateId)?.tier??'undiscovered'}><StarPortrait src={templatePortrait(p.templateId)} highPotential={isHighPotential(p)} name={playerName(p)}/></span>
    <div className="settlement-player-info"><strong>{playerName(p)}</strong><small>综合 {overallRating(p.stats).toFixed(1)}</small></div>
    <b className="settlement-player-value" title={money(playerValue(g,p))}>{money(playerValue(g,p))}</b>
   </li>)}</ul>:<div className="settlement-empty"><strong>暂无待交付球员</strong><span>可调整名单加入球员，或直接结束本月。</span></div>}
  </div>
  {BigInt(g.scrap)>0n&&<div className="settlement-compensation"><span>补偿计入交付</span><b>{money(g.scrap)}</b></div>}
  <div className="settlement-explanation"><p>确认后交付球员离营，获得等额经费；未交付球员保留。</p></div>
  <div className="settlement-actions"><button className="secondary" onClick={summary.met?onAdjust:onContinue}>{summary.met?'调整名单':'继续培养'}</button><button className="primary settlement-submit" disabled={g.status==='over'} onClick={onConfirm}>{summary.met?'确认交付':'仍然交付'}</button></div>
  {!summary.met&&<button className="settlement-adjust" onClick={onAdjust}>调整交付名单 ›</button>}
 </section>;
}
