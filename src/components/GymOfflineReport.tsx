import {Fragment, useEffect, useRef, useState, type CSSProperties} from 'react';
import type {OfflinePlayerReport, OfflineTrainingReport} from '../game/gym/offline';
import {playerLevelCap} from '../game/gym/progression';
import {tierConfig} from '../game/matching';
import {templateById} from '../game/templates';
import {gymPlayerName} from '../presentation/gymPlayerName';
import {offlineDuration} from '../presentation/offlineDuration';
import {decodePreferences, presentationConfig} from '../presentation/feedback';
import {ComicDialog} from './ComicDialog';
import {ActionNotice} from './ActionNotice';
import {StarPortrait, templatePortrait} from './PlayerTemplatePanel';
import './GymDesignSystem.css';
import './GymOfflineReport.css';

const number = new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 1});
const experienceText = (experience: number, bonus: number, multiplier: number) => `+${number.format(experience+Math.round(bonus*(multiplier-1)))}`;

/** Keep numbers and units separate, exactly as the selected report design. */
function DurationValue({milliseconds, className}: {milliseconds: number; className?: string}) {
  const parts = [...offlineDuration(milliseconds).matchAll(/(\d+)(小时|分钟|秒)/g)];
  return <b className={className}>{parts.map(([text, value, unit]) => <Fragment key={text}>{value}<small>{unit}</small></Fragment>)}</b>;
}

function OfflinePlayerCard({player, multiplier,bonus}: {player: OfflinePlayerReport; multiplier: number;bonus:number}) {
  const xp = experienceText(player.xpGained,bonus,multiplier);
  const template = templateById(player.templateAfter);
  const name = gymPlayerName({templateId: player.templateAfter, name: player.name});
  const changed = player.templateBefore !== player.templateAfter;
  const originalName = templateById(player.templateBefore)?.name ?? '待发掘';
  const finalName = template?.name ?? '待发掘';
  const tier = template?.tier ?? 'undiscovered';
  return <article className="report-athlete gm-offline-athlete" aria-label={`${name}离线培养成果`}>
    <div className="athlete-cover gm-offline-athlete-cover">
      <span className="gm-offline-portrait tier-portrait-frame" data-tier={tier}><span className="album-portrait-surface"><StarPortrait src={templatePortrait(player.templateAfter)} name={name}/></span></span>
      <div><h3>{name}</h3><small>{template ? tierConfig(template.tier).label : '待发掘'}</small></div>
    </div>
    <div className="athlete-growth gm-offline-athlete-growth">
      <div className="athlete-level gm-offline-level-flow" data-long-level={Math.max(player.levelBefore, player.levelAfter) >= 1000 || undefined}><span><small>Lv.</small>{player.levelBefore}</span><small aria-hidden="true">→</small><strong>{player.levelAfter}</strong></div>
      <p className="athlete-xp gm-offline-athlete-xp">经验 <b className="gm-offline-xp-value" data-xp-text={xp}>{xp}</b></p>
      <div className="athlete-stat"><span>完成投篮</span><b>{number.format(player.shots)} 球</b></div>
      <div className="athlete-stat"><span>完整课程</span><b>{number.format(player.courses)} 课</b></div>
      <div className="athlete-template gm-offline-template">
        {changed ? <>模板变化<strong className="gm-offline-template-change" title={`${originalName} → ${finalName}`}><span className="gm-offline-template-before">{originalName}</span><i aria-hidden="true"> → </i><span className="gm-offline-template-after">{finalName}</span></strong></> : <>培养记录已更新<strong className="gm-offline-template-unchanged">模板保持不变</strong></>}
      </div>
    </div>
  </article>;
}

type Report = OfflineTrainingReport & {reportId?: string; experienceMultiplier?: 1 | 2};
type Props = {
  report: Report; onClose: () => void;
  /** Resolve true only after the business reward has been durably committed. */
  onDoubleExperience?: () => Promise<boolean>;
  doubleExperienceClaimed?: boolean;
  doubleExperiencePending?: boolean;
  doubleExperienceError?: string;
  bonusExperience?: Readonly<Record<string,number>>;
};
export const offlineExperienceAnimationMs = 900;

/** Original XP stays immutable; authority controls whether the optional bonus is claimed. */
export function GymOfflineReport(props: Props) {
  const identity = props.report.reportId ?? `${props.report.from}:${props.report.to}`;
  return <OfflineReportContent key={identity} {...props}/>;
}

