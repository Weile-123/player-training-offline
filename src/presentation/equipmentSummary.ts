import type { GymEquipment } from '../game/gym/catalog';
import { statLabels } from '../game/config';

/** Short display copy is derived from the same effects used by training. */
export function equipmentSummary(item: GymEquipment): string {
  const e = item.effects;
  if (e.stamina) return `体力上限 +${e.stamina}`;
  if (e.recovery) return `体力恢复时间 -${e.recovery}秒`;
  if (e.courseRecovery) return `完成课程额外恢复 +${e.courseRecovery}`;
  if (e.experience) return `所有投篮经验 +${e.experience}`;
  if (e.automationExperience) return `自动投篮经验 +${e.automationExperience}`;
  if (e.offlineMinutes) return `离线时长 +${e.offlineMinutes} 分钟`;
  if (e.valuePercent) return `培养品牌声望 +${e.valuePercent}%`;
  if (e.cooperationBonus) return `合作达标额外 +${e.cooperationBonus} 券`;
  if (e.focusKey) return `${statLabels[e.focusKey]}倾向 +${e.focusPower}`;
  return '收藏器材';
}
