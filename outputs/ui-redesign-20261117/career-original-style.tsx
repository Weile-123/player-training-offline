import React, {type CSSProperties} from 'react';
import {createRoot} from 'react-dom/client';
import {ComicDialog} from '../../src/components/ComicDialog';
import {GameIcon} from '../../src/components/GameIcon';
import {StarPortrait, templatePortrait} from '../../src/components/PlayerTemplatePanel';
import {ProductImage} from '../../src/components/ProductImage';
import {TierBadge} from '../../src/components/TierBadge';
import {newGym, playerValue, type GymAlumnus, type GymPlayer} from '../../src/game/gym/engine';
import {templateById} from '../../src/game/templates';
import {statKeys} from '../../src/game/types';
import {statLabels} from '../../src/game/config';
import {assetUrl} from '../../src/presentation/assetUrls';
import {money} from '../../src/presentation/money';
import {gymCareerSummary} from '../../src/presentation/gymCareerSummary';
import '../../src/fonts/fonts.css';
import '../../src/styles.css';
import '../../src/gameplay.css';
import '../../src/components/ComicDialog.css';
import '../../src/contract.css';
import '../../src/scheme-a.css';
import '../../src/collection-album.css';
import '../../src/career-dialogs.css';
import '../../src/career-collection.css';
import '../../src/player-tiers.css';
import '../../src/fonts/typography.css';
import './career-original-style.css';

