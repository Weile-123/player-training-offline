import {statKeys, type Stats} from '../types';
import {statLabels} from '../config';
import {templateById, type TemplateTier} from '../templates';
import {hash, random, stream, type Stream} from '../contract/random';
import {ledger, type Ledger} from '../contract/money';
import {grow, match, shape} from '../contract/templates';
import {cloneData} from '../../utils/cloneData';
import {equipmentCatalog, gymLevels, projects, trainingCreditMilestones, type ProjectId} from './catalog';
import {trainingBias, trainingPlans, type TrainingPlanId, type TrainingProgress} from './training';
import {buildCooperationOffers, type Cooperation, type CooperationStatus} from './cooperation';
import {playerLevelCap, requiredExperience, shotExperience, type TrainingOutcome} from './progression';

export {projects, gymLevels, equipmentCatalog, trainingCreditMilestones} from './catalog';
export {trainingPlans} from './training';
export type {TrainingPlanId, TrainingProgress} from './training';
export type {Cooperation, CooperationOffer, CooperationStatus} from './cooperation';
export {playerLevelCap, requiredExperience, experienceForLevel, shotExperience} from './progression';

export type GymPlayer = {
  id: string; name: string; enteredAt: number; height: number; stats: Stats; entryStats: Stats;
  bias: Stats; lastStyle: Stats; matchSeed: number; level: number; peakLevel: number;
  templateId: string | null; highestTier: TemplateTier | null; shots: number;
  book: Ledger; stamina: number; recoveryMs: number; enteredGymLevel: number; training: TrainingProgress;
  experience: number; nextShotAt: number; autoEnabled: boolean; cooperation: Cooperation | null;
};
export type Recommendation = {
  credits: number; fame: number; growth: number; tier: number; tierId: TemplateTier | null; tierName: string;
  baseCredits: number; trainingCredits: number; cooperationCredits: number; rawFame: number; baseFame: number; cooperationFame: number;
};
export type GymAlumnus = GymPlayer & {recommendedAt: number; rewardCredits: number; rewardFame: number; finalValue: string};
export type GymState = {
  kind: 'gym-management'; version: 1; balanceVersion: 3; seed: number; revision: number; createdAt: number; updatedAt: number; nextPlayer: number;
  player: GymPlayer | null; bench: GymPlayer[]; credits: number; fame: number; gymLevel: number; projects: Record<ProjectId, number>;
  ownedEquipment: string[]; equippedEquipment: string[]; inventory: {drink: number};
  collection: Record<string, {firstAt: number; highestRating: number; highestValue: string}>;
  collectedEquipment: Record<string, {firstAt: number}>; alumni: GymAlumnus[];
  rng: {recruits: Stream; economy: Stream; attributes: Stream};
  /** Read only by save migration; new games keep timing and cooperation on each player. */
  nextShotAt?: number; cooperation?: Cooperation | null;
};
export type HeightPreference = 'any' | 'guard' | 'forward' | 'center';
export type GymAction =
  | {type: 'train' | 'recommend' | 'use-drink'; id: string}
  | {type: 'recruit'; preference?: HeightPreference}
  | {type: 'buy-equipment' | 'equip' | 'unequip' | 'upgrade-project'; id: string}
  | {type: 'set-training-plan'; id: TrainingPlanId; playerId: string}
  | {type: 'accept-cooperation'; id: string; playerId: string}
  | {type: 'abandon-cooperation'; playerId: string}
  | {type: 'select-player'; id: string}
  | {type: 'set-auto'; id: string; enabled: boolean}
  | {type: 'auto-step'}
  | {type: 'buy-drink' | 'upgrade-gym'};
export type GymEvent = {
  type: string; id?: string; playerId?: string; outcome?: 'hold' | 'success' | 'great';
  changes?: Stats; levelGain?: number; experienceGain?: number; templateId?: string; credits?: number; fame?: number; restoredStamina?: number;
};
export type GymResult = {state: GymState; events: GymEvent[]; error?: string};

export const shotCooldownMs = 1_000;
export const drinkPrice = 1;
export const drinkRecovery = 10;

export function automaticIntervalMs(state: GymState): number {
  return Math.max(1_000, 2_000 - state.projects.automation * 200);
}

export function autoTrainingSeconds(state: GymState): number {
  return automaticIntervalMs(state) / 1_000;
}

