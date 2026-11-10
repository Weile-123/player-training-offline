import { Fragment, useId } from 'react';
import { config, statLabels } from '../game/config';
import { gameSaleValue, monthPreview, rating } from '../game/engine';
import { tierConfig, styleSimilarity } from '../game/matching';
import { positionLabels, templateById } from '../game/templates';
import { statKeys, type Game, type Player } from '../game/types';
import { usePlayerProfile } from '../platform/usePlayerProfile';
import { StarPortrait } from './PlayerTemplatePanel';
import { CreditHearts } from './CreditHearts';

const money=(value:number)=>'$'+value.toLocaleString('en-US');

export function ExistingCareerWarning({game}:{game:Game}){
 return <>
  <div className="existing-save-warning" role="note"><strong>本地已有存档</strong><p>继续开启新生涯，将覆盖当前生涯进度。</p></div>
  <dl className="existing-save-summary"><dt>当前进度</dt><dd>第 {game.month} 月</dd><dt>当前余额</dt><dd>{money(game.cash)}</dd><dt>剩余债务</dt><dd>{money(game.debt)}</dd></dl>
  <p>当前球员、现金、装备和资产将重置。永久球星图鉴及历史纪录保留。</p>
 </>;
}

export function MonthSettlement({game}:{game:Game}) {
 const report=monthPreview(game);
 const rows=[['自动出售收入',report.saleIncome],['资产租金收入',report.passiveIncome],['本月新增利息',report.interest],['最低还款',report.payment]] as const;
 return <div className="settlement-content">
  <h2 className="settlement-title">本月结算预览</h2>
  <dl className="settlement-lines">{rows.map(([label,value])=><Fragment key={label}><dt>{label}</dt><dd>{money(value)}</dd></Fragment>)}</dl>
  <div className="settlement-total cash"><strong>结算后现金</strong><b>{money(report.cashAfter)}</b></div>
  <div className="settlement-total debt"><strong>结算后债务</strong><b>{money(report.debtAfter)}</b></div>
  <div className="settlement-context"><span>保留 {game.lounge.length} 人 · 自动出售 {report.autoSales} 人</span><span className="settlement-credit">信用 <CreditHearts credit={report.creditAfter} total={config.initialCredit}/></span></div>
  <p className={`settlement-alert ${report.canPay?'paid':'unpaid'}`}><b aria-hidden="true">{report.canPay?'✓':'!'}</b>{report.canPay?'本月可以完成还款':game.credit===1?'资金不足，本次结算将导致游戏结束':'资金不足，本月扣除 1 点信用'}</p>
 </div>;
}

export function TemplateDossier({player,game}:{player:Player;game:Game}) {
 const template=templateById(player.templateId),profile=usePlayerProfile(template?.id);
 const nextTier=config.matching.tiers.find(t=>t.minimumRating>rating(player));
 return <div className="template-dossier">
  <div className="dossier-hero">
   <div className="dossier-portrait tier-portrait-frame" data-tier={template?.tier??'undiscovered'}><StarPortrait key={profile?.avatar??'unknown'} src={profile?.avatar??null} name={profile?.name??template?.name??'待发掘'}/></div>
   <div className="dossier-identity"><small>当前 NBA 球星模板</small><h2 style={{fontSize:`clamp(18px,${Math.min(8,64/(profile?.name??template?.name??'待发掘').length)}vw,34px)`}}>{profile?.name??template?.name??'待发掘'}</h2>
    <div className="dossier-tags"><b>{template?tierConfig(template.tier).label:player.highPotential?'高潜力新秀':'潜力新秀'}</b>{template&&<b>{template.position}</b>}</div>
    <p>{template?`${positionLabels[template.position]} · ${template.style}`:'综合评分达到 45 后，匹配符合身高的球星风格。'}</p>
    <div className="dossier-match">{template?<>风格相似度 <strong>{(styleSimilarity(player.stats,template.stats)*100).toFixed(1)}%</strong><small>适配身高 {template.height[0]}–{template.height[1]} cm</small></>:<>等待模板匹配<small>{nextTier?`下一档：${nextTier.label} · 评分 ${nextTier.minimumRating}`:'继续训练发掘潜力'}</small></>}</div>
   </div>
  </div>
  {profile?.message&&<p role="status">{profile.message}，已显示远程备用头像。</p>}
  <section className="dossier-section"><h3>模板六维标准</h3><div className="dossier-stats">{statKeys.map(key=><div key={key}><span>{statLabels[key]}</span><b>{template?.stats[key]??'—'}</b></div>)}</div></section>
  <section className="dossier-section"><h3>受训球员 · 当前进度</h3><dl className="dossier-trainee"><dt>球员</dt><dd>{player.name} · {player.age} 岁 / {player.height} cm</dd><dt>能力</dt><dd>评分 {rating(player).toFixed(1)} · Lv.{player.level} · {player.shots} 次投篮</dd><dt>球探报价</dt><dd>{money(gameSaleValue(game,player))}</dd><dt>保护状态</dt><dd>{player.hotShots>0?`火热免重伤 ${player.hotShots} 次`:player.iceShots>0?`冰敷免轻伤 ${player.iceShots} 次`:`手感 ${player.heat}/${config.feel.maximum}`}</dd></dl></section>
  <p className="dossier-note">模板标准用于风格匹配；主界面展示受训球员的实时能力。</p>
 </div>;
}

export function RepaymentForm({amount,maximum,onChange}:{amount:string;maximum:number;onChange:(value:string)=>void}) {
 const id=useId(),value=Number(amount),limit=Math.max(0,Math.floor(maximum));
 const adjust=(delta:number)=>onChange(String(Math.max(1,Math.min(limit,(Number.isFinite(value)?value:0)+delta))));
 return <div className="repayment-content">
  <p className="repayment-intro">上交部分欠款，降低债务压力。</p>
  <label className="repayment-label" htmlFor={id}>上交金额</label>
  <div className="repayment-input"><span aria-hidden="true">$</span><input id={id} type="text" inputMode="numeric" autoComplete="off" value={amount&&Number.isFinite(value)?value.toLocaleString('en-US'):amount} onChange={e=>{const next=e.target.value.replace(/[,\s]/g,'');if(/^\d*$/.test(next))onChange(next);}} aria-describedby={`${id}-limit`}/><div className="repayment-stepper"><button type="button" aria-label="增加还款金额" disabled={limit===0||value>=limit} onClick={()=>adjust(1000)}>▲</button><button type="button" aria-label="减少还款金额" disabled={limit===0||value<=1} onClick={()=>adjust(-1000)}>▼</button></div></div>
  <div className="repayment-limit" id={`${id}-limit`}>{limit>0?`可上交金额：$1 ～ ${money(limit)}`:'当前暂无可上交现金'}{limit>0&&<button onClick={()=>onChange(String(limit))}>全部填入</button>}</div>
  <p className="repayment-note">额外还款后，月底仍需支付剩余债务对应的最低还款，请预留现金。</p>
 </div>;
}
