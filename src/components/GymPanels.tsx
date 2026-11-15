import {useEffect, useId, useMemo, useRef, useState} from 'react';
import {statLabels} from '../game/config';
import {templateRules, type TemplateRule} from '../game/contract/templates';
import {equipmentCatalog, equipmentFamilyLabels, gymLevels, projects, postgameRepeatTemplateCredits, type GymEquipment, type ProjectId} from '../game/gym/catalog';
import {automaticIntervalMs, cooperationStatus, courseRecoveryCap, drinkPrice, drinkRecovery, effectiveTrainingBias, equipmentCapacity, equipmentEffects, equipmentOffer, equipmentSaleValue, equippedFamilyEquipment, gymUpgrade, playerLevelCap, playerValue, projectOffer, recoverySeconds, requiredExperience, staminaMax, trainingCreditMilestones, trainingPlans, trainingStatus, type GymAction, type GymAlumnus, type GymPlayer, type GymState, type TrainingPlanId} from '../game/gym/engine';
import {offlineLimitMs, type OfflineTrainingReport} from '../game/gym/offline';
import {trainingGuidance} from '../game/gym/guidance';
import {forecastTraining} from '../game/gym/forecast';
import {equipmentTrainingComparison, previewEquipmentState, projectTrainingComparison, type EquipmentTrainingComparison} from '../game/gym/equipmentForecast';
import {offlineUpgradeGuidance} from '../game/gym/offlineUpgradeGuidance';
import {overallRating, tierConfig} from '../game/matching';
import {positionLabels, templateById} from '../game/templates';
import {statKeys, type Stats} from '../game/types';
import {usePlayerProfile} from '../platform/usePlayerProfile';
import {money} from '../presentation/money';
import {ComicDialog} from './ComicDialog';
import {EquipmentMystery} from './EquipmentMystery';
import {FittedAmount} from './FittedAmount';
import {GameIcon} from './GameIcon';
import {StarPortrait, templatePortrait} from './PlayerTemplatePanel';
import {ProductImage} from './ProductImage';
import {SlidingTabs} from './SlidingTabs';
import {GymRecruitmentControls} from './GymRecruitmentControls';
import {alumniProgress, recommendationPayout} from '../game/gym/engine';
import './GymPanels.css';

export type GymPanelProps = {
  state: GymState;
  onAction: (action: GymAction) => void;
  onClose?: () => void;
  busy?: boolean;
  loadAlumni?: (offset?: number, limit?: number) => Promise<{players: GymAlumnus[]; total: number}>;
};

const formatNumber = new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 1});
const format = (value: number) => formatNumber.format(value);
const rarityLabels = {common: '普通', rare: '稀有', legendary: '传说'};
const equipmentById = new Map(equipmentCatalog.map(item => [item.id, item]));
const tierOrder = ['rotation', 'starter', 'star', 'superstar', 'legend'];
const albumTemplates = [...templateRules].sort((a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier));
const effectLabels = {stamina: '体力容量', recovery: '恢复护理', focusPower: '专项成长', courseRecovery: '课程恢复', experience: '每球经验', automationExperience: '自动经验', offlineMinutes: '离线时长', cooperationBonus: '合作奖励', valuePercent: '身价与品牌'};
const recommendationTierNames = ['待发掘', '替补', '首发', '全明星', '巨星', '传奇'];

function RecommendationCreditRule({state}: {state: GymState}) {
  return <p className="gm-muted" aria-label="模板推荐奖励规则">每个模板首次推荐拥有额外奖励；之后同模板每次仅获得 {postgameRepeatTemplateCredits} 赞助券。</p>;
}

export function offlineDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const remainder = seconds % 60;
  return [hours ? `${hours}小时` : '', minutes ? `${minutes}分钟` : '', remainder || !hours && !minutes ? `${remainder}秒` : ''].filter(Boolean).join('');
}

export function TrainingAdvice({state, player = state.player, compact = false}: {state: GymState; player?: GymPlayer | null; compact?: boolean}) {
  const guidance = trainingGuidance(state, player);
  if (!player || !guidance) return null;
  const payout = recommendationPayout(state, player);
  const atCap = player.level >= playerLevelCap;
  const end = guidance.allStatsMax ? null : forecastTraining(state, player);
  const next = guidance.nextBonus;
  const nextForecast = !compact && next && next.levelGap > 0 ? forecastTraining(state, player, next.level) : null;
  if (compact) return <section className="gm-training-advice gm-paper gm-stack is-compact" aria-label={`${player.name}培养建议`}>
    <strong>{payout.repeatTemplate ? `重复模板 · 推荐合计 ${payout.credits} 券` : `培养奖金 +${guidance.currentBonus} 券${atCap ? ' · 训练已结束' : next ? ` · 下档 Lv.${next.level}＋${next.tierName}` : ' · 已达最高档'}`}</strong>
    <p className="gm-muted">{guidance.allStatsMax ? '六维已满，可核对奖金与合作后推荐。' : end?.finished ? '等级已满，可推荐签约。' : next && next.levelGap === 0 && next.tierGap > 0 ? `等级达标，仍需匹配${next.tierName}。` : guidance.suggestion}</p>
    {end && !end.finished && <p className="gm-muted">当前配置预计约 {offlineDuration(end.estimatedMs)} 到 Lv.{end.targetLevel}；可在节点提前推荐。</p>}
  </section>;
  return <section className={`gm-training-advice gm-paper gm-stack${compact ? ' is-compact' : ''}`} aria-label={`${player.name}培养建议`}>
    <div className="gm-section-heading"><h4>培养节点</h4><strong>{payout.repeatTemplate ? `重复模板 · 推荐合计 ${payout.credits} 券` : `当前培养奖金 +${guidance.currentBonus} 券`}</strong></div>
    <p>{guidance.suggestion}</p>
    <RecommendationCreditRule state={state}/>
    {payout.repeatTemplate ? <p className="gm-inline-status">当前模板已推荐过，提高培养或合作不补差额；声望与培养纪录照常。</p> : next ? <p className="gm-muted">下一档：Lv.{next.level}＋{next.tierName}及以上，额外奖金再增加 {next.additionalCredits} 券；{next.levelGap > 0 ? `还差 ${next.levelGap} 级` : '等级已达标'}{next.tierGap > 0 ? `，模板仍需达到${next.tierName}` : '，模板档次已达标'}。</p> : <p className="gm-inline-status">{atCap ? `训练等级已满，按当前实际模板结算培养奖金 ${guidance.currentBonus} 券，无法继续训练提升。` : '已达到最高培养奖金，继续升级不再增加培养奖金。'}</p>}
    {nextForecast && <p className="gm-muted">按当前配置连续{player.autoEnabled ? '自动' : '手动'}训练，约 {offlineDuration(nextForecast.estimatedMs)} 到 Lv.{next!.level}；模板仍需实际匹配，时间不是模板保证。</p>}
    {guidance.allStatsMax ? <p className="gm-recommend-warning">六维已满，继续训练不会增加属性。可核对奖金与合作后推荐签约，无需每名球员都练到99级。</p> : end?.finished ? <p className="gm-inline-status">已达到训练等级上限，可推荐签约。</p> : end && <p className="gm-muted">按当前配置连续训练，预计约 {offlineDuration(end.estimatedMs)} 到 Lv.{end.targetLevel}（属性可能提前达到上限，可提前推荐）。{player.autoEnabled && !end.withinOfflineLimit ? '当前离线上限不足以覆盖这段训练。' : ''}</p>}
    {!compact && <><h4>继续培养的剩余价值</h4><ul className="gm-remaining-value">{guidance.remainingValue.map(value => <li key={value}>{value}</li>)}</ul><p className="gm-muted">预计时间按当前体力、器材、课程与经验概率计算，不包含停留、换装或饮料，实际结果会波动；不会自动推荐球员。</p></>}
  </section>;
}

