import { shopCatalog, type Rarity } from '../contract/commerce';
import { type StatKey } from '../types';
import { type LegacyEquipmentEffects } from './equipmentLegacy';
import { equipmentArtIds } from './equipmentArt';
export { equipmentArtVersion } from './equipmentArt';
export {
  legacyEquipmentCatalog, previousEquipmentCatalog, equipmentCanonicalIds, removedEquipmentCatalog,
  legacyEquipmentPrice
} from './equipmentLegacy';

export type ProjectId = 'endurance' | 'recovery' | 'recruitment' | 'equipment' | 'automation' | 'offline';
export type Project = { id: ProjectId; name: string; unlockLevel: number; maxLevel: number; basePrice: number; prices?: readonly number[]; description: string; available: boolean };

/** Economic configuration revision; save/effect schemas remain unchanged. */
export const gymEconomyVersion = 11 as const;
/** Optional admission service; never changes free recruitment or recommendation rewards. */
export const selectedRecruitmentPrice = 8;
export const selectedRecruitmentUnlockLevel = 6;

export const projects: readonly Project[] = [
  { id: 'endurance', name: '耐力训练', unlockLevel: 1, maxLevel: 8, basePrice: 1, prices: [1, 2, 3, 5, 7, 10, 14, 20], description: '每级增加 5 点体力上限，不补充当前体力。', available: true },
  { id: 'recovery', name: '恢复护理', unlockLevel: 1, maxLevel: 8, basePrice: 1, description: '每级将恢复 1 点体力所需时间缩短 1 秒。', available: true },
  { id: 'recruitment', name: '招生培养', unlockLevel: 2, maxLevel: 6, basePrice: 2, prices: [2, 4, 7, 10, 14, 20], description: '每级使下一名新人出生六维各增加 1 点。', available: true },
  { id: 'equipment', name: '器械管理', unlockLevel: 2, maxLevel: 4, basePrice: 2, description: '每级增加 1 个器材启用槽。', available: true },
  { id: 'automation', name: '自动训练', unlockLevel: 2, maxLevel: 5, basePrice: 3, description: '球馆 2 级免费解锁在线与离线自动训练。项目每级使每球经验额外 +1，并缩短出手间隔 0.2 秒，最低 1 秒；体力不足仍需恢复。', available: true },
  { id: 'offline', name: '离线课表', unlockLevel: 2, maxLevel: 5, basePrice: 2, description: '球馆 2 级免费获得 30 分钟离线训练；项目依次提升至 45、60、90、120、180 分钟。超时只恢复体力，仅训练开启自动的球员。', available: true },
];

/** Cumulative training coupons; both actual level and actual template tier are required. */
export const trainingCreditMilestones = [
  { level: 10, tier: 2, credits: 3 },
  { level: 15, tier: 3, credits: 7 },
  { level: 20, tier: 4, credits: 12 },
  { level: 25, tier: 5, credits: 18 },
] as const;

/** Legendary base + highest training milestone + legendary cooperation + equipment. */
export const maximumRecommendationCredits = 33;
/** After the first recommendation of a matched template at any gym level, later ones pay this amount. */
export const postgameRepeatTemplateCredits = 1;

export type GymLevel = { level: number; name: string; fame: number; upgradePrice: number; requiredRecommendations: number; requiredTier: number; requiredLegends: number; requiredTemplates: number };
export const gymLevels: readonly GymLevel[] = [
  { level: 1, name: '社区训练馆', fame: 0, upgradePrice: 0, requiredRecommendations: 0, requiredTier: 0, requiredLegends: 0, requiredTemplates: 0 },
  { level: 2, name: '街区训练馆', fame: 60, upgradePrice: 0, requiredRecommendations: 2, requiredTier: 0, requiredLegends: 0, requiredTemplates: 0 },
  { level: 3, name: '城区训练馆', fame: 500, upgradePrice: 10, requiredRecommendations: 0, requiredTier: 3, requiredLegends: 0, requiredTemplates: 0 },
  { level: 4, name: '区域训练中心', fame: 1300, upgradePrice: 20, requiredRecommendations: 0, requiredTier: 4, requiredLegends: 0, requiredTemplates: 0 },
  { level: 5, name: '城市训练中心', fame: 3000, upgradePrice: 40, requiredRecommendations: 0, requiredTier: 5, requiredLegends: 0, requiredTemplates: 0 },
  { level: 6, name: '省级训练基地', fame: 6000, upgradePrice: 80, requiredRecommendations: 0, requiredTier: 0, requiredLegends: 3, requiredTemplates: 8 },
  { level: 7, name: '全国训练基地', fame: 11000, upgradePrice: 140, requiredRecommendations: 0, requiredTier: 0, requiredLegends: 8, requiredTemplates: 15 },
  { level: 8, name: '传奇篮球学院', fame: 18000, upgradePrice: 220, requiredRecommendations: 0, requiredTier: 0, requiredLegends: 15, requiredTemplates: 25 },
];

export type EquipmentEffects = LegacyEquipmentEffects & {
  experience: number; automationExperience: number; offlineMinutes: number;
};
export type EquipmentFamily = 'capacity' | 'recovery' | 'course' | 'experience' | 'automation' | 'offline'
  | 'brand' | 'cooperation' | `focus-${StatKey}`;
