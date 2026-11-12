import {hash} from '../contract/random';
import {statKeys} from '../types';
import {templateRules} from '../contract/templates';
import {equipmentCatalog, projects} from './catalog';
import {buildCooperationOffers} from './cooperation';
import {staminaMax, type GymPlayer, type GymState} from './engine';
import {requiredExperience} from './progression';

export type GymStorage = Pick<Storage, 'getItem' | 'setItem'>;
export const gymSaveKeys = {main: 'gym-management-v1', backup: 'gym-management-v1.backup'};
const templateIds = new Set(templateRules.map(template => template.id));
const equipmentIds = new Set(equipmentCatalog.map(equipment => equipment.id));
const tiers = new Set(templateRules.map(template => template.tier));
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const finite = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 120;
const money = (value: unknown): value is string => typeof value === 'string' && value.length <= 20_000 && /^(0|[1-9]\d*)$/.test(value);
const has = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

function agreement(value: unknown, athlete: Record<string, unknown>): boolean {
  return value === null || (record(value) && text(value.id) && value.playerId === athlete.id
    && integer(value.acceptedShots, 0, athlete.shots as number)
    && integer(value.acceptedCourses, 0, record(athlete.training) ? athlete.training.completedCourses as number : 0));
}

function stats(value: unknown, min: number, max: number, whole = true): value is Record<typeof statKeys[number], number> {
  return record(value) && statKeys.every(key => whole ? integer(value[key], min, max) : finite(value[key], min, max));
}

function training(value: unknown): boolean {
  return record(value) && ['balanced', 'shooting', 'finishing', 'interior'].includes(String(value.planId))
    && integer(value.shots, 0, 9) && integer(value.completedCourses);
}

function player(value: unknown, updatedAt: number, gymLevel: number, legacy: boolean, balanceVersion: 1 | 2 | 3): value is GymPlayer {
  if (!record(value) || !text(value.id) || !text(value.name) || !integer(value.enteredAt, 0, updatedAt)
    || !integer(value.height, 178, 218) || !integer(value.level, 0, 99) || !integer(value.peakLevel, value.level, 99)
    || !integer(value.matchSeed, 0, 0xffffffff) || !integer(value.shots) || !integer(value.stamina, 0, 90)
    || !integer(value.recoveryMs, 0, 19_999) || !stats(value.stats, 0, 99) || !stats(value.entryStats, 24, 54)
    || !stats(value.bias, 0, 1, false) || !stats(value.lastStyle, -3, 3, false)) return false;
  const currentStats = value.stats;
  const entryStats = value.entryStats;
  if (!statKeys.every(key => currentStats[key] >= entryStats[key])) return false;
  const level = value.level as number;
  const requirement = balanceVersion === 1 ? 20 + 6 * level + level * level : requiredExperience(level);
  if ((!legacy || has(value, 'experience')) && !integer(value.experience, 0, level === 99 ? 0 : requirement - 1)) return false;
  if ((!legacy || has(value, 'nextShotAt')) && !integer(value.nextShotAt)) return false;
  if ((!legacy || has(value, 'autoEnabled')) && (typeof value.autoEnabled !== 'boolean' || (gymLevel < 2 && value.autoEnabled))) return false;
  if ((!legacy || has(value, 'cooperation')) && !agreement(value.cooperation, value)) return false;
  if ((!legacy || Object.prototype.hasOwnProperty.call(value, 'enteredGymLevel')) && !integer(value.enteredGymLevel, 1, gymLevel)) return false;
  if (!legacy || Object.prototype.hasOwnProperty.call(value, 'training')) {
    if (!training(value.training) || !record(value.training)) return false;
    if ((value.training.completedCourses as number) > Math.floor(value.shots / 10)
      || (value.training.completedCourses as number) * 10 + (value.training.shots as number) > value.shots) return false;
  }
  if (value.templateId !== null && (typeof value.templateId !== 'string' || !templateIds.has(value.templateId))) return false;
  if (value.highestTier !== null && !tiers.has(value.highestTier as never)) return false;
  if (!record(value.book)) return false;
  const book = value.book;
  return ['base', 'greatBank', 'flat', 'permanent'].every(key => {
    const fraction = book[key];
    return record(fraction) && money(fraction.n) && money(fraction.d) && fraction.d !== '0';
  });
}

function idList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= equipmentIds.size && new Set(value).size === value.length
    && value.every(id => typeof id === 'string' && equipmentIds.has(id));
}

