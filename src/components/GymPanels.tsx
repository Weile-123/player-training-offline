import {useState} from 'react';
import {statLabels} from '../game/config';
import {templateRules, type TemplateRule} from '../game/contract/templates';
import {equipmentCatalog, gymLevels, projects, type GymEquipment, type ProjectId} from '../game/gym/catalog';
import {automaticIntervalMs, cooperationOffers, cooperationStatus, courseRecoveryCap, drinkPrice, drinkRecovery, effectiveTrainingBias, equipmentCapacity, equipmentEffects, equipmentOffer, gymUpgrade, playerLevelCap, playerValue, projectOffer, recommendation, recoverySeconds, requiredExperience, staminaMax, trainingCreditMilestones, trainingPlans, trainingStatus, type CooperationOffer, type GymAction, type GymAlumnus, type GymPlayer, type GymState, type TrainingPlanId} from '../game/gym/engine';
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
import './GymPanels.css';

export type GymPanelProps = {
  state: GymState;
  onAction: (action: GymAction) => void;
  onClose?: () => void;
};

const formatNumber = new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 1});
const format = (value: number) => formatNumber.format(value);
const rarityLabels = {common: '普通', rare: '稀有', legendary: '传说'};
const equipmentById = new Map(equipmentCatalog.map(item => [item.id, item]));
const tierOrder = ['rotation', 'starter', 'star', 'superstar', 'legend'];
const albumTemplates = [...templateRules].sort((a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier));
const effectLabels = {stamina: '体力容量', recovery: '恢复护理', focusPower: '专项成长', courseRecovery: '课程恢复', cooperationBonus: '合作奖励', valuePercent: '身价与品牌'};
const recommendationTierNames = ['待发掘', '替补', '首发', '全明星', '巨星', '传奇'];

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
    case 'equipment': return `同时启用 ${equipmentCapacity(preview)} 件器材`;
    case 'automation': return `自动训练 ${format(automaticIntervalMs(preview) / 1000)} 秒/球，球馆 Lv.2 免费解锁开关`;
    case 'offline': return '后续开放离线训练，当前离线恢复体力';
  }
}

export function GymClubPanel({state, onAction}: GymPanelProps) {
  const current = gymLevels.find(level => level.level === state.gymLevel)!;
  const upgrade = gymUpgrade(state);
  return <div className="gym-panel gm-club">
    <div className="gm-club-heading"><b className="gm-club-level">{state.gymLevel}</b><div><p className="gm-eyebrow">球馆等级</p><h3>{current.name}</h3><p className="gm-muted">{state.gymLevel} 个训练位 · 手动训练当前选中球员</p></div></div>
    <div className="gm-level-track" aria-label={`当前球馆 ${state.gymLevel} 级，最高 8 级`}>{gymLevels.map(level => <span key={level.level} className={`${level.level <= state.gymLevel ? 'is-reached' : ''} ${level.level === state.gymLevel ? 'is-current' : ''}`} title={level.name}>{level.level}</span>)}</div>
    <dl className="gm-metrics"><div><dt>累计声望</dt><dd>{format(state.fame)}</dd></div><div><dt>已推荐球员</dt><dd>{format(state.alumni.length)}</dd></div></dl>
    {upgrade.level ? <section className="gm-paper gm-stack" aria-label="下一球馆升级条件">
      <div className="gm-section-heading"><h4>下一馆级 · {upgrade.level.name}</h4><small>Lv.{upgrade.level.level}</small></div>
      {upgrade.requirements.map(requirement => <div className="gm-stack" key={requirement.label}>
        <div className={`gm-condition${requirement.met ? ' is-met' : ''}`}><span>{requirement.label}</span><b>{requirement.label.includes('推荐档次') ? requirement.met ? '已达成 ✓' : '尚未达成' : `${format(requirement.current)} / ${format(requirement.required)}${requirement.met ? ' ✓' : ''}`}</b></div>
        <progress className="gm-progress" value={Math.min(requirement.current, requirement.required)} max={requirement.required || 1} aria-label={requirement.label}/>
      </div>)}
      <p className="gm-muted">晋级免费，累计声望保留。提高馆级可开放更多器材和项目等级。</p>
      <button type="button" className="gm-button gm-primary" disabled={!upgrade.canUpgrade} onClick={() => onAction({type: 'upgrade-gym'})}>{upgrade.canUpgrade ? '免费升级球馆' : upgrade.reason ?? '尚未达到晋级条件'}</button>
    </section> : <p className="gm-inline-status">已达到当前最高馆级。继续培养球员、收集模板与器材。</p>}
    <Wallet credits={state.credits}/>
    <div className="gm-section-heading"><h3>球馆经营项目</h3><small>跨球员持续生效</small></div>
    <div className="gm-projects">{projects.map(project => {
      const offer = projectOffer(state, project.id);
      const canBuy = project.available && offer.price !== null && state.credits >= offer.price;
      const reason = !project.available ? '功能开放后可升级' : offer.reason ?? (offer.price !== null && state.credits < offer.price ? '赞助券不足' : '');
      return <article className={`gm-project${project.available ? '' : ' is-future'}`} key={project.id}>
        <div className="gm-project-heading"><h4>{project.name}</h4><span>Lv.{offer.level} / {project.maxLevel}</span></div>
        <p className="gm-muted">{project.description}</p>
        <div className="gm-project-effects"><span>当前 · {projectEffect(state, project.id, offer.level)}</span>{project.available && offer.level < project.maxLevel && <strong>下级 · {projectEffect(state, project.id, offer.level + 1)}</strong>}</div>
        <div className="gm-project-footer"><p className="gm-muted">{reason || `当前馆级最高可升至 Lv.${offer.maxLevel}`}</p><button type="button" className="gm-button gm-primary" disabled={!canBuy} onClick={() => onAction({type: 'upgrade-project', id: project.id})}>{!project.available ? '后续开放' : offer.price === null ? offer.level >= project.maxLevel ? '已升满' : '暂不可升级' : `升级 · ${offer.price} 券`}</button></div>
      </article>;
    })}</div>
  </div>;
}

