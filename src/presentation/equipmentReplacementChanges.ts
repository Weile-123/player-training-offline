import { statLabels } from '../game/config';
import { equipmentEffects, playerValue, recoverySeconds, staminaMax, trainingStatus, type GymState } from '../game/gym/engine';
import { previewEquipmentState } from '../game/gym/equipmentForecast';
import { offlineLimitMs } from '../game/gym/offline';
import { gymPlayerName } from './gymPlayerName';
import { statKeys } from '../game/types';
import { money } from './money';

export type EquipmentReplacementChange = {
  id: string;
  label: string;
  before: string;
  after: string;
  direction: 'up' | 'down';
};

const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });

/** Compare the same capped effects and reconciled stamina used by installation. */
export function equipmentReplacementChanges(state: GymState, itemId: string, replaceId: string): EquipmentReplacementChange[] | null {
  const preview = previewEquipmentState(state, itemId, replaceId);
  if (!preview) return null;
  const rows: EquipmentReplacementChange[] = [];
  const add = (id: string, label: string, before: number, after: number, unit = '') => {
    if (Math.abs(after - before) < 1e-9) return;
    rows.push({ id, label, before: `${number.format(before)}${unit}`, after: `${number.format(after)}${unit}`, direction: after > before ? 'up' : 'down' });
  };
  const before = equipmentEffects(state), after = equipmentEffects(preview);
  add('stamina-cap', '体力上限', staminaMax(state), staminaMax(preview), ' 点');
  const players = state.player ? [state.player, ...state.bench] : state.bench;
  const previewPlayers = new Map((preview.player ? [preview.player, ...preview.bench] : preview.bench).map(player => [player.id, player]));
  for (const player of players) {
    const next = previewPlayers.get(player.id);
    if (!next) continue;
    const name = player.id === state.player?.id ? '当前球员' : gymPlayerName(player);
    add(`stamina-${player.id}`, `${name}体力`, player.stamina, next.stamina, ' 点');
  }
  add('recovery', '体力恢复时间', recoverySeconds(state), recoverySeconds(preview), ' 秒/点');
  add('course-recovery', '完成课程额外恢复', trainingStatus(state).recovery, trainingStatus(preview).recovery, ' 点');
  add('experience', '所有投篮经验', before.experience, after.experience);
  add('automation-experience', '自动投篮经验', before.automationExperience, after.automationExperience);
  add('offline-limit', '离线训练上限', offlineLimitMs(state) / 60000, offlineLimitMs(preview) / 60000, ' 分钟');
  add('brand', '培养品牌声望加成', Math.min(50, before.valuePercent), Math.min(50, after.valuePercent), '%');
  add('value-percent', '展示身价加成', before.valuePercent, after.valuePercent, '%');
  for (const player of players) {
    const next = previewPlayers.get(player.id);
    if (!next) continue;
    const valueBefore = playerValue(state, player), valueAfter = playerValue(preview, next);
    if (valueBefore === valueAfter) continue;
    const name = player.id === state.player?.id ? '当前球员' : gymPlayerName(player);
    rows.push({ id: `value-${player.id}`, label: `${name}展示身价`, before: money(valueBefore), after: money(valueAfter), direction: BigInt(valueAfter) > BigInt(valueBefore) ? 'up' : 'down' });
  }
  add('cooperation', '后续合作器材档位', before.cooperationBonus, after.cooperationBonus, ' 券');
  for (const key of statKeys) add(`focus-${key}`, `${statLabels[key]}器材倾向`, before.focus[key], after.focus[key]);
  return rows;
}