export function activePlayers(state: GymState): GymPlayer[] {
  return state.player ? [state.player, ...state.bench] : [...state.bench];
}

/** Maximum equipment bonus; the four-point base course recovery is separate. */
export function courseRecoveryCap(state: GymState): number {
  return [1, 2, 2, 3, 3, 4, 4, 4][state.gymLevel - 1] ?? 1;
}
const tierIds: readonly (TemplateTier | null)[] = [null, 'rotation', 'starter', 'star', 'superstar', 'legend'];
const tierNames = ['待发掘', '替补', '首发', '全明星', '巨星', '传奇'];
const catalogById = new Map(equipmentCatalog.map(item => [item.id, item]));
const projectById = new Map(projects.map(project => [project.id as string, project]));
const rating = (stats: Stats) => statKeys.reduce((sum, key) => sum + stats[key], 0) / statKeys.length;
const validTime = (now: number) => Number.isSafeInteger(now) && now >= 0;

export function equipmentEffects(state: GymState) {
  const effects = state.equippedEquipment.reduce((effects, id) => {
    const item = state.ownedEquipment.includes(id) ? catalogById.get(id) : undefined;
    if (item) {
      effects.stamina += item.effects.stamina;
      effects.recovery += item.effects.recovery;
      effects.valuePercent += item.effects.valuePercent;
      if (item.effects.focusKey) effects.focus[item.effects.focusKey] += item.effects.focusPower;
      effects.courseRecovery += item.effects.courseRecovery;
      effects.cooperationBonus += item.effects.cooperationBonus;
    }
    return effects;
  }, {stamina: 0, recovery: 0, valuePercent: 0, focus: Object.fromEntries(statKeys.map(key => [key, 0])) as Stats,
    courseRecovery: 0, cooperationBonus: 0});
  effects.stamina = Math.min(20, effects.stamina);
  effects.recovery = Math.min(4, effects.recovery);
  effects.courseRecovery = Math.min(courseRecoveryCap(state), effects.courseRecovery);
  effects.cooperationBonus = Math.min(2, effects.cooperationBonus);
  for (const key of statKeys) effects.focus[key] = Math.min(1.5, effects.focus[key]);
  return effects;
}

export function staminaMax(state: GymState): number {
  return 20 + state.projects.endurance * 5 + equipmentEffects(state).stamina;
}

export function recoverySeconds(state: GymState): number {
  return Math.max(6, 20 - state.projects.recovery - equipmentEffects(state).recovery);
}

export function equipmentCapacity(state: GymState): number {
  return Math.min(8, 4 + state.projects.equipment);
}

export function playerValue(state: GymState, player: GymPlayer | null = state.player): string {
  if (!player) return '0';
  return (320n * BigInt(player.level + 1) ** 3n * BigInt(100 + equipmentEffects(state).valuePercent) / 100n).toString();
}

export function effectiveTrainingBias(state: GymState, player: GymPlayer | null = state.player): Stats {
  return player ? trainingBias(player.bias, player.training.planId, equipmentEffects(state).focus)
    : Object.fromEntries(statKeys.map(key => [key, 0])) as Stats;
}

export function trainingStatus(state: GymState, player: GymPlayer | null = state.player) {
  const training = player?.training ?? {planId: 'balanced', shots: 0, completedCourses: 0};
  const plan = trainingPlans.find(plan => plan.id === training.planId)!;
  const recovery = 4 + equipmentEffects(state).courseRecovery;
  return {plan, shots: training.shots, completedCourses: training.completedCourses, recovery, nextRecovery: recovery};
}

export const cooperationOffers = buildCooperationOffers;

