// Frozen V1/V2 definitions: used only for save migration and historical reports.
import {shopCatalog, type Rarity} from '../contract/commerce';
import {statKeys, type StatKey} from '../types';
export type LegacyEquipmentEffects = {stamina:number; recovery:number; valuePercent:number; focusKey:StatKey|null; focusPower:number; courseRecovery:number; cooperationBonus:number};
export type LegacyGymEquipment = {id:string; name:string; rarity:Rarity; unlockLevel:number; price:number; effects:LegacyEquipmentEffects; description:string; requiredTemplates:number};

// Preserve each item's capacity, recovery and display-value effects while adding an active training or business use.
const recoveryIds = new Set([2, 4, 7, 11, 12, 17, 18, 19, 21, 22, 23, 26, 27, 32, 37, 40, 41, 42, 48, 49, 51, 52, 53, 55, 57, 59, 61, 62, 63, 70, 71, 72, 73, 78, 84, 85, 87, 88, 93, 95, 97]);
const valueIds = new Set([1, 5, 6, 8, 9, 10, 13, 20, 24, 29, 33, 35, 43, 45, 46, 50, 54, 58, 64, 66, 67, 68, 69, 74, 79, 81, 82, 83, 86, 89, 91, 92, 94, 96, 98]);
const tierBudget = {
  common: {stamina: 2, recovery: 1, valuePercent: 10},
  rare: {stamina: 4, recovery: 2, valuePercent: 20},
  legendary: {stamina: 7, recovery: 3, valuePercent: 35},
};

/**
 * Permanent, gym-wide equipment prices, expressed in quarter-coupon units.
 * Recovery/course supply and repeatable cooperation income cost more than a
 * small capacity or display-brand boost. Equal effects at the same rarity have
 * equal prices regardless of their inherited item number or release month.
 */
export function legacyEquipmentPrice(rarity: Rarity, effects: LegacyEquipmentEffects): number {
  const tierCost = {common: 0, rare: 16, legendary: 40}[rarity];
  const strength = effects.stamina * 2 + effects.recovery * 4 + effects.valuePercent * 2 / 5
    + Math.round(effects.focusPower * 10) + effects.courseRecovery * 16 + effects.cooperationBonus * 16;
  return Math.max(2, Math.ceil((tierCost + strength) / 4));
}

/** Retained only to validate and migrate saves made before catalog deduplication. */
export const legacyEquipmentCatalog: readonly LegacyGymEquipment[] = shopCatalog.map(item => {
  const number = Number(item.id.slice(6));
  const budget = tierBudget[item.rarity];
  const effects: LegacyEquipmentEffects = {stamina: 0, recovery: 0, valuePercent: 0, focusKey: null, focusPower: 0, courseRecovery: 0, cooperationBonus: 0};
  if (recoveryIds.has(number)) effects.recovery = budget.recovery;
  else if (valueIds.has(number)) effects.valuePercent = budget.valuePercent;
  else effects.stamina = budget.stamina;
  if (number % 4 === 0) {
    effects.focusKey = statKeys[Math.floor(number / 4) % statKeys.length];
    effects.focusPower = item.rarity === 'common' ? .4 : item.rarity === 'rare' ? .7 : 1;
  } else if (number % 4 === 1) effects.courseRecovery = item.rarity === 'common' ? 1 : item.rarity === 'rare' ? 2 : 3;
  else if (number % 4 === 2) effects.valuePercent = Math.max(effects.valuePercent, budget.valuePercent);
  else effects.cooperationBonus = item.rarity === 'legendary' ? 2 : 1;
  const unlockLevel = Math.min(8, Math.max(item.rarity === 'legendary' ? 5 : item.rarity === 'rare' ? 3 : 1, item.month - 1));
  const price = legacyEquipmentPrice(item.rarity, effects);
  const descriptions: string[] = [];
  if (effects.stamina) descriptions.push(`体力上限 +${effects.stamina}（器材合计最多 +20）`);
  if (effects.recovery) descriptions.push(`体力恢复间隔缩短 ${effects.recovery} 秒（器材合计最多缩短 4 秒）`);
  if (effects.valuePercent) descriptions.push(`展示身价 +${effects.valuePercent}%，同时增加品牌声望倍率（器材倍率合计最多 +50%）`);
  if (effects.focusKey) descriptions.push(`${{three: '三分', mid: '中投', drive: '突破', inside: '篮下', handle: '控球', defense: '防守'}[effects.focusKey]}成长抽取权重 +${effects.focusPower}（单维器材加值最多 +1.5）`);
  if (effects.courseRecovery) descriptions.push(`每完成一课额外恢复 ${effects.courseRecovery} 体力（受馆级额外恢复上限限制）`);
  if (effects.cooperationBonus) descriptions.push(`完成合作且接取后完成至少 2 节课程，额外获得 ${effects.cooperationBonus} 券（器材合计最多 +2）`);
  const description = descriptions.join('；') + '。';
  return {id: item.id, name: item.name, rarity: item.rarity, unlockLevel, price, effects, description,
    requiredTemplates: item.locked ? Math.min(35, unlockLevel * 4) : 0};
});

export const previousEquipmentCatalogVersion = 2 as const;
const effectGroups = new Map<string, LegacyGymEquipment[]>();
for (const item of legacyEquipmentCatalog) {
  const signature = JSON.stringify(item.effects);
  const group = effectGroups.get(signature) ?? [];
  group.push(item);
  effectGroups.set(signature, group);
}
const canonicalIds = new Map<string, string>();
for (const group of effectGroups.values()) {
  const representative = [...group].sort((a, b) => a.unlockLevel - b.unlockLevel
    || a.requiredTemplates - b.requiredTemplates || a.id.localeCompare(b.id))[0];
  for (const item of group) canonicalIds.set(item.id, representative.id);
}
/** Complete effects, including the focus attribute, define equality. */
export const equipmentCanonicalIds: ReadonlyMap<string, string> = canonicalIds;
export const previousEquipmentCatalog: readonly LegacyGymEquipment[] = legacyEquipmentCatalog.filter(item => canonicalIds.get(item.id) === item.id);
export const removedEquipmentCatalog: readonly LegacyGymEquipment[] = legacyEquipmentCatalog.filter(item => canonicalIds.get(item.id) !== item.id);