export function GymOfflineReport({report, onClose}: {report: OfflineTrainingReport; onClose: () => void}) {
  return <ComicDialog title="离线训练报告" className="gym-management-dialog" priority={1} onClose={onClose}>
    <div className="contract-panel"><div className="gym-panel gm-offline-report">
      <p>离开了 {offlineDuration(report.elapsedMs)}，本次最多结算 {offlineDuration(report.capMs)} 的自动训练。</p>
      <dl className="gm-metrics"><div><dt>计入训练时长</dt><dd>{offlineDuration(report.creditedMs)}</dd></div><div><dt>完成投篮</dt><dd>{format(report.totalShots)} 球</dd></div></dl>
      <p className="gm-inline-status">累计获得 {format(report.totalExperience)} 经验，等级、属性、课程与模板已自动保存。</p>
      {report.capped && <p className="gm-recommend-warning">已达到离线时长上限。超出部分仅恢复体力；在球馆升级「离线课表」或放入离线延时器材，可延长下次的训练时长。</p>}
      <div className="gm-offline-players">{report.players.map(player => <section className="gm-paper gm-stack" key={player.id}>
        <div className="gm-section-heading"><h3>{player.name}</h3><strong>{format(player.shots)} 球</strong></div>
        <p>Lv.{player.levelBefore} → Lv.{player.levelAfter} · 经验 +{format(player.xpGained)}</p>
        <p className="gm-muted">体力 {player.staminaBefore} → {player.staminaAfter} · 完成 {player.courses} 课</p>
        {player.templateAfter !== player.templateBefore && <p>模板：{templateById(player.templateBefore)?.name ?? '待发掘'} → {templateById(player.templateAfter)?.name ?? '待发掘'}</p>}
      </section>)}</div>
      <p className="gm-muted">只训练离开前开启自动的球员，体力、馆内器材、训练计划与课程恢复按原规则生效。离线期间不会自动推荐或招募，赞助券仍需推荐签约取得。</p>
      <button type="button" className="gm-button gm-primary" onClick={onClose}>继续培养</button>
    </div></div>
  </ComicDialog>;
}

function Wallet({credits}: {credits: number}) {
  return <div className="gm-wallet"><span><i className="gm-coupon" aria-hidden="true">券</i>赞助券</span><b>{format(credits)}</b></div>;
}

function PlayerPortrait({player}: {player: Pick<GymPlayer, 'templateId' | 'name'>}) {
  const profile = usePlayerProfile(player.templateId);
  return <StarPortrait src={profile?.avatar ?? templatePortrait(player.templateId)} fallbackSrc={templatePortrait(player.templateId)} name={profile?.name ?? player.name}/>;
}

function PlayerHeading({player, value}: {player: GymPlayer; value: string}) {
  const template = templateById(player.templateId);
  return <div className="gm-recommend-player">
    <div className="gm-player-image"><PlayerPortrait player={player}/></div>
    <div className="gm-player-identity">
      <p className="gm-eyebrow">{template ? tierConfig(template.tier).label : '待发掘'} · Lv.{player.level}</p>
      <h3>{template?.name ?? player.name}</h3>
      <p className="gm-muted">{player.name} · {player.height} cm · 综合 {format(overallRating(player.stats))}</p>
      <strong title={value}>球员身价 {money(value)}</strong>
    </div>
  </div>;
}

function PlayerStats({stats}: {stats: Stats}) {
  return <dl className="gm-stat-grid">{statKeys.map(key => <div key={key}><dt>{statLabels[key]}</dt><dd>{stats[key]}</dd></div>)}</dl>;
}

function projectEffect(state: GymState, id: ProjectId, level: number): string {
  const preview = {...state, projects: {...state.projects, [id]: level}};
  switch (id) {
    case 'endurance': return `体力上限 ${staminaMax(preview)} 点`;
    case 'recovery': return `每 ${recoverySeconds(preview)} 秒恢复 1 点体力`;
    case 'recruitment': return level > 0 ? `下一名新人的出生六维各 +${level}` : '下一名新人使用基础出生属性';
    case 'equipment': return `球馆内同时生效 ${equipmentCapacity(preview)} 件器材`;
    case 'automation': return `自动训练 ${format(automaticIntervalMs(preview) / 1000)} 秒/球，每球额外 +${level} 经验，在线离线均生效`;
    case 'offline': return state.gymLevel < 2 ? '球馆 Lv.2 免费开放离线训练，基础上限 30分钟' : `每次离线最多训练 ${offlineDuration(offlineLimitMs(preview))}`;
  }
}

export function GymClubPanel({state, onAction}: GymPanelProps) {
  const [comparisonProject, setComparisonProject] = useState<ProjectId | null>(null);
  const current = gymLevels.find(level => level.level === state.gymLevel)!;
  const upgrade = gymUpgrade(state);
  const forecast = useMemo(() => forecastTraining(state), [state]);
  const allStatsMax = useMemo(() => trainingGuidance(state)?.allStatsMax, [state]);
  const offlineUpgrade = useMemo(() => offlineUpgradeGuidance(state), [state]);
  return <div className="gym-panel gm-club">
    <div className="gm-club-heading"><b className="gm-club-level">{state.gymLevel}</b><div><p className="gm-eyebrow">球馆等级</p><h3>{current.name}</h3><p className="gm-muted">{state.gymLevel} 个训练位 · 手动训练当前选中球员</p></div></div>
    <div className="gm-level-track" aria-label={`当前球馆 ${state.gymLevel} 级，最高 8 级`}>{gymLevels.map(level => <span key={level.level} className={`${level.level <= state.gymLevel ? 'is-reached' : ''} ${level.level === state.gymLevel ? 'is-current' : ''}`} title={level.name}>{level.level}</span>)}</div>
    <dl className="gm-metrics"><div><dt>累计声望</dt><dd>{format(state.fame)}</dd></div><div><dt>已推荐球员</dt><dd>{format(alumniProgress(state).total)}</dd></div></dl>
    {upgrade.level ? <section className="gm-paper gm-stack" aria-label="下一球馆升级条件">
      <div className="gm-section-heading"><h4>下一馆级 · {upgrade.level.name}</h4><small>Lv.{upgrade.level.level}</small></div>
      {upgrade.requirements.map(requirement => <div className="gm-stack" key={requirement.label}>
        <div className={`gm-condition${requirement.met ? ' is-met' : ''}`}><span>{requirement.label}</span><b>{requirement.label.includes('推荐档次') ? requirement.met ? '已达成 ✓' : '尚未达成' : `${format(requirement.current)} / ${format(requirement.required)}${requirement.met ? ' ✓' : ''}`}</b></div>
        <progress className="gm-progress" value={Math.min(requirement.current, requirement.required)} max={requirement.required || 1} aria-label={requirement.label}/>
      </div>)}
      <p className="gm-muted">{upgrade.price === 0 ? '升至球馆 Lv.2 免费，累计声望保留。' : `本次扩建花费 ${format(upgrade.price)} 券，成功升级后扣除，累计声望保留。`}升级后新增 1 个训练位，并开放更多器材和项目等级。</p>
      {state.credits < upgrade.price
        ? <p className="gm-recommend-warning" role="status">扩建资金还差 {format(upgrade.price - state.credits)} 券。</p>
        : !upgrade.canUpgrade && <p className="gm-muted" role="status">{upgrade.reason || '尚未达到晋级条件'}</p>}
      <button type="button" className="gm-button gm-primary" disabled={!upgrade.canUpgrade} onClick={() => onAction({type: 'upgrade-gym', targetLevel: upgrade.level!.level})}>{upgrade.price === 0 ? '免费升级球馆' : `升级 · ${format(upgrade.price)} 券`}</button>
    </section> : <p className="gm-inline-status">已达到当前最高馆级。继续培养球员、收集模板与器材。</p>}
    <Wallet credits={state.credits}/>
    <RecommendationCreditRule state={state}/>
    <div className="gm-section-heading"><h3>球馆经营项目</h3><small>跨球员持续生效</small></div>
    <div className="gm-projects">{projects.map(project => {
      const offer = projectOffer(state, project.id);
      const canBuy = project.available && offer.price !== null && state.credits >= offer.price;
      const reason = !project.available ? '功能开放后可升级' : offer.reason ?? (offer.price !== null && state.credits < offer.price ? '赞助券不足' : '');
      return <article className={`gm-project${project.available ? '' : ' is-future'}`} key={project.id}>
        <div className="gm-project-heading"><h4>{project.name}</h4><span>Lv.{offer.level} / {project.maxLevel}</span></div>
        <p className="gm-muted">{project.description}</p>
        <div className="gm-project-effects"><span>当前 · {projectEffect(state, project.id, offer.level)}</span>{project.available && offer.level < project.maxLevel && <strong>下级 · {projectEffect(state, project.id, offer.level + 1)}</strong>}</div>
        {['endurance', 'recovery', 'automation'].includes(project.id) && offer.price !== null && <>
          <button type="button" className="gm-info-button" aria-expanded={comparisonProject === project.id} onClick={() => setComparisonProject(comparisonProject === project.id ? null : project.id)}>{comparisonProject === project.id ? '收起培养耗时对比' : '查看培养耗时对比'}</button>
          {comparisonProject === project.id && <ProjectTrainingPreview state={state} id={project.id}/>}
        </>}
        {project.id === 'offline' && state.player && <p className="gm-muted gm-project-forecast">{allStatsMax ? '当前球员六维已满，可核对培养奖金与合作后推荐。' : forecast?.finished ? '当前球员已到训练等级上限，可以推荐。' : forecast ? `当前球员按现有配置连续训练，预计约 ${offlineDuration(forecast.estimatedMs)} 到 Lv.${forecast.targetLevel}。可在模板、奖金节点提前推荐。` : ''}</p>}
        {project.id === 'offline' && offlineUpgrade && <section className="gm-stack gm-project-forecast" aria-label="离线升级收益预估">
          <p className="gm-muted">升级花费 {offlineUpgrade.price} 券，离线训练上限 {offlineDuration(offlineUpgrade.currentLimitMs)} → {offlineDuration(offlineUpgrade.nextLimitMs)}。</p>
          {offlineUpgrade.automaticPlayers === 0
            ? <p className="gm-muted">当前没有开启自动的球员，离线只恢复体力；开启自动后才会训练。</p>
            : offlineUpgrade.predictedFinishedWithinCurrent === offlineUpgrade.automaticPlayers
              ? <p className="gm-recommend-warning">当前开启自动的 {offlineUpgrade.automaticPlayers} 名球员预计都可在现有离线上限内达到 Lv.99，延长时长不一定增加本批训练收益。</p>
              : offlineUpgrade.predictedFinishedWithinCurrent > 0
                ? <p className="gm-recommend-warning">当前开启自动的 {offlineUpgrade.automaticPlayers} 名球员中，{offlineUpgrade.predictedFinishedWithinCurrent} 名预计可在现有上限内达到 Lv.99；延长时长主要帮助其余球员继续训练。</p>
                : <p className="gm-muted">当前开启自动的 {offlineUpgrade.automaticPlayers} 名球员预计尚不能在现有上限内全部练满。延长上限可增加离开较久时的训练机会。</p>}
          <p className="gm-muted">项目永久生效，也适用于后续新人。{offlineUpgrade.hasExtensionEquipment ? '可按需要换下离线加时器材，腾出槽位。' : ''}{offlineUpgrade.automaticPlayers > 0 ? '满级时间按当前配置预估，实际经验结果会波动；不会自动推荐或补招。' : ''}</p>
        </section>}
        <div className="gm-project-footer"><p className="gm-muted">{reason || `当前馆级最高可升至 Lv.${offer.maxLevel}`}</p><button type="button" className="gm-button gm-primary" disabled={!canBuy} onClick={() => onAction({type: 'upgrade-project', id: project.id})}>{!project.available ? '后续开放' : offer.price === null ? offer.level >= project.maxLevel ? '已升满' : '暂不可升级' : `升级 · ${offer.price} 券`}</button></div>
      </article>;
    })}</div>
  </div>;
}

