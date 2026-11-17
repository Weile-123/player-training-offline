import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { statLabels } from '../game/config';
import { templateRules, type TemplateRule } from '../game/contract/templates';
import { equipmentCatalog, equipmentFamilyLabels, gymLevels, projects, postgameRepeatTemplateCredits, type GymEquipment, type ProjectId } from '../game/gym/catalog';
import { automaticIntervalMs, cooperationStatus, courseRecoveryCap, effectiveTrainingBias, equipmentCapacity, equipmentEffects, equipmentOffer, equipmentSaleValue, equippedFamilyEquipment, gymUpgrade, playerLevelCap, playerValue, projectOffer, recoverySeconds, requiredExperience, staminaMax, trainingCreditMilestones, trainingPlans, trainingStatus, type GymAction, type GymAlumnus, type GymPlayer, type GymState, type TrainingPlanId } from '../game/gym/engine';
import { offlineLimitMs } from '../game/gym/offline';
import { trainingGuidance } from '../game/gym/guidance';
import { forecastTraining } from '../game/gym/forecast';
import { equipmentTrainingComparison, previewEquipmentState, projectTrainingComparison, type EquipmentTrainingComparison } from '../game/gym/equipmentForecast';
import { offlineUpgradeGuidance } from '../game/gym/offlineUpgradeGuidance';
import { overallRating } from '../game/matching';
import { positionLabels, templateById } from '../game/templates';
import { statKeys, type Stats } from '../game/types';
import { usePlayerProfile } from '../platform/usePlayerProfile';
import { money } from '../presentation/money';
import { equipmentSummary } from '../presentation/equipmentSummary';
import { gymPlayerName } from '../presentation/gymPlayerName';
import { offlineDuration } from '../presentation/offlineDuration';
import { ComicDialog } from './ComicDialog';
import { EquipmentMystery } from './EquipmentMystery';
import { FittedAmount } from './FittedAmount';
import { GameIcon } from './GameIcon';
import { StarPortrait, templatePortrait } from './PlayerTemplatePanel';
import { ProductImage } from './ProductImage';
import { SlidingTabs } from './SlidingTabs';
import { GymRecruitmentControls } from './GymRecruitmentControls';
import { GymCooperationPanel } from './GymCooperationPanel';
import { groupGymAlumni, loadAllGymAlumni, type GymAlumniGroup } from '../presentation/gymAlumniGroups';
import { EquipmentReplacementChanges } from './EquipmentReplacementChanges';
import { TierBadge } from './TierBadge';
import { AutoTrainingBorder } from './AutoTrainingBorder';
import { AlbumIcon, MatchingRequirements } from './CollectionAlbum';
import { alumniProgress, recommendationPayout } from '../game/gym/engine';
import './GymPanels.css';
import './GymClubManagement.css';
import { projectCap, projectCost } from '../game/gym/engine';
import './GymShopGrid.css';
import './GymShopPage.css';
import './GymAlumni.css';
import './GymInventory.css';
import './GymEquipmentDetail.css';

export type GymPanelProps = {
  state: GymState;
  onAction: (action: GymAction) => void;
  onAdAction?: (action: GymAction) => void;
  adAction?: GymAction | null;
  onClose?: () => void;
  busy?: boolean;
  loadAlumni?: (offset?: number, limit?: number) => Promise<{ players: GymAlumnus[]; total: number }>;
};

const formatNumber = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });
const format = (value: number) => formatNumber.format(value);
const rarityLabels = { common: '普通', rare: '稀有', legendary: '传说' };
const equipmentById = new Map(equipmentCatalog.map(item => [item.id, item]));
const tierOrder = ['rotation', 'starter', 'star', 'superstar', 'legend'];
const albumTemplates = [...templateRules].sort((a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier));
const recommendationTierNames = ['待发掘', '替补', '首发', '全明星', '巨星', '传奇'];

function RecommendationCreditRule({ state }: { state: GymState }) {
  return <p className="gm-muted" aria-label="模板推荐奖励规则">同一模板首次按档次发基础券，之后基础为 {postgameRepeatTemplateCredits} 券；培养、合作与器材加奖另计。</p>;
}

export {offlineDuration} from '../presentation/offlineDuration';

export function TrainingAdvice({ state, player = state.player, compact = false }: { state: GymState; player?: GymPlayer | null; compact?: boolean }) {
  const guidance = trainingGuidance(state, player);
  if (!player || !guidance) return null;
  const payout = recommendationPayout(state, player);
  const atCap = player.level >= playerLevelCap;
  const end = guidance.allStatsMax ? null : forecastTraining(state, player);
  const next = guidance.nextBonus;
  const nextForecast = !compact && next && next.levelGap > 0 ? forecastTraining(state, player, next.level) : null;
  if (compact) return <section className="gm-training-advice gm-paper gm-stack is-compact" aria-label={`${gymPlayerName(player)}培养建议`}>
    <strong>{payout.repeatTemplate ? `重复模板 · 推荐合计 ${payout.credits} 券` : `培养奖金 +${guidance.currentBonus} 券${atCap ? ' · 训练已结束' : next ? ` · 下档 Lv.${next.level}＋${next.tierName}` : ' · 已达最高档'}`}</strong>
    <p className="gm-muted">{guidance.allStatsMax ? '六维已满，可核对奖金与合作后推荐。' : end?.finished ? '等级已满，可推荐签约。' : next && next.levelGap === 0 && next.tierGap > 0 ? `等级达标，仍需匹配${next.tierName}。` : guidance.suggestion}</p>
    {end && !end.finished && <p className="gm-muted">当前配置预计约 {offlineDuration(end.estimatedMs)} 到 Lv.{end.targetLevel}；可在节点提前推荐。</p>}
  </section>;
  return <section className={`gm-training-advice gm-paper gm-stack${compact ? ' is-compact' : ''}`} aria-label={`${gymPlayerName(player)}培养建议`}>
    <div className="gm-section-heading"><h4>培养节点</h4><strong>{payout.repeatTemplate ? `重复模板 · 推荐合计 ${payout.credits} 券` : `当前培养奖金 +${guidance.currentBonus} 券`}</strong></div>
    <p>{guidance.suggestion}</p>
    <RecommendationCreditRule state={state} />
    {next ? <p className="gm-muted">下一档：Lv.{next.level}＋{next.tierName}及以上，额外奖金再增加 {next.additionalCredits} 券；{next.levelGap > 0 ? `还差 ${next.levelGap} 级` : '等级已达标'}{next.tierGap > 0 ? `，模板仍需达到${next.tierName}` : '，模板档次已达标'}。</p> : <p className="gm-inline-status">{atCap ? `训练等级已满，按当前实际模板结算培养奖金 ${guidance.currentBonus} 券，无法继续训练提升。` : '已达到最高培养奖金，继续升级不再增加培养奖金。'}</p>}
    {nextForecast && <p className="gm-muted">按当前配置连续{player.autoEnabled ? '自动' : '手动'}训练，约 {offlineDuration(nextForecast.estimatedMs)} 到 Lv.{next!.level}；模板仍需实际匹配，时间不是模板保证。</p>}
    {guidance.allStatsMax ? <p className="gm-recommend-warning">六维已满，继续训练不会增加属性。可核对奖金与合作后推荐签约，无需每名球员都练到99级。</p> : end?.finished ? <p className="gm-inline-status">已达到训练等级上限，可推荐签约。</p> : end && <p className="gm-muted">按当前配置连续训练，预计约 {offlineDuration(end.estimatedMs)} 到 Lv.{end.targetLevel}（属性可能提前达到上限，可提前推荐）。{player.autoEnabled && !end.withinOfflineLimit ? '当前离线上限不足以覆盖这段训练。' : ''}</p>}
    {!compact && <><h4>继续培养的剩余价值</h4><ul className="gm-remaining-value">{guidance.remainingValue.map(value => <li key={value}>{value}</li>)}</ul><p className="gm-muted">预计时间按当前体力、器材、课程与经验概率计算，不包含停留或换装，实际结果会波动；不会自动推荐球员。</p></>}
  </section>;
}

export {GymOfflineReport} from './GymOfflineReport';

function Wallet({ credits }: { credits: number }) {
  return <div className="gm-wallet"><span><i className="gm-coupon" aria-hidden="true">券</i>赞助券</span><b>{format(credits)}</b></div>;
}

function PlayerPortrait({ player }: { player: Pick<GymPlayer, 'templateId' | 'name'> }) {
  const profile = usePlayerProfile(player.templateId);
  return <StarPortrait src={profile?.avatar ?? templatePortrait(player.templateId)} fallbackSrc={templatePortrait(player.templateId)} name={profile?.name ?? gymPlayerName(player)} />;
}

function PlayerHeading({ player, value, alumnus = false }: { player: GymPlayer; value: string; alumnus?: boolean }) {
  const template = templateById(player.templateId);
  return <div className={`gm-recommend-player${alumnus ? ' gm-alumnus-heading' : ''}`}>
    <div className="gm-player-image tier-portrait-frame" data-tier={template?.tier ?? 'undiscovered'}><span className="gm-alumni-portrait-surface album-portrait-surface"><PlayerPortrait player={player} /></span></div>
    <div className="gm-player-identity">
      <p className="gm-eyebrow"><TierBadge tier={template?.tier} /> · Lv.{player.level}</p>
      <h3>{gymPlayerName(player)}</h3>
      <p className="gm-muted">{player.height} cm · 综合 {format(overallRating(player.stats))}</p>
      <strong title={value}>球员身价 {money(value)}</strong>
    </div>
  </div>;
}