export function cooperationStatus(state: GymState, player: GymPlayer | null = state.player): CooperationStatus {
  const active = player?.cooperation;
  const offer = player && active?.playerId === player.id ? cooperationOffers(state, player).find(offer => offer.id === active.id) ?? null : null;
  if (!player || !active || !offer) return {offer: null, requirements: [], complete: false, rewardCredits: 0, rewardFame: 0, equipmentCredits: 0};
  const newShots = Math.max(0, player.shots - active.acceptedShots);
  const newCourses = Math.max(0, player.training.completedCourses - active.acceptedCourses);
  const tier = tierIds.indexOf(templateById(player.templateId)?.tier ?? null);
  const requirements = [
    {label: '接取后训练', current: newShots, required: offer.requiredShots, met: newShots >= offer.requiredShots},
    {label: '接取后课程', current: newCourses, required: offer.requiredCourses, met: newCourses >= offer.requiredCourses},
    {label: `模板档次（${tierNames[offer.requiredTier]}及以上）`, current: tier, required: offer.requiredTier, met: tier >= offer.requiredTier},
    ...offer.focusKeys.map(key => ({label: statLabels[key], current: player.stats[key], required: offer.requiredAttribute, met: player.stats[key] >= offer.requiredAttribute})),
  ];
  const complete = requirements.every(requirement => requirement.met);
  const equipmentCredits = complete && newCourses >= 2 ? equipmentEffects(state).cooperationBonus : 0;
  return {offer, requirements, complete, rewardCredits: offer.credits + equipmentCredits, rewardFame: offer.fame, equipmentCredits};
}

export function recommendation(player: GymPlayer | null): Recommendation;
export function recommendation(state: GymState, player?: GymPlayer | null): Recommendation;
export function recommendation(source: GymPlayer | GymState | null, selected?: GymPlayer | null): Recommendation {
  const player = source && 'kind' in source ? selected === undefined ? source.player : selected : source;
  const tierId = templateById(player?.templateId)?.tier ?? null;
  const tier = tierIds.indexOf(tierId);
  const growth = player ? statKeys.reduce((sum, key) => sum + Math.max(0, player.stats[key] - player.entryStats[key]), 0) : 0;
  const courses = player?.training.completedCourses ?? 0;
  const trainingCredits = trainingCreditMilestones.reduce((earned, milestone) =>
    player && player.level >= milestone.level && tier >= milestone.tier ? milestone.credits : earned, 0);
  const state = source && 'kind' in source ? source : null;
  const rawFame = Math.floor(growth * (tier + 1) / 10);
  const brand = state ? Math.min(50, equipmentEffects(state).valuePercent) : 0;
  const baseFame = Math.floor(rawFame * (100 + Math.min(60, courses * 10) + brand) / 100);
  const cooperation = state && player ? cooperationStatus(state, player) : null;
  const cooperationCredits = cooperation?.complete ? cooperation.rewardCredits : 0;
  const cooperationFame = cooperation?.complete ? cooperation.rewardFame : 0;
  return {credits: tier + trainingCredits + cooperationCredits, fame: baseFame + cooperationFame, growth, tier, tierId, tierName: tierNames[tier],
    baseCredits: tier, trainingCredits, cooperationCredits, rawFame, baseFame, cooperationFame};
}

export function projectCost(id: string, nextLevel: number): number {
  const project = projectById.get(id);
  if (!project || !Number.isInteger(nextLevel) || nextLevel < 1 || nextLevel > project.maxLevel) throw new Error('项目等级无效');
  const denominator = 5 ** (nextLevel - 1);
  const numerator = project.basePrice * 9 ** (nextLevel - 1);
  return Math.floor((numerator + denominator - 1) / denominator);
}

export function projectCap(id: string, gymLevel: number): number {
  const project = projectById.get(id);
  return project ? Math.min(project.maxLevel, Math.max(0, gymLevel - project.unlockLevel + 1)) : 0;
}

export function projectOffer(state: GymState, id: string) {
  const project = projectById.get(id);
  const level = project ? state.projects[project.id] : 0;
  const maxLevel = projectCap(id, state.gymLevel);
  let reason: string | null = null;
  if (!project) reason = '项目不存在';
  else if (!project.available) reason = '后续版本开放，当前不可购买';
  else if (state.gymLevel < project.unlockLevel) reason = `球馆达到 ${project.unlockLevel} 级后开放`;
  else if (level >= project.maxLevel) reason = '项目已达到最高等级';
  else if (level >= maxLevel) reason = '升级球馆后开放下一等级';
  return {level, maxLevel, price: reason || !project ? null : projectCost(id, level + 1), reason};
}

