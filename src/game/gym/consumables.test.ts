import {expect, it} from 'vitest';
import {chalkTrainingShots, gymConsumables, type GymConsumableId} from './consumables';
import {cooperationOffers, dispatchGym, experienceForLevel, newGym, playerLevelCap, requiredExperience, shotCooldownMs, trainPlayer, type GymAction, type GymState} from './engine';
import {settleOfflineGym} from './offline';
import {forecastTraining} from './forecast';
import {decodeGym, encodeGym, validGym} from './save';

const at = 1_800_000_000_000;
function fixture(): GymState {const state = newGym(at, 83); state.gymLevel = 3; state.credits = 40; return state;}
function command(state: GymState, action: GymAction, now = at): GymState {
  const result = dispatchGym(state, state.revision, action, now);
  expect(result.error).toBeUndefined();
  expect(validGym(result.state)).toBe(true);
  return result.state;
}

it.each(gymConsumables)('buys $name at its shown price without applying its effect', item => {
  const state = fixture(), originalPlayer = structuredClone(state.player);
  const result = command(state, {type: 'buy-consumable', id: item.id});
  expect(result.credits).toBe(40 - item.price);
  expect(result.inventory[item.id]).toBe(1);
  expect(result.player).toEqual(originalPlayer);
  expect(state.inventory[item.id] ?? 0).toBe(0);
});

it('keeps original drink actions and old inventory saves compatible', () => {
  let state = fixture();
  expect(state.inventory).toEqual({drink: 0});
  expect(decodeGym(encodeGym(state))).toEqual(state);
  state = command(state, {type: 'buy-drink'});
  state.player!.stamina = 2;
  state = command(state, {type: 'use-drink', id: state.player!.id});
  expect(state.player!.stamina).toBe(12);
  expect(state.inventory.drink).toBe(0);
});

it('uses a brace to restore only the selected player to the shared stamina cap', () => {
  let state = fixture(); state.projects.endurance = 1;
  state = command(state, {type: 'recruit'});
  state.inventory.brace = 1; state.player!.stamina = 1; state.bench[0].stamina = 3;
  state.player!.recoveryMs = 199;
  const result = command(state, {type: 'use-consumable', id: 'brace', playerId: state.player!.id});
  expect(result.player!.stamina).toBe(25);
  expect(result.player!.recoveryMs).toBe(0);
  expect(result.bench[0].stamina).toBe(3);
  expect(result.inventory.brace).toBe(0);
});

it('runs a timer as ten real shots with normal stamina, growth, courses, RNG and cooldown', () => {
  const state = fixture(); state.inventory.timer = 1;
  state.player!.recoveryMs = 7_777;
  const expected = structuredClone(state), events: never[] = [];
  for (let i = 0; i < 10; i++) trainPlayer(expected, expected.player!, at, events);
  const result = command(state, {type: 'use-consumable', id: 'timer', playerId: state.player!.id});
  expect(result.player).toEqual(expected.player);
  expect(result.player!.shots).toBe(10);
  expect(result.player!.training.completedCourses).toBe(1);
  expect(result.player!.stamina).toBe(14);
  expect(result.player!.recoveryMs).toBe(7_777);
  expect(result.player!.nextShotAt).toBe(at + shotCooldownMs);
  expect(result.updatedAt).toBe(at);
  expect(result.rng).toEqual(expected.rng);
  expect(result.inventory.timer).toBe(0);
});

it('stops a timer at actual stamina exhaustion and never creates a free course', () => {
  const state = fixture(); state.inventory.timer = 1; state.player!.stamina = 2;
  const result = command(state, {type: 'use-consumable', id: 'timer', playerId: state.player!.id});
  expect(result.player!.shots).toBe(2);
  expect(result.player!.stamina).toBe(0);
  expect(result.player!.training).toMatchObject({shots: 2, completedCourses: 0});
  expect(result.updatedAt).toBe(at);
});

it('counts timer equipment qualification only for complete courses actually using the equipment', () => {
  let state = fixture();
  state.ownedEquipment = ['relic_003']; state.equippedEquipment = ['relic_003'];
  state.purchasePrices.relic_003 = 5; state.collectedEquipment.relic_003 = {firstAt: at};
  state = command(state, {type: 'accept-cooperation', id: cooperationOffers(state)[0].id, playerId: state.player!.id});
  state.inventory.timer = 2;
  state = command(state, {type: 'use-consumable', id: 'timer', playerId: state.player!.id});
  expect(state.player!.equipmentTraining.cooperationCourses).toEqual([1, 0]);
  state = command(state, {type: 'use-consumable', id: 'timer', playerId: state.player!.id});
  expect(state.player!.equipmentTraining.cooperationCourses).toEqual([2, 0]);
  expect(state.player!.shots).toBe(20);
});

