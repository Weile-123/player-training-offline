import {useEffect, useMemo, useState, type CSSProperties} from 'react';
import {equipmentCatalog, gymLevels} from '../game/gym/catalog';
import {alumniProgress, automaticIntervalMs, equipmentCapacity, type GymAlumnus, type GymState} from '../game/gym/engine';
import {offlineLimitMs} from '../game/gym/offline';
import {templateById} from '../game/templates';
import {templateRules} from '../game/contract/templates';
import {usePlayerProfile} from '../platform/usePlayerProfile';
import {gymCareerSummary} from '../presentation/gymCareerSummary';
import {loadAllGymAlumni, type GymAlumniLoader} from '../presentation/gymAlumniGroups';
import {gymPlayerName} from '../presentation/gymPlayerName';
import {decodePreferences, presentationConfig} from '../presentation/feedback';
import {money} from '../presentation/money';
import {StarPortrait, templatePortrait} from './PlayerTemplatePanel';
import {tierConfig} from '../game/matching';
import './GymDesignSystem.css';
import './GymCareerPanel.css';

type Props = {state: GymState; loadAlumni?: GymAlumniLoader};
const number = new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 1});
const format = (value: number) => number.format(value);
const careerValue = (value: string) => money(value).replace(/^\$/, '').replace(/\.00(?=[万亿兆京]|$)/, '');

function BestCareerPlayer({player}: {player: GymAlumnus}) {
  const template = templateById(player.templateId);
  const profile = usePlayerProfile(player.templateId);
  const name = profile?.name ?? gymPlayerName(player);
  const tier = template?.tier ?? 'undiscovered';
  return <article className="hall-of-fame gm-career-best" data-tier={tier} aria-label="最高最终身价球员">
    <div className="best-portrait gm-career-best-portrait tier-portrait-frame" data-tier={tier}><span className="album-portrait-surface"><StarPortrait src={profile?.avatar ?? templatePortrait(player.templateId)} fallbackSrc={templatePortrait(player.templateId)} name={name}/></span></div>
    <div className="gm-career-best-identity"><h3>{name}</h3><p><span className="chip">{template ? tierConfig(template.tier).label : '待发掘'}</span>　训练 Lv.{player.level}</p></div>
    <div className="best-value gm-career-best-value"><span>最终身价</span><b title={player.finalValue}>{careerValue(player.finalValue)}</b></div>
  </article>;
}

