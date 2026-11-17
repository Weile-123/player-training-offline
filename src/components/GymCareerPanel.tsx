import {useEffect, useMemo, useState, type CSSProperties} from 'react';
import {equipmentCatalog, gymLevels} from '../game/gym/catalog';
import {alumniProgress, automaticIntervalMs, equipmentCapacity, type GymAlumnus, type GymState} from '../game/gym/engine';
import {offlineLimitMs} from '../game/gym/offline';
import {templateById} from '../game/templates';
import {templateRules} from '../game/contract/templates';
import {statKeys} from '../game/types';
import {statLabels} from '../game/config';
import {usePlayerProfile} from '../platform/usePlayerProfile';
import {gymCareerSummary} from '../presentation/gymCareerSummary';
import {loadAllGymAlumni, type GymAlumniLoader} from '../presentation/gymAlumniGroups';
import {gymPlayerName} from '../presentation/gymPlayerName';
import {decodePreferences, presentationConfig} from '../presentation/feedback';
import {assetUrl} from '../presentation/assetUrls';
import {ActionNotice} from './ActionNotice';
import {money} from '../presentation/money';
import {StarPortrait, templatePortrait} from './PlayerTemplatePanel';
import {GameIcon} from './GameIcon';
import {ProductImage} from './ProductImage';
import {TierBadge} from './TierBadge';
import './GymCareerPanel.css';

type Props = {state: GymState; loadAlumni?: GymAlumniLoader; onCollection?: (tab: 0 | 1) => void};
const number = new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 1});
const format = (value: number) => number.format(value);
const statColors = ['#c82d25', '#e28b20', '#c39d28', '#26917c', '#258eb8', '#8b419e'];

function Illustration({name}: {name: string}) {
  return <span className="career-stat-illustration"><img src={assetUrl(`art/career/${name}.png`)} alt=""/></span>;
}

function Laurels() {
  return <svg className="career-laurels" viewBox="0 0 240 100" aria-hidden="true"><g fill="#bf8b2f" stroke="#bf8b2f"><path d="M48 95Q2 57 22 9M192 95q46-38 26-86" fill="none" strokeWidth="2"/>{[0, 1, 2, 3, 4].map(i => <g key={i}><ellipse cx={17+i*4} cy={20+i*15} rx="4" ry="9" transform={`rotate(-38 ${17+i*4} ${20+i*15})`}/><ellipse cx={31+i*3} cy={25+i*14} rx="4" ry="9" transform={`rotate(35 ${31+i*3} ${25+i*14})`}/><ellipse cx={223-i*4} cy={20+i*15} rx="4" ry="9" transform={`rotate(38 ${223-i*4} ${20+i*15})`}/><ellipse cx={209-i*3} cy={25+i*14} rx="4" ry="9" transform={`rotate(-35 ${209-i*3} ${25+i*14})`}/></g>)}</g></svg>;
}

function BestCareerPlayer({player}: {player: GymAlumnus}) {
  const template = templateById(player.templateId);
  const profile = usePlayerProfile(player.templateId);
  const name = profile?.name ?? gymPlayerName(player);
  const tier = template?.tier ?? 'undiscovered';
  const rating = statKeys.reduce((sum, key) => sum + player.stats[key], 0) / statKeys.length;
  return <article className="career-best gm-career-best" data-tier={tier} aria-label="最高最终身价球员">
    <div className="career-best-hero">
      <div className="career-best-photo tier-portrait-frame" data-tier={tier}><StarPortrait src={profile?.avatar ?? templatePortrait(player.templateId)} fallbackSrc={templatePortrait(player.templateId)} name={name}/></div>
      <div className="career-best-info"><strong>模板：{name}</strong><b className="career-best-value gm-career-best-value" title={player.finalValue}>{money(player.finalValue)}</b><span className="career-best-level">♜ 训练 Lv.{player.level}</span><span className="career-best-rating">★ 综评 {rating.toFixed(1)}</span></div>
    </div>
    <div className="career-peak-label"><span>校友最终身价 · 价值巅峰记录</span></div>
    <div className="career-best-stats">{statKeys.map((key, index) => <div key={key} style={{'--stat-color': statColors[index]} as CSSProperties}><span>{statLabels[key]}</span><b>{player.stats[key]}</b><div className="career-stat-track"><i style={{width: `${player.stats[key] / 99 * 100}%`}}/></div></div>)}</div>
  </article>;
}

