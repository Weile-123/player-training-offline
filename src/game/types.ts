export const statKeys = ['three', 'mid', 'drive', 'inside', 'handle', 'defense'] as const;
export type StatKey = typeof statKeys[number];
export type Stats = Record<StatKey, number>;
export type Player = { highPotential?: boolean; id: string; name: string; age: number; height: number; stats: Stats; level: number; shots: number; templateId: string | null; heat: number; hotShots: number; iceShots: number };
export type Outcome = 'severe' | 'minor' | 'hold' | 'success' | 'great';
export type Game = { version: 1; month: number; cash: number; debt: number; credit: number; recruits: Player[]; lounge: Player[]; activePlayer?: Player | null; activeSource?: 'recruits' | 'lounge' | null; selectedId: string | null; status: 'playing' | 'over'; totalSales: number; totalPaid: number; totalShots: number; logs: string[]; lastOutcome: Outcome | null; revision: number; ownedEquipment: string[]; equippedEquipment: string[]; consumables: Record<ConsumableId, number>; assetLevels: AssetLevels; totalInterest: number; totalPassiveIncome: number };
export type RNG = () => number;

export type ConsumableId = 'drink' | 'ice';
export type EquipmentEffects = { severeMultiplier?: number; successBonus?: number; greatBonus?: number; growthBonus?: number; saleBonus?: number; statGrowth?: Partial<Record<StatKey, number>>; statWeights?: Partial<Record<StatKey, number>> };
export type Equipment = { id: string; name: string; price: number; build: string; description: string; effects: EquipmentEffects };

export const assetIds = ['gym', 'rehab', 'scout', 'lounge', 'rental'] as const;
export type AssetId = typeof assetIds[number];
export type AssetLevels = Record<AssetId, number>;
export type Asset = { id: AssetId; name: string; description: string; costs: readonly number[] };