export function GymRosterPanel({state, onAction, onAlumni}: GymPanelProps & {onAlumni?: () => void}) {
  const [preference, setPreference] = useState<'any' | 'guard' | 'forward' | 'center'>('any');
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
        <div className="contract-actions contract-roster-actions"><button type="button" className="primary" disabled={selected} onClick={() => onAction({type: 'select-player', id: player.id})}><GameIcon name="train"/><span>{selected ? '当前选中' : '选择训练'}</span></button><button type="button" className={`secondary${player.autoEnabled ? ' signing-button' : ''}`} role="switch" aria-label={`${player.name}自动训练`} aria-checked={player.autoEnabled} disabled={state.gymLevel < 2 || capped && !player.autoEnabled} onClick={() => onAction({type: 'set-auto', id: player.id, enabled: !player.autoEnabled})}><GameIcon name="rest"/><span>{state.gymLevel < 2 ? 'Lv.2 免费解锁自动' : player.autoEnabled ? '暂停自动' : capped ? '已满级' : '开启自动'}</span></button></div>
      </article>;
    })}</div>
    {freeSeats > 0 && <section className="gm-roster-recruit"><h3>空余 {freeSeats} 个训练位</h3><p>免费迎接新人，带着满体力入馆。</p>{state.gymLevel >= 2 && <select aria-label="名册新人身高偏好" value={preference} onChange={event => setPreference(event.target.value as typeof preference)}><option value="any">不限身高</option><option value="guard">后卫型 178–194 cm</option><option value="forward">锋线型 195–205 cm</option><option value="center">内线型 206–218 cm</option></select>}<button type="button" className="primary" onClick={() => onAction({type: 'recruit', preference})}><GameIcon name="people"/>免费招募新人</button></section>}
    <p className="roster-intro">{state.gymLevel < 2 ? '球馆 Lv.2 免费开放自动训练；当前先手动培养第一位球员。' : '开启自动后该球员暂停手动投篮；体力不足时等待恢复，恢复后继续。自动仅在训练馆页面可见时进行，离开后不补投篮。'}</p>
    {onAlumni && <button type="button" className="secondary" onClick={onAlumni}><GameIcon name="career"/>查看校友档案 · {state.alumni.length} 人</button>}
  </div>;
}

