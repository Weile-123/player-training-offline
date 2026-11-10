import { config } from './config';
import { statKeys, type Equipment, type Game, type StatKey } from './types';

export const equipmentCatalog: readonly Equipment[] = config.equipment.catalog;
export const equipmentById = (id: string) => equipmentCatalog.find(item => item.id === id);
export function equipmentEffects(ids: readonly string[] = []) {
  const result = { severeMultiplier: 1, successBonus: 0, greatBonus: 0, growthBonus: 0, saleBonus: 0,
    statGrowth: Object.fromEntries(statKeys.map(key => [key, 0])) as Record<StatKey, number>,
    statWeights: Object.fromEntries(statKeys.map(key => [key, 1])) as Record<StatKey, number> };
  for (const id of new Set(ids)) {
    const effects = equipmentById(id)?.effects;
    if (!effects) continue;
    result.severeMultiplier *= effects.severeMultiplier ?? 1;
    result.successBonus += effects.successBonus ?? 0;
    result.greatBonus += effects.greatBonus ?? 0;
    result.growthBonus += effects.growthBonus ?? 0;
    result.saleBonus += effects.saleBonus ?? 0;
    for (const key of statKeys) {
      result.statGrowth[key] += effects.statGrowth?.[key] ?? 0;
      result.statWeights[key] *= effects.statWeights?.[key] ?? 1;
    }
  }
  return result;
}
export const equippedEffects = (game: Game) => equipmentEffects(game.equippedEquipment);
