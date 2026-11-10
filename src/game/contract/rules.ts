import reference from './runtime/numerical.json';
import type { TemplateTier } from '../templates';

/** 运行数据来自输入快照；研究证据独立保存在 reference/evidence.ts，不进入客户端。 */
export const rules = {
  version: 'contract-v3',
  reference,
  credit: reference.tribute.failure_limit,
  recruits: 3,
  equipmentSlots: 8,
  heat: reference.frenzy.charge_needed,
  frenzyShots: 7,
  legacyFrenzyMs: reference.frenzy.base_duration_seconds * 1000,
  intervalMs: 0,
  contractMonths: 21,
  growth: { gain: 10, loss: 10, epsilon: 0.1, initialMin: 24, initialMax: 48 },
  matching: { enter: 0.65, margin: 0.05, tie: 0.000001, specialistLevel:10, specialistRating:50, specialistStat:80 },
  tiers: [
    { id: 'rotation', level: 2, coreRatio: 0.50 },
    { id: 'starter', level: 6, coreRatio: 0.62 },
    { id: 'star', level: 10, coreRatio: 0.74 },
    { id: 'superstar', level: 14, coreRatio: 0.84 },
    { id: 'legend', level: 18, coreRatio: 0.92 },
  ] as { id: TemplateTier; level: number; coreRatio: number }[],
  trainingLevelCap: 99,
  // 历史存档与月份计算的技术保护，与训练等级上限分开。
  maxLevel: 10000,
} as const;

export function integer(value: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('整数参数超出范围');
  return value;
}
