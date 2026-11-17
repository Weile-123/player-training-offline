export type GymConsumableId = 'drink' | 'brace' | 'timer' | 'chalk' | 'supplement';
export type GymConsumable = {
  id: GymConsumableId; artId: string; name: string; price: number; unlockLevel: number;
  description: string; action: string;
  retired?: boolean;
};

export const chalkTrainingShots = 30;
/** Previously purchased fifty-shot effects retain every remaining paid charge. */
export const maximumStoredChalkShots = 50;
export const teamSupplyRecovery = 10;

/** Three distinct uses: one athlete's stamina, a training run, and group recovery. */
export const gymConsumables: readonly GymConsumable[] = [
  {id: 'drink', artId: 'item_005', name: '运动饮料', price: 1, unlockLevel: 1, description: '恢复当前球员10点体力，最多恢复至上限。', action: '恢复10体力'},
  {id: 'chalk', artId: 'item_003', name: '训练镁粉', price: 2, unlockLevel: 3, description: `当前球员接下来${chalkTrainingShots}次投篮均为大成功，自动与离线也生效。不可叠加，效果绑定球员，离馆后结束。`, action: '连续大成功'},
  {id: 'supplement', artId: 'item_004', name: '团队补给', price: 3, unlockLevel: 3, description: `全体未满级在训球员各恢复${teamSupplyRecovery}体力，最多恢复至各自上限。多人缺体力时更划算。`, action: '全员恢复10'},
];

/** Previously purchased stock remains usable, but these two effects are no longer sold. */
export const retiredGymConsumables: readonly GymConsumable[] = [
  {id: 'brace', artId: 'item_001', name: '应急护具', price: 3, unlockLevel: 2, description: '旧版库存：将当前球员的体力恢复至上限。', action: '回满体力', retired: true},
  {id: 'timer', artId: 'item_002', name: '加练秒表', price: 2, unlockLevel: 2, description: '旧版库存：立即加练最多10球，逐球耗体力；仅限手动训练。', action: '立即加练', retired: true},
];
export const allGymConsumables = [...gymConsumables, ...retiredGymConsumables];
export const consumableById = new Map(allGymConsumables.map(item => [item.id, item]));