export function GymRosterPanel({state, onAction, onAlumni, busy}: GymPanelProps & {onAlumni?: () => void}) {
  const players = state.player ? [state.player, ...state.bench] : [];
  const maximum = staminaMax(state);
  const freeSeats = state.gymLevel - players.length;
  return <div className="gm-roster">
    <p className="roster-intro">训练位 {players.length}/{state.gymLevel} · 馆级每升一级增加 1 个训练位。选择球员查看资料、手动训练或推荐；每人的自动开关独立生效。</p>
    <div className="contract-cards roster-cards">{players.map(player => {
      const selected = state.player?.id === player.id;
      const template = templateById(player.templateId);
      const capped = player.level >= playerLevelCap;
      const experience = requiredExperience(player.level);
      return <article key={player.id} className={`contract-card roster-card${selected ? ' is-training' : ''}`} data-player-id={player.id} data-tier={template?.tier ?? 'undiscovered'}>
        <div className="roster-card-body"><span data-tier={template?.tier ?? 'undiscovered'} className={`roster-portrait tier-portrait-frame${template ? ' album-portrait-surface' : ''}`}><StarPortrait src={templatePortrait(player.templateId)} name={template?.name ?? player.name}/></span><div className="roster-identity"><h3>{template?.name ?? player.name} {template && <small>{tierConfig(template.tier).label}</small>}</h3><p>训练 <b className="roster-level">{player.level}</b><i/> {player.height} cm</p></div><div className="roster-value"><small>球员身价</small><FittedAmount text={money(playerValue(state, player))}/></div><div className="roster-attributes"><div className="roster-rating"><small>综合评分</small><b>{overallRating(player.stats).toFixed(1)}</b></div>{statKeys.map(key => <div key={key}><small>{statLabels[key]}</small><b>{player.stats[key]}</b></div>)}</div></div>
        <div className="gm-roster-training"><span>体力 {player.stamina}/{maximum}</span><span>{capped ? '等级已满' : `经验 ${player.experience}/${experience}`}</span><span>{capped ? '训练已完成' : player.autoEnabled ? `自动 ${format(automaticIntervalMs(state) / 1000)}秒/球` : '手动 1秒/球'}</span></div>
        <TrainingAdvice state={state} player={player} compact/>
        <div className="contract-actions contract-roster-actions"><button type="button" className="primary" disabled={selected} onClick={() => onAction({type: 'select-player', id: player.id})}><GameIcon name="train"/><span>{selected ? '当前选中' : '选择训练'}</span></button><button type="button" className={`secondary${player.autoEnabled ? ' signing-button' : ''}`} role="switch" aria-label={`${player.name}自动训练`} aria-checked={player.autoEnabled} disabled={state.gymLevel < 2 || capped && !player.autoEnabled} onClick={() => onAction({type: 'set-auto', id: player.id, enabled: !player.autoEnabled})}><GameIcon name="rest"/><span>{state.gymLevel < 2 ? 'Lv.2 免费解锁自动' : player.autoEnabled ? '暂停自动' : capped ? '已满级' : '开启自动'}</span></button></div>
      </article>;
    })}</div>
    {freeSeats > 0 && <GymRecruitmentControls state={state} onAction={onAction} busy={busy}/>}
    <p className="roster-intro">{state.gymLevel < 2 ? '球馆 Lv.2 同时免费开放自动与离线训练；当前先手动培养第一位球员。' : `开启自动后该球员暂停手动投篮；离开后继续按相同体力、器材与课程规则训练，每次上限 ${offlineDuration(offlineLimitMs(state))}。体力不足时等待恢复；超时仅恢复体力，不自动推荐或招募。`}</p>
    {onAlumni && <button type="button" className="secondary" onClick={onAlumni}><GameIcon name="career"/>查看校友档案 · {alumniProgress(state).total} 人</button>}
  </div>;
}