export function GymTrainingPanel({state, onAction}: GymPanelProps) {
  const [pendingPlan, setPendingPlan] = useState<{id: TrainingPlanId; playerId: string} | null>(null);
  const player = state.player;
  if (!player) return <div className="gym-panel gm-empty"><GameIcon name="train"/><h3>先迎接一位新人</h3><p className="gm-muted">招募球员后，可以为他选择训练计划。</p></div>;
  const progress = trainingStatus(state);
  const topDimensions = (bias: Stats) => [...statKeys].sort((first, second) => bias[second] - bias[first]).slice(0, 2).map(key => statLabels[key]).join('、');
  const effects = equipmentEffects(state);
  const equipmentFocus = statKeys.filter(key => effects.focus[key] > 0).map(key => statLabels[key]);
  const selectPlan = (id: TrainingPlanId) => {
    if (id === progress.plan.id) return;
    if (progress.shots > 0) setPendingPlan({id, playerId: player.id});
    else onAction({type: 'set-training-plan', id, playerId: player.id});
  };
  return <div className="gym-panel">
    <section className="gm-plan-summary" aria-label="当前训练课程">
      <div className="gm-section-heading"><div><p className="gm-eyebrow">当前计划</p><h3>{progress.plan.name}</h3></div><span className="gm-course-count">已完成 {progress.completedCourses} 课</span></div>
      <div className="gm-condition"><span>本课有效投篮</span><b>{progress.shots} / 10 球</b></div>
      <progress className="gm-progress" value={progress.shots} max={10} aria-label="本课有效投篮进度"/>
      <p>完成本课恢复 {progress.recovery} 点体力，超过体力上限的部分不计入。</p>
      <p className="gm-muted">每课基础恢复 4 点；球馆 Lv.{state.gymLevel} 的器材额外恢复上限 +{courseRecoveryCap(state)}，当前已生效 +{effects.courseRecovery}。</p>
      <p className="gm-muted">每 10 次有效投篮完成一课，三种训练结果均计入；冷却中或体力不足的点击不计入。</p>
    </section>
    <section className="gm-paper gm-stack" aria-label="球员能力与成长倾向"><div className="gm-section-heading"><h4>球员能力与成长倾向</h4><small>{player.name}</small></div><PlayerStats stats={player.stats}/><p><b>天赋倾向</b> · {topDimensions(player.bias)}</p><p><b>当前成长倾向</b> · {topDimensions(effectiveTrainingBias(state))}</p><p className="gm-muted">{progress.plan.focusKeys.length ? `当前专项更容易提升${progress.plan.focusKeys.map(key => statLabels[key]).join('、')}。` : '当前基础训练沿用球员原生偏好。'}{equipmentFocus.length ? `已启用器材额外偏向${equipmentFocus.join('、')}。` : '当前没有提供专项成长加权的器材。'}</p><p className="gm-muted">可以继续强化长处，也可以选专项补足短板；倾向不保证下一球必涨对应属性。</p></section>
    <div className="gm-section-heading"><h3>选择培养方向</h3><small>免费切换</small></div>
    <div className="gm-plan-grid">{trainingPlans.map(plan => {
      const current = plan.id === progress.plan.id;
      return <article className={`gm-plan-card${current ? ' is-selected' : ''}`} key={plan.id}>
        <div className="gm-plan-title"><h4>{plan.name}</h4>{current && <span>正在进行</span>}</div>
        <div className="gm-plan-targets">{plan.focusKeys.length ? plan.focusKeys.map(key => <span key={key}>{statLabels[key]}</span>) : <span>原生偏好 · 六维基础</span>}</div>
        <p className="gm-muted">{plan.description}</p>
        <button type="button" className={`gm-button${current ? '' : ' gm-primary'}`} disabled={current} onClick={() => selectPlan(plan.id)}>{current ? '当前计划' : '选择此计划'}</button>
      </article>;
    })}</div>
    <p className="gm-use-note">切换计划会将尚未完成的本课投篮进度清零；已完成课数、球员属性和获得的模板保留。专项提高对应属性的成长抽取权重，经验升满后才按原成长规则增加属性。</p>
    <section className="gm-paper gm-stack"><h4>培养加奖</h4><p className="gm-muted">推荐时，{trainingCreditMilestones.map(milestone => `Lv.${milestone.level} 且达到${recommendationTierNames[milestone.tier]}及以上，额外 +${milestone.credits} 券`).join('；')}。只取最高达标档，基础券与合作奖励另计。完整课程仍可提高培养声望。</p></section>
    {pendingPlan && <ComicDialog title="切换训练计划" onClose={() => setPendingPlan(null)}>
      <div className="gym-panel"><p>当前课程已训练 {progress.shots}/10 球。切换到「{trainingPlans.find(plan => plan.id === pendingPlan.id)?.name}」后，本课进度将从 0 球开始。</p><p className="gm-muted">已完成的 {progress.completedCourses} 节课程和球员成长保留。</p><div className="gm-actions"><button type="button" className="gm-button" onClick={() => setPendingPlan(null)}>继续当前课程</button><button type="button" className="gm-button gm-primary" onClick={() => {onAction({type: 'set-training-plan', id: pendingPlan.id, playerId: pendingPlan.playerId}); setPendingPlan(null);}}>确认切换</button></div></div>
    </ComicDialog>}
  </div>;
}

