import {hash} from '../contract/random';
import {statKeys} from '../types';
import {templateRules} from '../contract/templates';
import {equipmentCatalog, previousEquipmentCatalog, legacyEquipmentCatalog, equipmentCanonicalIds, equipmentCatalogVersion, projects, maximumRecommendationCredits} from './catalog';
import {buildCooperationOffers} from './cooperation';
import {legacyEquipmentPurchasePrice, staminaMax, type EquipmentBonuses, type GymAlumnus, type GymPlayer, type GymState} from './engine';
import {playerLevelCap, requiredExperience} from './progression';
import {allGymConsumables, maximumStoredChalkShots} from './consumables';

export type GymStorage = Pick<Storage, 'getItem' | 'setItem'>;
export const gymSaveKeys = {main: 'gym-management-v1', backup: 'gym-management-v1.backup'};
/** Writer and reader must agree before either recoverable copy is replaced. */
export const gymSaveMaxCharacters = 20_000_000;
const templateIds = new Set(templateRules.map(template => template.id));
const equipmentIds = new Set(equipmentCatalog.map(equipment => equipment.id));
const equipmentById = new Map(equipmentCatalog.map(equipment => [equipment.id, equipment]));
const previousEquipmentIds = new Set(previousEquipmentCatalog.map(equipment => equipment.id));
const legacyEquipmentIds = new Set(legacyEquipmentCatalog.map(equipment => equipment.id));
const legacyEquipmentById = new Map(legacyEquipmentCatalog.map(equipment => [equipment.id, equipment]));
const tiers = new Set(templateRules.map(template => template.tier));
const legacyPlayerLevelCap = 99;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const finite = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 120;
const money = (value: unknown): value is string => typeof value === 'string' && value.length <= 20_000 && /^(0|[1-9]\d*)$/.test(value);
const has = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

function agreement(value: unknown, athlete: Record<string, unknown>): boolean {
  return value === null || (record(value) && text(value.id) && value.playerId === athlete.id
    && integer(value.acceptedShots, 0, athlete.shots as number)
    && integer(value.acceptedCourses, 0, record(athlete.training) ? athlete.training.completedCourses as number : 0)
    && (!has(value, 'acceptedRevision') || integer(value.acceptedRevision))
    && (!has(value, 'adCompleted') || typeof value.adCompleted === 'boolean'));
}

function stats(value: unknown, min: number, max: number, whole = true): value is Record<typeof statKeys[number], number> {
  return record(value) && statKeys.every(key => whole ? integer(value[key], min, max) : finite(value[key], min, max));
}

function training(value: unknown): boolean {
  return record(value) && ['balanced', 'shooting', 'finishing', 'interior'].includes(String(value.planId))
    && integer(value.shots, 0, 9) && integer(value.completedCourses);
}

function equipmentTraining(value: unknown, athlete: Record<string, unknown>, allowMissingPartial: boolean): boolean {
  if (!record(value) || !integer(value.brandShots, 0, athlete.shots as number)
    || !integer(value.brandTotal, 0, value.brandShots * 50)
    || !Array.isArray(value.cooperationCourses) || value.cooperationCourses.length !== 2) return false;
  const courses = record(athlete.training) ? athlete.training.completedCourses as number : 0;
  const accepted = record(athlete.cooperation) ? athlete.cooperation.acceptedCourses as number : courses;
  if (!integer(value.cooperationCourses[0], 0, Math.min(2, courses - accepted))
    || !integer(value.cooperationCourses[1], 0, value.cooperationCourses[0])) return false;
  if (!has(value, 'cooperationCourseShots')) return allowMissingPartial;
  const currentCourse = record(athlete.cooperation) && record(athlete.training) ? athlete.training.shots as number : 0;
  return Array.isArray(value.cooperationCourseShots) && value.cooperationCourseShots.length === 2
    && integer(value.cooperationCourseShots[0], 0, currentCourse)
    && integer(value.cooperationCourseShots[1], 0, value.cooperationCourseShots[0]);
}