export function GymTrainingPanel({state, onAction}: GymPanelProps) {
  const [pendingPlan, setPendingPlan] = useState<{id: TrainingPlanId; playerId: string} | null>(null);
  const [showRules, setShowRules] = useState(false);
  const player = state.player;
  if (!player) return <div className="gym-panel gm-empty"><GameIcon name="train"/><h3>先迎接一位新人</h3><p className="gm-muted">招募球员后，可以为他选择训练计划。</p></div>;
  const progress = trainingStatus(state);
  const topDimensions = (bias: Stats) => [...statKeys].sort((first, second) => bias[second] - bias[first]).slice(0, 2).map(key => statLabels[key]).join('、');
  const effects = equipmentEffects(state);
  const equipmentFocus = statKeys.filter(key => effects.focus[key] > 0).map(key => statLabels[key]);
  const talent = topDimensions(player.bias);
  const tendency = topDimensions(effectiveTrainingBias(state));
  const reward = recommendationPayout(state);
  const atCap = player.level >= playerLevelCap;
  const allStatsMax = statKeys.every(key => player.stats[key] >= 99);
  const selectPlan = (id: TrainingPlanId) => {
    if (id === progress.plan.id) return;
    if (progress.shots > 0) setPendingPlan({id, playerId: player.id});
    else onAction({type: 'set-training-plan', id, playerId: player.id});
  };
  return <div className="gym-panel gm-training-panel">
    <section className="gm-plan-summary" aria-label="当前训练课程">
      <div className="gm-section-heading"><div><p className="gm-eyebrow">当前计划</p><h3>{progress.plan.name}</h3></div><div className="gm-training-summary-tools"><span className="gm-course-count">已完成 {progress.completedCourses} 课</span><button type="button" className="gm-training-help" aria-label="查看训练说明" title="训练说明" onClick={() => setShowRules(true)}>?</button></div></div>
      <div className="gm-condition"><span>本课进度</span><b>{progress.shots} / 10 球</b></div>
      <progress className="gm-progress" value={progress.shots} max={10} aria-label="本课有效投篮进度"/>
      <p className="gm-training-course-note">{atCap ? '已满级，训练已结束' : <>完课恢复 <strong>+{progress.recovery}</strong> 体力</>}</p>
    </section>
    <section className="gm-paper gm-stack gm-training-player" aria-label="球员能力与成长倾向"><div className="gm-section-heading"><h4>球员能力</h4><small>{player.name}{allStatsMax ? ' · 六维已满' : ''}</small></div><PlayerStats stats={player.stats}/><div className="gm-training-tendency"><p><span>成长偏向</span><b>{tendency}</b></p>{talent !== tendency && <small>天赋：{talent}</small>}</div></section>
    <div className="gm-section-heading gm-training-plan-heading"><h3>训练方向</h3><small>免费切换</small></div>
    <div className="gm-plan-grid">{trainingPlans.map(plan => {
      const current = plan.id === progress.plan.id;
      return <article className={`gm-plan-card${current ? ' is-selected' : ''}`} key={plan.id}>
        <div className="gm-plan-title"><h4>{plan.name}</h4></div>
        <div className="gm-plan-targets">{plan.focusKeys.length ? plan.focusKeys.map(key => <span key={key}>{statLabels[key]}</span>) : <span>原生偏好</span>}</div>
        <button type="button" className={`gm-button${current ? '' : ' gm-primary'}`} aria-label={current ? `当前计划：${plan.name}` : `选择${plan.name}`} disabled={current} onClick={() => selectPlan(plan.id)}>{current ? '已选用' : '选用'}</button>
      </article>;
    })}</div>
    {progress.shots > 0 && <p className="gm-training-switch-note">切换将清空本课 {progress.shots}/10 球进度</p>}
    <div className="gm-training-payout" aria-label="当前推荐收益"><span>当前推荐</span><strong>+{reward.credits} 券</strong><small>{reward.repeatTemplate ? '重复模板' : player.templateId ? '模板首次' : '未匹配模板'}</small></div>
    {showRules && <ComicDialog title="训练说明" className="gm-training-rules-dialog" onClose={() => setShowRules(false)}><div className="gym-panel gm-training-rules">
      <section className="gm-stack"><h3>课程与恢复</h3><p>每10次投篮完成1课，完课时恢复部分体力，超出上限不计入<br/>（当前：基础4点+器材额外{effects.courseRecovery}点）。</p></section>
      <section className="gm-stack"><h3>推荐奖励</h3><p>推荐签约时获得赞助券。相同模板首次发券有额外奖励，之后每次{postgameRepeatTemplateCredits}券。</p><table className="gm-training-bonus-table"><thead><tr><th scope="col">首次培养条件</th><th scope="col">培养加奖</th></tr></thead><tbody>{trainingCreditMilestones.map(milestone => <tr key={milestone.level}><td>Lv.{milestone.level}＋{recommendationTierNames[milestone.tier]}及以上</td><td>+{milestone.credits} 券</td></tr>)}</tbody></table><p className="gm-muted">培养加奖只取最高达标档，基础券与已完成合作另计；未匹配模板无赞助券奖励，完整课程可提高培养声望。</p></section>
      <button type="button" className="gm-button gm-primary" onClick={() => setShowRules(false)}>返回训练</button>
    </div></ComicDialog>}
    {pendingPlan && <ComicDialog title="切换训练计划" onClose={() => setPendingPlan(null)}>
      <div className="gym-panel"><p>切换至「{trainingPlans.find(plan => plan.id === pendingPlan.id)?.name}」？本课 {progress.shots}/10 球将清零。</p><p className="gm-muted">已完成的 {progress.completedCourses} 课和球员成长保留。</p><div className="gm-actions"><button type="button" className="gm-button" onClick={() => setPendingPlan(null)}>继续当前课程</button><button type="button" className="gm-button gm-primary" onClick={() => {onAction({type: 'set-training-plan', id: pendingPlan.id, playerId: pendingPlan.playerId}); setPendingPlan(null);}}>确认切换</button></div></div>
    </ComicDialog>}
  </div>;
}

export {GymCooperationPanel} from './GymCooperationPanel';

function TrainingTimeComparison({state, comparison, title, label}: {state: GymState; comparison: EquipmentTrainingComparison; title: string; label: string}) {
  return <section className="gm-paper gm-stack" aria-label={label}>
    <h4>培养耗时对比 · {title}</h4>
    {comparison.status === 'no-player' ? <p className="gm-muted">招募球员后，可按实际等级、体力与训练配置比较培养耗时。</p>
      : comparison.status === 'ended' ? <p className="gm-muted">当前球员已满级，训练已结束；此项投入仍适用于其他或未来球员。</p>
      : comparison.status === 'choose-replacement' ? <p className="gm-muted">馆内已满，请在替换确认中选择替换对象，再比较实际培养耗时。</p>
      : <>{comparison.rows.map(row => <p key={row.level} data-forecast-level={row.level}>到 Lv.{row.level}：约 {offlineDuration(row.beforeMs)} → {offlineDuration(row.afterMs)}{row.beforeMs === row.afterMs ? '（预计耗时不变）' : ''}</p>)}
        <p className="gm-muted">按当前球员{state.player?.autoEnabled ? '自动' : '手动'}连续训练估算，沿用现有体力、课程与冷却，不包含停留、饮料或后续换装。实际结果会波动，不保证模板；专项属性成长不折算为等级提速，离线延时仅增加可结算时长。</p>
      </>}
  </section>;
}

function EquipmentTrainingPreview({state, item, replaceId}: {state: GymState; item: GymEquipment; replaceId?: string}) {
  const comparison = useMemo(() => equipmentTrainingComparison(state, item.id, replaceId), [state, item.id, replaceId]);
  return <TrainingTimeComparison state={state} comparison={comparison} title={state.equippedEquipment.includes(item.id) ? '移出后' : '放入后'} label="器材培养耗时对比"/>;
}

function ProjectTrainingPreview({state, id}: {state: GymState; id: ProjectId}) {
  const comparison = useMemo(() => projectTrainingComparison(state, id), [state, id]);
  return comparison && <TrainingTimeComparison state={state} comparison={comparison} title="项目升一级后" label="项目培养耗时对比"/>;
}

function EquipmentDetail({item, state, onClose}: {item: GymEquipment; state: GymState; onClose: () => void}) {
  const offer = equipmentOffer(state, item.id);
  const collected = !!state.collectedEquipment[item.id];
  return <ComicDialog title="器材档案" variant="album" className="gm-detail-dialog" onClose={onClose}>
    <div className="gym-panel">
      <div className="gm-detail-art"><span className="gm-detail-tag">{rarityLabels[item.rarity]} · {item.grade}阶</span><ProductImage id={item.artId} name={item.name}/><h3>{item.name}</h3><p>{equipmentFamilyLabels[item.family]} · 同类只启用一件</p></div>
      <section className="gm-paper gm-stack"><h4>当前效果</h4><p>{item.description}</p><p className="gm-muted">{equipmentPreview(state, item)}</p></section>
      <EquipmentTrainingPreview state={state} item={item}/>
      <section className="gm-paper gm-stack"><h4>取得条件</h4><p>球馆 Lv.{item.unlockLevel}{item.requiredTemplates > 0 && ` · 收藏 ${item.requiredTemplates} 种球星模板`}</p><p>售价 {item.price} 张赞助券</p>{offer.reason && !offer.owned && <p className="gm-muted">{offer.reason}</p>}</section>
      <p className={collected ? 'gm-inline-status' : 'gm-muted'}>{state.equippedEquipment.includes(item.id) ? '已收藏 · 馆内生效' : state.ownedEquipment.includes(item.id) ? '已收藏 · 在仓库中' : collected ? '已收藏 · 当前未持有' : offer.price !== null ? '已可购 · 获得后点亮图鉴' : '尚未获得'}</p>
      <button type="button" className="gm-button" onClick={onClose}>返回</button>
    </div>
  </ComicDialog>;
}