export const equipmentFamilyLabels: Record<EquipmentFamily, string> = {
  capacity: '体力储备', recovery: '自然恢复', course: '课后恢复', experience: '训练经验',
  automation: '自动训练', offline: '离线课表', brand: '球馆品牌', cooperation: '培养合作',
  'focus-three': '三分专项', 'focus-mid': '中投专项', 'focus-drive': '突破专项',
  'focus-inside': '篮下专项', 'focus-handle': '控球专项', 'focus-defense': '防守专项',
};
export type GymEquipment = {
  id: string; artId: string; name: string; family: EquipmentFamily; grade: 1 | 2 | 3; rarity: Rarity;
  unlockLevel: number; price: number; effects: EquipmentEffects; description: string; requiredTemplates: number;
};
export const equipmentCatalogVersion = 3 as const;
const statLabels: Record<StatKey, string> = { three: '三分', mid: '中投', drive: '突破', inside: '篮下', handle: '控球', defense: '防守' };
const emptyEffects: EquipmentEffects = {
  stamina: 0, recovery: 0, valuePercent: 0, focusKey: null, focusPower: 0,
  courseRecovery: 0, cooperationBonus: 0, experience: 0, automationExperience: 0, offlineMinutes: 0
};
const originalEquipmentById = new Map(shopCatalog.map(item => [item.id, item]));

function equipment(id: number, family: EquipmentFamily, grade: 1 | 2 | 3,
  unlockLevel: number, price: number, effects: Partial<EquipmentEffects>, requiredTemplates = 0): GymEquipment {
  const logicalId = `relic_${String(id).padStart(3, '0')}`;
  const artId = equipmentArtIds[logicalId];
  const original = originalEquipmentById.get(artId);
  if (!original) throw new Error(`Missing original equipment artwork/name pair: ${logicalId}`);
  const e = { ...emptyEffects, ...effects };
  const text: string[] = [];
  if (e.stamina) text.push(`全体球员体力上限 +${e.stamina}`);
  if (e.recovery) text.push(`体力恢复时间缩短 ${e.recovery} 秒`);
  if (e.courseRecovery) text.push(`完成课程额外恢复 ${e.courseRecovery} 点体力（受馆级上限限制）`);
  if (e.experience) text.push(`手动、自动投篮额外 +${e.experience} 经验`);
  if (e.automationExperience) text.push(`自动投篮额外 +${e.automationExperience} 经验`);
  if (e.offlineMinutes) text.push(`离线结算训练时长 +${e.offlineMinutes} 分钟（上限4小时）`);
  if (e.valuePercent) text.push(`培养品牌声望 +${e.valuePercent}%；展示身价 +${e.valuePercent}%`);
  if (e.cooperationBonus) text.push(`完成至少 2 个完整课程，达标推荐理论额外 +${e.cooperationBonus} 券`);
  if (e.focusKey) text.push(`${statLabels[e.focusKey]}成长倾向 +${e.focusPower}，升级时更容易提升此属性`);
  return {
    id: logicalId, artId, name: original.name, family, grade,
    rarity: grade === 1 ? 'common' : grade === 2 ? 'rare' : 'legendary', unlockLevel, price,
    effects: e, description: text.join('；') + '。同类仅启用一件。', requiredTemplates
  };
}

/** Persistent logical IDs keep existing assets; presentation is selected independently from original-game pairs. */
export const equipmentCatalog: readonly GymEquipment[] = [
  equipment(14, 'capacity', 1, 1, 2, { stamina: 4 }),
  equipment(34, 'capacity', 2, 3, 6, { stamina: 10 }),
  equipment(90, 'capacity', 3, 6, 12, { stamina: 20 }, 8),
  equipment(2, 'recovery', 1, 1, 3, { recovery: 1 }),
  equipment(42, 'recovery', 2, 3, 8, { recovery: 2 }),
  equipment(78, 'recovery', 3, 7, 30, { recovery: 4 }, 8),
  equipment(17, 'course', 1, 1, 5, { courseRecovery: 1 }),
  equipment(37, 'course', 2, 3, 12, { courseRecovery: 2 }),
  equipment(85, 'course', 3, 8, 36, { courseRecovery: 3 }, 8),
  equipment(6, 'experience', 1, 1, 4, { experience: 1 }),
  equipment(46, 'experience', 2, 3, 10, { experience: 2 }),
  equipment(81, 'experience', 3, 7, 20, { experience: 3 }, 8),
  equipment(7, 'automation', 1, 2, 3, { automationExperience: 1 }),
  equipment(51, 'automation', 2, 4, 8, { automationExperience: 2 }),
  equipment(87, 'automation', 3, 6, 16, { automationExperience: 3 }, 8),
  equipment(28, 'offline', 1, 2, 2, { offlineMinutes: 15 }),
  equipment(65, 'offline', 2, 4, 6, { offlineMinutes: 30 }),
  equipment(77, 'offline', 3, 6, 14, { offlineMinutes: 60 }, 8),
  equipment(1, 'brand', 1, 1, 2, { valuePercent: 10 }),
  equipment(45, 'brand', 2, 3, 6, { valuePercent: 25 }),
  equipment(82, 'brand', 3, 6, 14, { valuePercent: 50 }, 8),
  equipment(3, 'cooperation', 1, 2, 5, { cooperationBonus: 1 }),
  equipment(79, 'cooperation', 3, 5, 14, { cooperationBonus: 2 }, 8),
  ...([
    ['three', 24, 96], ['mid', 4, 76], ['drive', 8, 80],
    ['inside', 12, 84], ['handle', 40, 88], ['defense', 20, 92],
  ] as const).flatMap(([key, basic, advanced]) => [
    equipment(basic, `focus-${key}`, 1, 2, 3, { focusKey: key, focusPower: .4 }),
    equipment(advanced, `focus-${key}`, 3, 5, 12, { focusKey: key, focusPower: 1.2 }, 8),
  ]),
];