function player(value: unknown, updatedAt: number, gymLevel: number, legacy: boolean, balanceVersion: 1 | 2 | 3, equipmentMetadataRequired: boolean, allowMissingPartial: boolean): value is GymPlayer {
  const levelCap = balanceVersion === 3 ? playerLevelCap : legacyPlayerLevelCap;
  if (!record(value) || !text(value.id) || !text(value.name) || !integer(value.enteredAt, 0, updatedAt)
    || !integer(value.height, 178, 218) || !integer(value.level, 0, levelCap) || !integer(value.peakLevel, value.level, levelCap)
    || !integer(value.matchSeed, 0, 0xffffffff) || !integer(value.shots) || !integer(value.stamina, 0, 90)
    || !integer(value.recoveryMs, 0, 19_999) || !stats(value.stats, 0, 99) || !stats(value.entryStats, 24, 54)
    || !stats(value.bias, 0, 1, false) || !stats(value.lastStyle, -3, 3, false)) return false;
  const currentStats = value.stats;
  const entryStats = value.entryStats;
  if (!statKeys.every(key => currentStats[key] >= entryStats[key])) return false;
  const level = value.level as number;
  const requirement = balanceVersion === 1 ? 20 + 6 * level + level * level : requiredExperience(level);
  if ((!legacy || has(value, 'experience')) && !integer(value.experience, 0, level === levelCap ? 0 : requirement - 1)) return false;
  if ((!legacy || has(value, 'nextShotAt')) && !integer(value.nextShotAt)) return false;
  if ((!legacy || has(value, 'autoEnabled')) && (typeof value.autoEnabled !== 'boolean' || (gymLevel < 2 && value.autoEnabled))) return false;
  if (has(value, 'greatShotReady') && typeof value.greatShotReady !== 'boolean') return false;
  if (has(value, 'greatShotsRemaining') && !integer(value.greatShotsRemaining, 1, maximumStoredChalkShots)) return false;
  if (has(value, 'shareLevelClaimed') && typeof value.shareLevelClaimed !== 'boolean') return false;
  if (has(value, 'highPotential') && typeof value.highPotential !== 'boolean') return false;
  if (has(value, 'overflowExperience') && !integer(value.overflowExperience)) return false;
  if ((!legacy || has(value, 'cooperation')) && !agreement(value.cooperation, value)) return false;
  if ((!legacy || Object.prototype.hasOwnProperty.call(value, 'enteredGymLevel')) && !integer(value.enteredGymLevel, 1, gymLevel)) return false;
  if (!legacy || Object.prototype.hasOwnProperty.call(value, 'training')) {
    if (!training(value.training) || !record(value.training)) return false;
    if ((value.training.completedCourses as number) > Math.floor(value.shots / 10)
      || (value.training.completedCourses as number) * 10 + (value.training.shots as number) > value.shots) return false;
  }
  if ((equipmentMetadataRequired || has(value, 'equipmentTraining')) && !equipmentTraining(value.equipmentTraining, value, allowMissingPartial)) return false;
  if (value.templateId !== null && (typeof value.templateId !== 'string' || !templateIds.has(value.templateId))) return false;
  if (value.highestTier !== null && !tiers.has(value.highestTier as never)) return false;
  if (!record(value.book)) return false;
  const book = value.book;
  return ['base', 'greatBank', 'flat', 'permanent'].every(key => {
    const fraction = book[key];
    return record(fraction) && money(fraction.n) && money(fraction.d) && fraction.d !== '0';
  });
}

function idList(value: unknown, allowed: ReadonlySet<string>): value is string[] {
  return Array.isArray(value) && value.length <= allowed.size && new Set(value).size === value.length
    && value.every(id => typeof id === 'string' && allowed.has(id));
}

/** Historical records are checked only when their requested page is read. */
export function validGymAlumnus(value: unknown, state: Pick<GymState, 'updatedAt' | 'gymLevel'>): value is GymAlumnus {
  if (!record(value)) return false;
  const fields: Record<string, unknown> = value;
  return player(value, state.updatedAt, state.gymLevel, false, 3, true, false)
    && integer(fields.recommendedAt, value.enteredAt, state.updatedAt)
    && integer(fields.rewardCredits, 0, maximumRecommendationCredits) && integer(fields.rewardFame) && money(fields.finalValue);
}