function PlayerStats({ stats }: { stats: Stats }) {
  return <dl className="gm-stat-grid">{statKeys.map(key => <div key={key}><dt>{statLabels[key]}</dt><dd>{stats[key]}</dd></div>)}</dl>;
}

function projectEffect(state: GymState, id: ProjectId, level: number): string {
  const preview = { ...state, projects: { ...state.projects, [id]: level } };
  switch (id) {
    case 'endurance': return `体力上限 ${staminaMax(preview)} 点`;
    case 'recovery': return `每 ${recoverySeconds(preview)} 秒恢复 1 点体力`;
    case 'recruitment': return level > 0 ? `下一名新人的出生六维各 +${level}` : '下一名新人使用基础出生属性';
    case 'equipment': return `球馆内同时生效 ${equipmentCapacity(preview)} 件器材`;
    case 'automation': return `自动训练 ${format(automaticIntervalMs(preview) / 1000)} 秒/球，每球额外 +${level} 经验，在线离线均生效`;
    case 'offline': return state.gymLevel < 2 ? '球馆 Lv.2 免费开放离线训练，基础上限 30分钟' : `每次离线最多训练 ${offlineDuration(offlineLimitMs(preview))}`;
  }
}

function ProjectBadge({ id }: { id: ProjectId }) {
  const drawing = {
    endurance: <path d="m18 3-11 15h8l-1 11 11-17h-8Z" />,
    recovery: <path d="M26 10A12 12 0 1 0 28 20 M26 3v8h-8 M16 8v9l6 3" />,
    recruitment: <><circle cx="12" cy="10" r="5" /><path d="M3 28v-5c0-7 18-7 18 0v5 M25 10v12 M19 16h12" /></>,
    equipment: <path d="M3 9h5v14H3Z M8 13h16v6H8 M24 9h5v14h-5 M13 8v16 M19 8v16" />,
    automation: <path d="m11 5 16 11-16 11Z M3 5v22" />,
    offline: <path d="M26 20A13 13 0 0 1 12 4 13 13 0 1 0 26 20Z M23 3v7 M20 6h6" />,
  };
  return <svg viewBox="0 0 32 32" aria-hidden="true">{drawing[id]}</svg>;
}

function ProjectChange({ state, id }: { state: GymState; id: ProjectId }) {
  const project = projects.find(item => item.id === id)!;
  const level = state.projects[id];
  const nextLevel = Math.min(project.maxLevel, level + 1);
  const current = { ...state, gymLevel: Math.max(2, state.gymLevel) };
  const next = { ...current, projects: { ...state.projects, [id]: nextLevel } };
  const values = {
    endurance: ['体力上限', staminaMax(current), staminaMax(next), ''],
    recovery: ['恢复1点体力', recoverySeconds(current), recoverySeconds(next), '秒'],
    recruitment: ['新人六维加成', `+${level}`, `+${nextLevel}`, ''],
    equipment: ['启用器材', equipmentCapacity(current), equipmentCapacity(next), '件'],
    automation: ['出手', format(automaticIntervalMs(current) / 1000), format(automaticIntervalMs(next) / 1000), '秒'],
    offline: ['训练上限', offlineLimitMs(current) / 60000, offlineLimitMs(next) / 60000, '分钟'],
  }[id];
  return <p className="gm-project-change"><span>{values[0]}</span><b>{values[1]}{level < project.maxLevel && <><i>→</i>{values[2]}</>}{values[3]}</b>{id === 'automation' && <em>每球经验 +{nextLevel}</em>}</p>;
}

function nextGymUnlocks(state: GymState, nextLevel: number) {
  const after = { ...state, gymLevel: nextLevel };
  const newEquipment = equipmentCatalog.filter(item => equipmentOffer(state, item.id).price === null && equipmentOffer(after, item.id).price !== null).length;
  const opened = projects.filter(project => project.unlockLevel > state.gymLevel && project.unlockLevel <= nextLevel).map(project => project.name.replace('培养', '').replace('训练', ''));
  const raised = projects.filter(project => project.unlockLevel <= state.gymLevel && projectCap(project.id, nextLevel) > projectCap(project.id, state.gymLevel)).map(project => project.name.replace('训练', '').replace('护理', ''));
  return { newEquipment, opened, raised };
}

export function GymClubPanel({ state, onAction, busy }: GymPanelProps) {
  const [tab, setTab] = useState(0);
  const [detailProject, setDetailProject] = useState<ProjectId | null>(null);
  const [showRules, setShowRules] = useState(false);
  const current = gymLevels.find(level => level.level === state.gymLevel)!;
  const upgrade = gymUpgrade(state);
  const selectedProject = projects.find(project => project.id === detailProject);
  const selectedOffer = selectedProject ? projectOffer(state, selectedProject.id) : null;
  const unlocks = upgrade.level ? nextGymUnlocks(state, upgrade.level.level) : null;
  return <div className="gym-panel gm-club">
    <div className="gm-club-overview">
      <div className="gm-club-heading"><b className="gm-club-level">{state.gymLevel}</b><div><p className="gm-eyebrow">{state.gymLevel} 个训练位 · 最高 Lv.8</p><h3>{current.name}</h3></div></div>
      <button type="button" className="gm-training-help" aria-label="查看球馆说明" title="球馆说明" onClick={() => setShowRules(true)}>?</button>
    </div>
    <div className="gm-club-resources" aria-label="球馆经营资源"><span>累计声望 <b>{format(state.fame)}</b></span><span>校友 <b>{format(alumniProgress(state).total)}</b></span><span><i className="gm-coupon" aria-hidden="true">券</i> <b>{format(state.credits)}</b></span></div>
    <SlidingTabs labels={['球馆升级', '经营项目']} label="球馆经营分类" index={tab} onChange={setTab}>
      {tab === 0 ? upgrade.level ? <section className="gm-club-expansion gm-expansion-a" aria-label="下一球馆升级条件">
        <header><div><span className="gm-expansion-ribbon">扩建至 Lv.{upgrade.level.level}</span><h3>{upgrade.level.name}</h3></div><span className="gm-expansion-arrow">{state.gymLevel}<i>›</i>{upgrade.level.level}</span></header>
        <div className="gm-expansion-conditions">{upgrade.requirements.map(requirement => <div className={requirement.met ? 'is-met' : ''} key={requirement.label}><span>{requirement.label}{requirement.met && <i aria-label="已达成">✓</i>}</span><b>{requirement.label.includes('推荐档次') ? recommendationTierNames[requirement.current] : format(requirement.current)} <small>/ {requirement.label.includes('推荐档次') ? recommendationTierNames[requirement.required] : format(requirement.required)}</small></b><div role="progressbar" aria-label={requirement.label} aria-valuemin={0} aria-valuemax={requirement.required} aria-valuenow={Math.min(requirement.current, requirement.required)}><i style={{ width: `${Math.min(100, requirement.current / requirement.required * 100)}%` }} /></div></div>)}</div>
        <footer><div className="gm-expansion-unlocks"><small>下一级新增</small><span><b>+1</b> 训练位{upgrade.level.level === 2 && <> <i>·</i> 自动训练 <i>·</i> 30分钟离线</>}{upgrade.level.level > 2 && !!unlocks?.newEquipment && <> <i>·</i> {unlocks.newEquipment}件器材上架</>}</span>{!!unlocks?.opened.length && <span className="gm-expansion-secondary">{upgrade.level.level === 2 ? '开放招生、器械管理、自动与离线项目' : `开放${unlocks.opened.join('、')}项目`}</span>}{upgrade.level.level > 2 && !!unlocks?.raised.length && <span className="gm-expansion-secondary">{unlocks.raised.join('、')}项目上限提高</span>}</div><button type="button" className="gm-button gm-primary gm-expansion-upgrade" title={upgrade.reason || `扩建花费 ${upgrade.price} 券`} disabled={busy || !upgrade.canUpgrade} onClick={() => onAction({ type: 'upgrade-gym', targetLevel: upgrade.level!.level })}>{upgrade.price === 0 ? '免费' : `升级 · ${format(upgrade.price)} 券`}</button></footer>
      </section> : <p className="gm-inline-status">已达到当前最高馆级，继续培养与收藏。</p> : <div className="gm-stack gm-club-project-page">
        <div className="gm-section-heading"><h3>经营项目</h3><small>全馆永久生效</small></div>
        <div className="gm-projects gm-project-list">{projects.map(project => {
          const offer = projectOffer(state, project.id);
          const canBuy = !busy && project.available && offer.price !== null && state.credits >= offer.price;
          const reason = !project.available ? '后续开放' : offer.reason ?? (offer.price !== null && state.credits < offer.price ? `还差 ${offer.price - state.credits} 券` : '');
          const nextPrice = offer.level < project.maxLevel ? projectCost(project.id, offer.level + 1) : null;
          const locked = state.gymLevel < project.unlockLevel || offer.level >= offer.maxLevel;
          return <article className={`gm-project gm-project-row${locked ? ' is-locked' : ''}`} data-project-id={project.id} key={project.id}>
            <span className="gm-project-badge"><ProjectBadge id={project.id} /></span><div className="gm-project-summary"><div className="gm-project-row-title"><h4>{project.name}</h4><small>Lv.{offer.level} / {project.maxLevel}</small></div><ProjectChange state={state} id={project.id} /></div>
            <button type="button" className="gm-project-detail" aria-label={`查看${project.name}详情`} onClick={() => setDetailProject(project.id)}>?</button>
            <button type="button" className="gm-button gm-primary gm-project-upgrade" title={reason || `馆级上限 Lv.${offer.maxLevel}`} disabled={!canBuy} onClick={() => onAction({ type: 'upgrade-project', id: project.id })}>{nextPrice === null ? '已升满' : <>{offer.price !== null && state.credits >= offer.price ? '升级' : ''}<b>{nextPrice}券</b>{(offer.price === null || state.credits < offer.price) && <small>{state.gymLevel < project.unlockLevel ? `馆${project.unlockLevel}开放` : offer.level >= offer.maxLevel ? '需先扩馆' : '赞助券不足'}</small>}</>}</button>
          </article>;
        })}</div></div>}
    </SlidingTabs>
    {selectedProject && selectedOffer && <ComicDialog title={`${selectedProject.name}详情`} onClose={() => setDetailProject(null)}><div className="gym-panel gm-stack"><h3>{selectedProject.name} · Lv.{selectedOffer.level}/{selectedProject.maxLevel}</h3><p>{selectedProject.description}</p><p>当前 · {projectEffect(state, selectedProject.id, selectedOffer.level)}</p>{selectedOffer.level < selectedProject.maxLevel && <p>下级 · {projectEffect({ ...state, gymLevel: Math.max(2, state.gymLevel) }, selectedProject.id, selectedOffer.level + 1)}</p>}<p className="gm-muted">馆级上限 Lv.{selectedOffer.maxLevel}。{selectedOffer.reason ?? (selectedOffer.price !== null && state.credits < selectedOffer.price ? `还差 ${selectedOffer.price - state.credits} 券` : '')}</p>{['endurance', 'recovery', 'automation'].includes(selectedProject.id) && selectedOffer.price !== null && <ProjectTrainingPreview state={state} id={selectedProject.id} />} {selectedProject.id === 'offline' && selectedOffer.price !== null && <OfflineProjectPreview state={state} />}<button type="button" className="gm-button" onClick={() => setDetailProject(null)}>返回经营项目</button></div></ComicDialog>}
    {showRules && <ComicDialog title="球馆说明" onClose={() => setShowRules(false)}><div className="gym-panel gm-training-rules"><section className="gm-stack"><h3>扩建球馆</h3><p>满足声望、培养成果与赞助券条件后扩建，每级新增1个空训练位，并提高项目上限、开放器材。升级保留累计声望；已有馆级不补收历史费用。</p><p>球馆2级免费解锁在线自动与离线训练，空位由你招募新人。</p></section><section className="gm-stack"><h3>经营项目</h3>{projects.map(project => <p key={project.id}><strong>{project.name}</strong> · {project.description}</p>)}</section><section className="gm-stack"><h3>获取赞助券</h3><RecommendationCreditRule state={state} /><p>未匹配模板的球员离馆不入校友档案；已发掘模板的推荐成果保存在校友簿。</p></section><button type="button" className="gm-button" onClick={() => setShowRules(false)}>返回球馆</button></div></ComicDialog>}
  </div>;
}