function OfflineReportContent({report, onClose, onDoubleExperience, doubleExperienceClaimed = false, doubleExperiencePending = false, doubleExperienceError = '',bonusExperience}: Props) {
  const [reduced] = useState(() => {
    try { return decodePreferences(localStorage.getItem(presentationConfig.preferenceKey)).reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch { return false; }
  });
  const authoritativeClaim = doubleExperienceClaimed || report.experienceMultiplier === 2;
  const [multiplier, setMultiplier] = useState(authoritativeClaim ? 2 : 1);
  const [claimedHere, setClaimedHere] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState('');
  const active = useRef(true), locked = useRef(false), frame = useRef(0), animated = useRef(authoritativeClaim);
  const claimed = authoritativeClaim || claimedHere;
  const busy = pending || doubleExperiencePending;
  // The same eased progress drives every counter and every gold text overlay.
  const colorProgress = Math.max(0, Math.min(1, multiplier - 1));
  const bonuses=report.bonusExperience??bonusExperience;
  const playerBonus=(player:OfflinePlayerReport)=>bonuses?.[player.id]??(player.levelAfter>=playerLevelCap?0:player.xpGained);
  const totalBonus=report.players.reduce((sum,player)=>sum+playerBonus(player),0);
  const totalExperience = experienceText(report.totalExperience,totalBonus,multiplier);
  const close = () => {if (!locked.current && !pending && !doubleExperiencePending) onClose();};
  useEffect(() => {active.current = true; return () => {active.current = false; cancelAnimationFrame(frame.current);};}, []);
  useEffect(() => {
    // A restored/already-claimed report shows its final value immediately.
    // During this component's active request the success callback owns tweening.
    if (authoritativeClaim && !locked.current && !animated.current) {
      animated.current = true; setMultiplier(2);
    }
  }, [authoritativeClaim, pending]);
  const claim = async () => {
    if (!onDoubleExperience || locked.current || busy || claimed || totalBonus <= 0) return;
    locked.current = true; setPending(true); setError('');
    try {
      const granted = await onDoubleExperience();
      if (!active.current) return;
      if (!granted) {setError('双倍经验未领取，请确认广告完成后重试。'); return;}
      setClaimedHere(true);
      if (animated.current) return;
      animated.current = true;
      if (reduced) {setMultiplier(2); return;}
      const started = performance.now();
      const update = (now: number) => {
        if (!active.current) return;
        const progress = Math.min(1, Math.max(0, (now - started) / offlineExperienceAnimationMs));
        setMultiplier(2 - (1 - progress) ** 3);
        if (progress < 1) frame.current = requestAnimationFrame(update);
      };
      frame.current = requestAnimationFrame(update);
    } catch (error) {if (active.current) setError(error instanceof Error ? error.message : '双倍经验领取失败，请稍后重试。');}
    finally {locked.current = false; if (active.current) setPending(false);}
  };
  return <ComicDialog title="离线训练报告" className="gym-design-dialog gym-offline-dialog" priority={1} onClose={close} dismissible={!busy}>
    <div className={`gym-design-surface offline-b gm-offline-report${reduced ? ' reduce-motion' : ''}${claimed ? ' is-double-experience' : ''}`} data-experience-multiplier={multiplier} style={{'--offline-gold-progress': colorProgress} as CSSProperties}>
      <section className="report-dashboard gm-offline-scoreboard" aria-label="离线训练结算">
        <div className="report-dashboard-top"><h2>离线训练结算</h2><small>● 已保存</small></div>
        <div className="report-dashboard-primary gm-offline-xp-total"><b className="gm-offline-xp-value" data-xp-text={totalExperience}>{totalExperience}</b><span>总经验 XP</span></div>
        <div className="report-dashboard-metrics gm-offline-metrics"><div><span>计入时长</span><DurationValue milliseconds={report.creditedMs}/></div><div><span>完成投篮</span><b>{number.format(report.totalShots)}<small>球</small></b></div><div><span>本次离开</span><DurationValue milliseconds={report.elapsedMs} className="duration"/></div></div>
      </section>
      {report.capped && <p className="cap-note gm-offline-cap-note"><b aria-hidden="true">!</b><span>本次已按{offlineDuration(report.capMs)}上限结算；超出时长仅恢复体力。</span></p>}
      <section className="gm-offline-results" aria-label="本次培养成果">
        <div className="result-heading"><h2>本次培养成果</h2><small>{report.players.length} 位自动训练球员</small></div>
        {report.players.length ? <div className="player-columns gm-offline-players" role="region" aria-label="球员离线成果，可左右滑动" tabIndex={0}>{report.players.map(player => <OfflinePlayerCard key={player.id} player={player} multiplier={multiplier} bonus={playerBonus(player)}/>)}</div> : <p className="gm-offline-empty">本次没有产生有效训练。</p>}
      </section>
      <div className="report-bottom gm-offline-footer"><p>经验奖励最高补至{playerLevelCap}级；赞助券需推荐签约获得。</p>
        <button type="button" className="primary gm-offline-double-experience" disabled={!onDoubleExperience || busy || claimed || totalBonus <= 0} aria-busy={busy} onClick={() => void claim()}><svg className="gm-offline-ad-icon" viewBox="0 0 24 20" aria-hidden="true"><rect x="1.5" y="2" width="21" height="16" rx="2"/><path d="m10 6 6 4-6 4Z"/></svg><span>{busy ? '正在领取…' : claimed ? '已领取双倍经验' : totalBonus<=0&&report.totalExperience>0?'球员已满级':'领取双倍经验'}</span></button>
        <ActionNotice message={doubleExperienceError||error} role="alert" className="gm-offline-double-error"/>
        <button type="button" className="primary" disabled={busy} onClick={close}>继续培养</button>
      </div>
    </div>
  </ComicDialog>;
}
