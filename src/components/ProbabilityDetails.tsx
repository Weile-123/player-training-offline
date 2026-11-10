import type {Athlete,Contract} from '../game/contract/engine';
import {probabilityDetails} from '../presentation/probabilityDetails';
import {probabilityEvents} from './ProbabilityStrip';
import './ProbabilityDetails.css';

export function ProbabilityDetails({game,player,noSevere=false,onClose}:{game:Contract;player?:Athlete;noSevere?:boolean;onClose:()=>void}){
 if(!player)return <p>请先选择一名球员，查看当前训练概率。</p>;
 const data=probabilityDetails(game,player,noSevere);
 return <div className="probability-details">
  <p className="probability-context">训练 {data.level} 级 · {data.hot?'火热投篮':'普通投篮'}</p>
  <h3>当前概率明细</h3>
  <div className="probability-details-strip">{probabilityEvents.map(({id,label,color})=><div key={id} style={{background:color}}><span>{label}</span><b>{data.tickets[id]/10}%</b></div>)}</div>
  <p className="probability-caption">已计入当前生效效果，合计 100%。</p>
  <table className="probability-base"><caption>基础权重</caption><thead><tr>{probabilityEvents.map(e=><th key={e.id} scope="col">{e.label}</th>)}</tr></thead><tbody><tr>{probabilityEvents.map(e=><td key={e.id}>{data.base[e.id]}</td>)}</tr></tbody></table>
  <table className="probability-effects"><thead><tr><th scope="col">来源</th><th scope="col">当前生效效果</th></tr></thead><tbody>{data.rows.map((r,i)=><tr key={i}><td><small>{r.category}</small><span>{r.source}</span></td><td>{r.effect}</td></tr>)}</tbody></table>
  <p className="probability-caption">仅列当前生效的权重、风险及已就绪保护。结果保护按列出顺序优先触发，每次重伤只消耗其中一项。只影响收益、等级或手感的效果不改变本投概率。</p>
  <h3>概率基础逻辑</h3>
  <ol className="probability-rules">
   <li>权重决定相对占比。增加某项权重后，概率一起重新计算；权重翻倍不代表概率翻倍。</li>
   <li>权重按“替换 → 加减 → 转移 → 倍率”处理，再按训练等级校准重伤权重。等级越高，基础重伤风险越高；30 级后基础曲线不再增长。</li>
   <li>风险倍率、火热与训练补剂再调整概率。火热使重伤为 0%，其余结果按比例分配。训练补剂将成功类合并为大成功，其余合并为重伤。</li>
   <li>最终分配为 1000 张签票，每张对应 0.1%，不足整张按小数余量补齐。每投都按当前状态重新抽签，不保证若干次内必出某种结果。</li>
   <li>结果保护在抽中重伤后生效，不直接改变概率条。连续结果仅在对应器械或历史效果生效时改变概率。权重显示最多三位小数，实际计算保留原始精度。</li>
  </ol>
  <button className="secondary probability-close" onClick={onClose}>关闭</button>
 </div>;
}