function OfflineProjectPreview({ state }: { state: GymState }) {
  const forecast = useMemo(() => forecastTraining(state), [state]);
  const allStatsMax = useMemo(() => trainingGuidance(state)?.allStatsMax, [state]);
  const upgrade = useMemo(() => offlineUpgradeGuidance(state), [state]);
  return <section className="gm-stack gm-project-forecast" aria-label="离线升级收益预估">
    {state.player && <p className="gm-muted">{allStatsMax ? '当前球员六维已满，可核对培养奖金与合作后推荐。' : forecast?.finished ? '当前球员已到训练等级上限，可以推荐。' : forecast ? `当前球员约 ${offlineDuration(forecast.estimatedMs)} 到 Lv.${forecast.targetLevel}，可在模板、奖金节点提前推荐。` : ''}</p>}
    {upgrade ? <><p className="gm-muted">升级花费 {upgrade.price} 券，离线训练上限 {offlineDuration(upgrade.currentLimitMs)} → {offlineDuration(upgrade.nextLimitMs)}。</p>
      {upgrade.automaticPlayers === 0 ? <p className="gm-muted">当前没有开启自动的球员，离线只恢复体力；开启自动后才会训练。</p> : upgrade.predictedFinishedWithinCurrent === upgrade.automaticPlayers ? <p className="gm-recommend-warning">当前开启自动的 {upgrade.automaticPlayers} 名球员预计都可在现有离线上限内达到 Lv.99，延长时长不一定增加本批训练收益。</p> : upgrade.predictedFinishedWithinCurrent > 0 ? <p className="gm-recommend-warning">当前开启自动的 {upgrade.automaticPlayers} 名球员中，{upgrade.predictedFinishedWithinCurrent} 名预计可在现有上限内达到 Lv.99；延长时长主要帮助其余球员继续训练。</p> : <p className="gm-muted">当前开启自动的 {upgrade.automaticPlayers} 名球员预计尚不能在现有上限内全部练满。</p>}
      <p className="gm-muted">项目永久生效，也适用于后续新人。{upgrade.hasExtensionEquipment ? '可按需要换下离线加时器材，腾出槽位。' : ''}{upgrade.automaticPlayers > 0 ? '满级时间按当前配置预估，实际经验结果会波动；不会自动推荐或补招。' : ''}</p></> : <p className="gm-muted">{state.gymLevel < 2 ? '球馆2级免费开放离线训练。' : '离线课表已升满；超过上限的时间仅恢复体力。'}</p>}
  </section>;
}

export function GymRosterPanel({ state, onAction, onAdAction, adAction, onAlumni, busy }: GymPanelProps & { onAlumni?: () => void }) {
  const [planningPlayerId, setPlanningPlayerId] = useState<string | null>(null);
  const [planningTab, setPlanningTab] = useState(0);
  const players = state.player ? [state.player, ...state.bench] : [];
  const planningPlayer = players.find(player => player.id === planningPlayerId);
  useEffect(() => { if (planningPlayerId && !planningPlayer) setPlanningPlayerId(null); }, [planningPlayerId, planningPlayer]);
  const planningState = planningPlayer ? {...state, player: planningPlayer, bench: players.filter(player => player.id !== planningPlayer.id)} : null;
  const planAction = (action: GymAction) => {
    if (busy) return;
    if (action.type === 'set-training-plan' || action.type === 'accept-cooperation' || action.type === 'abandon-cooperation') onAction({...action, scope: 'roster'});
  };
  const maximum = staminaMax(state);
  const freeSeats = state.gymLevel - players.length;
  return <div className="gm-roster">
    <div className="gm-roster-scroll" role="region" aria-label="球员列表" tabIndex={0}>
    {players.length > 0 && <div className="contract-cards roster-cards">{players.map((player, index) => {
      const selected = state.player?.id === player.id;
      const template = templateById(player.templateId);
      const capped = player.level >= playerLevelCap;
      const experience = requiredExperience(player.level);
      const name = gymPlayerName(player);
      const accessibleName = `${name} · 训练位${index + 1}`;
      return <article key={player.id} className={`contract-card roster-card${selected ? ' is-training' : ''}`} data-player-id={player.id} data-tier={template?.tier ?? 'undiscovered'}>
        <div className="roster-card-body"><span data-tier={template?.tier ?? 'undiscovered'} className={`roster-portrait tier-portrait-frame${template ? ' album-portrait-surface' : ''}`}><StarPortrait src={templatePortrait(player.templateId)} name={name} /></span><div className="roster-identity"><h3>{name} <TierBadge tier={template?.tier} /></h3><p>训练 <b className="roster-level">{player.level}</b><i /> {player.height} cm</p></div><div className="roster-value"><small>球员身价</small><FittedAmount text={money(playerValue(state, player))} /></div><div className="roster-attributes"><div className="roster-rating"><small>综合评分</small><b>{overallRating(player.stats).toFixed(1)}</b></div>{statKeys.map(key => <div key={key}><small>{statLabels[key]}</small><b>{player.stats[key]}</b></div>)}</div></div>
        <div className="gm-roster-meters"><div className="gm-roster-meter"><div><span>体力</span><b>{player.stamina}/{maximum}</b></div><div role="progressbar" aria-label={`${accessibleName}体力`} aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={player.stamina}><i style={{ width: `${Math.min(100, player.stamina / maximum * 100)}%` }} /></div></div><div className="gm-roster-meter is-experience"><div><span>经验</span><b>{capped ? '已满级' : `${player.experience}/${experience}`}</b></div><div role="progressbar" aria-label={`${accessibleName}训练经验`} aria-valuemin={0} aria-valuemax={capped ? 1 : experience} aria-valuenow={capped ? 1 : player.experience} aria-valuetext={capped ? '已满级' : `${player.experience}/${experience} 经验`}><i style={{ width: `${capped ? 100 : Math.min(100, player.experience / experience * 100)}%` }} /></div></div></div>
        <div className="contract-actions contract-roster-actions"><button type="button" className="primary gm-icon-button" disabled={selected || busy} onClick={() => onAction({ type: 'select-player', id: player.id })}><GameIcon name="train" /><span>{selected ? '当前选中' : '选择训练'}</span></button><button type="button" className="secondary gm-icon-button gm-roster-plan" disabled={busy} aria-label={`${accessibleName}训练计划`} onClick={() => {setPlanningTab(0); setPlanningPlayerId(player.id);}}><span>训练计划</span></button><button type="button" className={`secondary gm-icon-button${player.autoEnabled ? ' signing-button' : ''}`} role="switch" aria-label={`${accessibleName}自动训练`} aria-checked={player.autoEnabled} disabled={busy || state.gymLevel < 2 || capped && !player.autoEnabled} onClick={() => onAction({ type: 'set-auto', id: player.id, enabled: !player.autoEnabled })}><GameIcon name="rest" /><span>{state.gymLevel < 2 ? 'Lv.2 免费解锁自动' : player.autoEnabled ? '暂停自动' : capped ? '已满级' : '开启自动'}</span>{player.autoEnabled && <AutoTrainingBorder />}</button></div>
      </article>;
    })}</div>}
    {freeSeats > 0 && <GymRecruitmentControls state={state} onAction={onAction} busy={busy} />}
    </div>
    {onAlumni && <button type="button" className="secondary gm-icon-button gm-roster-alumni" onClick={onAlumni}><GameIcon name="career" /><span>查看校友档案 · {alumniProgress(state).total} 人</span></button>}
    {planningState && planningPlayer && <ComicDialog title="球员培养" onClose={() => setPlanningPlayerId(null)} className="gm-roster-planning-dialog"><div className="gym-panel gm-roster-planning"><p className="gm-roster-planning-name">{gymPlayerName(planningPlayer)} · Lv.{planningPlayer.level}</p><SlidingTabs labels={['训练计划', '赞助合作']} label="球员培养分页" index={planningTab} onChange={setPlanningTab}>{planningTab === 0 ? <GymTrainingPanel key={planningPlayer.id} state={planningState} onAction={planAction} busy={busy}/> : <GymCooperationPanel key={planningPlayer.id} state={planningState} onAction={planAction} onAdAction={onAdAction ? action => {if (action.type === 'complete-cooperation-ad') onAdAction({...action, scope: 'roster'});} : undefined} busy={busy} adAction={adAction}/>}</SlidingTabs></div></ComicDialog>}
  </div>;
}