function equipmentPreview(state: GymState, item: GymEquipment, replaceId?: string): string {
  const equipped = state.equippedEquipment.includes(item.id);
  const familyItem = equippedFamilyEquipment(state, item.id);
  const familyReplacement = !equipped && familyItem && familyItem.id !== item.id ? familyItem : undefined;
  const targetId = replaceId ?? familyReplacement?.id;
  const courseLimit = `球馆 Lv.${state.gymLevel} 的器材额外恢复上限 +${courseRecoveryCap(state)}。`;
  if (!equipped && !targetId && state.equippedEquipment.length >= equipmentCapacity(state)) return '馆内器材已满，选择替换对象后比较实际效果；被替换器材进入仓库。' + (item.effects.courseRecovery ? courseLimit : '');
  const preview = previewEquipmentState(state, item.id, replaceId);
  if (!preview) return '请选择当前馆内的替换对象后比较实际效果。';
  const prefix = equipped ? '移出球馆后' : targetId ? '替换后' : '入馆后';
  const beforeEffects = equipmentEffects(state);
  const afterEffects = equipmentEffects(preview);
  const benefits: string[] = familyReplacement ? [`同类只启用一件，将替换「${familyReplacement.name}」，旧件进入仓库。`] : [];
  const changes: string[] = [];
  const capacityBefore = staminaMax(state);
  const capacityAfter = staminaMax(preview);
  if (capacityBefore !== capacityAfter) {
    const balance = state.player ? `当前体力 ${state.player.stamina} → ${Math.min(state.player.stamina, staminaMax(preview))}` : '新人按生效上限获得满体力';
    changes.push(`${prefix}体力上限 ${capacityBefore} → ${capacityAfter}，${balance}。`);
  }
  const recoveryBefore = recoverySeconds(state);
  const recoveryAfter = recoverySeconds(preview);
  if (recoveryBefore !== recoveryAfter) changes.push(`${prefix}恢复间隔 ${recoveryBefore} → ${recoveryAfter} 秒/点${recoveryAfter > recoveryBefore ? '（恢复变慢）' : '（恢复变快）'}。`);
  const courseBefore = trainingStatus(state).recovery;
  const courseAfter = trainingStatus(preview).recovery;
  if (courseBefore !== courseAfter) changes.push(`${prefix}每课恢复 ${courseBefore} → ${courseAfter} 点体力。${courseLimit}`);
  for (const key of statKeys) if (Math.abs(beforeEffects.focus[key] - afterEffects.focus[key]) > 1e-9) {
    changes.push(`${prefix}${statLabels[key]}成长倾向 ${format(beforeEffects.focus[key])} → ${format(afterEffects.focus[key])}，倾向越高，升级时越容易提升该属性；升级总属性点数不变。`);
  }
  if (beforeEffects.experience !== afterEffects.experience) changes.push(`${prefix}每球器材经验 +${beforeEffects.experience} → +${afterEffects.experience}，手动、在线自动与离线均生效。`);
  if (beforeEffects.automationExperience !== afterEffects.automationExperience) changes.push(`${prefix}自动每球额外经验 +${beforeEffects.automationExperience} → +${afterEffects.automationExperience}，在线自动与离线加成相同。`);
  const offlineBefore = offlineLimitMs(state);
  const offlineAfter = offlineLimitMs(preview);
  if (offlineBefore !== offlineAfter) changes.push(`${prefix}每次离线训练上限 ${offlineDuration(offlineBefore)} → ${offlineDuration(offlineAfter)}，项目与器材合计最多4小时。`);
  else if (beforeEffects.offlineMinutes !== afterEffects.offlineMinutes && state.gymLevel < 2) changes.push(`离线延时器材在球馆 Lv.2 后生效，当前尚未开放离线训练。`);
  if (beforeEffects.valuePercent !== afterEffects.valuePercent) {
    changes.push(`${prefix}展示身价加成 +${beforeEffects.valuePercent}% → +${afterEffects.valuePercent}%${state.player ? `，身价 ${money(playerValue(state))} → ${money(playerValue(preview))}` : ''}。`);
  }
  const brandBefore = Math.min(50, beforeEffects.valuePercent);
  const brandAfter = Math.min(50, afterEffects.valuePercent);
  if (brandBefore !== brandAfter) changes.push(`${prefix}之后训练的品牌加成 +${brandBefore}% → +${brandAfter}%；推荐按实际培养期间的平均品牌加成结算，换装不会重算已完成的训练。`);
  if (beforeEffects.cooperationBonus !== afterEffects.cooperationBonus) changes.push(`${prefix}之后课程可累计的合作加券档位 ${beforeEffects.cooperationBonus} → ${afterEffects.cooperationBonus}；须完成合作，且接取后实际启用对应档位完成至少2课。已取得的资格不因换装丢失，推荐时领取。`);
  benefits.push(changes.length ? changes.join(' ') : `${prefix}当前配置实际加成没有变化（0增益）；未收藏的器材仅增加收藏，已收藏器材仅调整馆内与仓库位置。`);
  return benefits.join(' ');
}