export function equipmentOffer(state: GymState, id: string) {
  const item = catalogById.get(id);
  const owned = state.ownedEquipment.includes(id);
  let reason: string | null = null;
  if (!item) reason = '器材不存在';
  else if (owned) reason = '已获得该器材';
  else if (state.gymLevel < item.unlockLevel) reason = `球馆达到 ${item.unlockLevel} 级后上架`;
  else if (Object.keys(state.collection).length < item.requiredTemplates) reason = `收录 ${item.requiredTemplates} 种模板后上架`;
  return {owned, price: reason || !item ? null : item.price, reason};
}

export function gymUpgrade(state: GymState) {
  const level = gymLevels[state.gymLevel] ?? null;
  const effective = state.alumni.filter(player => {
    const reward = recommendation(player);
    return reward.growth > 0 && reward.tier >= 1;
  });
  const bestTier = Math.max(0, ...effective.map(player => recommendation(player).tier));
  const legends = effective.filter(player => recommendation(player).tier === 5).length;
  const requirements: {label: string; current: number; required: number; met: boolean}[] = [];
  const add = (label: string, current: number, required: number) => {
    if (required) requirements.push({label, current, required, met: current >= required});
  };
  if (level) {
    add('累计声望', state.fame, level.fame);
    add('有效推荐', effective.length, level.requiredRecommendations);
    add(`最高推荐档次（${tierNames[level.requiredTier]}及以上）`, bestTier, level.requiredTier);
    add('传奇推荐人数', legends, level.requiredLegends);
    add('球星模板收藏', Object.keys(state.collection).length, level.requiredTemplates);
  }
  const canUpgrade = !!level && requirements.every(requirement => requirement.met);
  const reason = !level ? '球馆已达到最高等级' : canUpgrade ? '' : '声望或培养成果尚未达标';
  return {level, requirements, canUpgrade, reason};
}

export function gymLevelRequirements(state: GymState): string[] {
  return gymUpgrade(state).requirements.filter(requirement => !requirement.met)
    .map(requirement => `${requirement.label} ${requirement.current}/${requirement.required}`);
}

function recruit(state: GymState, preference: HeightPreference): GymPlayer {
  const source = state.rng.recruits;
  const stats = Object.fromEntries(statKeys.map(key => [key, 24 + state.projects.recruitment + Math.floor(random(source) * 25)])) as Stats;
  const bias = Object.fromEntries(statKeys.map(key => [key, random(source) ** 3])) as Stats;
  const ranges = {any: [178, 218], guard: [178, 194], forward: [195, 205], center: [206, 218]};
  const [low, high] = ranges[preference];
  const height = low + Math.floor(random(source) * (high - low + 1));
  const sequence = state.nextPlayer++;
  const id = `gym-p${sequence}`;
  return {id, name: `新秀 ${sequence}`, enteredAt: state.updatedAt, height, stats, entryStats: {...stats}, bias,
    lastStyle: shape(stats), matchSeed: hash(`${state.seed}:${id}`), level: 0, peakLevel: 0, templateId: null,
    highestTier: null, shots: 0, book: ledger(), stamina: staminaMax(state), recoveryMs: 0, enteredGymLevel: state.gymLevel,
    training: {planId: 'balanced', shots: 0, completedCourses: 0}, experience: 0, nextShotAt: state.updatedAt,
    autoEnabled: false, cooperation: null};
}