export function GymTrainingPanel({ state, onAction }: GymPanelProps) {
  const [pendingPlan, setPendingPlan] = useState<{ id: TrainingPlanId; playerId: string } | null>(null);
  const [showRules, setShowRules] = useState(false);
  const player = state.player;
  if (!player) return <div className="gym-panel gm-empty"><GameIcon name="train" /><h3>先迎接一位新人</h3><p className="gm-muted">招募球员后，可以为他选择训练计划。</p></div>;
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
    if (progress.shots > 0) setPendingPlan({ id, playerId: player.id });
    else onAction({ type: 'set-training-plan', id, playerId: player.id });
  };
  return <div className="gym-panel gm-training-panel">
    <section className="gm-plan-summary" aria-label="当前训练课程">
      <div className="gm-section-heading"><div><p className="gm-eyebrow">当前计划</p><h3>{progress.plan.name}</h3></div><div className="gm-training-summary-tools"><span className="gm-course-count">已完成 {progress.completedCourses} 课</span><button type="button" className="gm-training-help" aria-label="查看训练说明" title="训练说明" onClick={() => setShowRules(true)}>?</button></div></div>
      <div className="gm-condition"><span>本课进度</span><b>{progress.shots} / 10 球</b></div>
      <progress className="gm-progress" value={progress.shots} max={10} aria-label="本课有效投篮进度" />
      <p className="gm-training-course-note">{atCap ? '已满级，训练已结束' : <>完课恢复 <strong>+{progress.recovery}</strong> 体力</>}</p>
    </section>
    <section className="gm-paper gm-stack gm-training-player" aria-label="球员能力与成长倾向"><div className="gm-section-heading"><h4>球员能力</h4><small>{gymPlayerName(player)}{allStatsMax ? ' · 六维已满' : ''}</small></div><PlayerStats stats={player.stats} /><div className="gm-training-tendency"><p><span>成长偏向</span><b>{tendency}</b></p>{talent !== tendency && <small>天赋：{talent}</small>}</div></section>
    <div className="gm-section-heading gm-training-plan-heading"><h3>训练方向</h3><small>免费切换</small></div>
    <div className="gm-plan-grid">{trainingPlans.map(plan => {
      const current = plan.id === progress.plan.id;
      return <article className={`gm-plan-card${current ? ' is-selected' : ''}`} key={plan.id}>
        <div className="gm-plan-title"><h4>{plan.name}</h4></div>
        <div className="gm-plan-targets">{plan.focusKeys.length ? plan.focusKeys.map(key => <span key={key}>{statLabels[key]}</span>) : <span>原生偏好</span>}</div>
        <button type="button" className={`gm-button${current ? '' : ' gm-primary'}`} aria-label={current ? `当前计划：${plan.name}` : `选择${plan.name}`} disabled={current} onClick={() => selectPlan(plan.id)}>{current ? '已选用' : '选用'}</button>
      </article>;
    })}</div>
    <p className="gm-training-switch-note">{progress.shots>0?`切换将清空本课 ${progress.shots}/10 球进度`:'切换训练方向免费，当前课程尚无进度'}</p>
    <div className="gm-training-payout" aria-label="当前推荐收益"><span>当前推荐</span><strong>+{reward.credits} 券</strong><small>{reward.repeatTemplate ? '重复模板' : player.templateId ? '模板首次' : '未匹配模板'}</small></div>
    {showRules && <ComicDialog title="训练说明" className="gm-training-rules-dialog" onClose={() => setShowRules(false)}><div className="gym-panel gm-training-rules">
      <section className="gm-stack"><h3>课程与恢复</h3><p>每10次投篮完成1课，完课时恢复部分体力，超出上限不计入<br />（当前：基础4点+器材额外{effects.courseRecovery}点）。</p></section>
      <section className="gm-stack"><h3>推荐奖励</h3><RecommendationCreditRule state={state}/><table className="gm-training-bonus-table"><thead><tr><th scope="col">培养条件</th><th scope="col">培养加奖</th></tr></thead><tbody>{trainingCreditMilestones.map(milestone => <tr key={milestone.level}><td>Lv.{milestone.level}＋{recommendationTierNames[milestone.tier]}及以上</td><td>+{milestone.credits} 券</td></tr>)}</tbody></table><p className="gm-muted">培养加奖只取最高达标档，基础券与已完成合作另计；未匹配模板无赞助券奖励，完整课程可提高培养声望。</p></section>
      <button type="button" className="gm-button gm-primary" onClick={() => setShowRules(false)}>返回训练</button>
    </div></ComicDialog>}
    {pendingPlan && <ComicDialog title="切换训练计划" onClose={() => setPendingPlan(null)}>
      <div className="gym-panel"><p>切换至「{trainingPlans.find(plan => plan.id === pendingPlan.id)?.name}」？本课 {progress.shots}/10 球将清零。</p><p className="gm-muted">已完成的 {progress.completedCourses} 课和球员成长保留。</p><div className="gm-actions"><button type="button" className="gm-button" onClick={() => setPendingPlan(null)}>继续当前课程</button><button type="button" className="gm-button gm-primary" onClick={() => { onAction({ type: 'set-training-plan', id: pendingPlan.id, playerId: pendingPlan.playerId }); setPendingPlan(null); }}>确认切换</button></div></div>
    </ComicDialog>}
  </div>;
}

export { GymCooperationPanel } from './GymCooperationPanel';

function TrainingTimeComparison({ state, comparison, title, label }: { state: GymState; comparison: EquipmentTrainingComparison; title: string; label: string }) {
  return <section className="gm-paper gm-stack" aria-label={label}>
    <h4>培养耗时对比 · {title}</h4>
    {comparison.status === 'no-player' ? <p className="gm-muted">招募球员后，可按实际等级、体力与训练配置比较培养耗时。</p>
      : comparison.status === 'ended' ? <p className="gm-muted">当前球员已满级，训练已结束；此项投入仍适用于其他或未来球员。</p>
        : comparison.status === 'choose-replacement' ? <p className="gm-muted">馆内已满，请在替换确认中选择替换对象，再比较实际培养耗时。</p>
          : <>{comparison.rows.map(row => <p key={row.level} data-forecast-level={row.level}>到 Lv.{row.level}：约 {offlineDuration(row.beforeMs)} → {offlineDuration(row.afterMs)}{row.beforeMs === row.afterMs ? '（预计耗时不变）' : ''}</p>)}
            <p className="gm-muted">按当前球员{state.player?.autoEnabled ? '自动' : '手动'}连续训练估算，沿用现有体力、课程与冷却，不包含停留或后续换装。实际结果会波动，不保证模板；专项属性成长不折算为等级提速，离线延时仅增加可结算时长。</p>
          </>}
  </section>;
}