export function GymCooperationPanel({state, onAction}: GymPanelProps) {
  const [pending, setPending] = useState<{offer: CooperationOffer | null; playerId: string} | null>(null);
  const player = state.player;
  if (!player) return <div className="gym-panel gm-empty"><GameIcon name="handshake"/><h3>合作机会随新人到来</h3><p className="gm-muted">招募一位球员后，可以从三份培养合作中选择一份。</p></div>;
  const offers = cooperationOffers(state);
  const status = cooperationStatus(state);
  const accept = (offer: CooperationOffer) => {
    if (status.offer) setPending({offer, playerId: player.id});
    else onAction({type: 'accept-cooperation', id: offer.id, playerId: player.id});
  };
  return <div className="gym-panel">
    <Wallet credits={state.credits}/>
    <section className="gm-paper gm-stack"><h3>赞助合作</h3><p>每位球员有三份固定合作，任选一份。接取后开始累计新的投篮与课程，达标后推荐球员，领取额外赞助券与声望。</p><p className="gm-muted">合作没有期限。未完成也能正常推荐，不扣赞助券、不扣声望。</p></section>
    {status.offer && <p className="gm-inline-status" role="status">{status.complete ? `「${status.offer.name}」已达标，推荐时额外获得 ${status.rewardCredits} 券、${status.rewardFame} 声望。` : `正在进行「${status.offer.name}」，继续培养即可推进合作。`}</p>}
    <div className="gm-cooperation-list">{offers.map(offer => {
      const active = status.offer?.id === offer.id;
      const target = active ? status : cooperationStatus(state, {...player, cooperation: {id: offer.id, playerId: player.id, acceptedShots: player.shots, acceptedCourses: player.training.completedCourses}});
      return <article className={`gm-cooperation${active ? ' is-active' : ''}${active && status.complete ? ' is-ready' : ''}`} key={offer.id}>
        <div className="gm-cooperation-title"><h4>{offer.name}</h4><span>{active ? status.complete ? '已达标' : '进行中' : '可选择'}</span></div>
        <p className="gm-muted">{offer.description}</p>
        <div className="gm-cooperation-reward"><span>额外 +{active ? status.rewardCredits : offer.credits} 券</span><span>+{active ? status.rewardFame : offer.fame} 声望</span></div>
        <div className="gm-cooperation-conditions">{target.requirements.map(requirement => <div key={requirement.label} className={`gm-stack${requirement.met ? ' is-met' : ''}`}>
          <div className={`gm-condition${requirement.met ? ' is-met' : ''}`}><span>{requirement.label}</span><b className="gm-condition-value">{/档次|模板|档位/.test(requirement.label) ? requirement.met ? '已达成 ✓' : '尚未达成' : `${format(requirement.current)} / ${format(requirement.required)}${requirement.met ? ' ✓' : ''}`}</b></div>
          <progress className="gm-progress" value={Math.min(requirement.current, requirement.required)} max={requirement.required || 1} aria-label={requirement.label}/>
        </div>)}</div>
        {active && status.equipmentCredits > 0 && <p className="gm-muted">奖励已包含当前器材提供的 {status.equipmentCredits} 张合作加券，达标后随推荐一并发放。</p>}
        <button type="button" className={`gm-button${active ? '' : ' gm-primary'}`} disabled={active} onClick={() => accept(offer)}>{active ? status.complete ? '推荐时领取合作奖励' : '当前合作' : status.offer ? '更换为此合作' : '接取合作'}</button>
      </article>;
    })}</div>
    {status.offer && <button type="button" className="gm-info-button" onClick={() => setPending({offer: null, playerId: player.id})}>放弃当前合作</button>}
    <p className="gm-use-note">更换或放弃合作会清空这份合作的新增球数、课数进度；再次接取从新基线开始。球员属性、已完成课程和球星收藏保留。</p>
    {pending && <ComicDialog title={pending.offer ? '更换赞助合作' : '放弃赞助合作'} onClose={() => setPending(null)}><div className="gym-panel"><p>{pending.offer ? `确认改接「${pending.offer.name}」？新合作从当前投篮数和课数重新累计。` : '确认放弃当前合作？这份合作尚未领取的奖励与进度不会保留。'}</p><p className="gm-muted">此操作不扣赞助券或声望，不影响已经获得的球员属性与课程记录。</p><div className="gm-actions"><button type="button" className="gm-button" onClick={() => setPending(null)}>保留当前合作</button><button type="button" className="gm-button gm-primary" onClick={() => {onAction(pending.offer ? {type: 'accept-cooperation', id: pending.offer.id, playerId: pending.playerId} : {type: 'abandon-cooperation', playerId: pending.playerId}); setPending(null);}}>{pending.offer ? '确认更换' : '确认放弃'}</button></div></div></ComicDialog>}
  </div>;
}