// An isolated visual sample. This module never imports the store or saves data.
const state = newGym(Date.now(), 20261117);
state.gymLevel = 4; state.fame = 2480; state.credits = 86;
state.projects = {endurance: 3, recovery: 2, recruitment: 2, equipment: 1, automation: 2, offline: 2};
function samplePlayer(id: string, templateId: string, level: number, shots: number): GymPlayer {
 const player = structuredClone(state.player!), template = templateById(templateId)!;
 Object.assign(player, {id, templateId, highestTier: template.tier, stats: {...template.stats}, height: template.height[0], level, peakLevel: level, shots, autoEnabled: true, training: {planId: 'balanced', shots: shots % 10, completedCourses: Math.floor(shots / 10)}});
 return player;
}
state.player = samplePlayer('a', 'jason-terry', 19, 236); state.bench = [samplePlayer('b', 'caruso', 12, 114), samplePlayer('c', 'conley', 17, 193)];
state.alumni = ['jason-terry', 'caruso', 'conley', 'jordan', 'jason-terry', 'conley'].map((id, index) => {
 const player = samplePlayer(`history-${index}`, id, id === 'jordan' ? 36 : 19 + index, id === 'jordan' ? 520 : 290 + index * 40);
 return {...player, recommendedAt: Date.now() - index * 1000, rewardCredits: 6, rewardFame: 120, finalValue: playerValue(state, player)} as GymAlumnus;
});
const summary = gymCareerSummary(state, state.alumni), best = summary.best!, bestTemplate = templateById(best.templateId)!;
const colors = ['#c82d25', '#e28b20', '#c39d28', '#26917c', '#258eb8', '#8b419e'];
const illustration = (name: string) => <span className="career-stat-illustration"><img src={assetUrl(`art/career/${name}.png`)} alt=""/></span>;
function Laurels() {return <svg className="career-laurels" viewBox="0 0 240 100" aria-hidden="true"><g fill="#bf8b2f" stroke="#bf8b2f"><path d="M48 95Q2 57 22 9M192 95q46-38 26-86" fill="none" strokeWidth="2"/>{[0,1,2,3,4].map(i => <g key={i}><ellipse cx={17+i*4} cy={20+i*15} rx="4" ry="9" transform={`rotate(-38 ${17+i*4} ${20+i*15})`}/><ellipse cx={31+i*3} cy={25+i*14} rx="4" ry="9" transform={`rotate(35 ${31+i*3} ${25+i*14})`}/><ellipse cx={223-i*4} cy={20+i*15} rx="4" ry="9" transform={`rotate(38 ${223-i*4} ${20+i*15})`}/><ellipse cx={209-i*3} cy={25+i*14} rx="4" ry="9" transform={`rotate(-35 ${209-i*3} ${25+i*14})`}/></g>)}</g></svg>;}
function Preview() {
 return <ComicDialog title="球馆档案" variant="album" className="career-statistics-dialog gym-career-original-preview" onClose={() => {}}><article className="career-statistics">
  <header className="career-identity"><GameIcon name="career"/><strong>我的球馆经营档案</strong><span>累计记录</span></header>
  <section className="career-month-record"><div className="career-trophy"><img src={assetUrl('art/career/highest-month.png')} alt=""/></div><div className="career-month-copy"><h3>区域训练中心</h3><strong>球馆 <b>4</b> 级</strong><Laurels/></div><div className="preview-fame"><span>累计声望 <b>2,480</b><small> / 3,000</small></span><progress value={2480} max={3000}/><small>距下一馆级声望还差 520 · 升级还需满足其他条件</small></div></section>
  <dl className="career-totals"><div>{illustration('cash')}<dt>可用赞助券</dt><dd>86<small> 券</small></dd></div><div>{illustration('calendar')}<dt>在训 / 训练位</dt><dd>3<small> / 4 人</small></dd></div><div>{illustration('finish')}<dt>累计推荐</dt><dd>{summary.recommended}<small> 人</small></dd></div><div>{illustration('training')}<dt>最高训练</dt><dd>36<small> 级</small></dd></div></dl>
  <section className="career-end-section"><h3>推荐成果与培养纪录</h3><div className="preview-tier-grid">{summary.distribution.map(tier => <div key={tier.id} data-tier={tier.id}><TierBadge tier={tier.id}/><b>{tier.count}<small> 人</small></b></div>)}</div><div className="preview-record-row"><span>校友平均等级</span><b>{summary.averageLevel.toFixed(1)} 级</b></div><div className="preview-record-row"><span>最高校友身价</span><b>{money(best.finalValue)}</b></div></section>
  <section className="career-end-section"><h3>最高身价纪录</h3><div className="career-best"><div className="career-best-hero"><div className="career-best-photo tier-portrait-frame" data-tier={bestTemplate.tier}><StarPortrait src={templatePortrait(best.templateId)} name={bestTemplate.name}/></div><div className="career-best-info"><strong>模板：{bestTemplate.name}</strong><b className="career-best-value">{money(best.finalValue)}</b><span className="career-best-level">♜ 训练 Lv.{best.level}</span><span className="career-best-rating">★ 综评 {(Object.values(best.stats).reduce((s, n) => s + n, 0) / 6).toFixed(1)}</span></div></div><div className="career-peak-label"><span>校友最终身价 · 价值巅峰记录</span></div><div className="career-best-stats">{statKeys.map((key, i) => <div key={key} style={{'--stat-color': colors[i]} as CSSProperties}><span>{statLabels[key]}</span><b>{best.stats[key]}</b><div className="career-stat-track"><i style={{width: `${best.stats[key] / 99 * 100}%`}}/></div></div>)}</div></div></section>
  <section className="career-end-section"><h3>训练与设施</h3>{[['有效投篮 / 已完成课程', `${summary.shots.toLocaleString()} 球 / ${summary.courses} 课`], ['自动训练中的球员', '3 / 3 人'], ['馆内器材 / 可用槽位', '4 / 5 件'], ['经营项目已购等级合计', '12 级'], ['自动间隔 / 离线结算上限', '1.6 秒 / 60 分钟']].map(([label, value]) => <div className="preview-record-row" key={label}><span>{label}</span><b>{value}</b></div>)}</section>
  <section className="career-collection-progress"><h3>收藏足迹</h3><div className="career-collection-links"><button><span className="career-collection-art"><img src={assetUrl('art/career/album.png')} alt=""/></span><strong>球星模板</strong><b>24<small> / 119</small></b><progress value={24} max={119}/><span className="collection-link-arrow">›</span><small className="preview-collection-note">已推荐 4 种模板</small></button><button><span className="career-collection-art"><ProductImage id="relic_002" name="器材"/></span><strong>器材收藏</strong><b>13<small> / 94</small></b><progress value={13} max={94}/><span className="collection-link-arrow">›</span><small className="preview-collection-note">当前持有 6 件</small></button></div></section>
  <p className="career-stat-note">推荐分布按完整校友最终模板统计；有效投篮与课程为在馆＋校友记录，不含未留档球员，余额不代表累计收入。</p>
 </article></ComicDialog>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
