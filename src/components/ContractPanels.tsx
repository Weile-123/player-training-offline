import {FittedAmount} from './FittedAmount';
import {isHighPotential} from '../game/contract/recruits';
import {useState} from 'react';
import {useContract} from '../contractStore';
import {playerValue,type Athlete} from '../game/contract/engine';
import {match} from '../game/contract/templates';
import {positionLabels,templateById} from '../game/templates';
import {statKeys} from '../game/types';
import {statLabels} from '../game/config';
import {StarPortrait,templatePortrait} from './PlayerTemplatePanel';
import {GameIcon} from './GameIcon';
import {overallRating,tierConfig} from '../game/matching';
import {rosterPlayers} from '../presentation/roster';
import {money} from '../presentation/money';
export {money} from '../presentation/money';
export const playerName=(p:Athlete)=>templateById(p.templateId)?.name??'待发掘球员';
export function ContractRoster({onChoose,onLounge,lounge=false}:{onChoose:()=>void;onLounge?:()=>void;lounge?:boolean}){
 const store=useContract(),g=store.state,[tab,setTab]=useState<'idle'|'queued'>('idle'),all=rosterPlayers(g.players,store.restingIds,lounge),players=lounge?all:all.filter(p=>p.queued===(tab==='queued'));
 return <><p className="roster-intro">{lounge?'休息中的球员可继续训练，或留在这里跨月保留。':'每月3名新人，未交付球员全部跨月保留。推荐签约后球员离营，获得赞助券用于购买器材。'}</p>{!lounge&&<div className={`roster-tabs ${tab==='queued'?'show-queued':''}`} role="tablist" aria-label="球员名单分类"><i aria-hidden="true"/>{(['idle','queued'] as const).map(t=><button key={t} role="tab" id={`roster-tab-${t}`} aria-controls="roster-page" aria-selected={tab===t} tabIndex={tab===t?0:-1} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?'idle':e.key==='End'?'queued':tab==='idle'?'queued':'idle';setTab(next);document.getElementById(`roster-tab-${next}`)?.focus();}}} onClick={()=>setTab(t)}>{t==='idle'?'空闲球员':'待交付球员'} <b>{all.filter(p=>p.queued===(t==='queued')).length}</b></button>)}</div>}<div id="roster-page" role={lounge?undefined:'tabpanel'} aria-labelledby={lounge?undefined:`roster-tab-${tab}`}><div className="contract-cards roster-cards">{players.map(p=><article key={p.id} className={`contract-card roster-card${store.selectedId===p.id?' is-training':''}`} data-player-id={p.id} data-tier={templateById(p.templateId)?.tier??'undiscovered'}>
  <div className="roster-card-body"><span data-tier={templateById(p.templateId)?.tier??'undiscovered'} className={`roster-portrait tier-portrait-frame ${p.templateId?'album-portrait-surface':''}`}><StarPortrait key={p.templateId??'rookie'} src={templatePortrait(p.templateId)} highPotential={isHighPotential(p)} name={playerName(p)}/></span><div className="roster-identity"><h3>{playerName(p)} {templateById(p.templateId)&&<small>{tierConfig(templateById(p.templateId)!.tier).label}</small>}</h3><p>训练 <b className="roster-level">{p.level}</b><i/> {p.height} cm{p.queued&&<span className="roster-queued"> · 待交付</span>}</p></div><div className="roster-value"><small>球员估值</small><FittedAmount text={money(playerValue(g,p))}/></div><div className="roster-attributes"><div className="roster-rating"><small>综合评分</small><b>{overallRating(p.stats).toFixed(1)}</b></div>{statKeys.map(k=><div key={k}><small>{statLabels[k]}</small><b>{p.stats[k]}</b></div>)}</div></div>
  <div className="contract-actions contract-roster-actions"><button className="primary" disabled={store.selectedId===p.id||p.queued||g.status==='over'} onClick={()=>{store.select(p.id);onChoose();}}><GameIcon name="train"/><span>{store.selectedId===p.id?'上场训练中':lounge?'继续训练':'上场训练'}</span></button><button className="secondary" disabled={store.selectedId===p.id||g.status==='over'} onClick={()=>store.act({type:'queue',playerId:p.id,queued:!p.queued})}><GameIcon name="handoff"/><span>{p.queued?'撤回交付':'加入交付'}</span></button><Exchange player={p}/></div>
 </article>)}</div>{!players.length&&<div className="roster-empty"><GameIcon name={lounge?'bed':'people'}/><h3>{lounge?'休息室暂无球员':tab==='queued'?'暂无待交付球员':'暂无待训练球员'}</h3><p>{lounge?'球员停止训练后会在这里休息。':tab==='queued'?'将培养好的球员加入交付后，会显示在这里。':'可以从休息室继续训练，或结束本月迎接新人。'}</p>{!lounge&&tab==='idle'&&onLounge&&<button className="secondary" onClick={onLounge}><GameIcon name="bed"/>前往休息室</button>}</div>}</div>{lounge&&<button className="secondary" onClick={onChoose}>留存并返回训练场</button>}</>;
}
function Exchange({player}:{player:Athlete}){
 const [confirm,setConfirm]=useState(false),store=useContract();
 return <button className={`secondary signing-button${confirm?' signing-confirm':''}`} disabled={store.selectedId===player.id||player.queued||store.state.status==='over'} onClick={()=>{if(confirm){store.act({type:'exchange',playerId:player.id});setConfirm(false);}else setConfirm(true);}} onBlur={()=>setConfirm(false)}>{!confirm&&<GameIcon name="handshake"/>}<span>{confirm?'确认签约离队？':'推荐签约'}</span></button>;
}
export {ContractCollection} from './CollectionAlbum';
export function ContractDossier({player}:{player:Athlete}){
 const g=useContract(s=>s.state),diagnostic=match(player),[debug,setDebug]=useState(false);
 const reasons:Record<string,string>={'specialist-entry':'专长匹配（轮换级）','rating-floor':'综合评分不足','stat-floor':'单项属性下限不足',height:'身高不符',level:'历史最高训练等级不足',core:'核心属性不足',aptitude:'模板适配度不足','lower-tier':'更高档候选优先',stability:'保留当前稳定模板',rank:'其他候选匹配更优','earned-appearance':'保留已获得的历史外观'};
 return <><h3>{playerName(player)} · +{player.level}</h3><p>{player.height} cm · 训练 {player.shots} 次 · 估值 {money(playerValue(g,player))}</p><p>六维与模板不额外增加经济倍率。历史最高训练等级决定可获取档次；属性提高不会失去匹配资格，已获得外观不会因受伤或属性变化退回。</p><button className="secondary" onClick={()=>setDebug(!debug)}>模板匹配诊断</button>{debug&&diagnostic.rows.map(r=><p key={r.id}>{r.name}：适配度 {(r.score*100).toFixed(1)}% / 门槛 {(r.threshold*100).toFixed(1)}% · {r.reasons.map(code=>reasons[code]??code).join(' / ')||'已匹配'}{r.gaps.some(v=>v.gap>0)&&<small> · 缺口 {r.gaps.filter(v=>v.gap>0).map(v=>`${statLabels[v.key]}还差${v.gap}`).join('、')}</small>}</p>)}</>;
}
