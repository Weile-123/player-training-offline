import {describe, expect, it} from 'vitest';
import {
  activePlayers, advanceGym, dispatchGym, newGym, playerLevelCap, requiredExperience, staminaMax,
  type GymAction, type GymState,
} from './engine';
import {offlineLimitMs, settleOfflineGym} from './offline';
import {validGym} from './save';
import {equipmentCatalog} from './catalog';

const start = 1_700_000_000_000;
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const withoutRevision = (state: GymState) => ({...state, revision: 0});
function act(state: GymState, action: GymAction, now = state.updatedAt): GymState {
  const result = dispatchGym(state, state.revision, action, now);
  expect(result.error).toBeUndefined();
  return result.state;
}
function automaticGym(count = 1, level = 2): GymState {
  let state = newGym(start, 17);
  state.gymLevel = level;
  for (let number = 1; number < count; number++) state = act(state, {type: 'recruit'});
  for (const player of activePlayers(state)) state = act(state, {type: 'set-auto', id: player.id, enabled: true});
  return state;
}
function online(state: GymState, until: number): GymState {
  for (let at = state.updatedAt + 200; at <= until; at += 200) state = act(state, {type: 'auto-step'}, at);
  return advanceGym(state, until);
}

describe('bounded offline automatic gym training', () => {
  it('unlocks the free 30 minute window at gym two and caps upgrades at three hours', () => {
    const state = newGym(start, 7);
    expect(offlineLimitMs(state)).toBe(0);
    state.gymLevel = 8;
    expect([0, 1, 2, 3, 4, 5].map(level => {
      state.projects.offline = level;
      return offlineLimitMs(state);
    })).toEqual([1_800_000, 2_700_000, 3_600_000, 5_400_000, 7_200_000, 10_800_000]);
  });

  it('only restores stamina before gym two or when all athletes remain manual', () => {
    const state = newGym(start, 7);
    state.player!.stamina = 0;
    const first = settleOfflineGym(state, start + 86_400_000);
    expect(first.state.player).toMatchObject({shots: 0, stamina: 20, level: 0});
    expect(first.report).toBeUndefined();
    state.gymLevel = 2;
    expect(settleOfflineGym(state, start + 86_400_000).state).toEqual(advanceGym(state, start + 86_400_000));
    expect(state.player!.stamina).toBe(0);
  });

  it('respects the first cooldown and does not count future shots', () => {
    const state = automaticGym();
    const early = settleOfflineGym(state, start + 1_999);
    expect(early.report).toMatchObject({totalShots: 0, totalExperience: 0});
    expect(early.state.player!.shots).toBe(0);
    const due = settleOfflineGym(early.state, start + 2_000);
    expect(due.report).toMatchObject({totalShots: 1});
    expect(due.state.player).toMatchObject({shots: 1, stamina: 19, nextShotAt: start + 4_000});
    expect(validGym(due.state)).toBe(true);
  });

  it('matches real online auto-step dispatch including XP, templates, course recovery and RNG', () => {
    let state = automaticGym(3, 8);
    state.projects.automation = 3;
    state.projects.endurance = 2;
    state.projects.recovery = 3;
    state.ownedEquipment = ['relic_004', 'relic_017'];
    state.purchasePrices = Object.fromEntries(state.ownedEquipment.map(id => [id, equipmentCatalog.find(item => item.id === id)!.price]));
    state.equippedEquipment = [...state.ownedEquipment];
    state.collectedEquipment = Object.fromEntries(state.ownedEquipment.map(id => [id, {firstAt: start}]));
    state = act(state, {type: 'set-training-plan', playerId: state.player!.id, id: 'shooting'});
    const duration = 120_000;
    const expected = online(state, start + duration);
    const actual = settleOfflineGym(state, start + duration);
    expect(withoutRevision(actual.state)).toEqual(withoutRevision(expected));
    expect(actual.report!.totalShots).toBe(activePlayers(actual.state).reduce((sum, player) => sum + player.shots, 0));
    expect(actual.report!.players.every(player => player.xpGained > 0 && player.courses > 0)).toBe(true);
    expect(actual.state.credits).toBe(state.credits);
    expect(actual.state.fame).toBe(state.fame);
    expect(actual.state.alumni).toEqual(state.alumni);
    expect(validGym(actual.state)).toBe(true);
  });

  it('never borrows the tenth-shot course recovery before natural stamina is available', () => {
    const state = automaticGym();
    state.player!.stamina = 0;
    state.player!.shots = 9;
    state.player!.training.shots = 9;
    const beforeRecovery = settleOfflineGym(state, start + 19_999);
    expect(beforeRecovery.state.player).toMatchObject({shots: 9, stamina: 0});
    const afterRecovery = settleOfflineGym(beforeRecovery.state, start + 20_000);
    expect(afterRecovery.state.player).toMatchObject({shots: 10, stamina: 4, training: {shots: 0, completedCourses: 1}});
  });

  it('leaves manual players untrained while recovering them normally', () => {
    let state = automaticGym(2);
    const manual = state.bench[0].id;
    state = act(state, {type: 'set-auto', id: manual, enabled: false});
    state.bench[0].stamina = 0;
    const result = settleOfflineGym(state, start + 120_000);
    expect(result.report!.players).toHaveLength(1);
    expect(result.state.bench[0]).toMatchObject({shots: 0, experience: 0, level: 0, stamina: 6});
    expect(result.state.player!.shots).toBeGreaterThan(0);
  });

  it('consumes discarded capped time, restores its stamina and cannot claim it again', () => {
    const state = automaticGym();
    const atCap = settleOfflineGym(state, start + 30_000);
    const long = settleOfflineGym(state, start + 86_400_000, 30_000);
    expect(long.report).toMatchObject({elapsedMs: 86_400_000, creditedMs: 30_000, capMs: 30_000, capped: true});
    expect(long.state.player!.shots).toBe(atCap.state.player!.shots);
    expect(long.state.player!.stamina).toBe(staminaMax(state));
    expect(long.state.updatedAt).toBe(start + 86_400_000);
    const immediateOnline = act(long.state, {type: 'auto-step'});
    expect(immediateOnline.player!.shots).toBe(long.state.player!.shots);
    const repeated = settleOfflineGym(long.state, start + 86_400_000);
    expect(repeated.state).toBe(long.state);
    expect(repeated.report).toBeUndefined();
    expect(settleOfflineGym(long.state, start).state).toBe(long.state);
    expect(settleOfflineGym(long.state, Number.NaN).state).toBe(long.state);
    expect(settleOfflineGym(long.state, Number.POSITIVE_INFINITY).state).toBe(long.state);
  });

  it('has the same outcomes in segments under the cap and after changing selection', () => {
    const state = automaticGym(3, 8);
    const whole = settleOfflineGym(state, start + 120_000);
    const first = settleOfflineGym(state, start + 23_457);
    const second = settleOfflineGym(first.state, start + 120_000);
    expect(withoutRevision(second.state)).toEqual(withoutRevision(whole.state));
    const selected = copy(state);
    [selected.player!, selected.bench[1]] = [selected.bench[1], selected.player!];
    const reordered = settleOfflineGym(selected, start + 120_000);
    expect(reordered.state.rng).toEqual(whole.state.rng);
    expect(activePlayers(reordered.state).sort((a, b) => a.id.localeCompare(b.id)))
      .toEqual(activePlayers(whole.state).sort((a, b) => a.id.localeCompare(b.id)));
  });

  it('stops at level99, excludes overflow XP from the report and keeps other athletes training', () => {
    const state = automaticGym(2);
    state.player!.level = 98;
    state.player!.peakLevel = 98;
    state.player!.experience = requiredExperience(98) - 1;
    const result = settleOfflineGym(state, start + 10_000);
    expect(result.state.player).toMatchObject({level: playerLevelCap, experience: 0, autoEnabled: false, shots: 1});
    expect(result.report!.players.find(player => player.id === state.player!.id)).toMatchObject({xpGained: 1, shots: 1});
    expect(result.state.bench[0].shots).toBe(5);
  });

  it('caps a twelve-hour absence to four hours with the best offline item for eight athletes without iterating idle milliseconds', () => {
    const state = automaticGym(8, 8);
    Object.assign(state.projects, {endurance: 8, recovery: 8, automation: 5, offline: 5, equipment: 4});
    state.ownedEquipment = ['relic_085', 'relic_078', 'relic_090', 'relic_081', 'relic_087', 'relic_077', 'relic_079', 'relic_082'];
    state.purchasePrices = Object.fromEntries(state.ownedEquipment.map(id => [id, equipmentCatalog.find(item => item.id === id)!.price]));
    state.equippedEquipment = [...state.ownedEquipment];
    state.collectedEquipment = Object.fromEntries(state.ownedEquipment.map(id => [id, {firstAt: start}]));
    for (const player of activePlayers(state)) player.stamina = staminaMax(state);
    const result = settleOfflineGym(state, start + 43_200_000);
    expect(result.report).toMatchObject({creditedMs: 14_400_000, capped: true});
    expect(result.report!.totalShots).toBeGreaterThan(10_000);
    expect(result.state.revision).toBe(state.revision + 1);
    expect(activePlayers(result.state).every(player => player.stamina >= 0 && player.level <= 99)).toBe(true);
    expect(validGym(result.state)).toBe(true);
  }, 60_000);
});