function validGymShape(value: unknown, legacy = false): value is GymState {
  if (!record(value) || value.kind !== 'gym-management' || value.version !== 1 || !integer(value.seed, 0, 0xffffffff)
    || !integer(value.revision) || !integer(value.updatedAt) || !integer(value.createdAt, 0, value.updatedAt) || !integer(value.nextPlayer, 1)
    || !integer(value.credits) || !integer(value.fame) || !integer(value.gymLevel, 1, 8)
    || !record(value.projects) || !record(value.inventory) || !integer(value.inventory.drink)
    || !idList(value.ownedEquipment) || !idList(value.equippedEquipment)) return false;
  if (legacy ? has(value, 'balanceVersion') && ![1, 2, 3].includes(value.balanceVersion as number) : value.balanceVersion !== 3) return false;
  const balanceVersion = value.balanceVersion === 3 ? 3 : value.balanceVersion === 2 ? 2 : 1;
  if (balanceVersion >= 2 && !has(value, 'bench')) return false;
  const projectLevels = value.projects;
  const owned = value.ownedEquipment;
  if (Object.keys(projectLevels).length !== projects.length || !projects.every(project => {
    const limit = Math.min(project.maxLevel, Math.max(0, value.gymLevel as number - project.unlockLevel + 1));
    return integer(projectLevels[project.id], 0, limit);
  })) return false;
  if (value.equippedEquipment.length > 4 + (value.projects.equipment as number)
    || !value.equippedEquipment.every(id => owned.includes(id))) return false;
  if (!record(value.rng)) return false;
  const rng = value.rng;
  if (!['recruits', 'economy', 'attributes'].every(key => record(rng[key]) && integer(rng[key].state, 0, 0xffffffff))) return false;
  if (!record(value.collection) || !Object.entries(value.collection).every(([id, entry]) => templateIds.has(id)
    && record(entry) && integer(entry.firstAt, 0, value.updatedAt as number) && finite(entry.highestRating, 0, 99) && money(entry.highestValue))) return false;
  if (!record(value.collectedEquipment) || !Object.entries(value.collectedEquipment).every(([id, entry]) => equipmentIds.has(id)
    && record(entry) && integer(entry.firstAt, 0, value.updatedAt as number))) return false;
  const collectedEquipment = value.collectedEquipment;
  if (!owned.every(id => Object.prototype.hasOwnProperty.call(collectedEquipment, id))) return false;
  const oldFormat = legacy && !has(value, 'bench');
  if (!oldFormat && (has(value, 'nextShotAt') || has(value, 'cooperation'))) return false;
  if (has(value, 'nextShotAt') && !integer(value.nextShotAt)) return false;
  if (!oldFormat && (!Array.isArray(value.bench) || value.bench.length > (value.gymLevel as number) - (value.player ? 1 : 0))) return false;
  const bench: unknown[] = Array.isArray(value.bench) ? value.bench : [];
  if (value.player === null && bench.length) return false;
  if (value.player !== null && !player(value.player, value.updatedAt as number, value.gymLevel as number, oldFormat, balanceVersion)) return false;
  if (bench.some(athlete => !player(athlete, value.updatedAt as number, value.gymLevel as number, false, balanceVersion))) return false;
  if (has(value, 'cooperation') && (!record(value.player) ? value.cooperation !== null : !agreement(value.cooperation, value.player))) return false;
  if (!Array.isArray(value.alumni) || value.alumni.length > 100_000) return false;
  const activePlayers = [...(value.player ? [value.player] : []), ...bench] as GymPlayer[];
  if (balanceVersion === 3 && activePlayers.some(athlete => athlete.stamina > staminaMax(value as unknown as GymState))) return false;
  const playerIds = new Set(activePlayers.map(athlete => athlete.id));
  if (playerIds.size !== activePlayers.length) return false;
  for (const alumnus of value.alumni) {
    if (!record(alumnus)) return false;
    const fields: Record<string, unknown> = alumnus;
    if (!player(alumnus, value.updatedAt as number, value.gymLevel as number, oldFormat, balanceVersion) || playerIds.has(alumnus.id)
      || !integer(fields.recommendedAt, alumnus.enteredAt, value.updatedAt) || !integer(fields.rewardCredits, 0, 27)
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

function restoreGym(value: unknown): GymState | null {
  const sourceBalanceVersion = record(value) ? value.balanceVersion : undefined;
  if (!validGymShape(value, true)) return null;
  const oldFormat = !has(value, 'bench');
  const oldBalance = sourceBalanceVersion !== 2 && sourceBalanceVersion !== 3;
  const oldStamina = sourceBalanceVersion !== 3;
  if (oldFormat) value.bench = [];
  for (const athlete of [...value.alumni, ...(value.player ? [value.player] : []), ...value.bench]) {
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
      athlete.experience = athlete.level === 99 ? 0 : Math.floor(athlete.experience * requiredExperience(athlete.level) / oldRequirement);
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
  return JSON.stringify({format: 'gym-management-envelope-v1', checksum: hash(payload), payload});
}

export function decodeGym(raw: string | null): GymState | null {
  try {
    if (!raw || raw.length > 20_000_000) return null;
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
  let encoded: string;
  try {
    encoded = encodeGym(state);
    storage.setItem(gymSaveKeys.main, encoded);
  } catch (error) { return {ok: false, error: error instanceof Error ? error.message : 'save-failed'}; }
  // The main write is the commit. A new backup must never become visible before it.
  try {
    storage.setItem(gymSaveKeys.backup, encoded);
    return {ok: true, backupOk: true};
  } catch { return {ok: true, backupOk: false}; }
}
