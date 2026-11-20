import {statKeys, type Stats} from '../types';
import {statLabels} from '../config';
import {templateById, type TemplateTier} from '../templates';
import {hash, random, stream, type Stream} from '../contract/random';
import {ledger, type Ledger} from '../contract/money';
import {grow, match, shape} from '../contract/templates';
import {cloneData} from '../../utils/cloneData';
import {equipmentCatalog, legacyEquipmentCatalog, equipmentCatalogVersion, gymLevels, projects, trainingCreditMilestones, selectedRecruitmentPrice, selectedRecruitmentUnlockLevel, postgameRepeatTemplateCredits, type GymEquipment, type ProjectId} from './catalog';
import {isSelectedRecruitmentDirection, selectedRecruitmentBase, type SelectedRecruitmentDirection} from './selectedRecruitment';
import {trainingBias, trainingPlans, type TrainingPlanId, type TrainingProgress} from './training';
import {buildCooperationOffers, type Cooperation, type CooperationStatus} from './cooperation';
import {experienceForLevel, playerLevelCap, requiredExperience, shotExperience, type TrainingOutcome} from './progression';
import {chalkTrainingShots, consumableById, teamSupplyRecovery, type GymConsumableId} from './consumables';
import type {OfflineTrainingReport} from './offline';

export {projects, gymLevels, equipmentCatalog, trainingCreditMilestones, trainingPlanUnlockLevel, cooperationUnlockLevel, maximumRecommendationCredits, postgameRepeatTemplateCredits} from './catalog';
export {trainingPlans} from './training';
export type {TrainingPlanId, TrainingProgress} from './training';
export type {Cooperation, CooperationOffer, CooperationStatus} from './cooperation';
export type {SelectedRecruitmentDirection} from './selectedRecruitment';
export {playerLevelCap, requiredExperience, experienceForLevel, shotExperience} from './progression';

export type GymPlayer = {
  id: string; name: string; enteredAt: number; height: number; stats: Stats; entryStats: Stats;
  bias: Stats; lastStyle: Stats; matchSeed: number; level: number; peakLevel: number;
  templateId: string | null; highestTier: TemplateTier | null; shots: number;
  book: Ledger; stamina: number; recoveryMs: number; enteredGymLevel: number; training: TrainingProgress;
  experience: number; nextShotAt: number; autoEnabled: boolean; cooperation: Cooperation | null;
  /** New selected recruits keep the original high-potential portrait appearance. */
  highPotential?: boolean;
  /** One effective shot only; absent on older saves and consumed by online/offline training alike. */
  greatShotReady?: boolean;
  greatShotsRemaining?: number;
  /** Per recruit, independent of which template is currently displayed. */
  shareLevelClaimed?: boolean;
  /** Retired overflow field retained only to read older saves. New rewards stop at the level cap. */
  overflowExperience?: number;
  equipmentTraining: {brandTotal: number; brandShots: number; cooperationCourses: [number, number]; cooperationCourseShots: [number, number]};
};
export type EquipmentBonuses = {
  stamina: number; recovery: number; valuePercent: number; focus: Stats; courseRecovery: number; cooperationBonus: number;
  experience: number; automationExperience: number; offlineMinutes: number;
};
export type Recommendation = {
  credits: number; fame: number; growth: number; tier: number; tierId: TemplateTier | null; tierName: string;
  baseCredits: number; trainingCredits: number; cooperationCredits: number; rawFame: number; baseFame: number; cooperationFame: number;
};
/** Credits are the payout; base credits reflect repeats while earned bonuses stay additive. */
export type RecommendationPayout = Recommendation & {
  /** Legacy event name; now means the first recommendation at any gym level. */
  rawCredits: number; withheldCredits: number; repeatTemplate: boolean; isFirstPostgameRecommendation: boolean;
};
export type GymAlumnus = GymPlayer & {recommendedAt: number; rewardCredits: number; rewardFame: number; finalValue: string};
/** Counts only older records moved out of the bounded recent alumni array. */
export type GymAlumniArchive = {id: string; count: number; effectiveCount: number; legendCount: number; bestTier: number};
export type GymState = {
  equipmentCatalogVersion?: 1 | 2 | 3;
  /** Migration-only snapshot: consumed once before newly rewritten effects can accrue. */
  pendingLegacyEquipmentEffects?: EquipmentBonuses;
  legacyEquipmentCollection?: Record<string, {firstAt: number}>;
  /** Absent on pre-offline saves; establish a fresh clock baseline before accruing shots. */
  offlineRulesVersion?: 1 | 2;
  offlineReward?: {report: OfflineTrainingReport; claimed: boolean; dismissed: boolean};
  kind: 'gym-management'; version: 1; balanceVersion: 3; seed: number; revision: number; createdAt: number; updatedAt: number; nextPlayer: number;
  player: GymPlayer | null; bench: GymPlayer[]; credits: number; fame: number; gymLevel: number; projects: Record<ProjectId, number>;
  ownedEquipment: string[]; equippedEquipment: string[]; purchasePrices: Record<string, number>; inventory: {drink: number} & Partial<Record<Exclude<GymConsumableId, 'drink'>, number>>;
  collection: Record<string, {firstAt: number; highestRating: number; highestValue: string}>;
  collectedEquipment: Record<string, {firstAt: number}>; alumni: GymAlumnus[];
  alumniArchive?: GymAlumniArchive;
  /** Retired hint field retained for old saves; no longer used by gameplay. */
  collectionGoalId?: string | null;
  /** Version 11 marks the one-time union of old counters and actual alumni final templates. */
  recommendationRulesVersion?: 11;
  /** Legacy field name retained for compatibility; counts recommendations at every gym level. */
  postgameRecommendedTemplates?: string[];
  /** The first stamina reward uses posting; all later rewards use advertisements. */
  staminaRewardCount?: number;
  rng: {recruits: Stream; economy: Stream; attributes: Stream};
  /** Read only by save migration; new games keep timing and cooperation on each player. */
  nextShotAt?: number; cooperation?: Cooperation | null;
};
export type HeightPreference = 'any' | 'guard' | 'forward' | 'center';
export type GymAction =
  | {type: 'train' | 'recommend'; id: string}
  | {type: 'use-drink'; id: string}
  | {type: 'recruit'; preference?: HeightPreference; mode?: 'selected'; direction?: SelectedRecruitmentDirection; expectedNextPlayer?: number; selectRecruited?: boolean}
  | {type: 'buy-equipment'; id: string; replaceId?: string; destination?: 'warehouse'}
  | {type: 'equip'; id: string; replaceId?: string}
  | {type: 'unequip' | 'sell-equipment' | 'upgrade-project'; id: string}
  | {type: 'set-training-plan'; id: TrainingPlanId; playerId: string; scope?: 'roster'}
  | {type: 'accept-cooperation'; id: string; playerId: string; scope?: 'roster'}
  | {type: 'abandon-cooperation'; playerId: string; scope?: 'roster'}
  | {type: 'share-player-levels'; playerId: string}
  | {type: 'double-offline-experience' | 'dismiss-offline-report'; reportId: string}
  | {type: 'restore-stamina-reward'; playerId: string; method: 'share' | 'ad'; expectedCount: number}
  | {type: 'complete-cooperation-ad'; id: string; playerId: string; expectedCooperationId: string | null; expectedCooperationRevision: number | null; scope?: 'roster'}
  | {type: 'select-player'; id: string}
  | {type: 'set-auto'; id: string; enabled: boolean}
  | {type: 'auto-step'}
  | {type: 'buy-drink'}
  | {type: 'buy-consumable'; id: GymConsumableId}
  | {type: 'use-consumable'; id: GymConsumableId; playerId: string}
  | {type: 'upgrade-gym'; targetLevel?: number};