function EquipmentCard({item, state, onAction, onDetails, busy = false, inventory = false}: GymPanelProps & {item: GymEquipment; onDetails: () => void; inventory?: boolean}) {
  const [pending, setPending] = useState<'replace' | 'sell' | 'remove' | null>(null);
  const [replaceId, setReplaceId] = useState('');
  const submitted = useRef(false);
  const offer = equipmentOffer(state, item.id);
  const equipped = state.equippedEquipment.includes(item.id);
  const owned = state.ownedEquipment.includes(item.id);
  const full = state.equippedEquipment.length >= equipmentCapacity(state);
  const activeFamilyItem = equippedFamilyEquipment(state, item.id);
  const familyItem = activeFamilyItem?.id !== item.id ? activeFamilyItem : undefined;
  const mustReplace = full || !!familyItem;
  const replacementIds = familyItem ? [familyItem.id] : state.equippedEquipment;
  const reason = owned ? equipped ? '已放入球馆，持续为全体球员生效' : familyItem ? '同类只启用一件，替换后旧件进入仓库' : '仓库器材，可重新入馆或半价出售' : offer.reason ?? (offer.price !== null && state.credits < offer.price ? '赞助券不足' : familyItem ? '同类只启用一件，购买时替换旧件入仓库' : full ? '购买时选择替换，旧器材进入仓库' : '购买即放入球馆生效');
  const open = (mode: 'replace' | 'sell' | 'remove') => {if (busy) return; submitted.current = false; setReplaceId(mode === 'replace' ? familyItem?.id ?? '' : ''); setPending(mode);};
  const submit = (action: GymAction) => {
    if (busy || submitted.current) return;
    submitted.current = true;
    onAction(action);
    setPending(null);
  };
  const install = () => {
    if (busy) return;
    if (mustReplace) open('replace');
    else onAction({type: owned ? 'equip' : 'buy-equipment', id: item.id});
  };
  const refund = owned && !equipped ? equipmentSaleValue(state, item.id) : 0;
  return <article className="gm-product" data-rarity={item.rarity} data-family={item.family} data-grade={item.grade} data-equipment-id={item.id}>
    <div className="gm-product-image"><ProductImage id={item.artId} name={item.name}/></div>
    <div className="gm-product-copy"><div className="gm-product-meta"><span>{rarityLabels[item.rarity]}</span><span>{equipmentFamilyLabels[item.family]} · {item.grade}阶</span><span>球馆 Lv.{item.unlockLevel}</span>{equipped && <span className="gm-equipped">馆内生效</span>}</div><h4>{item.name}</h4><p className="gm-muted">{item.description}</p>{!equipped && <p className="gm-muted">{equipmentPreview(state, item)}</p>}<button type="button" className="gm-info-button" onClick={onDetails}>器材详情 ›</button></div>
    <div className={`gm-product-actions${owned && !equipped && inventory ? ' gm-warehouse-actions' : ''}`}><p className="gm-muted">{reason}</p>
      {owned ? equipped ? inventory ? <button type="button" className="gm-button" disabled={busy} onClick={() => open('remove')}>移入仓库</button> : <button type="button" className="gm-button" disabled>馆内生效</button> : <><button type="button" className="gm-button gm-primary" disabled={busy} onClick={install}>{mustReplace ? '替换馆内器材' : '放入球馆'}</button>{inventory && <button type="button" className="gm-button" disabled={busy} onClick={() => open('sell')}>半价出售 · 返 {refund} 券</button>}</> : <button type="button" className="gm-button gm-primary" disabled={busy || offer.price === null || state.credits < offer.price} onClick={install}>购买 · {item.price} 券</button>}
    </div>
    {pending === 'replace' && <ComicDialog title="替换馆内器材" onClose={() => setPending(null)}><div className="gym-panel gm-stack">
      <h3>{owned ? '重新放入' : '购买并放入'}「{item.name}」</h3><p>{familyItem ? `同类只启用一件，将替换「${familyItem.name}」。` : '馆内器材已满，请选择一件替换。'}旧器材进入仓库，可重新换上或半价出售；取消不扣券、不移动器材。</p>
      <label className="gm-replace-label">替换对象<select aria-label="选择替换的器材" value={replaceId} onChange={event => setReplaceId(event.target.value)}>{!familyItem && <option value="">请选择馆内器材</option>}{replacementIds.map(id => <option key={id} value={id}>{equipmentById.get(id)?.name ?? id}</option>)}</select></label>
      {replaceId && <p className="gm-paper gm-use-note">{equipmentPreview(state, item, replaceId)}</p>}
      {replaceId && <EquipmentTrainingPreview state={state} item={item} replaceId={replaceId}/>}
      <div className="gm-actions"><button type="button" className="gm-button" onClick={() => setPending(null)}>取消替换</button><button type="button" className="gm-button gm-primary" disabled={busy || !replaceId} onClick={() => submit({type: owned ? 'equip' : 'buy-equipment', id: item.id, replaceId})}>{owned ? '确认替换' : `确认购买并替换 · ${item.price} 券`}</button></div>
    </div></ComicDialog>}
    {pending === 'remove' && <ComicDialog title="移入器材仓库" onClose={() => setPending(null)}><div className="gym-panel gm-stack">
      <h3>移出「{item.name}」</h3><p>移出后停止为全体球员提供效果，不扣赞助券；器材与收藏保留，可随时重新放入或半价出售。</p>
      <p className="gm-paper gm-use-note">{equipmentPreview(state, item)}</p>
      {item.effects.stamina > 0 && <p className="gm-recommend-warning">体力超过新上限的部分会截断；再次放入不会补回体力，其他在训球员也按新上限处理。</p>}
      <EquipmentTrainingPreview state={state} item={item}/>
      <div className="gm-actions"><button type="button" className="gm-button" onClick={() => setPending(null)}>保留馆内器材</button><button type="button" className="gm-button gm-primary" disabled={busy || !equipped} onClick={() => submit({type: 'unequip', id: item.id})}>确认移入仓库</button></div>
    </div></ComicDialog>}
    {pending === 'sell' && <ComicDialog title="出售仓库器材" onClose={() => setPending(null)}><div className="gym-panel gm-stack">
      <h3>出售「{item.name}」返还 {refund} 券</h3><p>按记录购入价的一半返还，向下取整。出售后不再持有，已点亮的器材图鉴保留；需要时可按商店现价重新购买。</p><p className="gm-muted">旧存档缺少购价记录时，按历史价格基准估算，不按涨价后的现价返还。</p>
      <div className="gm-actions"><button type="button" className="gm-button" onClick={() => setPending(null)}>保留器材</button><button type="button" className="gm-button gm-primary" disabled={busy} onClick={() => submit({type: 'sell-equipment', id: item.id})}>确认出售 · 返 {refund} 券</button></div>
    </div></ComicDialog>}
  </article>;
}

function DrinkCard({state, onAction, purchasing}: GymPanelProps & {purchasing: boolean}) {
  const capacity = staminaMax(state);
  const ended = !!state.player && state.player.level >= playerLevelCap;
  const restored = state.player && !ended ? Math.max(0, Math.min(drinkRecovery, capacity - state.player.stamina)) : 0;
  return <article className="gm-product">
    <div className="gm-product-image"><ProductImage id="item_005" name="运动饮料"/></div>
    <div className="gm-product-copy"><div className="gm-product-meta"><span>消耗品</span><span>持有 {state.inventory.drink} 瓶</span></div><h4>运动饮料</h4><p className="gm-muted">恢复当前球员 {drinkRecovery} 点体力，超过上限的部分不计入。</p>{state.player && <p className="gm-muted">当前体力 {state.player.stamina}/{capacity} · 本次恢复 {restored} 点</p>}</div>
    <div className="gm-product-actions"><p className="gm-muted">{!state.player ? '招募球员后可使用' : ended ? '球员已满级，饮料留给其他或未来球员使用' : restored === 0 ? '体力已满' : state.inventory.drink === 0 ? '先在商店购买饮料' : ''}</p>
      <button type="button" className="gm-button" disabled={!state.player || ended || restored <= 0 || state.inventory.drink <= 0} onClick={() => {if (state.player && !ended) onAction({type: 'use-drink', id: state.player.id});}}>使用饮料</button>
      {purchasing && <button type="button" className="gm-button gm-primary" disabled={state.credits < drinkPrice} onClick={() => onAction({type: 'buy-drink'})}>购买 · {drinkPrice} 券</button>}
    </div>
  </article>;
}