export function newGym(now: number, seed = 1): GymState {
  if (!validTime(now) || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('球馆初始化参数无效');
  const state: GymState = {kind: 'gym-management', version: 1, balanceVersion: 3, seed, revision: 0, createdAt: now, updatedAt: now, nextPlayer: 1,
    player: null, bench: [], credits: 0, fame: 0, gymLevel: 1,
    projects: {endurance: 0, recovery: 0, recruitment: 0, equipment: 0, automation: 0, offline: 0},
    ownedEquipment: [], equippedEquipment: [], inventory: {drink: 0}, collection: {}, collectedEquipment: {}, alumni: [],
    rng: {recruits: stream(seed, 'recruits'), economy: stream(seed, 'economy'), attributes: stream(seed, 'attributes')}};
  state.player = recruit(state, 'any');
  return state;
}

export function advanceGym(state: GymState, now: number): GymState {
  if (!validTime(now) || now <= state.updatedAt) return state;
  const maximum = staminaMax(state);
  const interval = recoverySeconds(state) * 1_000;
  const elapsed = now - state.updatedAt;
  const recover = (source: GymPlayer): GymPlayer => {
    const player = {...source};
    const needed = (maximum - player.stamina) * interval - player.recoveryMs;
    if (player.stamina >= maximum || elapsed >= needed) {
      player.stamina = maximum;
      player.recoveryMs = 0;
    } else {
      const accumulated = player.recoveryMs + elapsed;
      player.stamina += Math.floor(accumulated / interval);
      player.recoveryMs = accumulated % interval;
    }
    return player;
  };
  return {...state, updatedAt: now, revision: state.revision + 1,
    player: state.player ? recover(state.player) : null, bench: state.bench.map(recover)};
}

function reconcileRecovery(before: GymState, after: GymState) {
  for (const player of activePlayers(after)) {
    player.stamina = Math.min(player.stamina, staminaMax(after));
    player.recoveryMs = player.stamina >= staminaMax(after) ? 0
      : Math.floor(player.recoveryMs * recoverySeconds(after) / recoverySeconds(before));
  }
}

function rememberPlayer(state: GymState, events: GymEvent[], player: GymPlayer | null = state.player) {
  if (!player?.templateId) return;
  const previous = state.collection[player.templateId];
  const value = playerValue(state, player);
  state.collection[player.templateId] = {
    firstAt: previous?.firstAt ?? state.updatedAt,
    highestRating: Math.max(previous?.highestRating ?? 0, rating(player.stats)),
    highestValue: previous && BigInt(previous.highestValue) > BigInt(value) ? previous.highestValue : value,
  };
  if (!previous) events.push({type: 'template-unlocked', templateId: player.templateId, playerId: player.id});
}

/** A valid shot always earns XP; only a level gained consumes attribute RNG. */
function trainPlayer(state: GymState, player: GymPlayer, now: number, events: GymEvent[]) {
  const cooperationWasComplete = cooperationStatus(state, player).complete;
  const roll = random(state.rng.economy);
  const outcome: TrainingOutcome = roll < .3 ? 'hold' : roll < .9 ? 'success' : 'great';
  const experienceGain = shotExperience(outcome);
  const before = player.level;
  const previousStats = {...player.stats};
  const previousTemplate = player.templateId;
  player.experience += experienceGain;
  while (player.level < playerLevelCap && player.experience >= requiredExperience(player.level)) {
    player.experience -= requiredExperience(player.level);
    player.level++;
  }
  if (player.level === playerLevelCap) player.experience = 0;
  const levelGain = player.level - before;
  if (levelGain > 0) player.stats = grow(player.stats, effectiveTrainingBias(state, player), 'success', levelGain, state.rng.attributes);
  player.peakLevel = Math.max(player.peakLevel, player.level);
  player.stamina--;
  player.shots++;
  player.training.shots++;
  let restoredStamina: number | null = null;
  if (player.training.shots === 10) {
    player.training.shots = 0;
    player.training.completedCourses++;
    restoredStamina = Math.min(trainingStatus(state, player).nextRecovery, staminaMax(state) - player.stamina);
    player.stamina += restoredStamina;
    if (player.stamina === staminaMax(state)) player.recoveryMs = 0;
  }
  player.nextShotAt = now + (player.autoEnabled ? automaticIntervalMs(state) : shotCooldownMs);
  if (player.level === playerLevelCap) player.autoEnabled = false;
  const matched = match(player);
  player.templateId = matched.templateId;
  player.lastStyle = matched.lastStyle;
  if (tierIds.indexOf(matched.tier) > tierIds.indexOf(player.highestTier)) player.highestTier = matched.tier;
  const changes = Object.fromEntries(statKeys.map(key => [key, player.stats[key] - previousStats[key]])) as Stats;
  events.push({type: 'trained', playerId: player.id, outcome, changes, levelGain, experienceGain});
  if (restoredStamina !== null) events.push({type: 'course-completed', playerId: player.id, restoredStamina});
  if (player.templateId !== previousTemplate) events.push({type: 'template-changed', playerId: player.id, templateId: player.templateId ?? undefined});
  rememberPlayer(state, events, player);
  if (!cooperationWasComplete && cooperationStatus(state, player).complete) {
    events.push({type: 'cooperation-ready', playerId: player.id, id: player.cooperation!.id});
  }
}

/** Commands are atomic. Call advanceGym first when natural recovery must persist even if a command is refused. */
export function dispatchGym(original: GymState, expectedRevision: number, action: GymAction, now: number): GymResult {
  const fail = (error: string): GymResult => ({state: original, events: [], error});
  if (expectedRevision !== original.revision) return fail('操作已过期，请重试');
  if (!validTime(now) || now < original.updatedAt) return fail('当前时间无效');
  const timed = advanceGym(original, now);
  const next = cloneData(timed);
  const events: GymEvent[] = [];
  const player = next.player;
  switch (action.type) {
    case 'train': {
      if (!player || action.id !== player.id) return fail('当前球员已变化，请重新选择');
      if (player.autoEnabled) return fail('请先关闭该球员的自动训练');
      if (player.level >= playerLevelCap) return fail('球员已达到 99 级训练上限');
      if (now < player.nextShotAt) return fail('下一球正在准备');
      if (player.stamina < 1) return fail('体力不足，请等待恢复或使用饮料');
      trainPlayer(next, player, now, events);
      break;
    }
    case 'auto-step': {
      if (next.gymLevel < 2) return {state: timed, events};
      // Selection and bench order must not change which player receives each RNG draw.
      const due = activePlayers(next).filter(player => player.autoEnabled && player.level < playerLevelCap
        && player.nextShotAt <= now && player.stamina >= 1).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      if (!due.length) return {state: timed, events};
      for (const trainee of due) trainPlayer(next, trainee, now, events);
      break;
    }
    case 'select-player': {
      if (player?.id === action.id) return fail('当前已选择该球员');
      const index = next.bench.findIndex(trainee => trainee.id === action.id);
      if (index < 0) return fail('该球员已不在训练馆');
      next.player = next.bench[index];
      if (player) next.bench[index] = player;
      else next.bench.splice(index, 1);
      events.push({type: 'player-selected', playerId: action.id});
      break;
    }
    case 'set-auto': {
      const trainee = activePlayers(next).find(trainee => trainee.id === action.id);
      if (!trainee) return fail('该球员已不在训练馆');
      if (typeof action.enabled !== 'boolean') return fail('自动训练设置无效');
      if (action.enabled && next.gymLevel < 2) return fail('球馆 2 级开放自动训练');
      if (action.enabled && trainee.level >= playerLevelCap) return fail('球员已达到 99 级训练上限');
      if (trainee.autoEnabled === action.enabled) return fail('当前已使用该训练模式');
      trainee.autoEnabled = action.enabled;
      // Toggling cannot create a shot, clear an existing cooldown or bank elapsed time.
      trainee.nextShotAt = Math.max(trainee.nextShotAt, now + (action.enabled ? automaticIntervalMs(next) : shotCooldownMs));
      events.push({type: 'auto-changed', playerId: trainee.id});
      break;
    }
    case 'recommend': {
      if (!player || action.id !== player.id) return fail('当前球员已变化，无法重复推荐');
      const reward = recommendation(next, player);
      if (!Number.isSafeInteger(next.credits + reward.credits) || !Number.isSafeInteger(next.fame + reward.fame)) return fail('经营记录已达到数值上限');
      next.alumni.push({...player, recommendedAt: now, rewardCredits: reward.credits, rewardFame: reward.fame, finalValue: playerValue(next, player)});
      next.credits += reward.credits;
      next.fame += reward.fame;
      next.player = next.bench.shift() ?? null;
      events.push({type: 'recommended', playerId: player.id, credits: reward.credits, fame: reward.fame});
      break;
    }
    case 'recruit': {
      if (activePlayers(next).length >= next.gymLevel) return fail('训练位已满，升级球馆或推荐一名球员后再招募');
      const preference = action.preference ?? 'any';
      if (!['any', 'guard', 'forward', 'center'].includes(preference)) return fail('身高偏好无效');
      if (preference !== 'any' && next.gymLevel < 2) return fail('球馆 2 级开放身高偏好');
      const trainee = recruit(next, preference);
      trainee.nextShotAt = Math.max(trainee.nextShotAt, now + shotCooldownMs);
      if (player) next.bench.push(trainee);
      else next.player = trainee;
      events.push({type: 'recruited', playerId: trainee.id});
      break;
    }
    case 'set-training-plan': {
      if (!player || action.playerId !== player.id) return fail('当前球员已变化，请重新选择');
      if (!trainingPlans.some(plan => plan.id === action.id)) return fail('训练计划不存在');
      if (player.training.planId === action.id) return fail('当前已使用该训练计划');
      player.training.planId = action.id;
      player.training.shots = 0;
      events.push({type: 'training-plan-changed', playerId: player.id, id: action.id});
      break;
    }
    case 'accept-cooperation': {
      if (!player || action.playerId !== player.id) return fail('当前球员已变化，请重新选择');
      if (!cooperationOffers(next).some(offer => offer.id === action.id)) return fail('合作目标已变化，请重新选择');
      if (player.cooperation?.id === action.id) return fail('该合作已在进行');
      player.cooperation = {id: action.id, playerId: player.id, acceptedShots: player.shots, acceptedCourses: player.training.completedCourses};
      events.push({type: 'cooperation-accepted', playerId: player.id, id: action.id});
      break;
    }
    case 'abandon-cooperation': {
      if (!player || action.playerId !== player.id) return fail('当前球员已变化，请重新选择');
      if (!player.cooperation) return fail('当前没有进行中的合作');
      player.cooperation = null;
      events.push({type: 'cooperation-abandoned', playerId: player.id});
      break;
    }
    case 'buy-equipment': {
      const offer = equipmentOffer(next, action.id);
      if (offer.price === null) return fail(offer.reason ?? '器材暂不可购');
      if (next.credits < offer.price) return fail('赞助券不足');
      next.credits -= offer.price;
      next.ownedEquipment.push(action.id);
      next.collectedEquipment[action.id] ??= {firstAt: now};
      events.push({type: 'equipment-bought', id: action.id});
      break;
    }
    case 'equip': {
      if (!catalogById.has(action.id) || !next.ownedEquipment.includes(action.id)) return fail('请先获得该器材');
      if (next.equippedEquipment.includes(action.id)) return fail('该器材已启用');
      if (next.equippedEquipment.length >= equipmentCapacity(next)) return fail('器材启用槽已满，请先停用一件');
      next.equippedEquipment.push(action.id);
      reconcileRecovery(timed, next);
      for (const trainee of activePlayers(next)) rememberPlayer(next, events, trainee);
      events.push({type: 'equipped', id: action.id});
      break;
    }
    case 'unequip': {
      if (!next.equippedEquipment.includes(action.id)) return fail('该器材尚未启用');
      next.equippedEquipment = next.equippedEquipment.filter(id => id !== action.id);
      reconcileRecovery(timed, next);
      events.push({type: 'unequipped', id: action.id});
      break;
    }
    case 'buy-drink': {
      if (next.credits < drinkPrice) return fail('赞助券不足');
      if (!Number.isSafeInteger(next.inventory.drink + 1)) return fail('饮料库存已达到上限');
      next.credits -= drinkPrice;
      next.inventory.drink++;
      events.push({type: 'drink-bought'});
      break;
    }
    case 'use-drink': {
      if (!player || action.id !== player.id) return fail('当前球员已变化，请重新选择');
      if (!next.inventory.drink) return fail('运动饮料已用完');
      if (player.stamina >= staminaMax(next)) return fail('当前体力已满');
      next.inventory.drink--;
      player.stamina = Math.min(staminaMax(next), player.stamina + drinkRecovery);
      if (player.stamina === staminaMax(next)) player.recoveryMs = 0;
      events.push({type: 'drink-used', playerId: player.id});
      break;
    }
    case 'upgrade-project': {
      const project = projectById.get(action.id);
      const offer = projectOffer(next, action.id);
      if (!project || offer.price === null) return fail(offer.reason ?? '项目暂不可升级');
      if (next.credits < offer.price) return fail('赞助券不足');
      next.credits -= offer.price;
      next.projects[project.id]++;
      reconcileRecovery(timed, next);
      events.push({type: 'project-upgraded', id: project.id});
      break;
    }
    case 'upgrade-gym': {
      const offer = gymUpgrade(next);
      if (!offer.canUpgrade || !offer.level) return fail(offer.reason);
      next.gymLevel = offer.level.level;
      events.push({type: 'gym-upgraded', id: String(next.gymLevel)});
      break;
    }
    default: return fail('未知操作');
  }
  next.revision = original.revision + 1;
  return {state: next, events};
}