export type GymEvent = {
  type: string; id?: string; playerId?: string; outcome?: 'hold' | 'success' | 'great';
  changes?: Stats; levelGain?: number; experienceGain?: number; templateId?: string; credits?: number; fame?: number; restoredStamina?: number;
  rawCredits?: number; withheldCredits?: number; repeatTemplate?: boolean; isFirstPostgameRecommendation?: boolean;
};
export type GymResult = {state: GymState; events: GymEvent[]; error?: string};

export const shotCooldownMs = 500;
export const drinkPrice = 1;
export const drinkRecovery = 10;

export function staminaRewardMethod(state: GymState): 'share' | 'ad' {
  return (state.staminaRewardCount ?? 0) === 0 ? 'share' : 'ad';
}

export function consumableCount(state: GymState, id: GymConsumableId): number {
  return state.inventory[id] ?? 0;
}

export function guaranteedGreatShots(player: GymPlayer | null | undefined): number {
  return player?.greatShotsRemaining ?? (player?.greatShotReady ? 1 : 0);
}

/** A disabled use action never spends stock, including a stale full-stamina click. */
export function consumableUseReason(state: GymState, id: GymConsumableId): string {
  const item = consumableById.get(id);
  if (!item) return '消耗品不存在';
  const player = state.player;
  if (!player) return '招募球员后可使用';
  if (id === 'supplement') {
    if (consumableCount(state, id) < 1) return '团队补给已用完';
    const eligible = activePlayers(state).filter(trainee => trainee.level < playerLevelCap);
    if (!eligible.length) return '所有球员已满级，补给留给后续新人使用';
    return eligible.some(trainee => trainee.stamina < staminaMax(state)) ? '' : '全体可训练球员体力已满';
  }
  if (player.level >= playerLevelCap) return `球员已达到 ${playerLevelCap} 级训练上限，无需使用${item.name}`;
  if (consumableCount(state, id) < 1) return `${item.name}已用完`;
  if ((id === 'drink' || id === 'brace') && player.stamina >= staminaMax(state)) return '当前体力已满';
  if (id === 'timer' && player.autoEnabled) return '请先暂停自动训练再使用加练秒表';
  if (id === 'timer' && player.stamina < 1) return '体力不足，无法加练';
  if (id === 'chalk' && guaranteedGreatShots(player) > 0) return `镁粉还可生效${guaranteedGreatShots(player)}球，用完后再使用`;
  return '';
}

export function automaticIntervalMs(state: GymState): number {
  return Math.max(1_000, 2_000 - state.projects.automation * 200);
}

export function autoTrainingSeconds(state: GymState): number {
  return automaticIntervalMs(state) / 1_000;
}

/** Each automatic project level adds one deterministic XP to a valid auto shot. */
export function trainingShotExperience(state: GymState, outcome: TrainingOutcome, player: GymPlayer | null = state.player): number {
  const equipment = equipmentEffects(state);
  return shotExperience(outcome) + equipment.experience
    + (player?.autoEnabled ? equipment.automationExperience + (state.offlineRulesVersion === 2 ? state.projects.automation : 0) : 0);
}

export function activePlayers(state: GymState): GymPlayer[] {
  return state.player ? [state.player, ...state.bench] : [...state.bench];
}

/** Maximum equipment bonus; the four-point base course recovery is separate. */
export function courseRecoveryCap(state: GymState): number {
  return [1, 1, 2, 2, 2, 3, 3, 3][state.gymLevel - 1] ?? 1;
}
const tierIds: readonly (TemplateTier | null)[] = [null, 'rotation', 'starter', 'star', 'superstar', 'legend'];
const tierNames = ['待发掘', '替补', '首发', '全明星', '巨星', '传奇'];
const catalogById = new Map(equipmentCatalog.map(item => [item.id, item]));
const legacyCatalogById = new Map(legacyEquipmentCatalog.map(item => [item.id, item]));
const projectById = new Map(projects.map(project => [project.id as string, project]));
const rating = (stats: Stats) => statKeys.reduce((sum, key) => sum + stats[key], 0) / statKeys.length;
const validTime = (now: number) => Number.isSafeInteger(now) && now >= 0;