it('arms thirty guaranteed shots without stacking, and preserves the count through failed shots', () => {
  let state = fixture(); state.inventory.chalk = 2;
  state = command(state, {type: 'use-consumable', id: 'chalk', playerId: state.player!.id});
  expect(state.player!.greatShotsRemaining).toBe(chalkTrainingShots);
  expect(state.inventory.chalk).toBe(1);
  const repeated = dispatchGym(state, state.revision, {type: 'use-consumable', id: 'chalk', playerId: state.player!.id}, at);
  expect(repeated.error).toContain('用完后'); expect(repeated.state).toBe(state);
  state.player!.stamina = 0;
  expect(dispatchGym(state, state.revision, {type: 'train', id: state.player!.id}, at).state.player!.greatShotsRemaining).toBe(chalkTrainingShots);
  state.player!.stamina = 2;
  const result = dispatchGym(state, state.revision, {type: 'train', id: state.player!.id}, at);
  expect(result.events.find(event => event.type === 'trained')).toMatchObject({outcome: 'great', experienceGain: 20});
  expect(result.state.player!.greatShotsRemaining).toBe(chalkTrainingShots - 1);
});

it('consumes exactly thirty chalk charges during both online automatic and offline replay', () => {
  let state = fixture(); state.inventory.chalk = 1;
  state.gymLevel = 8; state.projects.endurance = 8; state.player!.stamina = 60;
  state = command(state, {type: 'use-consumable', id: 'chalk', playerId: state.player!.id});
  state = command(state, {type: 'set-auto', id: state.player!.id, enabled: true});
  let online = state;
  for (let i = 1; i <= chalkTrainingShots; i++) online = command(online, {type: 'auto-step'}, at + i * 2_000);
  const offline = settleOfflineGym(state, at + chalkTrainingShots * 2_000).state;
  expect(offline.player).toEqual(online.player);
  expect(offline.rng).toEqual(online.rng);
  expect(offline.player!.greatShotsRemaining).toBeUndefined();
  expect(offline.player!.shots).toBe(chalkTrainingShots);
  expect(experienceForLevel(offline.player!.level) + offline.player!.experience).toBe(20 * chalkTrainingShots);
});

it('restores the whole eligible team without XP, courses, cooldown changes or wasted overflow', () => {
  let state = fixture();
  state = command(command(state, {type: 'recruit'}), {type: 'recruit'});
  state.inventory.supplement = 1;
  state.player!.stamina = 2; state.bench[0].stamina = 16; state.bench[0].recoveryMs = 123;
  state.bench[1].level = state.bench[1].peakLevel = playerLevelCap; state.bench[1].stamina = 0;
  const result = command(state, {type: 'use-consumable', id: 'supplement', playerId: state.player!.id});
  expect(result.player!.stamina).toBe(12);
  expect(result.bench[0].stamina).toBe(20); expect(result.bench[0].recoveryMs).toBe(0);
  expect(result.bench[1].stamina).toBe(0);
  expect(result.player!.level).toBe(state.player!.level);
  expect(result.player!.stats).toEqual(state.player!.stats);
  expect(result.player!.shots).toBe(0);
  expect(result.player!.nextShotAt).toBe(state.player!.nextShotAt);
  expect(result.player!.training).toEqual(state.player!.training);
  expect(result.player!.equipmentTraining).toEqual(state.player!.equipmentTraining);
  expect(result.inventory.supplement).toBe(0);
  expect(result.rng).toEqual(state.rng);
});

it('can replenish bench athletes when the selected athlete is already capped, without wasting a second supply', () => {
  let state = command(fixture(), {type: 'recruit'});
  state.player!.level = state.player!.peakLevel = playerLevelCap;
  state.bench[0].stamina = 10; state.inventory.supplement = 2;
  state = command(state, {type: 'use-consumable', id: 'supplement', playerId: state.player!.id});
  expect(state.bench[0].stamina).toBe(20); expect(state.inventory.supplement).toBe(1);
  const result = dispatchGym(state, state.revision, {type: 'use-consumable', id: 'supplement', playerId: state.player!.id}, at);
  expect(result.error).toContain('体力已满'); expect(result.state).toBe(state);
});