/** Exact aggregate of the old installation, retained for its pending absence. */
function legacyEffects(state: GymState): EquipmentBonuses {
  const effects: EquipmentBonuses = {stamina: 0, recovery: 0, valuePercent: 0,
    focus: Object.fromEntries(statKeys.map(key => [key, 0])) as EquipmentBonuses['focus'],
    courseRecovery: 0, cooperationBonus: 0, experience: 0, automationExperience: 0, offlineMinutes: 0};
  for (const id of state.equippedEquipment) if (state.ownedEquipment.includes(id)) {
    const item = legacyEquipmentById.get(id)!;
    effects.stamina += item.effects.stamina;
    effects.recovery += item.effects.recovery;
    effects.valuePercent += item.effects.valuePercent;
    effects.courseRecovery += item.effects.courseRecovery;
    effects.cooperationBonus += item.effects.cooperationBonus;
    if (item.effects.focusKey) effects.focus[item.effects.focusKey] += item.effects.focusPower;
  }
  effects.stamina = Math.min(20, effects.stamina);
  effects.recovery = Math.min(4, effects.recovery);
  effects.courseRecovery = Math.min([1, 2, 2, 3, 3, 4, 4, 4][state.gymLevel - 1], effects.courseRecovery);
  effects.cooperationBonus = Math.min(2, effects.cooperationBonus);
  for (const key of statKeys) effects.focus[key] = Math.min(1.5, effects.focus[key]);
  return effects;
}

function validPendingEffects(value: unknown, gymLevel: number): boolean {
  return record(value) && integer(value.stamina, 0, 20) && integer(value.recovery, 0, 4)
    && integer(value.valuePercent, 0, 280) && stats(value.focus, 0, 1.5, false)
    && integer(value.courseRecovery, 0, [1, 2, 2, 3, 3, 4, 4, 4][gymLevel - 1])
    && integer(value.cooperationBonus, 0, 2) && value.experience === 0
    && value.automationExperience === 0 && value.offlineMinutes === 0;
}