function EquipmentDetail({item, state, onClose}: {item: GymEquipment; state: GymState; onClose: () => void}) {
  const offer = equipmentOffer(state, item.id);
  const collected = !!state.collectedEquipment[item.id];
  return <ComicDialog title="器材档案" variant="album" className="gm-detail-dialog" onClose={onClose}>
    <div className="gym-panel">
      <div className="gm-detail-art"><span className="gm-detail-tag">{rarityLabels[item.rarity]}</span><ProductImage id={item.id} name={item.name}/><h3>{item.name}</h3></div>
      <section className="gm-paper gm-stack"><h4>当前效果</h4><p>{item.description}</p><p className="gm-muted">{equipmentPreview(state, item)}</p></section>
      <section className="gm-paper gm-stack"><h4>取得条件</h4><p>球馆 Lv.{item.unlockLevel}{item.requiredTemplates > 0 && ` · 收藏 ${item.requiredTemplates} 种球星模板`}</p><p>售价 {item.price} 张赞助券</p>{offer.reason && !offer.owned && <p className="gm-muted">{offer.reason}</p>}</section>
      <p className={collected ? 'gm-inline-status' : 'gm-muted'}>{state.equippedEquipment.includes(item.id) ? '已收藏 · 当前已启用' : collected ? '已收藏 · 目前未启用' : offer.price !== null ? '已可购 · 获得后点亮图鉴' : '尚未获得'}</p>
      <button type="button" className="gm-button" onClick={onClose}>返回</button>
    </div>
  </ComicDialog>;
}

function equipmentPreview(state: GymState, item: GymEquipment): string {
  const equipped = state.equippedEquipment.includes(item.id);
  const courseLimit = `球馆 Lv.${state.gymLevel} 的器材额外恢复上限 +${courseRecoveryCap(state)}。`;
  if (!equipped && state.equippedEquipment.length >= equipmentCapacity(state)) return '启用槽位已满，先停用一件器材即可查看本件的启用收益。' + (item.effects.courseRecovery ? courseLimit : '');
  const preview = {...state,
    ownedEquipment: state.ownedEquipment.includes(item.id) ? state.ownedEquipment : [...state.ownedEquipment, item.id],
    equippedEquipment: equipped ? state.equippedEquipment.filter(id => id !== item.id) : [...state.equippedEquipment, item.id],
  };
  const prefix = equipped ? '停用后' : '启用后';
  const benefits: string[] = [];
  if (item.effects.stamina) {
    const balance = state.player ? `当前体力 ${state.player.stamina} → ${Math.min(state.player.stamina, staminaMax(preview))}` : '新人按生效上限获得满体力';
    benefits.push(`${prefix}体力上限 ${staminaMax(state)} → ${staminaMax(preview)}，${balance}。`);
  }
  if (item.effects.recovery) benefits.push(`${prefix}恢复间隔 ${recoverySeconds(state)} → ${recoverySeconds(preview)} 秒/点。`);
  if (item.effects.valuePercent) {
    benefits.push(state.player ? `${prefix}身价 ${money(playerValue(state))} → ${money(playerValue(preview))}；当前培养声望 ${recommendation(state).baseFame} → ${recommendation(preview).baseFame}。` : '品牌效果同时提高展示身价与属性培养声望，不改变模板基础券。');
  }
  if (item.effects.focusKey) benefits.push(`${prefix}${statLabels[item.effects.focusKey]}器材成长加权 ${format(equipmentEffects(state).focus[item.effects.focusKey])} → ${format(equipmentEffects(preview).focus[item.effects.focusKey])}，每次升级的总成长仍按原规则结算。`);
  if (item.effects.courseRecovery) benefits.push(`${prefix}每课恢复 ${trainingStatus(state).recovery} → ${trainingStatus(preview).recovery} 点体力。${courseLimit}${!equipped && equipmentEffects(state).courseRecovery >= courseRecoveryCap(state) ? '该项已达到本馆上限。' : ''}`);
  if (item.effects.cooperationBonus) {
    benefits.push(`${prefix}合作器材加券 ${equipmentEffects(state).cooperationBonus} → ${equipmentEffects(preview).cooperationBonus}；须完成合作且接取后完成至少 2 课，推荐时领取。`);
  }
  return benefits.join(' ');
}