it('stops a retained legacy timer at the cap and disables automatic training', () => {
  for (const id of ['timer'] as const) {
    const state = fixture(); state.inventory[id] = 1; state.player!.level = state.player!.peakLevel = playerLevelCap - 1;
    state.player!.experience = requiredExperience(state.player!.level) - 1;
    const result = command(state, {type: 'use-consumable', id, playerId: state.player!.id});
    expect(result.player!.level).toBe(playerLevelCap); expect(result.player!.experience).toBe(0);
    expect(result.player!.autoEnabled).toBe(false);
    expect(result.player!.shots).toBe(1);
  }
});

it.each(gymConsumables)('refuses $name at the level cap or with empty stock without changing state', item => {
  const state = fixture(); state.inventory[item.id] = 1; state.player!.level = state.player!.peakLevel = playerLevelCap;
  const action: GymAction = {type: 'use-consumable', id: item.id, playerId: state.player!.id};
  expect(dispatchGym(state, state.revision, action, at).state).toBe(state);
  state.player!.level = 0; state.player!.peakLevel = 0; state.inventory[item.id] = 0;
  expect(dispatchGym(state, state.revision, action, at).state).toBe(state);
});

it('refuses full-stamina recovery, automatic timers, locked purchases, stale players and impossible stock', () => {
  const state = fixture(); state.inventory.brace = 1; state.inventory.timer = 1;
  expect(dispatchGym(state, state.revision, {type: 'use-consumable', id: 'brace', playerId: state.player!.id}, at).error).toContain('已满');
  state.player!.autoEnabled = true;
  expect(dispatchGym(state, state.revision, {type: 'use-consumable', id: 'timer', playerId: state.player!.id}, at).error).toContain('暂停自动');
  expect(dispatchGym(state, state.revision, {type: 'use-consumable', id: 'brace', playerId: 'stale'}, at).error).toContain('已变化');
  state.gymLevel = 1; state.player!.autoEnabled = false;
  expect(dispatchGym(state, state.revision, {type: 'buy-consumable', id: 'chalk'}, at).error).toContain('3 级');
  state.inventory.drink = Number.MAX_SAFE_INTEGER;
  expect(dispatchGym(state, state.revision, {type: 'buy-drink'}, at).error).toContain('库存');
});

it('validates optional inventory and one-shot metadata while leaving old saves valid', () => {
  const state = fixture(); state.inventory.chalk = 1; state.player!.greatShotReady = true;
  expect(decodeGym(encodeGym(state))).toEqual(state);
  for (const id of ['brace', 'timer', 'chalk', 'supplement'] as GymConsumableId[]) {
    expect(validGym({...state, inventory: {...state.inventory, [id]: -1}})).toBe(false);
    expect(validGym({...state, inventory: {...state.inventory, [id]: 1.5}})).toBe(false);
  }
  expect(validGym({...state, player: {...state.player!, greatShotReady: 'yes' as never}})).toBe(false);
  for (const count of [0, 51, 1.5]) expect(validGym({...state, player: {...state.player!, greatShotsRemaining: count}})).toBe(false);
  state.player!.greatShotsRemaining = 50;
  expect(decodeGym(encodeGym(state))).toEqual(state);
});

it('stops selling retired effects while preserving their existing inventory and usage', () => {
  const state = fixture();
  for (const id of ['brace', 'timer'] as const) {
    const result = dispatchGym(state, state.revision, {type: 'buy-consumable', id}, at);
    expect(result.error).toContain('停止销售'); expect(result.state).toBe(state);
  }
});

it('includes every remaining guaranteed shot in forecasts without changing the effect', () => {
  const state = fixture(); state.player!.greatShotsRemaining = 50;
  const forecast = forecastTraining(state, state.player, 10)!;
  const required = experienceForLevel(10);
  expect(forecast.expectedShots).toBe(Math.ceil(required / 20));
  expect(forecast.minShots).toBe(forecast.maxShots);
  expect(state.player!.greatShotsRemaining).toBe(50);
});

it('accounts for only the first guaranteed chalk shot in a training forecast', () => {
  const state = fixture(); state.player!.greatShotReady = true;
  const forecast = forecastTraining(state, state.player, 1)!;
  expect(forecast.expectedShots).toBe(1);
  expect(forecast.minShots).toBe(1); expect(forecast.maxShots).toBe(1);
  expect(state.player!.greatShotReady).toBe(true);
});