function validGymShape(value: unknown, legacy = false): value is GymState {
  if(record(value)&&has(value,'offlineReward')){
    const reward=value.offlineReward;
    if(!record(reward)||typeof reward.claimed!=='boolean'||typeof reward.dismissed!=='boolean'||!record(reward.report))return false;
    const r=reward.report;
    if(!text(r.reportId)||![r.from,r.to,r.elapsedMs,r.creditedMs,r.capMs,r.totalShots,r.totalExperience].every(v=>integer(v))
      ||(r.to as number)>(value.updatedAt as number)||r.elapsedMs!==(r.to as number)-(r.from as number)||(r.creditedMs as number)>(r.elapsedMs as number)
      ||typeof r.capped!=='boolean'||!Array.isArray(r.players)||r.players.length>8||new Set(r.players.map(p=>record(p)?p.id:null)).size!==r.players.length)return false;
    let xp=0,shots=0;
    for(const p of r.players){if(!record(p)||!text(p.id)||!text(p.name)||![p.shots,p.xpGained,p.courses,p.staminaBefore,p.staminaAfter].every(v=>integer(v))
      ||!integer(p.levelBefore,0,playerLevelCap)||!integer(p.levelAfter,p.levelBefore,playerLevelCap)
      ||!(p.templateBefore===null||typeof p.templateBefore==='string'&&templateIds.has(p.templateBefore))
      ||!(p.templateAfter===null||typeof p.templateAfter==='string'&&templateIds.has(p.templateAfter)))return false;
      xp+=p.xpGained as number;shots+=p.shots as number;
    }
    if(xp!==r.totalExperience||shots!==r.totalShots)return false;
    if(has(r,'bonusExperience')){
      if(!record(r.bonusExperience)||Object.keys(r.bonusExperience).length!==r.players.length)return false;
      for(const p of r.players as Record<string,unknown>[]){if(!has(r.bonusExperience,p.id as string)||!integer(r.bonusExperience[p.id as string],0,p.xpGained as number))return false;}
    }
  }
  if (record(value) && has(value, 'staminaRewardCount') && !integer(value.staminaRewardCount)) return false;
  if (record(value) && has(value, 'recommendationRulesVersion') && value.recommendationRulesVersion !== 11) return false;
  if (record(value) && value.recommendationRulesVersion === 11 && !idList(value.postgameRecommendedTemplates, templateIds)) return false;
  if (record(value) && has(value, 'postgameRecommendedTemplates') && !idList(value.postgameRecommendedTemplates, templateIds)) return false;
  if (record(value) && has(value, 'collectionGoalId') && value.collectionGoalId !== null
    && (typeof value.collectionGoalId !== 'string' || !templateIds.has(value.collectionGoalId))) return false;
  if (record(value) && has(value, 'alumniArchive')) {
    const archive = value.alumniArchive;
    if (!record(archive) || !text(archive.id) || !/^[a-zA-Z0-9_-]+$/.test(archive.id)
      || !integer(archive.count, 1) || !integer(archive.effectiveCount, 0, archive.count)
      || !integer(archive.legendCount, 0, archive.effectiveCount) || !integer(archive.bestTier, 0, 5)
      || (archive.effectiveCount === 0 ? archive.bestTier !== 0 : archive.bestTier < 1)
      || ((archive.legendCount > 0) !== (archive.bestTier === 5))) return false;
  }
  if (record(value) && has(value, 'offlineRulesVersion') && value.offlineRulesVersion !== 1 && value.offlineRulesVersion !== 2) return false;
  if (record(value) && (legacy ? has(value, 'equipmentCatalogVersion') && ![1, 2, 3].includes(value.equipmentCatalogVersion as number)
    : value.equipmentCatalogVersion !== equipmentCatalogVersion)) return false;
  const legacyCatalog = legacy && record(value) && value.equipmentCatalogVersion !== equipmentCatalogVersion;
  const allowedEquipment = legacyCatalog ? record(value) && value.equipmentCatalogVersion === 2 ? previousEquipmentIds : legacyEquipmentIds : equipmentIds;
  if (!record(value) || value.kind !== 'gym-management' || value.version !== 1 || !integer(value.seed, 0, 0xffffffff)
    || !integer(value.revision) || !integer(value.updatedAt) || !integer(value.createdAt, 0, value.updatedAt) || !integer(value.nextPlayer, 1)
    || !integer(value.credits) || !integer(value.fame) || !integer(value.gymLevel, 1, 8)
    || !record(value.projects) || !record(value.inventory) || !integer(value.inventory.drink)
    || !idList(value.ownedEquipment, allowedEquipment) || !idList(value.equippedEquipment, allowedEquipment)) return false;
  if (!allGymConsumables.every(item => !has(value.inventory as object, item.id) || integer((value.inventory as Record<string, unknown>)[item.id]))) return false;
  const owned = value.ownedEquipment;
  if (!legacy || has(value, 'purchasePrices')) {
    if (!record(value.purchasePrices) || Object.keys(value.purchasePrices).length !== owned.length
      || !Object.entries(value.purchasePrices).every(([id, cost]) => owned.includes(id) && integer(cost, 1))) return false;
  }
  if (legacy ? has(value, 'balanceVersion') && ![1, 2, 3].includes(value.balanceVersion as number) : value.balanceVersion !== 3) return false;
  const balanceVersion = value.balanceVersion === 3 ? 3 : value.balanceVersion === 2 ? 2 : 1;
  if (balanceVersion >= 2 && !has(value, 'bench')) return false;
  const projectLevels = value.projects;
  if (Object.keys(projectLevels).length !== projects.length || !projects.every(project => {
    const limit = Math.min(project.maxLevel, Math.max(0, value.gymLevel as number - project.unlockLevel + 1));
    return integer(projectLevels[project.id], 0, limit);
  })) return false;
  if (value.equippedEquipment.length > 4 + (value.projects.equipment as number)
    || !value.equippedEquipment.every(id => owned.includes(id))) return false;
  if (!legacyCatalog && new Set(value.equippedEquipment.map(id => equipmentById.get(id)!.family)).size !== value.equippedEquipment.length) return false;
  if (has(value, 'pendingLegacyEquipmentEffects') && (legacyCatalog || !validPendingEffects(value.pendingLegacyEquipmentEffects, value.gymLevel))) return false;
  if (!record(value.rng)) return false;
  const rng = value.rng;
  if (!['recruits', 'economy', 'attributes'].every(key => record(rng[key]) && integer(rng[key].state, 0, 0xffffffff))) return false;
  if (!record(value.collection) || !Object.entries(value.collection).every(([id, entry]) => templateIds.has(id)
    && record(entry) && integer(entry.firstAt, 0, value.updatedAt as number) && finite(entry.highestRating, 0, 99) && money(entry.highestValue))) return false;
  if (!record(value.collectedEquipment) || !Object.entries(value.collectedEquipment).every(([id, entry]) => allowedEquipment.has(id)
    && record(entry) && integer(entry.firstAt, 0, value.updatedAt as number))) return false;
  const collectedEquipment = value.collectedEquipment;
  if (!owned.every(id => Object.prototype.hasOwnProperty.call(collectedEquipment, id))) return false;
  if (has(value, 'legacyEquipmentCollection') && (!record(value.legacyEquipmentCollection)
    || !Object.entries(value.legacyEquipmentCollection).every(([id, entry]) => legacyEquipmentIds.has(id)
      && record(entry) && integer(entry.firstAt, 0, value.updatedAt as number)))) return false;
  const oldFormat = legacy && !has(value, 'bench');
  if (!oldFormat && (has(value, 'nextShotAt') || has(value, 'cooperation'))) return false;
  if (has(value, 'nextShotAt') && !integer(value.nextShotAt)) return false;
  if (!oldFormat && (!Array.isArray(value.bench) || value.bench.length > (value.gymLevel as number) - (value.player ? 1 : 0))) return false;
  const bench: unknown[] = Array.isArray(value.bench) ? value.bench : [];
  if (value.player === null && bench.length) return false;
  if (value.player !== null && !player(value.player, value.updatedAt as number, value.gymLevel as number, oldFormat, balanceVersion, !legacyCatalog, legacy)) return false;
  if (bench.some(athlete => !player(athlete, value.updatedAt as number, value.gymLevel as number, false, balanceVersion, !legacyCatalog, legacy))) return false;
  if (has(value, 'cooperation') && (!record(value.player) ? value.cooperation !== null : !agreement(value.cooperation, value.player))) return false;
  if (!Array.isArray(value.alumni) || value.alumni.length > 100_000) return false;
  const activePlayers = [...(value.player ? [value.player] : []), ...bench] as GymPlayer[];
  const maximumStamina = legacyCatalog ? 20 + (value.projects.endurance as number) * 5 + legacyEffects(value as unknown as GymState).stamina : staminaMax(value as unknown as GymState);
  if (balanceVersion === 3 && activePlayers.some(athlete => athlete.stamina > maximumStamina)) return false;
  const playerIds = new Set(activePlayers.map(athlete => athlete.id));
  if (playerIds.size !== activePlayers.length) return false;
  for (const alumnus of value.alumni) {
    if (!record(alumnus)) return false;
    const fields: Record<string, unknown> = alumnus;
    if (!player(alumnus, value.updatedAt as number, value.gymLevel as number, oldFormat, balanceVersion, !legacyCatalog, legacy) || playerIds.has(alumnus.id)
      || !integer(fields.recommendedAt, alumnus.enteredAt, value.updatedAt) || !integer(fields.rewardCredits, 0, maximumRecommendationCredits)
      || !integer(fields.rewardFame) || !money(fields.finalValue)) return false;
    playerIds.add(alumnus.id);
  }
  return true;
}