function EquipmentTrainingPreview({ state, item, replaceId }: { state: GymState; item: GymEquipment; replaceId?: string }) {
  const comparison = useMemo(() => equipmentTrainingComparison(state, item.id, replaceId), [state, item.id, replaceId]);
  return <TrainingTimeComparison state={state} comparison={comparison} title={state.equippedEquipment.includes(item.id) ? '移出后' : '放入后'} label="器材培养耗时对比" />;
}

function ProjectTrainingPreview({ state, id }: { state: GymState; id: ProjectId }) {
  const comparison = useMemo(() => projectTrainingComparison(state, id), [state, id]);
  return comparison && <TrainingTimeComparison state={state} comparison={comparison} title="项目升一级后" label="项目培养耗时对比" />;
}

function EquipmentDetail({ item, onClose, actions }: { item: GymEquipment; state: GymState; onClose: () => void; actions?: ReactNode }) {
  return <ComicDialog title="器材档案" variant="album" className="equipment-detail-dialog" onClose={onClose}>
    <div className="equipment-detail gym-equipment-detail">
      <div className="equipment-display"><span className="equipment-rarity" data-rarity={item.rarity}>{rarityLabels[item.rarity]} · {item.grade}阶</span><ProductImage id={item.artId} name={item.name} /></div>
      <h3>{item.name}</h3><div className="equipment-name-rule" aria-hidden="true"><i />◆<i /></div>
      <section className="equipment-effect"><h4>器材效果</h4><div><svg viewBox="0 0 40 48" aria-hidden="true"><path d="M24 2 3 27h14l-3 19 23-28H23Z" /></svg><div><p>{item.description}</p><small>{equipmentFamilyLabels[item.family]} · 同类只启用一件</small></div></div></section>
      {actions}
      <button type="button" className="album-back" onClick={onClose}>‹ 返回</button>
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

function EquipmentCard({ item, state, onAction, onDetails, onEquip, selectedForEquip = false, replacementMode = false, replacementAllowed = true, busy = false, inventory = false }: GymPanelProps & { item: GymEquipment; onDetails: () => void; inventory?: boolean; onEquip?: () => void; selectedForEquip?: boolean; replacementMode?: boolean; replacementAllowed?: boolean }) {
  const [pending, setPending] = useState<'purchase' | 'replace' | null>(null);
  const [replaceId, setReplaceId] = useState('');
  const submitted = useRef(false);
  const offer = equipmentOffer(state, item.id);
  const equipped = state.equippedEquipment.includes(item.id);
  const owned = state.ownedEquipment.includes(item.id);
  const locked = !owned && offer.price === null;
  const full = state.equippedEquipment.length >= equipmentCapacity(state);
  const activeFamilyItem = equippedFamilyEquipment(state, item.id);
  const familyItem = activeFamilyItem?.id !== item.id ? activeFamilyItem : undefined;
  const mustReplace = full || !!familyItem;
  const replacementIds = familyItem ? [familyItem.id] : state.equippedEquipment;
  const validReplacement = replacementIds.includes(replaceId) && state.equippedEquipment.includes(replaceId);
  const reason = owned ? equipped ? '已放入球馆，持续为全体球员生效' : familyItem ? '同类只启用一件，替换后旧件进入仓库' : '仓库器材，可重新入馆或半价出售' : offer.reason ?? (offer.price !== null && state.credits < offer.price ? '赞助券不足' : familyItem ? '同类只启用一件，购买时替换旧件入仓库' : full ? '购买时选择替换，旧器材进入仓库' : '购买即放入球馆生效');
  useEffect(() => {
    if (pending !== 'purchase') return;
    if (owned) { submitted.current = false; setReplaceId(familyItem?.id ?? ''); setPending('replace'); }
    else if (!busy) { submitted.current = false; setPending(null); }
  }, [pending, owned, busy, familyItem?.id]);
  useEffect(() => { if (pending === 'replace' && !owned) setPending(null); }, [pending, owned]);
  useEffect(() => { if (!busy && pending !== 'purchase') submitted.current = false; }, [busy, pending, state.revision]);
  const submit = (action: GymAction) => {
    if (busy || submitted.current) return;
    submitted.current = true;
    onAction(action);
    setPending(null);
  };
  const install = () => {
    if (inventory) { if (!busy && !equipped && replacementAllowed) onEquip?.(); return; }
    if (busy || submitted.current || owned || offer.price === null || state.credits < item.price) return;
    submitted.current = true;
    if (mustReplace) { setPending('purchase'); onAction({ type: 'buy-equipment', id: item.id, destination: 'warehouse' }); }
    else onAction({ type: 'buy-equipment', id: item.id });
  };
  return <article className={`gm-product gm-shop-product${inventory ? ` gm-warehouse-product${selectedForEquip ? ' is-pending-equipment' : ''}` : owned ? ' is-owned' : locked ? ' is-locked' : ''}`} data-rarity={item.rarity} data-family={item.family} data-grade={item.grade} data-equipment-id={item.id}>
    {inventory ? <><div className="gm-product-image"><ProductImage id={item.artId} name={item.name} /></div><div className="gm-product-copy gm-shop-ticket-title"><h4>{item.name}</h4><span className="gm-equipment-summary" title={item.description}>{equipmentSummary(item)}</span><button type="button" className="gm-info-button" aria-label={`器材详情：${item.name}`} onClick={onDetails}>详情 <i aria-hidden="true">›</i></button></div><button type="button" className="gm-button gm-primary gm-warehouse-equip" aria-pressed={selectedForEquip} disabled={busy || equipped || !replacementAllowed} title={!replacementAllowed ? '同类只启用一件，请选择对应的装备位' : undefined} onClick={install}>{equipped ? '已装备' : replacementMode ? '替换' : selectedForEquip ? '选择中' : '装备'}</button></> : <><div className="gm-shop-ticket-face"><div className="gm-product-image"><ProductImage id={item.artId} name={item.name} /></div><div className="gm-product-copy gm-shop-ticket-title"><h4>{item.name}</h4><span className="gm-equipment-summary" title={item.description}>{equipmentSummary(item)}</span></div></div>
      <div className="gm-product-actions"><button type="button" className="gm-info-button" aria-label={`器材详情：${item.name}`} onClick={onDetails}>详情 <i aria-hidden="true">›</i></button><button type="button" className="gm-button gm-primary" disabled={owned || busy || offer.price === null || state.credits < offer.price} title={owned ? '已经持有此器材，无需重复购买' : reason} onClick={install}>购买 <b>· {item.price} 券</b></button></div></>}
    {!inventory && locked && <div className="gm-shop-lock"><strong>尚未上架</strong><p>球馆 Lv.{item.unlockLevel}{item.requiredTemplates > 0 && <><br />收藏 {item.requiredTemplates} 种球星模板</>}</p></div>}
    {!inventory && owned && <div className="gm-shop-owned-cover"><span className="gm-shop-purchased-stamp">已购买</span></div>}
    {pending === 'replace' && <ComicDialog title="替换馆内器材" onClose={() => setPending(null)}><div className="gym-panel gm-stack">
      <h3>已购买「{item.name}」</h3><p>器材已存入仓库。{familyItem ? `同类只启用一件，可替换「${familyItem.name}」。` : '馆内器材已满，可选择一件替换。'}替换不再扣券，旧器材留在仓库。</p>
      <div className="gm-replacement-options" role="group" aria-label="选择替换的器材">{state.equippedEquipment.map(id => {
        const equippedItem = equipmentById.get(id);
        if (!equippedItem) return null;
        return <button type="button" key={id} className="gm-replacement-option" data-equipment-id={id} aria-label={`选择替换${equippedItem.name}`} aria-pressed={replaceId === id} disabled={busy || !replacementIds.includes(id)} onClick={() => setReplaceId(id)}><ProductImage id={equippedItem.artId} name={equippedItem.name} /><span>{equippedItem.name}</span></button>;
      })}</div>
      {familyItem && <p className="gm-muted gm-replacement-options-note">同类器材只启用一件，仅可替换对应的已装备器材。</p>}
      {validReplacement && <EquipmentReplacementChanges state={state} itemId={item.id} replaceId={replaceId} />}
      <div className="gm-actions"><button type="button" className="gm-button" onClick={() => setPending(null)}>放入仓库</button><button type="button" className="gm-button gm-primary" disabled={busy || !validReplacement} onClick={() => submit({ type: 'equip', id: item.id, replaceId })}>确认替换</button></div>
    </div></ComicDialog>}
  </article>;
}

export function GymShopPanel({ state, onAction, busy }: GymPanelProps) {
  const [selected, setSelected] = useState<GymEquipment | null>(null);
  const stock = [...equipmentCatalog].sort((first, second) => {
    const group = (item: GymEquipment) => state.ownedEquipment.includes(item.id) ? 3 : equipmentOffer(state, item.id).price === null ? 2 : state.credits >= item.price ? 0 : 1;
    const firstGroup = group(first), secondGroup = group(second);
    return firstGroup - secondGroup || (firstGroup === 2 ? first.unlockLevel - second.unlockLevel : 0) || equipmentCatalog.indexOf(first) - equipmentCatalog.indexOf(second);
  });
  return <div className="gym-panel gm-shop gm-shop-page">
    <div className="gm-shop-resources"><span className="gm-shop-club-mark"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 13 16 5l12 8v15H4Z M1 13l15-10 15 10 M11 28V17h10v11" /></svg>球馆等级 <b>{state.gymLevel}</b></span><span className="gm-shop-coupon"><i aria-hidden="true">券</i><span>可用赞助券</span><b>{format(state.credits)}</b></span></div>
    <div className="collection-sections"><div className="collection-tab-panel">
      <div className="gm-stack gm-shop-shelf">
        <div className="gm-shop-shelf-heading"><h3>器材货架</h3><span>已上架优先 · 已购买置后</span></div>
        <div className="gm-products gm-shop-grid" role="region" aria-label="器材货架" tabIndex={0}>{stock.map(item => <EquipmentCard key={item.id} {...{ item, state, onAction, busy }} onDetails={() => setSelected(item)} />)}</div>
      </div>
    </div></div>
    <footer className="gm-shop-bottom"><span>器材装备后全馆共享生效</span><b>同类只启用一件</b></footer>
    {selected && <EquipmentDetail item={selected} state={state} onClose={() => setSelected(null)} />}
  </div>;
}

export function GymInventoryPanel({ state, onAction, busy }: GymPanelProps) {
  const [selected, setSelected] = useState<GymEquipment | null>(null);
  const [pendingEquipment, setPendingEquipment] = useState<string | null>(null);
  const [replacementSlotId, setReplacementSlotId] = useState<string | null>(null);
  const [management, setManagement] = useState<{ id: string } | null>(null);
  const slots = useRef<HTMLDivElement>(null);
  const submitted = useRef(false);
  const capacity = equipmentCapacity(state);
  const owned = equipmentCatalog.filter(item => state.ownedEquipment.includes(item.id));
  const warehouse = [...owned].sort((first, second) => Number(state.equippedEquipment.includes(first.id)) - Number(state.equippedEquipment.includes(second.id)));
  const pendingItem = owned.find(item => item.id === pendingEquipment && !state.equippedEquipment.includes(item.id));
  const replacementSlot = owned.find(item => item.id === replacementSlotId && state.equippedEquipment.includes(item.id));
  const familyItem = pendingItem ? equippedFamilyEquipment(state, pendingItem.id) : undefined;
  const replacementIds = familyItem ? [familyItem.id] : state.equippedEquipment;
  const managed = management ? owned.find(item => item.id === management.id) : undefined;
  const canManage = !!managed && !state.equippedEquipment.includes(managed.id);
  useEffect(() => { submitted.current = false; }, [state.revision, busy]);
  useEffect(() => { if (!pendingItem) setPendingEquipment(null); }, [pendingItem]);
  useEffect(() => { if (!replacementSlot) setReplacementSlotId(null); }, [replacementSlot]);
  useEffect(() => {
    if (!pendingItem) return;
    slots.current?.scrollIntoView?.({ block: 'nearest' });
    slots.current?.querySelector<HTMLButtonElement>('.is-replaceable')?.focus({ preventScroll: true });
  }, [pendingItem?.id]);
  const commit = (action: GymAction) => {
    if (busy || submitted.current) return;
    submitted.current = true;
    onAction(action);
    setPendingEquipment(null); setReplacementSlotId(null); setManagement(null); setSelected(null);
  };
  const equip = (item: GymEquipment) => {
    if (busy || submitted.current || !state.ownedEquipment.includes(item.id) || state.equippedEquipment.includes(item.id)) return;
    if (replacementSlot) {
      const sameFamily = equippedFamilyEquipment(state, item.id);
      if (sameFamily && sameFamily.id !== replacementSlot.id) return;
      commit({type: 'equip', id: item.id, replaceId: replacementSlot.id});
      return;
    }
    if (pendingEquipment === item.id) { setPendingEquipment(null); return; }
    if (state.equippedEquipment.length >= capacity || equippedFamilyEquipment(state, item.id)) setPendingEquipment(item.id);
    else commit({ type: 'equip', id: item.id });
  };
  const chooseSlot = (id: string) => {
    if (busy || !state.equippedEquipment.includes(id)) return;
    if (pendingItem) {
      if (replacementIds.includes(id)) commit({ type: 'equip', id: pendingItem.id, replaceId: id });
      return;
    }
    if (replacementSlot && replacementSlot.id !== id) return;
    setReplacementSlotId(replacementSlot?.id === id ? null : id);
  };
  return <div className="gym-panel gm-inventory">
    <div className="collection-sections"><div className="collection-tab-panel">
        <div className="gm-inventory-split-head"><h3>装备台<small>{state.equippedEquipment.length} / {capacity}</small></h3><h3>仓库<small>{owned.length} 件</small></h3></div>
        <div className="gm-inventory-workbench">
          <div ref={slots} className={`gm-slot-row${pendingItem || replacementSlot ? ' is-replacing' : ''}${replacementSlot ? ' is-slot-selected' : ''}`} role="group" aria-label="馆内生效的器材">{Array.from({ length: capacity }, (_, index) => {
            const item = equipmentById.get(state.equippedEquipment[index]);
            const available = !!pendingItem && !!item && replacementIds.includes(item.id);
            const selectedSlot = replacementSlot?.id === item?.id && !!item;
            const disabled = busy || !item || (pendingItem ? !available : !!replacementSlot && !selectedSlot);
            return <button type="button" className={`gm-slot${available ? ' is-replaceable' : ''}${selectedSlot ? ' is-selected-slot' : ''}`} data-equipment-id={item?.id} key={index} disabled={disabled} aria-pressed={selectedSlot} aria-label={pendingItem && item ? `用${pendingItem.name}替换${item.name}` : item ? `${item.name}装备位` : '空装备位'} onClick={() => item && chooseSlot(item.id)}><span className="gm-slot-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span className="gm-slot-art">{item ? <ProductImage id={item.artId} name={item.name} /> : <span aria-hidden="true">＋</span>}</span><strong title={item?.name}>{item?.name ?? '空装备位'}</strong>{(available || selectedSlot) && <span className="gm-slot-target-label" aria-hidden="true">{selectedSlot ? '待替换' : '点击替换'}</span>}</button>;
          })}</div>
          <div className="gm-products gm-shop-grid gm-inventory-list" role="region" aria-label="器材仓库" tabIndex={0}>{warehouse.map(item => <EquipmentCard key={item.id} {...{ item, state, onAction, busy }} inventory selectedForEquip={pendingEquipment === item.id} replacementMode={!!replacementSlot} replacementAllowed={!replacementSlot || !equippedFamilyEquipment(state, item.id) || equippedFamilyEquipment(state, item.id)?.id === replacementSlot.id} onEquip={() => equip(item)} onDetails={() => setSelected(item)} />)}{owned.length === 0 && <div className="gm-empty"><GameIcon name="bag" /><h4>还没有器材</h4><p className="gm-muted">推荐球员取得赞助券后，可到商店购入器材。</p></div>}</div>
        </div>
        {pendingItem && <section className="gm-selected-drawer gm-replacement-note" role="status"><div className="gm-selected-drawer-heading"><span>待装备</span><h3>{pendingItem.name}</h3><button type="button" className="gm-info-button" disabled={busy} onClick={() => setPendingEquipment(null)}>取消替换</button></div>{familyItem && <EquipmentReplacementChanges state={state} itemId={pendingItem.id} replaceId={familyItem.id} />}<p>{familyItem ? `同类仅启用一件，点击左侧高亮的「${familyItem.name}」替换。` : '装备栏已满，点击左侧高亮器材位完成替换。'}旧器材留在仓库。</p></section>}
        {replacementSlot && <section className="gm-selected-drawer gm-replacement-note" role="status"><div className="gm-selected-drawer-heading"><span>待替换</span><h3>{replacementSlot.name}</h3><button type="button" className="gm-info-button" disabled={busy} onClick={() => setReplacementSlotId(null)}>取消替换</button></div><p>选择右侧仓库器材替换此位置；灰色按钮表示同类冲突。旧器材留在仓库。{replacementSlot.effects.stamina > 0 && '若体力上限降低，超出部分会截断。'}</p></section>}
        {Object.keys(state.legacyEquipmentCollection ?? {}).length > 0 && <p className="gm-muted gm-inventory-legacy">历史器材收藏 {Object.keys(state.legacyEquipmentCollection ?? {}).length} 件已留档，不计入当前 {equipmentCatalog.length} 件器材的收藏进度。</p>}
        <footer className="gm-inventory-bottom"><span>器材全馆共享 · 同类仅启用一件</span><small>详情内可移出 / 半价出售</small></footer>
    </div></div>
    {selected && state.ownedEquipment.includes(selected.id) && <EquipmentDetail item={selected} state={state} onClose={() => setSelected(null)} actions={<div className="gm-inventory-management"><button type="button" className={`album-back${state.equippedEquipment.includes(selected.id) ? '' : ' gm-equipment-sell'}`} disabled={busy} onClick={() => { if (state.equippedEquipment.includes(selected.id)) commit({type: 'unequip', id: selected.id}); else { setManagement({id: selected.id}); setPendingEquipment(null); } }}>{state.equippedEquipment.includes(selected.id) ? '移入仓库' : `半价出售 · 返 ${equipmentSaleValue(state, selected.id)} 券`}</button></div>} />}
    {management && managed && canManage && <ComicDialog title="出售仓库器材" onClose={() => setManagement(null)} priority={2}><div className="gym-panel gm-stack">
      <h3>出售「{managed.name}」返还 {equipmentSaleValue(state, managed.id)} 券</h3><p>按记录购入价的一半返还，向下取整；出售后收藏保留，需要时可按商店现价重新购买。</p>
      <div className="gm-actions"><button type="button" className="gm-button" onClick={() => setManagement(null)}>保留器材</button><button type="button" className="gm-button gm-primary" disabled={busy} onClick={() => commit({ type: 'sell-equipment', id: managed.id })}>确认出售 · 返 {equipmentSaleValue(state, managed.id)} 券</button></div>
    </div></ComicDialog>}
  </div>;
}

export function GymRecommendPanel({ state, onAction, onClose }: GymPanelProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const detailsId = useId();
  const player = state.player;
  if (!player) return <div className="gym-panel gm-empty"><GameIcon name="people" /><h3>目前没有在训球员</h3><p className="gm-muted">返回训练馆，免费招募下一名球员。</p>{onClose && <button type="button" className="gm-button" onClick={onClose}>返回训练馆</button>}</div>;
  const reward = recommendationPayout(state);
  const cooperation = cooperationStatus(state);
  return <div className="gym-panel gm-recommend-panel">
    <div className="gm-recommend-profile"><PlayerHeading player={player} value={playerValue(state, player)} /><button type="button" className="gm-training-help gm-recommend-help" aria-label="查看推荐说明" title="推荐说明" onClick={() => setShowRules(true)}>?</button></div>
    <div className="gm-recommend-rewards"><div><span>赞助券合计</span><b>+{reward.credits}</b></div><div><span>球馆声望合计</span><b>+{format(reward.fame)}</b></div></div>
    <div className="gm-recommend-achievements" aria-label="本次培养成果"><span>训练 <b>{format(player.shots)}</b> 球</span><span>完成 <b>{format(player.training.completedCourses)}</b> 课</span><span>净成长 <b>+{format(reward.growth)}</b></span></div>
    {reward.tier === 0 && <p className="gm-recommend-warning">未匹配模板，本次0券；可继续培养或免费换人。</p>}
    {reward.repeatTemplate && <p className="gm-recommend-warning" role="status">重复模板，本次合计{reward.credits}券，声望照常。</p>}
    {reward.isFirstPostgameRecommendation && <p className="gm-recommend-warning" role="status">首次推荐，基础按模板档次结算；之后同模板基础{postgameRepeatTemplateCredits}券，其他加奖照常叠加。</p>}
    {cooperation.offer && (cooperation.complete ? <p className="gm-recommend-cooperation is-complete">合作奖励 · 已达标</p> : <p className="gm-recommend-cooperation">「{cooperation.offer.name}」未达标，推荐后结束。</p>)}
    <button type="button" className="gm-info-button gm-recommend-details-toggle" aria-expanded={detailsOpen} aria-controls={detailsId} onClick={() => setDetailsOpen(!detailsOpen)}>{detailsOpen ? '收起结算明细' : '查看结算明细'}<span aria-hidden="true">{detailsOpen ? '−' : '+'}</span></button>
    {detailsOpen && <div className="gm-stack gm-recommend-details" id={detailsId} aria-label="推荐结算明细">
      <section className="gm-paper gm-stack gm-recommend-credit-detail"><h4>赞助券明细</h4><dl className="gm-reward-breakdown"><div><dt>{reward.repeatTemplate ? '重复模板基础' : `模板基础 · ${reward.tierName}`}</dt><dd>+{reward.baseCredits} 券</dd></div><div><dt>培养加奖 · Lv.{player.level} · {reward.tierName}</dt><dd>+{reward.trainingCredits} 券</dd></div><div><dt>合作奖励{cooperation.offer ? ` · ${cooperation.complete ? '已达标' : '未达标'}` : ' · 未接取'}</dt><dd>+{reward.tier > 0 && cooperation.complete ? reward.cooperationCredits - cooperation.equipmentCredits : 0} 券</dd></div><div><dt>器材加奖</dt><dd>+{reward.tier > 0 && cooperation.complete ? cooperation.equipmentCredits : 0} 券</dd></div><div className="gm-reward-actual"><dt>实际入账</dt><dd>+{reward.credits} 券</dd></div></dl>{reward.repeatTemplate && <p className="gm-muted">重复模板基础1券，培养、合作与器材加奖照常叠加；声望照常结算。</p>}</section>
      <section className="gm-paper gm-stack"><h4>声望明细</h4><dl className="gm-reward-breakdown"><div><dt>属性培养声望</dt><dd>+{format(reward.rawFame)}</dd></div><div><dt>课程与培养期间品牌加成</dt><dd>+{format(reward.baseFame - reward.rawFame)}</dd></div><div><dt>合作额外声望</dt><dd>+{format(reward.cooperationFame)}</dd></div></dl></section>
      <section className="gm-stack"><h4>球员六维</h4><PlayerStats stats={player.stats} /></section>
    </div>}
    <div className="gm-sheet-footer"><p className="gm-muted">{templateById(player.templateId) ? '确认后离馆入档，收藏保留；空位可免费补招。' : '确认后离馆，不进入校友档案；空位可免费补招。'}</p><div className="gm-actions">{onClose && <button type="button" className="gm-button" onClick={onClose}>继续培养</button>}<button type="button" className="gm-button gm-primary" onClick={() => onAction({ type: 'recommend', id: player.id })}>确认推荐 · +{reward.credits} 券</button></div></div>
    {showRules && <ComicDialog title="推荐说明" onClose={() => setShowRules(false)}><div className="gym-panel gm-training-rules">
      <section className="gm-stack"><h3>发券规则</h3><RecommendationCreditRule state={state} /><p>升级球馆不重置首次资格。每次按本次推荐时的等级、合作与器材培养成果结算加奖。</p></section>
      <section className="gm-stack"><h3>培养加奖</h3><table className="gm-training-bonus-table"><thead><tr><th scope="col">等级与模板</th><th scope="col">培养加奖</th></tr></thead><tbody>{trainingCreditMilestones.map(milestone => <tr key={milestone.level}><td>Lv.{milestone.level}＋{recommendationTierNames[milestone.tier]}及以上</td><td>+{milestone.credits} 券</td></tr>)}</tbody></table></section>
      <section className="gm-stack"><h3>声望与离馆</h3><p>声望来自属性净成长、完整课程、培养期间的平均品牌加成及已完成合作。</p></section>
      <button type="button" className="gm-button gm-primary" onClick={() => setShowRules(false)}>返回结算</button>
    </div></ComicDialog>}
  </div>;
}

function AlumnusDetail({ player, count = 1, onClose }: { player: GymAlumnus; count?: number; onClose: () => void }) {
  return <ComicDialog title="校友档案" variant="album" className="gm-detail-dialog" onClose={onClose}>
    <div className="gym-panel"><PlayerHeading player={player} value={player.finalValue} alumnus />{count > 1 && <p className="gm-alumni-group-note">同模板共 {count} 份，当前展示最近一次推荐记录。</p>}<PlayerStats stats={player.stats} /><div className="gm-paper gm-stack"><h4>推荐记录</h4><p>{new Date(player.recommendedAt).toLocaleString('zh-CN')}</p><p>赞助券 +{player.rewardCredits} · 球馆声望 +{format(player.rewardFame)}</p><p className="gm-muted">累计出手 {format(player.shots)} 次 · 离馆体力 {player.stamina}</p></div><button type="button" className="gm-button" onClick={onClose}>返回校友簿</button></div>
  </ComicDialog>;
}

export function GymAlumniPanel({ state, loadAlumni }: GymPanelProps) {
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<GymAlumniGroup | null>(null);
  const [loaded, setLoaded] = useState<GymAlumnus[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const progress = alumniProgress(state);
  const offset = page * 20;
  useEffect(() => { setPage(0); setSelected(null); }, [state.createdAt, state.seed]);
  useEffect(() => {
    if (!loadAlumni) return;
    let cancelled = false;
    setLoading(true); setLoadError(''); setLoaded([]);
    loadAllGymAlumni(loadAlumni).then(players => { if (!cancelled) setLoaded(players); })
      .catch(() => { if (!cancelled) setLoadError('校友档案暂时无法读取，原记录已保留，请重试。'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadAlumni, progress.total, state.createdAt, state.seed, retry]);
  const groups = useMemo(() => groupGymAlumni(loadAlumni ? loaded : state.alumni), [loadAlumni, loaded, state.alumni]);
  const all = groups.slice(offset, offset + 20);
  useEffect(() => { setPage(value => Math.min(value, Math.max(0, Math.ceil(groups.length / 20) - 1))); }, [groups.length]);
  return <div className="gym-panel gm-alumni-panel">
    <header className="gm-alumni-heading"><span><GameIcon name="career"/></span><div><small>传奇球馆 · 校友簿</small><h3>从这里，走向更大的球场</h3></div></header>
    <dl className="gm-alumni-totals"><div><dt>累计推荐</dt><dd>{format(progress.total)}<small> 人</small></dd></div><div><dt>传奇校友</dt><dd>{format(progress.legendCount)}<small> 人</small></dd></div><div><dt>收录模板</dt><dd>{loading || loadError ? '—' : groups.filter(group => !!group.player.templateId).length}<small> 种</small></dd></div></dl>
    {progress.total > 0 && <div className="gm-alumni-section-title"><h4>校友名录</h4><span>同模板合并展示</span></div>}
    {progress.total === 0 ? <div className="gm-empty"><GameIcon name="career" /><h3>第一份校友档案正在等你</h3><p className="gm-muted">推荐已发掘模板的球员后，最终模板、六维、身价和推荐成果会留在这里。</p></div> : <div className="gm-alumni-list">{all.map(group => {
      const {player, count} = group;
      const template = templateById(player.templateId);
      const tier = template?.tier ?? 'undiscovered';
      const name = `${gymPlayerName(player)}${count > 1 ? `(${count})` : ''}`;
      return <button type="button" key={group.key} className="gm-alumnus" data-tier={tier} aria-label={`查看${name}校友档案`} onClick={() => setSelected(group)}><span className="gm-alumnus-image tier-portrait-frame" data-tier={tier}><span className="gm-alumni-portrait-surface album-portrait-surface"><PlayerPortrait player={player} /></span></span><div className="gm-alumnus-copy"><strong>{name}</strong><span><TierBadge tier={template?.tier}/> <small>Lv.{player.level}</small></span><small>最终身价</small><b>{money(player.finalValue)}</b></div><span className="gm-alumnus-open" aria-hidden="true">›</span></button>;
    })}</div>}
    {loading && <p className="gm-muted" role="status">正在读取校友档案…</p>}
    {loadError && <div className="gm-stack"><p className="gm-recommend-warning" role="alert">{loadError}</p><button type="button" className="gm-button" onClick={() => setRetry(value => value + 1)}>重新读取档案</button></div>}
    {groups.length > 20 && !loadError && <nav className="gm-actions" aria-label="校友档案分页"><button type="button" className="gm-button" disabled={loading || page === 0} onClick={() => setPage(value => value - 1)}>上一页</button><span>第 {page + 1} / {Math.ceil(groups.length / 20)} 页</span><button type="button" className="gm-button" disabled={loading || offset + 20 >= groups.length} onClick={() => setPage(value => value + 1)}>下一页</button></nav>}
    {selected && <AlumnusDetail player={selected.player} count={selected.count} onClose={() => setSelected(null)} />}
  </div>;
}

const albumStatColors = ['#e65c21', '#e1ac23', '#ed712a', '#25886b', '#2788ac', '#b82e27'];

function TemplateDetail({ template, state, onClose }: { template: TemplateRule; state: GymState; onClose: () => void }) {
  const record = state.collection[template.id];
  const profile = usePlayerProfile(template.id);
  return <ComicDialog title="球星档案" variant="album" className="collection-detail-dialog album-detail-dialog" onClose={onClose}>
    <article className="album-detail">
      <header className="album-hero"><div className="album-hero-photo tier-portrait-frame" data-tier={template.tier}><div className="collection-photo"><StarPortrait src={profile?.avatar ?? templatePortrait(template.id)} fallbackSrc={templatePortrait(template.id)} name={profile?.name ?? template.name} /></div></div><div className="album-hero-info"><h3>{profile?.name ?? template.name} <TierBadge tier={template.tier} className="album-tier" /></h3><p className="album-style">{template.style}</p><dl className="album-requirements"><div><dt>最低等级</dt><dd><AlbumIcon name="level" /><span>训练</span><b>+{template.minLevel}</b></dd></div><div><dt>身高要求</dt><dd><AlbumIcon name="height" /><b>{template.height[0]}–{template.height[1]}</b><span>cm</span></dd></div><div><dt>位置</dt><dd><AlbumIcon name="position" /><strong>{positionLabels[template.position]}</strong></dd></div></dl></div></header>
      <MatchingRequirements template={template} />
      <section className="album-section"><h3>标准六维</h3><div className="album-stats">{statKeys.map((key, index) => <div key={key} style={{ '--stat-color': albumStatColors[index] } as CSSProperties}><AlbumIcon name={key} /><span>{statLabels[key]}</span><b>{template.stats[key]}</b><div className="album-stat-track" role="meter" aria-label={statLabels[key]} aria-valuenow={template.stats[key]} aria-valuemin={0} aria-valuemax={99}><i style={{ width: `${template.stats[key] / 99 * 100}%` }} /></div></div>)}</div></section>
      {record && <section className="album-section gm-album-record"><h3>收录记录</h3><p>{new Date(record.firstAt).toLocaleDateString('zh-CN')} · 最高综合 {format(record.highestRating)}</p><p>历史最高身价 {money(record.highestValue)}</p></section>}
      <button type="button" className="album-back" onClick={onClose}><span aria-hidden="true">‹</span> 返回图鉴</button>
    </article>
  </ComicDialog>;
}

function GymAlbumEntry({ template, collected, onSelect }: { template: TemplateRule; collected: boolean; onSelect: () => void }) {
  const profile = usePlayerProfile(collected ? template.id : null);
  return <button type="button" data-tier={template.tier} className={`album-card ${collected ? 'discovered' : 'collection-locked'}`} disabled={!collected} onClick={onSelect} aria-label={collected ? `查看${template.name}档案` : '未知球星'}><span className="collection-photo tier-portrait-frame" data-tier={template.tier}>{collected ? <StarPortrait src={profile?.avatar ?? templatePortrait(template.id)} fallbackSrc={templatePortrait(template.id)} name={profile?.name ?? template.name} /> : <svg className="album-unknown" viewBox="0 0 120 130" aria-hidden="true"><path d="m7 130 3-22q1-10 19-16l16-9V72q-8-8-9-22-6-2-5-10l3-3q-3-27 12-29 22-15 35 6 9 9 5 23l3 4q1 8-6 10-1 13-9 21v11l17 9q19 5 20 16l3 22Z" /><text x="60" y="81" textAnchor="middle">?</text></svg>}</span><b><span>{collected ? template.name : '未知球星'}</span></b></button>;
}

export function GymCollectionPanel({ state, initialTab = 0 }: GymPanelProps & {initialTab?: 0 | 1}) {
  const [tab, setTab] = useState<number>(initialTab);
  const [selected, setSelected] = useState<string | null>(null);
  const stars = albumTemplates.filter(template => !!state.collection[template.id]);
  const equipment = equipmentCatalog.filter(item => !!state.collectedEquipment[item.id]);
  const count = tab === 0 ? stars.length : equipment.length;
  const total = tab === 0 ? albumTemplates.length : equipmentCatalog.length;
  const selectedTemplate = tab === 0 ? albumTemplates.find(template => template.id === selected && !!state.collection[template.id]) : undefined;
  const selectedEquipment = tab === 1 && selected ? equipmentById.get(selected) : undefined;
  return <div className="gm-collection">
    <SlidingTabs labels={['球星图鉴', '器材图鉴']} label="图鉴分类" index={tab} onChange={index => { setTab(index); setSelected(null); }}>
      <div className={`album-view${tab === 1 ? ' equipment-album' : ''}`}>
        <div className="album-progress"><strong>收集进度</strong><progress value={count} max={total} aria-label={tab === 0 ? '球星收藏进度' : '器材收藏进度'} /><b>{count} / {total}</b></div>
        {tab === 1 && Object.keys(state.legacyEquipmentCollection ?? {}).length > 0 && <p className="gm-legacy-album-note">历史器材收藏 {Object.keys(state.legacyEquipmentCollection ?? {}).length} 件已留档，不计入当前 {equipmentCatalog.length} 件器材的收藏进度。</p>}
        {tab === 0 ? <div key="stars" className="album-grid contract-collection" role="region" aria-label="全部球星图鉴" tabIndex={0}>{albumTemplates.map(template => <GymAlbumEntry key={template.id} template={template} collected={!!state.collection[template.id]} onSelect={() => setSelected(template.id)} />)}</div> : <div key="equipment" className="equipment-album-grid" role="region" aria-label="全部器械图鉴" tabIndex={0}>{equipmentCatalog.map(item => {
          const collected = !!state.collectedEquipment[item.id];
          return <button type="button" key={item.id} className={`equipment-album-card ${collected ? `is-unlocked rarity-${item.rarity}` : 'is-unknown'}`} onClick={() => setSelected(item.id)} aria-label={`查看${item.name}器材档案`}>{collected ? <ProductImage id={item.artId} name={item.name} /> : <EquipmentMystery />}<strong>{collected ? item.name : '未知器械'}</strong></button>;
        })}</div>}
      </div>
    </SlidingTabs>
    {selectedTemplate && <TemplateDetail template={selectedTemplate} state={state} onClose={() => setSelected(null)} />}
    {selectedEquipment && <EquipmentDetail item={selectedEquipment} state={state} onClose={() => setSelected(null)} />}
  </div>;
}