export function equipmentEffects(state: GymState): EquipmentBonuses {
  if (state.pendingLegacyEquipmentEffects) return {...state.pendingLegacyEquipmentEffects, focus: {...state.pendingLegacyEquipmentEffects.focus}};
  const families = new Map<string, GymEquipment>();
  for (const id of state.equippedEquipment) {
    const item = state.ownedEquipment.includes(id) ? catalogById.get(id) : undefined;
    const previous = item && families.get(item.family);
    if (item && (!previous || item.grade > previous.grade)) families.set(item.family, item);
  }
  const effects = [...families.values()].reduce((effects, item) => {
      effects.stamina += item.effects.stamina;
      effects.recovery += item.effects.recovery;
      effects.valuePercent += item.effects.valuePercent;
      if (item.effects.focusKey) effects.focus[item.effects.focusKey] += item.effects.focusPower;
      effects.courseRecovery += item.effects.courseRecovery;
      effects.cooperationBonus += item.effects.cooperationBonus;
      effects.experience += item.effects.experience;
      effects.automationExperience += item.effects.automationExperience;
      effects.offlineMinutes += item.effects.offlineMinutes;
    return effects;
  }, {stamina: 0, recovery: 0, valuePercent: 0, focus: Object.fromEntries(statKeys.map(key => [key, 0])) as Stats,
    courseRecovery: 0, cooperationBonus: 0, experience: 0, automationExperience: 0, offlineMinutes: 0});
  effects.stamina = Math.min(20, effects.stamina);
  effects.recovery = Math.min(4, effects.recovery);
  effects.courseRecovery = Math.min(courseRecoveryCap(state), effects.courseRecovery);
  effects.cooperationBonus = Math.min(2, effects.cooperationBonus);
  effects.experience = Math.min(3, effects.experience);
  effects.automationExperience = Math.min(3, effects.automationExperience);
  effects.offlineMinutes = Math.min(60, effects.offlineMinutes);
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

/** Old saves did not record payment. Use the pre-repricing baseline, never the raised shop price. */
export function legacyEquipmentPurchasePrice(id: string): number {
  const item = legacyCatalogById.get(id);
  if (!item) return 0;
  const number = Number(id.slice(6));
  return item.rarity === 'common' ? 1 + number % 2 : item.rarity === 'rare' ? 3 + number % 3 : 8 + number % 5;
}

export function warehouseEquipment(state: GymState): string[] {
  return state.ownedEquipment.filter(id => !state.equippedEquipment.includes(id));
}

export function equipmentSaleValue(state: GymState, id: string): number {
  if (!state.ownedEquipment.includes(id)) return 0;
  return Math.floor((state.purchasePrices?.[id] ?? legacyEquipmentPurchasePrice(id)) / 2);
}

export function equippedFamilyEquipment(state: GymState, itemId: string): GymEquipment | undefined {
  const family = catalogById.get(itemId)?.family;
  return family ? state.equippedEquipment.map(id => catalogById.get(id)).find(item => item?.family === family && item.id !== itemId) : undefined;
}

function installationError(state: GymState, itemId: string, replaceId?: string): string | null {
  if (replaceId !== undefined && !state.equippedEquipment.includes(replaceId)) return '被替换的器材已不在馆内，请重新选择';
  const familyItem = equippedFamilyEquipment(state, itemId);
  if (familyItem && replaceId !== familyItem.id) return '同类器材仅能启用一件，请选择替换同类器材，旧件进入仓库';
  if (replaceId === undefined && state.equippedEquipment.length >= equipmentCapacity(state)) return '馆内器材已满，请选择一件替换入仓库';
  return null;
}

function installEquipment(state: GymState, id: string, replaceId: string | undefined, events: GymEvent[]) {
  if (replaceId !== undefined) {
    state.equippedEquipment = state.equippedEquipment.filter(active => active !== replaceId);
    events.push({type: 'unequipped', id: replaceId});
  }
  state.equippedEquipment.push(id);
  events.push({type: 'equipped', id});
}

export function playerValue(state: GymState, player: GymPlayer | null = state.player): string {
  if (!player) return '0';
  return (320n * BigInt(player.level + 1) ** 3n * BigInt(100 + equipmentEffects(state).valuePercent) / 100n).toString();
}

export function effectiveTrainingBias(state: GymState, player: GymPlayer | null = state.player): Stats {
  const focus = equipmentEffects(state).focus;
  // Extra specialization must not increase wasted draws once that attribute is full.
  if (player && !state.pendingLegacyEquipmentEffects) for (const key of statKeys) if (player.stats[key] >= 99) focus[key] = 0;
  return player ? trainingBias(player.bias, player.training.planId, focus)
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
  const complete = active.adCompleted === true || requirements.every(requirement => requirement.met);
  const eligible = player.equipmentTraining.cooperationCourses;
  const equipmentCredits = complete ? eligible[1] >= 2 ? 2 : eligible[0] >= 2 ? 1 : 0 : 0;
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
  const coursePercent = 100 + Math.min(60, courses * 10);
  const brandShots = state && player ? player.equipmentTraining.brandShots : 0;
  const brandTotal = state && player ? player.equipmentTraining.brandTotal : 0;
  // Keep the historical average rational until the final floor (81 shots / 1260 brand must not lose one fame).
  const baseFame = brandShots ? Number(BigInt(rawFame)
    * (BigInt(coursePercent) * BigInt(brandShots) + BigInt(brandTotal)) / (100n * BigInt(brandShots)))
    : Math.floor(rawFame * coursePercent / 100);
  const cooperation = state && player ? cooperationStatus(state, player) : null;
  const cooperationCredits = cooperation?.complete ? cooperation.rewardCredits : 0;
  const cooperationFame = cooperation?.complete ? cooperation.rewardFame : 0;
  return {credits: tier + trainingCredits + cooperationCredits, fame: baseFame + cooperationFame, growth, tier, tierId, tierName: tierNames[tier],
    baseCredits: tier, trainingCredits, cooperationCredits, rawFame, baseFame, cooperationFame};
}

/** Old hot records can provide preview evidence until the history transaction also reads the cold archive. */
export function recommendedTemplateIds(state: GymState): string[] {
  if (state.recommendationRulesVersion === 11) return state.postgameRecommendedTemplates ?? [];
  const ids = new Set(state.postgameRecommendedTemplates ?? []);
  for (const player of state.alumni) if (player.templateId && templateById(player.templateId)) ids.add(player.templateId);
  return [...ids];
}

/** Called once in the same transaction as the historical evidence read; never infers recommendations from collection. */
export function initializeRecommendationRecords(state: GymState, archivedIds: Iterable<string> = []): GymState {
  if (state.recommendationRulesVersion === 11) return state;
  const ids = new Set(recommendedTemplateIds(state));
  for (const id of archivedIds) if (templateById(id)) ids.add(id);
  return {...state, recommendationRulesVersion: 11, postgameRecommendedTemplates: [...ids]};
}

/** Apply the all-level per-template repeat reward without changing theory, qualifications or fame. */
export function recommendationPayout(state: GymState, player: GymPlayer | null = state.player): RecommendationPayout {
  const raw = recommendation(state, player);
  const eligible = !!player?.templateId && raw.tierId !== null;
  const repeatTemplate = eligible && recommendedTemplateIds(state).includes(player!.templateId!);
  const isFirstPostgameRecommendation = eligible && !repeatTemplate;
  // Advertising can now satisfy a cooperation before an appearance is earned;
  // an undiscovered recruit still never earns recommendation coupons.
  const baseCredits = repeatTemplate ? postgameRepeatTemplateCredits : raw.baseCredits;
  const credits = !eligible ? 0 : baseCredits + raw.trainingCredits + raw.cooperationCredits;
  return {...raw, baseCredits, credits, rawCredits: raw.credits, withheldCredits: raw.credits - credits, repeatTemplate, isFirstPostgameRecommendation};
}

export function projectCost(id: string, nextLevel: number): number {
  const project = projectById.get(id);
  if (!project || !Number.isInteger(nextLevel) || nextLevel < 1 || nextLevel > project.maxLevel) throw new Error('项目等级无效');
  const explicitPrice = project.prices?.[nextLevel - 1];
  if (explicitPrice !== undefined) return explicitPrice;
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

export function alumniCount(state: GymState): number {
  return state.alumni.length + (state.alumniArchive?.count ?? 0);
}

export function alumniProgress(state: GymState) {
  let effectiveCount = state.alumniArchive?.effectiveCount ?? 0;
  let legendCount = state.alumniArchive?.legendCount ?? 0;
  let bestTier = state.alumniArchive?.bestTier ?? 0;
  for (const player of state.alumni) {
    const reward = recommendation(player);
    if (reward.growth <= 0 || reward.tier < 1) continue;
    effectiveCount++;
    if (reward.tier === 5) legendCount++;
    bestTier = Math.max(bestTier, reward.tier);
  }
  return {total: alumniCount(state), effectiveCount, legendCount, bestTier};
}

export function gymUpgrade(state: GymState) {
  const level = gymLevels[state.gymLevel] ?? null;
  const progress = alumniProgress(state);
  const requirements: {label: string; current: number; required: number; met: boolean}[] = [];
  const add = (label: string, current: number, required: number) => {
    if (required) requirements.push({label, current, required, met: current >= required});
  };
  if (level) {
    add('累计声望', state.fame, level.fame);
    add('有效推荐', progress.effectiveCount, level.requiredRecommendations);
    add(`最高推荐档次（${tierNames[level.requiredTier]}及以上）`, progress.bestTier, level.requiredTier);
    add('传奇推荐人数', progress.legendCount, level.requiredLegends);
    add('球星模板收藏', Object.keys(state.collection).length, level.requiredTemplates);
  }
  const progressMet = !!level && requirements.every(requirement => requirement.met);
  const price = level?.upgradePrice ?? 0;
  if (level) add('扩建赞助券', state.credits, price);
  const canUpgrade = progressMet && state.credits >= price;
  const reason = !level ? '球馆已达到最高等级' : canUpgrade ? '' : !progressMet ? '声望或培养成果尚未达标' : `赞助券不足，还差 ${price - state.credits} 券`;
  return {level, price, requirements, canUpgrade, reason};
}

export function gymLevelRequirements(state: GymState): string[] {
  return gymUpgrade(state).requirements.filter(requirement => !requirement.met)
    .map(requirement => `${requirement.label} ${requirement.current}/${requirement.required}`);
}

function recruit(state: GymState, preference: HeightPreference, direction?: SelectedRecruitmentDirection): GymPlayer {
  const source = state.rng.recruits;
  let baseStats = Object.fromEntries(statKeys.map(key => [key, 24 + Math.floor(random(source) * 25)])) as Stats;
  const bias = Object.fromEntries(statKeys.map(key => [key, random(source) ** 3])) as Stats;
  const ranges = {any: [178, 218], guard: [178, 194], forward: [195, 205], center: [206, 218]};
  const [low, high] = ranges[preference];
  const height = low + Math.floor(random(source) * (high - low + 1));
  if (direction) baseStats = selectedRecruitmentBase(baseStats, direction, source);
  const stats = Object.fromEntries(statKeys.map(key => [key, baseStats[key] + state.projects.recruitment])) as Stats;
  const sequence = state.nextPlayer++;
  const id = `gym-p${sequence}`;
  return {id, name: `新秀 ${sequence}`, enteredAt: state.updatedAt, height, stats, entryStats: {...stats}, bias,
    ...(direction ? {highPotential: true} : {}),
    lastStyle: shape(stats), matchSeed: hash(`${state.seed}:${id}`), level: 0, peakLevel: 0, templateId: null,
    highestTier: null, shots: 0, book: ledger(), stamina: staminaMax(state), recoveryMs: 0, enteredGymLevel: state.gymLevel,
    training: {planId: 'balanced', shots: 0, completedCourses: 0}, experience: 0, nextShotAt: state.updatedAt,
    autoEnabled: false, cooperation: null, equipmentTraining: {brandTotal: 0, brandShots: 0, cooperationCourses: [0, 0], cooperationCourseShots: [0, 0]}};
}

export function newGym(now: number, seed = 1): GymState {
  if (!validTime(now) || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('球馆初始化参数无效');
  const state: GymState = {kind: 'gym-management', version: 1, balanceVersion: 3, equipmentCatalogVersion, offlineRulesVersion: 2, seed, revision: 0, createdAt: now, updatedAt: now, nextPlayer: 1,
    player: null, bench: [], credits: 0, fame: 0, gymLevel: 1,
    projects: {endurance: 0, recovery: 0, recruitment: 0, equipment: 0, automation: 0, offline: 0},
    ownedEquipment: [], equippedEquipment: [], purchasePrices: {}, inventory: {drink: 0}, collection: {}, collectedEquipment: {}, alumni: [], recommendationRulesVersion: 11, postgameRecommendedTemplates: [],
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

/** Finish a one-time legacy replay without refilling stamina or preserving an old recovery speed. */
export function finishEquipmentMigration(state: GymState): GymState {
  if (!state.pendingLegacyEquipmentEffects) return state;
  const next = cloneData(state);
  delete next.pendingLegacyEquipmentEffects;
  reconcileRecovery(state, next);
  return next;
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

function addPlayerExperience(state: GymState, player: GymPlayer, experience: number): number {
  const before = player.level;
  player.experience += experience;
  while (player.level < playerLevelCap && player.experience >= requiredExperience(player.level)) {
    player.experience -= requiredExperience(player.level);
    player.level++;
  }
  if (player.level === playerLevelCap) player.experience = 0;
  const levelGain = player.level - before;
  if (levelGain > 0) player.stats = grow(player.stats, effectiveTrainingBias(state, player), 'success', levelGain, state.rng.attributes);
  player.peakLevel = Math.max(player.peakLevel, player.level);
  return levelGain;
}

/** A valid shot always earns XP; only a level gained consumes attribute RNG. */
export function trainPlayer(state: GymState, player: GymPlayer, now: number, events: GymEvent[], reuseMatching = false) {
  const cooperationWasComplete = cooperationStatus(state, player).complete;
  const roll = random(state.rng.economy);
  const guaranteed = guaranteedGreatShots(player);
  const outcome: TrainingOutcome = guaranteed > 0 ? 'great' : roll < .3 ? 'hold' : roll < .9 ? 'success' : 'great';
  if (guaranteed > 1) player.greatShotsRemaining = guaranteed - 1;
  else delete player.greatShotsRemaining;
  delete player.greatShotReady;
  const experienceGain = trainingShotExperience(state, outcome, player);
  const equipment = equipmentEffects(state);
  player.equipmentTraining.brandShots++;
  player.equipmentTraining.brandTotal += Math.min(50, equipment.valuePercent);
  if (player.cooperation) for (let tier = 1; tier <= 2; tier++) if (equipment.cooperationBonus >= tier) {
    player.equipmentTraining.cooperationCourseShots[tier - 1]++;
  }
  const previousStats = {...player.stats};
  const previousTemplate = player.templateId;
  const levelGain = addPlayerExperience(state, player, experienceGain);
  player.stamina--;
  player.shots++;
  player.training.shots++;
  let restoredStamina: number | null = null;
  if (player.training.shots === 10) {
    player.training.shots = 0;
    player.training.completedCourses++;
    if (player.cooperation) {
      for (let tier = 1; tier <= 2; tier++) if (player.equipmentTraining.cooperationCourseShots[tier - 1] === 10) {
        player.equipmentTraining.cooperationCourses[tier - 1] = Math.min(2, player.equipmentTraining.cooperationCourses[tier - 1] + 1);
      }
    }
    player.equipmentTraining.cooperationCourseShots = [0, 0];
    restoredStamina = Math.min(trainingStatus(state, player).nextRecovery, staminaMax(state) - player.stamina);
    player.stamina += restoredStamina;
    if (player.stamina === staminaMax(state)) player.recoveryMs = 0;
  }
  player.nextShotAt = now + (player.autoEnabled ? automaticIntervalMs(state) : shotCooldownMs);
  if (player.level === playerLevelCap) player.autoEnabled = false;
  // Offline replay may reuse this athlete's preceding result when no matching
  // input changed. Every first shot and every level/stat gain still calls the
  // original matcher; regular dispatch always takes the uncached path.
  if (!reuseMatching || levelGain > 0) {
    const matched = match(player);
    player.templateId = matched.templateId;
    player.lastStyle = matched.lastStyle;
    if (tierIds.indexOf(matched.tier) > tierIds.indexOf(player.highestTier)) player.highestTier = matched.tier;
  }
  const changes = Object.fromEntries(statKeys.map(key => [key, player.stats[key] - previousStats[key]])) as Stats;
  events.push({type: 'trained', playerId: player.id, outcome, changes, levelGain, experienceGain});
  if (restoredStamina !== null) events.push({type: 'course-completed', playerId: player.id, restoredStamina});
  if (player.templateId !== previousTemplate) events.push({type: 'template-changed', playerId: player.id, templateId: player.templateId ?? undefined});
  rememberPlayer(state, events, player);
  if (!cooperationWasComplete && cooperationStatus(state, player).complete) {
    events.push({type: 'cooperation-ready', playerId: player.id, id: player.cooperation!.id});
  }
}

/** Only credit the remaining XP before the existing player-level ceiling. */
export function offlineBonusExperience(state:GymState,report:OfflineTrainingReport):Record<string,number>{
  const players=activePlayers(state),ceiling=experienceForLevel(playerLevelCap);
  return Object.fromEntries(report.players.map(earned=>{
    const trainee=players.find(player=>player.id===earned.id);
    const remaining=trainee?Math.max(0,ceiling-experienceForLevel(trainee.level)-trainee.experience):0;
    return[earned.id,Math.min(earned.xpGained,remaining)];
  }));
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
    case 'double-offline-experience': {
      const reward=next.offlineReward;
      if(!reward || reward.report.reportId!==action.reportId) return fail('离线报告已变化，请重新打开后领取');
      if(reward.claimed) return fail('这份报告已领取双倍经验');
      if(reward.dismissed) return fail('这份离线报告已结束');
      const bonusExperience=offlineBonusExperience(next,reward.report);
      if(!Object.values(bonusExperience).some(value=>value>0))return fail(`球员已达到${playerLevelCap}级，无需领取额外经验`);
      for(const earned of reward.report.players){
        const trainee=activePlayers(next).find(entry=>entry.id===earned.id);
        if(!trainee) return fail('报告中的球员已离馆，未发放奖励');
        const bonus=bonusExperience[earned.id];
        if(!bonus)continue;
        const before={...trainee.stats};
        const levelGain=addPlayerExperience(next,trainee,bonus);
        if(trainee.level===playerLevelCap) trainee.autoEnabled=false;
        const previousTemplate=trainee.templateId,matched=match(trainee);
        trainee.templateId=matched.templateId;trainee.lastStyle=matched.lastStyle;
        if(tierIds.indexOf(matched.tier)>tierIds.indexOf(trainee.highestTier))trainee.highestTier=matched.tier;
        events.push({type:'offline-experience-doubled',playerId:trainee.id,experienceGain:bonus,levelGain,
          changes:Object.fromEntries(statKeys.map(key=>[key,trainee.stats[key]-before[key]])) as Stats});
        if(previousTemplate!==trainee.templateId)events.push({type:'template-changed',playerId:trainee.id,templateId:trainee.templateId??undefined});
        rememberPlayer(next,events,trainee);
      }
      reward.report.bonusExperience=bonusExperience;
      reward.claimed=true;
      break;
    }
    case 'dismiss-offline-report': {
      if(!next.offlineReward || next.offlineReward.report.reportId!==action.reportId)return fail('离线报告已变化');
      next.offlineReward.dismissed=true;
      break;
    }
    case 'train': {
      if (!player || action.id !== player.id) return fail('当前球员已变化，请重新选择');
      if (player.autoEnabled) return fail('请先关闭该球员的自动训练');
      if (player.level >= playerLevelCap) return fail(`球员已达到 ${playerLevelCap} 级训练上限`);
      if (now < player.nextShotAt) return fail('下一球正在准备');
      if (player.stamina < 1) return fail('体力不足，请等待体力恢复或领取体力奖励');
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
      if (action.enabled && trainee.level >= playerLevelCap) return fail(`球员已达到 ${playerLevelCap} 级训练上限`);
      if (trainee.autoEnabled === action.enabled) return fail('当前已使用该训练模式');
      trainee.autoEnabled = action.enabled;
      // Toggling cannot create a shot, clear an existing cooldown or bank elapsed time.
      trainee.nextShotAt = Math.max(trainee.nextShotAt, now + (action.enabled ? automaticIntervalMs(next) : shotCooldownMs));
      events.push({type: 'auto-changed', playerId: trainee.id});
      break;
    }
    case 'recommend': {
      if (!player || action.id !== player.id) return fail('当前球员已变化，无法重复推荐');
      if (next.recommendationRulesVersion !== 11 && next.alumniArchive?.count) return fail('推荐记录尚未恢复，请重新进入球馆后重试');
      const reward = recommendationPayout(next, player);
      if (!Number.isSafeInteger(next.credits + reward.credits) || !Number.isSafeInteger(next.fame + reward.fame)) return fail('经营记录已达到数值上限');
      if (next.recommendationRulesVersion !== 11) {
        const initialized = initializeRecommendationRecords(next);
        next.recommendationRulesVersion = initialized.recommendationRulesVersion;
        next.postgameRecommendedTemplates = initialized.postgameRecommendedTemplates;
      }
      if (reward.isFirstPostgameRecommendation) next.postgameRecommendedTemplates = [...(next.postgameRecommendedTemplates ?? []), player.templateId!];
      // Free replacement of an undiscovered player is not a completed alumni record.
      if (reward.tierId !== null) next.alumni.push({...player, recommendedAt: now, rewardCredits: reward.credits, rewardFame: reward.fame, finalValue: playerValue(next, player)});
      next.credits += reward.credits;
      next.fame += reward.fame;
      next.player = next.bench.shift() ?? null;
      events.push({type: 'recommended', playerId: player.id, credits: reward.credits, fame: reward.fame,
        rawCredits: reward.rawCredits, withheldCredits: reward.withheldCredits,
        repeatTemplate: reward.repeatTemplate, isFirstPostgameRecommendation: reward.isFirstPostgameRecommendation});
      break;
    }
    case 'recruit': {
      if (action.mode !== undefined && action.mode !== 'selected') return fail('招生方式无效');
      if (action.selectRecruited !== undefined && typeof action.selectRecruited !== 'boolean') return fail('招生选择无效');
      if (action.expectedNextPlayer !== undefined && (!Number.isSafeInteger(action.expectedNextPlayer) || action.expectedNextPlayer !== next.nextPlayer)) return fail('招生名单已变化，请重新确认');
      if (activePlayers(next).length >= next.gymLevel) return fail('训练位已满，升级球馆或推荐一名球员后再招募');
      const preference = action.preference ?? 'any';
      if (!['any', 'guard', 'forward', 'center'].includes(preference)) return fail('身高偏好无效');
      const selected = action.mode === 'selected';
      if (selected && action.expectedNextPlayer === undefined) return fail('请重新确认精选招生名单');
      if (selected && !isSelectedRecruitmentDirection(action.direction)) return fail('精选方向无效');
      if (!selected && action.direction !== undefined) return fail('免费招生无需选择精选方向');
      if (selected && next.gymLevel < selectedRecruitmentUnlockLevel) return fail(`球馆 ${selectedRecruitmentUnlockLevel} 级开放精选招生`);
      if (selected && next.credits < selectedRecruitmentPrice) return fail('赞助券不足');
      if (!Number.isSafeInteger(next.nextPlayer + 1)) return fail('招生记录已达到数值上限');
      const trainee = recruit(next, preference, selected ? action.direction : undefined);
      if (selected) next.credits -= selectedRecruitmentPrice;
      trainee.nextShotAt = Math.max(trainee.nextShotAt, now + shotCooldownMs);
      if (player && action.selectRecruited) {next.bench.push(player); next.player = trainee;}
      else if (player) next.bench.push(trainee);
      else next.player = trainee;
      events.push({type: 'recruited', playerId: trainee.id});
      if (action.selectRecruited) events.push({type: 'player-selected', playerId: trainee.id});
      if (selected) events.push({type: 'selected-recruited', playerId: trainee.id, id: action.direction, credits: selectedRecruitmentPrice});
      break;
    }
    case 'set-training-plan': {
      const trainee = action.scope === 'roster' ? activePlayers(next).find(entry => entry.id === action.playerId) : player;
      if (!trainee || action.playerId !== trainee.id) return fail('当前球员已变化，请重新选择');
      if (!trainingPlans.some(plan => plan.id === action.id)) return fail('训练计划不存在');
      if (trainee.training.planId === action.id) return fail('当前已使用该训练计划');
      trainee.training.planId = action.id;
      trainee.training.shots = 0;
      trainee.equipmentTraining.cooperationCourseShots = [0, 0];
      events.push({type: 'training-plan-changed', playerId: trainee.id, id: action.id});
      break;
    }
    case 'accept-cooperation': {
      const trainee = action.scope === 'roster' ? activePlayers(next).find(entry => entry.id === action.playerId) : player;
      if (!trainee || action.playerId !== trainee.id) return fail('当前球员已变化，请重新选择');
      if (!cooperationOffers(next, trainee).some(offer => offer.id === action.id)) return fail('合作目标已变化，请重新选择');
      if (trainee.cooperation?.id === action.id) return fail('该合作已在进行');
      if (trainee.level >= playerLevelCap) return fail(`球员已达到 ${playerLevelCap} 级训练上限，无法新接或更换合作`);
      trainee.cooperation = {id: action.id, playerId: trainee.id, acceptedShots: trainee.shots, acceptedCourses: trainee.training.completedCourses, acceptedRevision: original.revision + 1};
      trainee.equipmentTraining.cooperationCourses = [0, 0];
      trainee.equipmentTraining.cooperationCourseShots = [0, 0];
      events.push({type: 'cooperation-accepted', playerId: trainee.id, id: action.id});
      break;
    }
    case 'abandon-cooperation': {
      const trainee = action.scope === 'roster' ? activePlayers(next).find(entry => entry.id === action.playerId) : player;
      if (!trainee || action.playerId !== trainee.id) return fail('当前球员已变化，请重新选择');
      if (!trainee.cooperation) return fail('当前没有进行中的合作');
      trainee.cooperation = null;
      trainee.equipmentTraining.cooperationCourses = [0, 0];
      trainee.equipmentTraining.cooperationCourseShots = [0, 0];
      events.push({type: 'cooperation-abandoned', playerId: trainee.id});
      break;
    }
    case 'share-player-levels': {
      if (!player || action.playerId !== player.id) return fail('当前球员已变化，请重新选择');
      if (!templateById(player.templateId)) return fail('获得球员模板后才能分享升级');
      if (player.shareLevelClaimed) return fail('该球员已领取分享升级奖励');
      if (player.level >= playerLevelCap) return fail(`球员已达到 ${playerLevelCap} 级训练上限`);
      const beforeStats = {...player.stats}, beforeTemplate = player.templateId;
      const cooperationWasComplete = cooperationStatus(next, player).complete;
      const targetLevel = Math.min(playerLevelCap, player.level + 3);
      const experienceGain = experienceForLevel(targetLevel) - experienceForLevel(player.level);
      const levelGain = addPlayerExperience(next, player, experienceGain);
      player.shareLevelClaimed = true;
      if (player.level === playerLevelCap) player.autoEnabled = false;
      const matched = match(player);
      player.templateId = matched.templateId;
      player.lastStyle = matched.lastStyle;
      if (tierIds.indexOf(matched.tier) > tierIds.indexOf(player.highestTier)) player.highestTier = matched.tier;
      const changes = Object.fromEntries(statKeys.map(key => [key, player.stats[key] - beforeStats[key]])) as Stats;
      events.push({type: 'player-share-rewarded', playerId: player.id, changes, levelGain, experienceGain});
      if (beforeTemplate !== player.templateId) events.push({type: 'template-changed', playerId: player.id, templateId: player.templateId ?? undefined});
      rememberPlayer(next, events, player);
      if (!cooperationWasComplete && cooperationStatus(next, player).complete) events.push({type: 'cooperation-ready', playerId: player.id, id: player.cooperation!.id});
      break;
    }
    case 'restore-stamina-reward': {
      if (!player || action.playerId !== player.id) return fail('当前球员已变化，请重新选择');
      const count = next.staminaRewardCount ?? 0;
      if (!Number.isSafeInteger(action.expectedCount) || action.expectedCount !== count) return fail('体力奖励已领取，请重新打开');
      if (action.method !== staminaRewardMethod(next)) return fail('体力奖励领取方式已变化，请重试');
      if (player.level >= playerLevelCap) return fail(`球员已达到 ${playerLevelCap} 级训练上限`);
      if (player.stamina >= staminaMax(next)) return fail('该球员体力已满');
      if (!Number.isSafeInteger(count + 1)) return fail('体力奖励次数已达到上限');
      const restoredStamina = staminaMax(next) - player.stamina;
      player.stamina = staminaMax(next);
      player.recoveryMs = 0;
      next.staminaRewardCount = count + 1;
      events.push({type: 'stamina-rewarded', playerId: player.id, restoredStamina});
      break;
    }
    case 'complete-cooperation-ad': {
      const trainee = action.scope === 'roster' ? activePlayers(next).find(entry => entry.id === action.playerId) : player;
      if (!trainee || action.playerId !== trainee.id) return fail('当前球员已变化，请重新选择');
      const active = trainee.cooperation;
      if ((active?.id ?? null) !== action.expectedCooperationId
        || (active ? active.acceptedRevision ?? 0 : null) !== action.expectedCooperationRevision) return fail('合作目标已变化，请重新选择');
      if (!cooperationOffers(next, trainee).some(offer => offer.id === action.id)) return fail('合作目标已变化，请重新选择');
      if (active?.id === action.id && cooperationStatus(next, trainee).complete) return fail('该合作已经达成');
      if (active?.id !== action.id) {
        trainee.cooperation = {id: action.id, playerId: trainee.id, acceptedShots: trainee.shots,
          acceptedCourses: trainee.training.completedCourses, acceptedRevision: original.revision + 1, adCompleted: true};
        trainee.equipmentTraining.cooperationCourses = [0, 0];
        trainee.equipmentTraining.cooperationCourseShots = [0, 0];
      } else active.adCompleted = true;
      events.push({type: 'cooperation-ad-completed', playerId: trainee.id, id: action.id});
      events.push({type: 'cooperation-ready', playerId: trainee.id, id: action.id});
      break;
    }
    case 'buy-equipment': {
      const offer = equipmentOffer(next, action.id);
      if (offer.price === null) return fail(offer.reason ?? '器材暂不可购');
      if (next.credits < offer.price) return fail('赞助券不足');
      if (action.destination === 'warehouse' && action.replaceId !== undefined) return fail('入库购买不会替换馆内器材');
      if (action.destination !== 'warehouse') {
        const invalidInstallation = installationError(next, action.id, action.replaceId);
        if (invalidInstallation) return fail(invalidInstallation);
      }
      next.credits -= offer.price;
      next.ownedEquipment.push(action.id);
      next.purchasePrices[action.id] = offer.price;
      next.collectedEquipment[action.id] ??= {firstAt: now};
      events.push({type: 'equipment-bought', id: action.id});
      if (action.destination !== 'warehouse') {
        installEquipment(next, action.id, action.replaceId, events);
        reconcileRecovery(timed, next);
        for (const trainee of activePlayers(next)) rememberPlayer(next, events, trainee);
      }
      break;
    }
    case 'equip': {
      if (!catalogById.has(action.id) || !next.ownedEquipment.includes(action.id)) return fail('请先获得该器材');
      if (next.equippedEquipment.includes(action.id)) return fail('该器材已在馆内生效');
      const invalidInstallation = installationError(next, action.id, action.replaceId);
      if (invalidInstallation) return fail(invalidInstallation);
      installEquipment(next, action.id, action.replaceId, events);
      reconcileRecovery(timed, next);
      for (const trainee of activePlayers(next)) rememberPlayer(next, events, trainee);
      break;
    }
    case 'unequip': {
      if (!next.equippedEquipment.includes(action.id)) return fail('该器材尚未启用');
      next.equippedEquipment = next.equippedEquipment.filter(id => id !== action.id);
      reconcileRecovery(timed, next);
      events.push({type: 'unequipped', id: action.id});
      break;
    }
    case 'sell-equipment': {
      if (!catalogById.has(action.id) || !next.ownedEquipment.includes(action.id)) return fail('仓库中已没有该器材');
      if (next.equippedEquipment.includes(action.id)) return fail('馆内生效的器材不能直接出售，请先替换入仓库');
      const refund = equipmentSaleValue(next, action.id);
      if (!Number.isSafeInteger(next.credits + refund)) return fail('赞助券已达到数值上限');
      next.ownedEquipment = next.ownedEquipment.filter(id => id !== action.id);
      delete next.purchasePrices[action.id];
      next.credits += refund;
      events.push({type: 'equipment-sold', id: action.id, credits: refund});
      break;
    }
    case 'buy-drink':
    case 'buy-consumable': {
      const id = action.type === 'buy-drink' ? 'drink' : action.id;
      const item = consumableById.get(id);
      if (!item) return fail('消耗品不存在');
      if (item.retired) return fail('该消耗品已停止销售，已有库存仍可使用');
      if (next.gymLevel < item.unlockLevel) return fail(`球馆 ${item.unlockLevel} 级开放${item.name}`);
      if (next.credits < item.price) return fail('赞助券不足');
      if (!Number.isSafeInteger(consumableCount(next, id) + 1)) return fail('消耗品库存已达到上限');
      next.credits -= item.price;
      next.inventory[id] = consumableCount(next, id) + 1;
      events.push({type: id === 'drink' ? 'drink-bought' : 'consumable-bought', id});
      break;
    }
    case 'use-drink':
    case 'use-consumable': {
      const playerId = action.type === 'use-drink' ? action.id : action.playerId;
      const id = action.type === 'use-drink' ? 'drink' : action.id;
      if (!player || playerId !== player.id) return fail('当前球员已变化，请重新选择');
      const reason = consumableUseReason(next, id);
      if (reason) return fail(reason);
      next.inventory[id] = consumableCount(next, id) - 1;
      if (id === 'drink' || id === 'brace') {
        player.stamina = Math.min(staminaMax(next), id === 'brace' ? staminaMax(next) : player.stamina + drinkRecovery);
        if (player.stamina === staminaMax(next)) player.recoveryMs = 0;
      } else if (id === 'timer') {
        const nextShotAt = player.nextShotAt;
        for (let shot = 0; shot < 10 && player.stamina >= 1 && player.level < playerLevelCap; shot++) trainPlayer(next, player, now, events);
        // A time-saving item creates no wall-clock recovery and keeps the normal next-shot gate.
        player.nextShotAt = Math.max(nextShotAt, now + shotCooldownMs);
      } else if (id === 'chalk') {
        player.greatShotsRemaining = chalkTrainingShots;
        delete player.greatShotReady;
      } else if (id === 'supplement') {
        for (const trainee of activePlayers(next)) if (trainee.level < playerLevelCap) {
          trainee.stamina = Math.min(staminaMax(next), trainee.stamina + teamSupplyRecovery);
          if (trainee.stamina === staminaMax(next)) trainee.recoveryMs = 0;
        }
      }
      events.push({type: id === 'drink' ? 'drink-used' : 'consumable-used', id, playerId: player.id});
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
      if (action.targetLevel !== undefined && action.targetLevel !== next.gymLevel + 1) return fail('球馆已变化，请重新确认扩建');
      const offer = gymUpgrade(next);
      if (!offer.canUpgrade || !offer.level) return fail(offer.reason);
      next.credits -= offer.price;
      next.gymLevel = offer.level.level;
      events.push({type: 'gym-upgraded', id: String(next.gymLevel)});
      break;
    }
    default: return fail('未知操作');
  }
  next.revision = original.revision + 1;
  return {state: next, events};
}