export function validGym(value: unknown): value is GymState {
  if (!validGymShape(value)) return false;
  return [...(value.player ? [value.player] : []), ...value.bench].every(athlete => athlete.cooperation === null
    || buildCooperationOffers(value, athlete).some(offer => offer.id === athlete.cooperation!.id));
}

/** V1 deduplicates first; V2 assets are then retained by ID or refunded in full. */
function migrateEquipment(state: GymState): boolean {
  if (state.equipmentCatalogVersion === equipmentCatalogVersion) return true;
  const oldEffects = legacyEffects(state);
  const oldCatalogVersion = state.equipmentCatalogVersion;
  const installed = new Set(state.equippedEquipment);
  const groups = new Map<string, string[]>();
  for (const id of state.ownedEquipment) {
    const canonical = oldCatalogVersion === 2 ? id : equipmentCanonicalIds.get(id)!;
    const items = groups.get(canonical) ?? [];
    items.push(id);
    groups.set(canonical, items);
  }
  const owned: string[] = [];
  const purchasePrices: Record<string, number> = {};
  let refund = 0;
  for (const [canonical, items] of groups) {
    const ordered = [...items].sort((a, b) => Number(installed.has(b)) - Number(installed.has(a))
      || Number(b === canonical) - Number(a === canonical) || a.localeCompare(b));
    if (equipmentIds.has(canonical)) {
      owned.push(canonical);
      const previousCost = state.purchasePrices[ordered[0]];
      const retainedCost = Math.min(previousCost, equipmentById.get(canonical)!.price);
      purchasePrices[canonical] = retainedCost;
      refund += previousCost - retainedCost;
      if (!Number.isSafeInteger(refund)) return false;
    }
    // Deleted V2 assets are refunded too, including the representative itself.
    for (const id of equipmentIds.has(canonical) ? ordered.slice(1) : ordered) {
      refund += state.purchasePrices[id];
      if (!Number.isSafeInteger(refund)) return false;
    }
  }
  if (!Number.isSafeInteger(state.credits + refund)) return false;
  const collectedEquipment: GymState['collectedEquipment'] = {};
  const legacyEquipmentCollection = {...state.legacyEquipmentCollection};
  for (const [id, entry] of Object.entries(state.collectedEquipment)) {
    const archived = legacyEquipmentCollection[id];
    legacyEquipmentCollection[id] = {firstAt: Math.min(archived?.firstAt ?? entry.firstAt, entry.firstAt)};
    const canonical = oldCatalogVersion === 2 ? id : equipmentCanonicalIds.get(id)!;
    if (!equipmentIds.has(canonical)) continue;
    const previous = collectedEquipment[canonical];
    collectedEquipment[canonical] = {firstAt: Math.min(previous?.firstAt ?? entry.firstAt, entry.firstAt)};
  }
  state.credits += refund;
  state.ownedEquipment = owned;
  const mappedInstalled = [...new Set(state.equippedEquipment.map(id => oldCatalogVersion === 2 ? id : equipmentCanonicalIds.get(id)!))]
    .filter(id => equipmentIds.has(id));
  const bestByFamily = new Map<string, string>();
  for (const id of mappedInstalled) {
    const item = equipmentById.get(id)!;
    const previous = bestByFamily.get(item.family);
    if (!previous || item.grade > equipmentById.get(previous)!.grade) bestByFamily.set(item.family, id);
  }
  state.equippedEquipment = mappedInstalled.filter(id => bestByFamily.get(equipmentById.get(id)!.family) === id);
  state.purchasePrices = purchasePrices;
  state.collectedEquipment = collectedEquipment;
  state.legacyEquipmentCollection = legacyEquipmentCollection;
  state.equipmentCatalogVersion = equipmentCatalogVersion;
  // The pending absence still belongs to the old installation. It is consumed
  // once by the store before new equipment can affect a shot or recommendation.
  state.pendingLegacyEquipmentEffects = oldEffects;
  for (const athlete of [...state.alumni, ...(state.player ? [state.player] : []), ...state.bench]) {
    const brandTotal = Math.min(50, oldEffects.valuePercent) * athlete.shots;
    if (!Number.isSafeInteger(brandTotal)) return false;
    athlete.equipmentTraining = {brandTotal, brandShots: athlete.shots, cooperationCourses: [0, 0], cooperationCourseShots: [0, 0]};
  }
  return true;
}