function EquipmentCard({item, state, onAction, onDetails, inventory = false}: GymPanelProps & {item: GymEquipment; onDetails: () => void; inventory?: boolean}) {
  const offer = equipmentOffer(state, item.id);
  const equipped = state.equippedEquipment.includes(item.id);
  const owned = state.ownedEquipment.includes(item.id);
  const full = state.equippedEquipment.length >= equipmentCapacity(state);
  const reason = inventory ? !equipped && full ? '启用槽位已满，可先停用其他器材' : '启停器材不会影响收藏记录' : offer.reason ?? (offer.price !== null && state.credits < offer.price ? '赞助券不足' : '');
  return <article className="gm-product" data-rarity={item.rarity}>
    <div className="gm-product-image"><ProductImage id={item.id} name={item.name}/></div>
    <div className="gm-product-copy"><div className="gm-product-meta"><span>{rarityLabels[item.rarity]}</span><span>球馆 Lv.{item.unlockLevel}</span>{equipped && <span className="gm-equipped">已启用</span>}</div><h4>{item.name}</h4><p className="gm-muted">{item.description}</p>{inventory && <p className="gm-muted">{equipmentPreview(state, item)}</p>}<button type="button" className="gm-info-button" onClick={onDetails}>器材详情 ›</button></div>
    <div className="gm-product-actions"><p className="gm-muted">{reason}</p>
      {owned ? <button type="button" className="gm-button" disabled={!equipped && full} onClick={() => onAction({type: equipped ? 'unequip' : 'equip', id: item.id})}>{equipped ? '停用器材' : '启用器材'}</button> : <button type="button" className="gm-button gm-primary" disabled={offer.price === null || state.credits < offer.price} onClick={() => onAction({type: 'buy-equipment', id: item.id})}>购买 · {item.price} 券</button>}
    </div>
  </article>;
}

function DrinkCard({state, onAction, purchasing}: GymPanelProps & {purchasing: boolean}) {
  const capacity = staminaMax(state);
  const restored = state.player ? Math.max(0, Math.min(drinkRecovery, capacity - state.player.stamina)) : 0;
  return <article className="gm-product">
    <div className="gm-product-image"><ProductImage id="item_005" name="运动饮料"/></div>
    <div className="gm-product-copy"><div className="gm-product-meta"><span>消耗品</span><span>持有 {state.inventory.drink} 瓶</span></div><h4>运动饮料</h4><p className="gm-muted">恢复当前球员 {drinkRecovery} 点体力，超过上限的部分不计入。</p>{state.player && <p className="gm-muted">当前体力 {state.player.stamina}/{capacity} · 本次恢复 {restored} 点</p>}</div>
    <div className="gm-product-actions"><p className="gm-muted">{!state.player ? '招募球员后可使用' : restored === 0 ? '体力已满' : state.inventory.drink === 0 ? '先在商店购买饮料' : ''}</p>
      <button type="button" className="gm-button" disabled={!state.player || restored <= 0 || state.inventory.drink <= 0} onClick={() => {if (state.player) onAction({type: 'use-drink', id: state.player.id});}}>使用饮料</button>
      {purchasing && <button type="button" className="gm-button gm-primary" disabled={state.credits < drinkPrice} onClick={() => onAction({type: 'buy-drink'})}>购买 · {drinkPrice} 券</button>}
    </div>
  </article>;
}

