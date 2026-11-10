import { useState } from 'react';
import { ComicDialog } from './ComicDialog';
import { useGame } from '../store';
import { config, statLabels } from '../game/config';
import { tierConfig } from '../game/matching';
import { nbaTemplates, positionLabels, templateById, type TemplateTier } from '../game/templates';
import { statKeys } from '../game/types';
import { usePlayerProfile } from '../platform/usePlayerProfile';
const money=(n:number)=>'$'+n.toLocaleString('en-US');
export function CollectionPanel() {
 const collection=useGame(s=>s.collection);
 const [tier,setTier]=useState<TemplateTier|'all'>('all'),[status,setStatus]=useState<'all'|'unlocked'|'locked'>('all');
 const [detail,setDetail]=useState<string|null>(null);
 const profile=usePlayerProfile(detail);
 const count=Object.keys(collection).length;
 const filtered=nbaTemplates.filter(t=>(tier==='all'||t.tier===tier)&&(status==='all'||(status==='unlocked')===!!collection[t.id]));
 const t=templateById(detail), record=t&&collection[t.id];
 return <section className="collection mx-5 mt-5" aria-label="NBA 模板图鉴">
  <div className="collection-progress"><span className="eyebrow">THE ARCHIVE / 永久收藏</span><h2>NBA 模板图鉴 <b>{count}/{nbaTemplates.length}</b></h2><div className="stat-track"><i style={{width:`${count/nbaTemplates.length*100}%`}}/></div><p>培养出模板立即解锁。重伤、关营与重开保留，本机缓存清除后会丢失。</p></div>
  <div className="collection-filters"><label>实力档次<select aria-label="图鉴档次" value={tier} onChange={e=>setTier(e.target.value as typeof tier)}><option value="all">全部档次</option>{config.matching.tiers.map(x=><option key={x.id} value={x.id}>{x.label}{x.id==='legend'?' · 稀有':''}</option>)}</select></label><label>收集状态<select aria-label="图鉴状态" value={status} onChange={e=>setStatus(e.target.value as typeof status)}><option value="all">全部状态</option><option value="unlocked">已解锁</option><option value="locked">未解锁</option></select></label></div>
  <p className="shop-help">传奇稀有模板需高评分和对应身高、风格；无需额外抽奖。当前显示 {filtered.length} 个。</p>
  <div className="collection-grid">{filtered.map(t=><button key={t.id} className={`collection-item ${t.tier} ${collection[t.id]?'unlocked':'locked'}`} onClick={()=>setDetail(t.id)} aria-label={`${t.name} · ${collection[t.id]?'已解锁':'未解锁'}`}><span className="collection-badge">{t.position} · {tierConfig(t.tier).label}{t.tier==='legend'?' ✦':''}</span><strong>{t.name}</strong><small>{t.style}</small><span className="collection-status">{collection[t.id]?`已解锁 · 最高 ${collection[t.id].bestRating.toFixed(1)}`:'未解锁 · 查看培养条件'}</span></button>)}</div>
  {!filtered.length&&<p className="empty">没有符合筛选条件的模板。去训练场培养下一位球星。</p>}
  {t&&<ComicDialog title={profile?.name??t.name} className="collection-detail" onClose={()=>setDetail(null)}><span className="eyebrow">{record?'已永久解锁':'尚未解锁'} · {tierConfig(t.tier).label}{t.tier==='legend'?' · 稀有':''}</span>{profile?.avatar&&<img key={profile.avatar} className="collection-profile-photo tier-portrait-frame" data-tier={t.tier} src={profile.avatar} alt={(profile.name||t.name)+"头像"} referrerPolicy="no-referrer" onError={e=>{e.currentTarget.hidden=true;}}/>}{profile?.message&&<p role="status">{profile.message}，已显示远程备用头像。</p>}<p>{profile?.englishName??t.englishName} · {positionLabels[t.position]}<br/>{t.style}</p><p>身高 {t.height[0]}–{t.height[1]} cm；综合评分 ≥ {tierConfig(t.tier).minimumRating}，再匹配六维风格。</p><div className="template-standards">{statKeys.map(k=><span key={k}>{statLabels[k]}<b>{t.stats[k]}</b></span>)}</div><p>标准六维为风格参考，匹配比较相对分布，不要求逐项达到。</p>{record?<dl><dt>首次解锁</dt><dd>某次生涯第 {record.firstMonth} 月</dd><dt>历史最高评分</dt><dd>{record.bestRating.toFixed(1)}</dd><dt>历史最高报价</dt><dd>{money(record.bestValue)}</dd><dt>最高实际出售价值</dt><dd>{record.bestSale?money(record.bestSale):'尚未出售'}</dd></dl>:<p>培养出此模板后，会永久记录历史评分和价值。当前未解锁。</p>}<button className="primary mt-5" onClick={()=>setDetail(null)}>关闭详情</button></ComicDialog>}
 </section>;
}