/** The approved archive design, populated with complete hot and cold career records. */
export function GymCareerPanel({state, loadAlumni, onCollection}: Props) {
  const [loaded, setLoaded] = useState<GymAlumnus[] | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const progress = alumniProgress(state);
  const identity = `${state.createdAt}:${state.seed}:${progress.total}`;
  const [loadedIdentity, setLoadedIdentity] = useState('');
  const [reduced] = useState(() => {
    try { return decodePreferences(localStorage.getItem(presentationConfig.preferenceKey)).reducedMotion; }
    catch { return false; }
  });
  useEffect(() => {
    if (!loadAlumni) return;
    let cancelled = false;
    setLoaded(null); setError('');
    loadAllGymAlumni(loadAlumni).then(players => {
      if (!cancelled) {setLoaded(players); setLoadedIdentity(identity);}
    }).catch(() => {if (!cancelled) setError('完整档案暂时无法读取，请重试。');});
    return () => {cancelled = true;};
  }, [loadAlumni, identity, retry]);
  const ready = loadAlumni ? loaded !== null && loadedIdentity === identity : !state.alumniArchive?.count;
  const alumni = loadAlumni ? loaded ?? [] : state.alumni;
  const summary = useMemo(() => gymCareerSummary(state, alumni), [state, alumni]);
  const gym = gymLevels[state.gymLevel - 1];
  const next = gymLevels[state.gymLevel];
  const stars = templateRules.filter(template => !!state.collection[template.id]).length;
  const equipment = equipmentCatalog.filter(item => !!state.collectedEquipment[item.id]).length;
  const historyValue = (value: number) => ready ? format(value) : '—';
  return <article className={`career-statistics gym-career${reduced ? ' reduce-motion' : ''}`} aria-label="球馆经营档案" aria-busy={!!loadAlumni&&!ready&&!error}>
    <header className="career-identity"><GameIcon name="career"/><strong>我的球馆经营档案</strong><span className="gm-career-header-status">{error?<button type="button" onClick={()=>setRetry(value=>value+1)}>重新读取档案</button>:'累计记录'}</span></header>
    <section className="career-month-record"><div className="career-trophy"><img src={assetUrl('art/career/highest-month.png')} alt=""/></div><div className="career-month-copy"><h3>{gym.name}</h3><strong>球馆 <b>{state.gymLevel}</b> 级</strong><Laurels/></div><div className="gm-career-fame"><span>累计声望 <b>{format(state.fame)}</b>{next && <small> / {format(next.fame)}</small>}</span><progress value={next ? Math.min(state.fame, next.fame) : 1} max={next?.fame ?? 1} aria-label="下级球馆声望进度"/><small>{next ? `距下一馆级声望还差 ${format(Math.max(0, next.fame - state.fame))} · 升级还需满足其他条件` : '已达到最高球馆等级'}</small></div></section>
    <dl className="career-totals gm-career-counters"><div><Illustration name="cash"/><dt>可用赞助券</dt><dd>{format(state.credits)}<small> 券</small></dd></div><div><Illustration name="calendar"/><dt>在训 / 训练位</dt><dd>{summary.active}<small> / {state.gymLevel} 人</small></dd></div><div><Illustration name="finish"/><dt>累计推荐</dt><dd>{ready ? format(summary.recommended) : format(progress.total)}<small> 人</small></dd></div><div><Illustration name="training"/><dt>最高训练</dt><dd>{historyValue(summary.peakLevel)}<small> 级</small></dd></div></dl>
    <ActionNotice message={error||(!ready?(loadAlumni?'正在汇总完整球馆档案…':'历史档案尚未载入，请重新进入球馆后查看完整纪录。'):'')} role={error?'alert':'status'}/>
    <section className="career-end-section gm-career-recommendations"><h3>推荐成果与培养纪录</h3><div className="gm-career-tier-grid">{summary.distribution.map(tier => <div key={tier.id} data-tier={tier.id}><TierBadge tier={tier.id}/><b>{historyValue(tier.count)}<small> 人</small></b></div>)}</div><div className="gm-career-record-row"><span>校友平均等级</span><b>{ready ? summary.averageLevel.toFixed(1) : '—'} 级</b></div><div className="gm-career-record-row"><span>最高校友身价</span><b>{ready && summary.best ? money(summary.best.finalValue) : '—'}</b></div></section>
    <section className="career-end-section gm-career-best-section"><h3>最高身价纪录</h3>{ready ? summary.best ? <BestCareerPlayer player={summary.best}/> : <p className="career-stat-empty gm-career-empty">推荐首位球员后，这里会留下最高身价纪录。</p> : <p className="career-stat-empty gm-career-empty">{error ? '完整纪录读取后显示。' : '正在读取最高身价纪录…'}</p>}</section>
    <section className="career-end-section gm-career-facilities"><h3>训练与设施</h3>{[
      ['有效投篮 / 已完成课程', `${historyValue(summary.shots)} 球 / ${historyValue(summary.courses)} 课`],
      ['自动训练中的球员', `${summary.automatic} / ${summary.active} 人`],
      ['馆内器材 / 可用槽位', `${state.equippedEquipment.length} / ${equipmentCapacity(state)} 件`],
      ['经营项目已购等级合计', `${summary.projectLevels} 级`],
      ['自动间隔 / 离线结算上限', state.gymLevel < 2 ? '球馆 Lv.2 开放' : `${format(automaticIntervalMs(state) / 1000)} 秒 / ${format(offlineLimitMs(state) / 60_000)} 分钟`],
    ].map(([label, value]) => <div className="gm-career-record-row" key={label}><span>{label}</span><b>{value}</b></div>)}</section>
    <section className="career-collection-progress"><h3>收藏足迹</h3><div className="career-collection-links"><button type="button" onClick={() => onCollection?.(0)} aria-label="查看球星模板图鉴"><span className="career-collection-art"><img src={assetUrl('art/career/album.png')} alt=""/></span><strong>球星模板</strong><b>{stars}<small> / {templateRules.length}</small></b><progress value={stars} max={templateRules.length} aria-label="球星收藏进度"/><span className="collection-link-arrow" aria-hidden="true">›</span><small className="gm-career-collection-note">已推荐 {historyValue(summary.recommendedTemplates)} 种模板</small></button><button type="button" onClick={() => onCollection?.(1)} aria-label="查看器材收藏图鉴"><span className="career-collection-art"><ProductImage id="relic_002" name="器材"/></span><strong>器材收藏</strong><b>{equipment}<small> / {equipmentCatalog.length}</small></b><progress value={equipment} max={equipmentCatalog.length} aria-label="器材收藏进度"/><span className="collection-link-arrow" aria-hidden="true">›</span><small className="gm-career-collection-note">当前持有 {state.ownedEquipment.length} 件</small></button></div></section>
    <p className="career-stat-note">推荐分布按完整校友最终模板统计；有效投篮与课程为在馆＋校友记录，不含未留档球员，余额不代表累计收入。{ready && summary.unmatched > 0 && `包含历史待发掘校友 ${format(summary.unmatched)} 人。`}</p>
  </article>;
}