function restoreGym(value: unknown): GymState | null {
  if (validGym(value)) return value;
  const sourceBalanceVersion = record(value) ? value.balanceVersion : undefined;
  if (!validGymShape(value, true)) return null;
  const oldFormat = !has(value, 'bench');
  const oldBalance = sourceBalanceVersion !== 2 && sourceBalanceVersion !== 3;
  const oldStamina = sourceBalanceVersion !== 3;
  if (oldFormat) value.bench = [];
  if (!has(value, 'purchasePrices')) value.purchasePrices = Object.fromEntries(value.ownedEquipment.map(id => [id, legacyEquipmentPurchasePrice(id)]));
  if (!migrateEquipment(value)) return null;
  for (const athlete of [...value.alumni, ...(value.player ? [value.player] : []), ...value.bench]) {
    if (!has(athlete.equipmentTraining, 'cooperationCourseShots')) athlete.equipmentTraining.cooperationCourseShots = [0, 0];
    if (!Object.prototype.hasOwnProperty.call(athlete, 'training')) athlete.training = {planId: 'balanced', shots: 0, completedCourses: 0};
    if (!Object.prototype.hasOwnProperty.call(athlete, 'enteredGymLevel')) athlete.enteredGymLevel = value.gymLevel;
    if (oldFormat) {
      if (!has(athlete, 'experience')) athlete.experience = 0;
      if (!has(athlete, 'nextShotAt')) athlete.nextShotAt = athlete === value.player ? value.nextShotAt ?? value.updatedAt : value.updatedAt;
      if (!has(athlete, 'autoEnabled')) athlete.autoEnabled = false;
      if (!has(athlete, 'cooperation')) athlete.cooperation = athlete === value.player ? value.cooperation ?? null : null;
    }
    if (oldBalance) {
      const oldRequirement = 20 + 6 * athlete.level + athlete.level * athlete.level;
      athlete.experience = athlete.level === legacyPlayerLevelCap ? 0 : Math.floor(athlete.experience * requiredExperience(athlete.level) / oldRequirement);
    }
  }
  if (oldStamina) for (const athlete of [...(value.player ? [value.player] : []), ...value.bench]) {
    athlete.stamina = Math.min(athlete.stamina, staminaMax(value));
    if (athlete.stamina === staminaMax(value)) athlete.recoveryMs = 0;
  }
  value.balanceVersion = 3;
  delete value.cooperation;
  delete value.nextShotAt;
  return validGym(value) ? value : null;
}