export function GymShopPanel({state, onAction, busy}: GymPanelProps) {
  const [tab, setTab] = useState(0);
  const [effect, setEffect] = useState('all');
  const [family, setFamily] = useState('all');
  const [rarity, setRarity] = useState('all');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<GymEquipment | null>(null);
  const filtered = equipmentCatalog.filter(item => {
    if (effect !== 'all' && !item.effects[effect as keyof typeof effectLabels]) return false;
    if (family !== 'all' && item.family !== family) return false;
    if (rarity !== 'all' && item.rarity !== rarity) return false;
    const offer = equipmentOffer(state, item.id);
    if (status === 'owned') return state.ownedEquipment.includes(item.id);
    if (status === 'available') return !offer.owned && offer.price !== null;
    if (status === 'locked') return !offer.owned && offer.price === null;
    return true;
  });
  return <div className="gym-panel">
    <Wallet credits={state.credits}/>
    <SlidingTabs labels={['器材', '消耗品']} label="商店分类" index={tab} onChange={setTab}>
      {tab === 0 ? <div className="gm-stack">
        <div className="gm-filters"><label>效果<select value={effect} onChange={event => setEffect(event.target.value)}><option value="all">全部效果</option>{Object.entries(effectLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>稀有度<select value={rarity} onChange={event => setRarity(event.target.value)}><option value="all">全部档次</option>{Object.entries(rarityLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>取得状态<select value={status} onChange={event => setStatus(event.target.value)}><option value="all">全部器材</option><option value="available">已可购</option><option value="locked">待解锁</option><option value="owned">已获得</option></select></label><label>类别<select value={family} onChange={event => setFamily(event.target.value)}><option value="all">全部类别</option>{Object.entries(equipmentFamilyLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label></div>
        <p className="gm-muted">共 {filtered.length} 件 · 同类只启用一件；购买即入馆，有同类或馆内已满时确认替换，旧件转入仓库。</p>
        <div className="gm-products">{filtered.map(item => <EquipmentCard key={item.id} {...{item, state, onAction, busy}} onDetails={() => setSelected(item)}/>)}</div>
        {filtered.length === 0 && <p className="gm-use-note">暂无符合筛选的器材，可调整筛选查看全部货架。</p>}
      </div> : <DrinkCard state={state} onAction={onAction} purchasing/>}
    </SlidingTabs>
    {selected && <EquipmentDetail item={selected} state={state} onClose={() => setSelected(null)}/>}
  </div>;
}

export function GymInventoryPanel({state, onAction, busy}: GymPanelProps) {
  const [tab, setTab] = useState(0);
  const [selected, setSelected] = useState<GymEquipment | null>(null);
  const capacity = equipmentCapacity(state);
  const owned = equipmentCatalog.filter(item => state.ownedEquipment.includes(item.id));
  return <div className="gym-panel">
    <div className="gm-section-heading"><h3>馆内生效器材</h3><small>{state.equippedEquipment.length}/{capacity} 已放入</small></div>
    <div className="gm-slot-row" aria-label="馆内生效的器材">{Array.from({length: capacity}, (_, index) => {
      const item = equipmentById.get(state.equippedEquipment[index]);
      return <div className="gm-slot" key={index}>{item ? <ProductImage id={item.artId} name={item.name}/> : <span aria-label="空槽">＋</span>}</div>;
    })}</div>
    <p className="gm-muted">馆内器材持续为全体球员生效，同类只启用一件。可主动移入仓库或用其他器材替换，再重新放入或按记录购价半价出售；提高体力上限不会立刻补满体力。</p>
    {Object.keys(state.legacyEquipmentCollection ?? {}).length > 0 && <p className="gm-muted">历史器材收藏 {Object.keys(state.legacyEquipmentCollection ?? {}).length} 件已留档，不计入当前 {equipmentCatalog.length} 件器材的收藏进度。</p>}
    <SlidingTabs labels={['器材与仓库', '消耗品']} label="背包分类" index={tab} onChange={setTab}>
      {tab === 0 ? <div className="gm-stack"><h4>馆内器材 · 持续生效</h4><div className="gm-products">{owned.filter(item => state.equippedEquipment.includes(item.id)).map(item => <EquipmentCard key={item.id} {...{item, state, onAction, busy}} inventory onDetails={() => setSelected(item)}/>)}</div><h4>器材仓库 · {owned.length - state.equippedEquipment.length} 件</h4><div className="gm-products">{owned.filter(item => !state.equippedEquipment.includes(item.id)).map(item => <EquipmentCard key={item.id} {...{item, state, onAction, busy}} inventory onDetails={() => setSelected(item)}/>)}</div>{owned.length === 0 && <div className="gm-empty"><GameIcon name="bag"/><h4>还没有器材</h4><p className="gm-muted">用推荐球员获得的赞助券，到商店购买第一件器材。</p></div>}</div> : <DrinkCard state={state} onAction={onAction} purchasing={false}/>}
    </SlidingTabs>
    {selected && <EquipmentDetail item={selected} state={state} onClose={() => setSelected(null)}/>}
  </div>;
}

export function GymRecommendPanel({state, onAction, onClose}: GymPanelProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const detailsId = useId();
  const player = state.player;
  if (!player) return <div className="gym-panel gm-empty"><GameIcon name="people"/><h3>目前没有在训球员</h3><p className="gm-muted">返回训练馆，免费招募下一名球员。</p>{onClose && <button type="button" className="gm-button" onClick={onClose}>返回训练馆</button>}</div>;
  const reward = recommendationPayout(state);
  const cooperation = cooperationStatus(state);
  return <div className="gym-panel gm-recommend-panel">
    <div className="gm-recommend-profile"><PlayerHeading player={player} value={playerValue(state, player)}/><button type="button" className="gm-training-help gm-recommend-help" aria-label="查看推荐说明" title="推荐说明" onClick={() => setShowRules(true)}>?</button></div>
    <div className="gm-recommend-rewards"><div><span>赞助券合计</span><b>+{reward.credits}</b></div><div><span>球馆声望合计</span><b>+{format(reward.fame)}</b></div></div>
    <div className="gm-recommend-achievements" aria-label="本次培养成果"><span>训练 <b>{format(player.shots)}</b> 球</span><span>完成 <b>{format(player.training.completedCourses)}</b> 课</span><span>净成长 <b>+{format(reward.growth)}</b></span></div>
    {reward.tier === 0 && reward.rawCredits === 0 && <p className="gm-recommend-warning">未匹配模板，本次0券；可继续培养或免费换人。</p>}
    {reward.repeatTemplate && <p className="gm-recommend-warning" role="status">重复模板，本次合计{reward.credits}券，声望照常。</p>}
    {reward.isFirstPostgameRecommendation && <p className="gm-recommend-warning" role="status">首次推荐，之后同模板每次合计{postgameRepeatTemplateCredits}券，培养或合作提高后不补差额。</p>}
    {cooperation.offer && (cooperation.complete ? <p className="gm-recommend-cooperation is-complete">合作奖励 · 已达标</p> : <p className="gm-recommend-cooperation">「{cooperation.offer.name}」未达标，推荐后结束。</p>)}
    <button type="button" className="gm-info-button gm-recommend-details-toggle" aria-expanded={detailsOpen} aria-controls={detailsId} onClick={() => setDetailsOpen(!detailsOpen)}>{detailsOpen ? '收起结算明细' : '查看结算明细'}<span aria-hidden="true">{detailsOpen ? '−' : '+'}</span></button>
    {detailsOpen && <div className="gm-stack gm-recommend-details" id={detailsId} aria-label="推荐结算明细">
      <section className="gm-paper gm-stack"><h4>赞助券明细 · 理论与实际</h4><dl className="gm-reward-breakdown"><div><dt>模板基础 · {reward.tierName}</dt><dd>+{reward.baseCredits} 券</dd></div><div><dt>培养加奖 · Lv.{player.level} · {reward.tierName}</dt><dd>+{reward.trainingCredits} 券</dd></div><div><dt>合作奖励{cooperation.offer ? ` · ${cooperation.complete ? '已达标' : '未达标'}` : ' · 未接取'}</dt><dd>+{reward.cooperationCredits} 券</dd></div>{reward.withheldCredits > 0 && <div><dt>重复模板结算调整</dt><dd>−{reward.withheldCredits} 券</dd></div>}<div className="gm-reward-actual"><dt>实际入账</dt><dd>+{reward.credits} 券</dd></div></dl></section>
      <section className="gm-paper gm-stack"><h4>声望明细</h4><dl className="gm-reward-breakdown"><div><dt>属性培养声望</dt><dd>+{format(reward.rawFame)}</dd></div><div><dt>课程与培养期间品牌加成</dt><dd>+{format(reward.baseFame - reward.rawFame)}</dd></div><div><dt>合作额外声望</dt><dd>+{format(reward.cooperationFame)}</dd></div></dl></section>
      <section className="gm-stack"><h4>球员六维</h4><PlayerStats stats={player.stats}/></section>
    </div>}
    <div className="gm-sheet-footer"><p className="gm-muted">确认后离馆入档，收藏保留；空位可免费补招。</p><div className="gm-actions">{onClose && <button type="button" className="gm-button" onClick={onClose}>继续培养</button>}<button type="button" className="gm-button gm-primary" onClick={() => onAction({type: 'recommend', id: player.id})}>确认推荐 · +{reward.credits} 券</button></div></div>
    {showRules && <ComicDialog title="推荐说明" onClose={() => setShowRules(false)}><div className="gym-panel gm-training-rules">
      <section className="gm-stack"><h3>发券规则</h3><RecommendationCreditRule state={state}/></section>
      <section className="gm-stack"><h3>首次培养加奖</h3><table className="gm-training-bonus-table"><thead><tr><th scope="col">等级与模板</th><th scope="col">培养加奖</th></tr></thead><tbody>{trainingCreditMilestones.map(milestone => <tr key={milestone.level}><td>Lv.{milestone.level}＋{recommendationTierNames[milestone.tier]}及以上</td><td>+{milestone.credits} 券</td></tr>)}</tbody></table></section>
      <section className="gm-stack"><h3>声望与离馆</h3><p>声望来自属性净成长、完整课程、培养期间的平均品牌加成及已完成合作。</p></section>
      <button type="button" className="gm-button gm-primary" onClick={() => setShowRules(false)}>返回结算</button>
    </div></ComicDialog>}
  </div>;
}

function AlumnusDetail({player, onClose}: {player: GymAlumnus; onClose: () => void}) {
  return <ComicDialog title="校友档案" variant="album" className="gm-detail-dialog" onClose={onClose}>
    <div className="gym-panel"><PlayerHeading player={player} value={player.finalValue}/><PlayerStats stats={player.stats}/><div className="gm-paper gm-stack"><h4>推荐记录</h4><p>{new Date(player.recommendedAt).toLocaleString('zh-CN')}</p><p>赞助券 +{player.rewardCredits} · 球馆声望 +{format(player.rewardFame)}</p><p className="gm-muted">累计出手 {format(player.shots)} 次 · 离馆体力 {player.stamina}</p></div><button type="button" className="gm-button" onClick={onClose}>返回校友簿</button></div>
  </ComicDialog>;
}

export function GymAlumniPanel({state, loadAlumni}: GymPanelProps) {
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<GymAlumnus | null>(null);
  const [loaded, setLoaded] = useState<GymAlumnus[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const progress = alumniProgress(state);
  const offset = page * 20;
  useEffect(() => {setPage(0); setSelected(null);}, [state.createdAt, state.seed]);
  useEffect(() => {
    if (!loadAlumni) return;
    let cancelled = false;
    setLoading(true); setLoadError(''); setLoaded([]);
    loadAlumni(offset, 20).then(result => {if (!cancelled) setLoaded(result.players);})
      .catch(() => {if (!cancelled) setLoadError('校友档案暂时无法读取，原记录已保留，请重试。');})
      .finally(() => {if (!cancelled) setLoading(false);});
    return () => {cancelled = true;};
  }, [loadAlumni, offset, progress.total, state.createdAt, state.seed, retry]);
  const all = loadAlumni ? loaded : [...state.alumni].reverse().slice(offset, offset + 20);
  return <div className="gym-panel">
    <dl className="gm-metrics"><div><dt>累计推荐</dt><dd>{format(progress.total)} 人</dd></div><div><dt>传奇校友</dt><dd>{format(progress.legendCount)} 人</dd></div></dl>
    {progress.total === 0 ? <div className="gm-empty"><GameIcon name="career"/><h3>第一份校友档案正在等你</h3><p className="gm-muted">推荐球员后，最终模板、六维、身价和推荐成果会留在这里。</p></div> : <div className="gm-alumni-list">{all.map(player => <button type="button" key={player.id} className="gm-alumnus" onClick={() => setSelected(player)}><span className="gm-alumnus-image"><StarPortrait src={templatePortrait(player.templateId)} name={player.name}/></span><div><strong>{templateById(player.templateId)?.name ?? player.name}</strong><span>{player.name} · Lv.{player.level} · {player.height} cm</span><span>推荐 +{player.rewardCredits} 券 · +{format(player.rewardFame)} 声望</span></div><b>{format(overallRating(player.stats))}</b></button>)}</div>}
    {loading && <p className="gm-muted" role="status">正在读取校友档案…</p>}
    {loadError && <div className="gm-stack"><p className="gm-recommend-warning" role="alert">{loadError}</p><button type="button" className="gm-button" onClick={() => setRetry(value => value + 1)}>重新读取档案</button></div>}
    {progress.total > 20 && !loadError && <nav className="gm-actions" aria-label="校友档案分页"><button type="button" className="gm-button" disabled={loading || page === 0} onClick={() => setPage(value => value - 1)}>上一页</button><span>第 {page + 1} / {Math.ceil(progress.total / 20)} 页</span><button type="button" className="gm-button" disabled={loading || offset + 20 >= progress.total} onClick={() => setPage(value => value + 1)}>下一页</button></nav>}
    {selected && <AlumnusDetail player={selected} onClose={() => setSelected(null)}/>}
  </div>;
}

function TemplateDetail({template, state, onClose}: {template: TemplateRule; state: GymState; onClose: () => void}) {
  const record = state.collection[template.id];
  const profile = usePlayerProfile(template.id);
  const branches = template.branches ?? [];
  return <ComicDialog title="球星档案" variant="album" className="gm-detail-dialog" onClose={onClose}>
    <div className="gym-panel">
      <div className="gm-detail-art"><span className="gm-detail-tag">{tierConfig(template.tier).label}</span><div className="gm-player-image"><StarPortrait src={profile?.avatar ?? templatePortrait(template.id)} fallbackSrc={templatePortrait(template.id)} name={profile?.name ?? template.name}/></div><h3>{profile?.name ?? template.name}</h3><p>{template.style}</p></div>
      <div className="gm-paper gm-stack"><h4>模板要求</h4><p>Lv.{template.minLevel} · {template.height[0]}–{template.height[1]} cm · {positionLabels[template.position]}</p></div>
      <div className="gm-template-routes">
        <div className="gm-template-route"><strong>常规路线 · 同时满足</strong><p>{statKeys.filter(key => template.coreMinimums[key] !== undefined).map(key => `${statLabels[key]} ≥ ${template.coreMinimums[key]}`).join(' · ')}</p><p>模板适配度 ≥ {Math.round(template.enter * 100)}%</p></div>
        {branches.map((branch, index) => <div className="gm-template-route" key={index}><strong>或 · 专项路线 {index + 1}</strong><p>{statKeys.filter(key => branch.coreMinimums[key] !== undefined).map(key => `${statLabels[key]} ≥ ${branch.coreMinimums[key]}`).join(' · ')}</p><p>专项适配度 ≥ {Math.round(branch.enter * 100)}%</p></div>)}
        {template.ratingFloor !== undefined && <p className="gm-muted">同时要求综合评分 ≥ {template.ratingFloor}，每项属性 ≥ {template.statFloor}。</p>}
      </div>
      <section className="gm-stack"><h4>标准六维</h4><PlayerStats stats={template.stats}/></section>
      {record && <section className="gm-paper gm-stack"><h4>我的收录记录</h4><p>{new Date(record.firstAt).toLocaleDateString('zh-CN')} · 最高综合 {format(record.highestRating)}</p><p>历史最高身价 {money(record.highestValue)}</p></section>}
      <button type="button" className="gm-button" onClick={onClose}>返回图鉴</button>
    </div>
  </ComicDialog>;
}

export function GymCollectionPanel({state}: GymPanelProps) {
  const [tab, setTab] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const stars = albumTemplates.filter(template => !!state.collection[template.id]);
  const equipment = equipmentCatalog.filter(item => !!state.collectedEquipment[item.id]);
  const count = tab === 0 ? stars.length : equipment.length;
  const total = tab === 0 ? albumTemplates.length : equipmentCatalog.length;
  const selectedTemplate = tab === 0 ? albumTemplates.find(template => template.id === selected && !!state.collection[template.id]) : undefined;
  const selectedEquipment = tab === 1 && selected ? equipmentById.get(selected) : undefined;
  return <div className="gym-panel">
    <SlidingTabs labels={['球星图鉴', '器材图鉴']} label="图鉴分类" index={tab} onChange={index => {setTab(index); setSelected(null);}}>
      <div className="gm-stack">
        <div className="gm-album-progress"><div><span>收藏进度</span><b>{count} / {total}</b></div><progress className="gm-progress" value={count} max={total} aria-label={tab === 0 ? '球星收藏进度' : '器材收藏进度'}/></div>
        {tab === 1 && Object.keys(state.legacyEquipmentCollection ?? {}).length > 0 && <p className="gm-muted">历史器材收藏 {Object.keys(state.legacyEquipmentCollection ?? {}).length} 件已留档，不计入当前 {equipmentCatalog.length} 件器材的收藏进度。</p>}
        <div className="gm-album-grid">{tab === 0 ? albumTemplates.map(template => {
          const collected = !!state.collection[template.id];
          return <button type="button" key={template.id} className={`gm-album-card${collected ? '' : ' is-unknown'}`} data-tier={template.tier} disabled={!collected} onClick={() => setSelected(template.id)} aria-label={collected ? `查看${template.name}档案` : '未知球星'}><span className="gm-album-image">{collected ? <StarPortrait src={templatePortrait(template.id)} name={template.name}/> : <span className="gm-question" aria-hidden="true">?</span>}</span><strong>{collected ? template.name : '未知球星'}</strong><small>{tierConfig(template.tier).label}</small></button>;
        }) : equipmentCatalog.map(item => {
          const collected = !!state.collectedEquipment[item.id];
          const offer = equipmentOffer(state, item.id);
          const label = state.equippedEquipment.includes(item.id) ? '馆内生效' : collected ? '已收藏' : offer.price !== null ? '已可购' : '待解锁';
          return <button type="button" key={item.id} className={`gm-album-card${collected ? '' : ' is-unknown'}`} data-rarity={item.rarity} onClick={() => setSelected(item.id)} aria-label={`查看${item.name}器材档案`}><span className="gm-album-image">{collected ? <ProductImage id={item.artId} name={item.name}/> : <EquipmentMystery/>}</span><strong>{item.name}</strong><small>{label}</small></button>;
        })}</div>
      </div>
    </SlidingTabs>
    {selectedTemplate && <TemplateDetail template={selectedTemplate} state={state} onClose={() => setSelected(null)}/>}
    {selectedEquipment && <EquipmentDetail item={selectedEquipment} state={state} onClose={() => setSelected(null)}/>}
  </div>;
}
