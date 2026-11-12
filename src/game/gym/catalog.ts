import {shopCatalog, type Rarity} from '../contract/commerce';
import {statKeys, type StatKey} from '../types';

export type ProjectId = 'endurance' | 'recovery' | 'recruitment' | 'equipment' | 'automation' | 'offline';
export type Project = {id: ProjectId; name: string; unlockLevel: number; maxLevel: number; basePrice: number; description: string; available: boolean};

export const projects: readonly Project[] = [
  {id: 'endurance', name: '耐力训练', unlockLevel: 1, maxLevel: 8, basePrice: 1, description: '每级增加 5 点体力上限。', available: true},
  {id: 'recovery', name: '恢复护理', unlockLevel: 1, maxLevel: 8, basePrice: 1, description: '每级将恢复 1 点体力所需时间缩短 1 秒。', available: true},
  {id: 'recruitment', name: '招生培养', unlockLevel: 2, maxLevel: 6, basePrice: 2, description: '每级使下一名新人出生六维各增加 1 点。', available: true},
  {id: 'equipment', name: '器械管理', unlockLevel: 2, maxLevel: 4, basePrice: 2, description: '每级增加 1 个器材启用槽。', available: true},
  {id: 'automation', name: '自动训练', unlockLevel: 2, maxLevel: 5, basePrice: 3, description: '球馆 2 级免费解锁在线自动训练，基础每 2 秒一球；项目每级缩短 0.2 秒，最低 1 秒。离线不补投。', available: true},
  {id: 'offline', name: '离线课表', unlockLevel: 4, maxLevel: 5, basePrice: 4, description: '后续版本开放离线训练，当前离线仅恢复体力。', available: false},
];

/** Cumulative training coupons; both actual level and actual template tier are required. */
export const trainingCreditMilestones = [
  {level: 10, tier: 2, credits: 2},
  {level: 18, tier: 3, credits: 6},
  {level: 25, tier: 4, credits: 12},
] as const;

export type GymLevel = {level: number; name: string; fame: number; requiredRecommendations: number; requiredTier: number; requiredLegends: number; requiredTemplates: number};
export const gymLevels: readonly GymLevel[] = [
  {level: 1, name: '社区训练馆', fame: 0, requiredRecommendations: 0, requiredTier: 0, requiredLegends: 0, requiredTemplates: 0},
  {level: 2, name: '街区训练馆', fame: 60, requiredRecommendations: 2, requiredTier: 0, requiredLegends: 0, requiredTemplates: 0},
  {level: 3, name: '城区训练馆', fame: 500, requiredRecommendations: 0, requiredTier: 3, requiredLegends: 0, requiredTemplates: 0},
  {level: 4, name: '区域训练中心', fame: 1300, requiredRecommendations: 0, requiredTier: 4, requiredLegends: 0, requiredTemplates: 0},
  {level: 5, name: '城市训练中心', fame: 3000, requiredRecommendations: 0, requiredTier: 5, requiredLegends: 0, requiredTemplates: 0},
  {level: 6, name: '省级训练基地', fame: 6000, requiredRecommendations: 0, requiredTier: 0, requiredLegends: 3, requiredTemplates: 8},
  {level: 7, name: '全国训练基地', fame: 11000, requiredRecommendations: 0, requiredTier: 0, requiredLegends: 8, requiredTemplates: 15},
  {level: 8, name: '传奇篮球学院', fame: 18000, requiredRecommendations: 0, requiredTier: 0, requiredLegends: 15, requiredTemplates: 25},
];

export type EquipmentEffects = {
  stamina: number; recovery: number; valuePercent: number; focusKey: StatKey | null; focusPower: number;
  courseRecovery: number; cooperationBonus: number;
};
export type GymEquipment = {id: string; name: string; rarity: Rarity; unlockLevel: number; price: number; effects: EquipmentEffects; description: string; requiredTemplates: number};

// Preserve each item's capacity, recovery and display-value effects while adding an active training or business use.
const recoveryIds = new Set([2, 4, 7, 11, 12, 17, 18, 19, 21, 22, 23, 26, 27, 32, 37, 40, 41, 42, 48, 49, 51, 52, 53, 55, 57, 59, 61, 62, 63, 70, 71, 72, 73, 78, 84, 85, 87, 88, 93, 95, 97]);
const valueIds = new Set([1, 5, 6, 8, 9, 10, 13, 20, 24, 29, 33, 35, 43, 45, 46, 50, 54, 58, 64, 66, 67, 68, 69, 74, 79, 81, 82, 83, 86, 89, 91, 92, 94, 96, 98]);
const tierBudget = {
  common: {stamina: 2, recovery: 1, valuePercent: 10},
  rare: {stamina: 4, recovery: 2, valuePercent: 20},
  legendary: {stamina: 7, recovery: 3, valuePercent: 35},
};

export const equipmentCatalog: readonly GymEquipment[] = shopCatalog.map(item => {
  const number = Number(item.id.slice(6));
  const budget = tierBudget[item.rarity];
  const effects: EquipmentEffects = {stamina: 0, recovery: 0, valuePercent: 0, focusKey: null, focusPower: 0, courseRecovery: 0, cooperationBonus: 0};
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
  const price = item.rarity === 'common' ? 1 + number % 2 : item.rarity === 'rare' ? 3 + number % 3 : 8 + number % 5;
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