export function encodeGym(state: GymState): string {
  if (!validGym(state)) throw new Error('invalid-gym-state');
  const payload = JSON.stringify(state);
  const encoded = JSON.stringify({format: 'gym-management-envelope-v1', checksum: hash(payload), payload});
  if (encoded.length > gymSaveMaxCharacters) throw new Error('gym-save-too-large');
  return encoded;
}

export function decodeGym(raw: string | null): GymState | null {
  try {
    if (!raw || raw.length > gymSaveMaxCharacters) return null;
    const envelope = JSON.parse(raw);
    if (envelope?.format !== 'gym-management-envelope-v1' || typeof envelope.payload !== 'string' || hash(envelope.payload) !== envelope.checksum) return null;
    const state: unknown = JSON.parse(envelope.payload);
    return restoreGym(state);
  } catch { return null; }
}

export function readGym(storage: GymStorage): {state: GymState | null; source: 'main' | 'backup' | 'none'; error?: string} {
  try {
    const main = storage.getItem(gymSaveKeys.main);
    const state = decodeGym(main);
    if (state) return {state, source: 'main'};
    const backup = storage.getItem(gymSaveKeys.backup);
    const restored = decodeGym(backup);
    return {state: restored, source: restored ? 'backup' : 'none', ...(!restored && (main || backup) ? {error: 'invalid-save'} : {})};
  } catch { return {state: null, source: 'none', error: 'storage-unavailable'}; }
}

export function writeGym(storage: GymStorage, state: GymState): {ok: boolean; backupOk?: boolean; error?: string} {
  try { return writeGymEnvelope(storage, encodeGym(state)); }
  catch (error) { return {ok: false, error: error instanceof Error ? error.message : 'save-failed'}; }
}

/** Mirror the exact bytes returned by encodeGym after the IndexedDB commit. */
export function writeGymEnvelope(storage: GymStorage, encoded: string): {ok: boolean; backupOk?: boolean; error?: string} {
  try {
    storage.setItem(gymSaveKeys.main, encoded);
  } catch (error) { return {ok: false, error: error instanceof Error ? error.message : 'save-failed'}; }
  // The main write is the commit. A new backup must never become visible before it.
  try {
    storage.setItem(gymSaveKeys.backup, encoded);
    return {ok: true, backupOk: true};
  } catch { return {ok: true, backupOk: false}; }
}