/** A read-only management dashboard. Detailed alumni remain in the in-game archive. */
export function GymCareerPanel({state, loadAlumni}: Props) {
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
  const targetFame = next?.fame ?? gym.fame;
  const fameRatio = next ? Math.min(100, state.fame / Math.max(1, targetFame) * 100) : 100;
  const stars = Object.keys(state.collection).length;
  const equipment = Object.keys(state.collectedEquipment).length;
  const historyValue = (value: number) => ready ? format(value) : '—';
  return <div className={`gym-design-surface career-b gym-career${reduced ? ' reduce-motion' : ''}`} aria-label="球馆经营档案">
    <section className="dashboard-hero gm-career-hero"><div><span className="eyebrow">当前球馆 · 经营总览</span><h2>{gym.name}</h2></div><b className="dashboard-level">Lv.{state.gymLevel}</b><div className="dashboard-fame"><div className="dashboard-fame-head"><span>累计声望</span><b>{format(state.fame)}{next && <small> / {format(targetFame)}</small>}</b></div><div className="bar gm-career-track" role="progressbar" aria-label="下级球馆声望进度" aria-valuemin={0} aria-valuemax={Math.max(1, targetFame)} aria-valuenow={Math.min(state.fame, Math.max(1, targetFame))}><i style={{width: `${fameRatio}%`}}/></div><p>{next ? `距下一馆级声望还差 ${format(Math.max(0, targetFame - state.fame))} · 升级还需满足其他条件` : '已达到最高球馆等级'}</p></div></section>
    <div className="dashboard-counters gm-career-counters"><div className="counter"><span>可用赞助券</span><b>{format(state.credits)}</b></div><div className="counter"><span>在训 / 训练位</span><b>{summary.active}<small style={{font: "12px 'Microsoft YaHei'", color: '#806746'}}> / {state.gymLevel}</small></b></div></div>
    {loadAlumni && !ready && !error && <p className="gm-career-loading" role="status">正在汇总完整球馆档案…</p>}
    {error && <div className="gm-career-error"><p role="alert">{error}</p><button type="button" className="gm-button" onClick={() => setRetry(value => value + 1)}>重新读取档案</button></div>}
    {!loadAlumni && !ready && <p className="gm-career-loading" role="status">历史档案尚未载入，请重新进入球馆后查看完整纪录。</p>}
    <div className="dashboard-split gm-career-split"><section className="gm-career-recommendations"><h2>推荐成果 <span className="chip">{ready ? format(summary.recommended) : format(progress.total)} 人</span></h2><div className="distribution gm-career-distribution" aria-hidden="true">{summary.distribution.map(tier => <i key={tier.id} style={{width: ready && summary.recommended ? `${tier.count / summary.recommended * 100}%` : '0%'}}/>)}{!ready || !summary.recommended ? <i className="is-empty"/> : null}</div><div className="distribution-key gm-career-tier-key">{summary.distribution.map(tier => <div key={tier.id}><span>{tier.label}</span><b>{historyValue(tier.count)}</b></div>)}</div></section><section className="gm-career-records"><h2>培养纪录</h2><div className="stats-row"><span>最高训练</span><b>{ready ? `Lv.${summary.peakLevel}` : '—'}</b></div><div className="stats-row"><span>校友平均等级</span><b>{historyValue(summary.averageLevel)}</b></div><div className="stats-row"><span>最高校友身价</span><b>{ready ? summary.best ? careerValue(summary.best.finalValue) : '—' : '—'}</b></div></section></div>
    <section className="block gm-career-best-section"><div className="section-title"><h2>最高身价纪录</h2><small>校友最终身价</small></div>{ready ? summary.best ? <BestCareerPlayer player={summary.best}/> : <p className="gm-career-empty">推荐首位已发掘模板的球员后，这里会留下最高身价纪录。</p> : <p className="gm-career-empty">{error ? '完整纪录读取后显示。' : '正在读取最高身价纪录…'}</p>}</section>
    <section className="records-table gm-career-facilities"><header>训练与设施</header><div className="stats-row"><span>有效投篮 / 已完成课程</span><b>{historyValue(summary.shots)} <small>球</small> / {historyValue(summary.courses)} <small>课</small></b></div><div className="stats-row"><span>自动训练中的球员</span><b>{summary.automatic} <small>/ {summary.active} 人</small></b></div><div className="stats-row"><span>馆内器材 / 可用槽位</span><b>{state.equippedEquipment.length} <small>/ {equipmentCapacity(state)} 件</small></b></div><div className="stats-row"><span>经营项目已购等级合计</span><b>{summary.projectLevels} <small>级</small></b></div><div className="stats-row"><span>自动间隔 / 离线结算上限</span>{state.gymLevel < 2 ? <b className="gm-career-locked">球馆 Lv.2 开放</b> : <b>{format(automaticIntervalMs(state) / 1000)} <small>秒/球</small> / {format(offlineLimitMs(state) / 60_000)} <small>分钟</small></b>}</div></section>
    <section className="block gm-career-collection"><div className="section-title"><h2>收藏足迹</h2><small>图鉴永久保留</small></div><div className="collection-rings"><div className="ring-card"><span className="ring" style={{'--progress': `${Math.min(100, stars / templateRules.length * 100)}%`} as CSSProperties}><b>{stars}</b></span><div><h3>球星模板</h3><small>已推荐 {historyValue(summary.recommendedTemplates)} 种模板</small></div></div><div className="ring-card"><span className="ring is-equipment" style={{'--progress': `${Math.min(100, equipment / equipmentCatalog.length * 100)}%`} as CSSProperties}><b>{equipment}</b></span><div><h3>器材收藏</h3><small>当前持有 {state.ownedEquipment.length} 件</small></div></div></div></section>
    <p className="footnote gm-career-note">推荐分布按完整校友最终模板统计；有效投篮与课程为在馆＋校友记录，不含未留档球员，余额不代表累计收入。{ready && summary.unmatched > 0 && `包含历史待发掘校友 ${format(summary.unmatched)} 人。`}</p>
  </div>;
}