export function GymShopPanel({state, onAction}: GymPanelProps) {
  const [tab, setTab] = useState(0);
  const [effect, setEffect] = useState('all');
  const [rarity, setRarity] = useState('all');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<GymEquipment | null>(null);
  const filtered = equipmentCatalog.filter(item => {
    if (effect !== 'all' && !item.effects[effect as keyof typeof effectLabels]) return false;
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
        <div className="gm-filters"><label>效果<select value={effect} onChange={event => setEffect(event.target.value)}><option value="all">全部效果</option>{Object.entries(effectLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>稀有度<select value={rarity} onChange={event => setRarity(event.target.value)}><option value="all">全部档次</option>{Object.entries(rarityLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>取得状态<select value={status} onChange={event => setStatus(event.target.value)}><option value="all">全部器材</option><option value="available">已可购</option><option value="locked">待解锁</option><option value="owned">已获得</option></select></label></div>
        <p className="gm-muted">共 {filtered.length} 件 · 永久器材获得后进入仓库，启用才生效。</p>
        <div className="gm-products">{filtered.map(item => <EquipmentCard key={item.id} {...{item, state, onAction}} onDetails={() => setSelected(item)}/>)}</div>
        {filtered.length === 0 && <p className="gm-use-note">暂无符合筛选的器材，可调整筛选查看全部货架。</p>}
      </div> : <DrinkCard state={state} onAction={onAction} purchasing/>}
    </SlidingTabs>
    {selected && <EquipmentDetail item={selected} state={state} onClose={() => setSelected(null)}/>}
  </div>;
}

export function GymInventoryPanel({state, onAction}: GymPanelProps) {
  const [tab, setTab] = useState(0);
  const [selected, setSelected] = useState<GymEquipment | null>(null);
  const capacity = equipmentCapacity(state);
  const owned = equipmentCatalog.filter(item => state.ownedEquipment.includes(item.id));
  return <div className="gym-panel">
    <div className="gm-section-heading"><h3>器材启用槽</h3><small>{state.equippedEquipment.length}/{capacity} 已启用</small></div>
    <div className="gm-slot-row" aria-label="当前启用的器材">{Array.from({length: capacity}, (_, index) => {
      const item = equipmentById.get(state.equippedEquipment[index]);
      return <div className="gm-slot" key={index}>{item ? <ProductImage id={item.id} name={item.name}/> : <span aria-label="空槽">＋</span>}</div>;
    })}</div>
    <p className="gm-muted">器材由球馆共享，对所有在训球员生效。未启用的继续保存在仓库；提高上限不会立刻补满体力。</p>
    <SlidingTabs labels={['永久器材', '消耗品']} label="背包分类" index={tab} onChange={setTab}>
      {tab === 0 ? <div className="gm-products">{owned.map(item => <EquipmentCard key={item.id} {...{item, state, onAction}} inventory onDetails={() => setSelected(item)}/>)}{owned.length === 0 && <div className="gm-empty"><GameIcon name="bag"/><h4>仓库还没有器材</h4><p className="gm-muted">用推荐球员获得的赞助券，到商店购买第一件器材。</p></div>}</div> : <DrinkCard state={state} onAction={onAction} purchasing={false}/>}
    </SlidingTabs>
    {selected && <EquipmentDetail item={selected} state={state} onClose={() => setSelected(null)}/>}
  </div>;
}

export function GymRecommendPanel({state, onAction, onClose}: GymPanelProps) {
  const player = state.player;
  if (!player) return <div className="gym-panel gm-empty"><GameIcon name="people"/><h3>目前没有在训球员</h3><p className="gm-muted">返回训练馆，免费招募下一名球员。</p>{onClose && <button type="button" className="gm-button" onClick={onClose}>返回训练馆</button>}</div>;
  const reward = recommendation(state);
  const cooperation = cooperationStatus(state);
  return <div className="gym-panel">
    <PlayerHeading player={player} value={playerValue(state, player)}/>
    <PlayerStats stats={player.stats}/>
    <div className="gm-recommend-rewards"><div><span>赞助券合计</span><b>+{reward.credits}</b></div><div><span>球馆声望合计</span><b>+{format(reward.fame)}</b></div></div>
    <section className="gm-paper gm-stack"><h4>赞助券明细</h4><dl className="gm-reward-breakdown"><div><dt>模板基础 · {reward.tierName}</dt><dd>+{reward.baseCredits} 券</dd></div><div><dt>培养加奖 · Lv.{player.level} · {reward.tierName}</dt><dd>+{reward.trainingCredits} 券</dd></div><div><dt>合作奖励{cooperation.offer ? ` · ${cooperation.complete ? '已达标' : '未达标'}` : ' · 未接取'}</dt><dd>+{reward.cooperationCredits} 券</dd></div></dl></section>
    <section className="gm-paper gm-stack"><h4>球馆声望明细</h4><dl className="gm-reward-breakdown"><div><dt>属性培养声望</dt><dd>+{format(reward.rawFame)}</dd></div><div><dt>课程与品牌加成</dt><dd>+{format(reward.baseFame - reward.rawFame)}</dd></div><div><dt>合作额外声望</dt><dd>+{format(reward.cooperationFame)}</dd></div></dl></section>
    <div className="gm-paper gm-stack"><h4>本次培养成果</h4><p>累计训练 {format(player.shots)} 球 · 完成 {player.training.completedCourses} 课 · 六维净成长 +{format(reward.growth)}</p><p className="gm-muted">基础赞助券按实际模板档位发放，培养加奖同时检查当前等级与模板档次，合作奖励另计。完整课程与器材品牌提高培养声望，品牌同时影响展示身价。</p></div>
    {reward.credits === 0 && <p className="gm-recommend-warning">尚未匹配球星模板，本次推荐获得 0 张赞助券。你可以继续培养，也可以免费换人。</p>}
    {cooperation.offer && !cooperation.complete && <p className="gm-recommend-warning">「{cooperation.offer.name}」尚未达标。本次仍可普通推荐，领取以上基础与培养奖励；不扣券或声望，当前合作随球员离馆结束。</p>}
    <p className="gm-muted">确认后该球员离馆并进入校友簿，已获得的球星模板保留。空出的训练位可以免费招募下一名球员。</p>
    <div className="gm-actions">{onClose && <button type="button" className="gm-button" onClick={onClose}>继续培养</button>}<button type="button" className="gm-button gm-primary" onClick={() => onAction({type: 'recommend', id: player.id})}>确认推荐 · +{reward.credits} 券</button></div>
  </div>;
}

function AlumnusDetail({player, onClose}: {player: GymAlumnus; onClose: () => void}) {
  return <ComicDialog title="校友档案" variant="album" className="gm-detail-dialog" onClose={onClose}>
    <div className="gym-panel"><PlayerHeading player={player} value={player.finalValue}/><PlayerStats stats={player.stats}/><div className="gm-paper gm-stack"><h4>推荐记录</h4><p>{new Date(player.recommendedAt).toLocaleString('zh-CN')}</p><p>赞助券 +{player.rewardCredits} · 球馆声望 +{format(player.rewardFame)}</p><p className="gm-muted">累计出手 {format(player.shots)} 次 · 离馆体力 {player.stamina}</p></div><button type="button" className="gm-button" onClick={onClose}>返回校友簿</button></div>
  </ComicDialog>;
}

export function GymAlumniPanel({state}: GymPanelProps) {
  const [visible, setVisible] = useState(20);
  const [selected, setSelected] = useState<GymAlumnus | null>(null);
  const all = [...state.alumni].reverse();
  const legends = all.filter(player => recommendation(player).tier === 5).length;
  return <div className="gym-panel">
    <dl className="gm-metrics"><div><dt>累计推荐</dt><dd>{format(all.length)} 人</dd></div><div><dt>传奇校友</dt><dd>{format(legends)} 人</dd></div></dl>
    {all.length === 0 ? <div className="gm-empty"><GameIcon name="career"/><h3>第一份校友档案正在等你</h3><p className="gm-muted">推荐球员后，最终模板、六维、身价和推荐成果会留在这里。</p></div> : <div className="gm-alumni-list">{all.slice(0, visible).map(player => <button type="button" key={player.id} className="gm-alumnus" onClick={() => setSelected(player)}><span className="gm-alumnus-image"><StarPortrait src={templatePortrait(player.templateId)} name={player.name}/></span><div><strong>{templateById(player.templateId)?.name ?? player.name}</strong><span>{player.name} · Lv.{player.level} · {player.height} cm</span><span>推荐 +{player.rewardCredits} 券 · +{format(player.rewardFame)} 声望</span></div><b>{format(overallRating(player.stats))}</b></button>)}</div>}
    {all.length > visible && <button type="button" className="gm-button" onClick={() => setVisible(count => count + 20)}>再看 {Math.min(20, all.length - visible)} 位校友</button>}
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
        <div className="gm-album-grid">{tab === 0 ? albumTemplates.map(template => {
          const collected = !!state.collection[template.id];
          return <button type="button" key={template.id} className={`gm-album-card${collected ? '' : ' is-unknown'}`} data-tier={template.tier} disabled={!collected} onClick={() => setSelected(template.id)} aria-label={collected ? `查看${template.name}档案` : '未知球星'}><span className="gm-album-image">{collected ? <StarPortrait src={templatePortrait(template.id)} name={template.name}/> : <span className="gm-question" aria-hidden="true">?</span>}</span><strong>{collected ? template.name : '未知球星'}</strong><small>{tierConfig(template.tier).label}</small></button>;
        }) : equipmentCatalog.map(item => {
          const collected = !!state.collectedEquipment[item.id];
          const offer = equipmentOffer(state, item.id);
          const label = state.equippedEquipment.includes(item.id) ? '已启用' : collected ? '已收藏' : offer.price !== null ? '已可购' : '待解锁';
          return <button type="button" key={item.id} className={`gm-album-card${collected ? '' : ' is-unknown'}`} data-rarity={item.rarity} onClick={() => setSelected(item.id)} aria-label={`查看${item.name}器材档案`}><span className="gm-album-image">{collected ? <ProductImage id={item.id} name={item.name}/> : <EquipmentMystery/>}</span><strong>{item.name}</strong><small>{label}</small></button>;
        })}</div>
      </div>
    </SlidingTabs>
    {selectedTemplate && <TemplateDetail template={selectedTemplate} state={state} onClose={() => setSelected(null)}/>}
    {selectedEquipment && <EquipmentDetail item={selectedEquipment} state={state} onClose={() => setSelected(null)}/>}
  </div>;
}
