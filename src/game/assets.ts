import { config } from './config';
import { type Asset, type AssetId, type AssetLevels, type Game } from './types';
export const assetCatalog: readonly Asset[] = config.assets.catalog;
export const initialAssets = (): AssetLevels => ({ gym:0, rehab:0, scout:0, lounge:0, rental:0 });
export const assetById = (id: AssetId) => assetCatalog.find(asset => asset.id === id);
export const upgradeCost = (levels: AssetLevels, id: AssetId): number | null => assetById(id)?.costs[levels[id]] ?? null;
export function assetEffects(levels: AssetLevels = initialAssets()) {
  return {
    successBonus: levels.gym * config.assets.gymSuccessPerLevel,
    growthBonus: levels.gym * config.assets.gymGrowthPerLevel,
    severeMultiplier: config.assets.rehabRiskMultiplier ** levels.rehab,
    minorMultiplier: config.assets.rehabRiskMultiplier ** levels.rehab,
    saleBonus: levels.scout * config.assets.scoutSalePerLevel,
    loungeCapacity: config.loungeCapacity + levels.lounge * config.assets.loungeSlotsPerLevel,
    monthlyIncome: levels.rental * config.assets.rentalIncomePerLevel,
  };
}
export const loungeCapacity = (game: Game) => assetEffects(game.assetLevels).loungeCapacity;
