import {describe, expect, it} from 'vitest';
import {equipmentCatalog, type EquipmentFamily} from './catalog';
import {templateRules} from '../contract/templates';
import {activePlayers, cooperationOffers, cooperationStatus, dispatchGym, effectiveTrainingBias, equipmentEffects,
  newGym, recommendation, recoverySeconds, shotCooldownMs, trainingShotExperience, type GymAction, type GymState} from './engine';
import {offlineLimitMs, settleOfflineGym} from './offline';

function fixture() {
  const state = newGym(1_000, 7);
  state.gymLevel = 8;
  state.credits = 1_000;
  state.projects.equipment = 4;
  state.collection = Object.fromEntries(templateRules.slice(0, 8).map(template => [template.id, {firstAt: 1_000, highestRating: 0, highestValue: '0'}]));
  return state;
}
const item = (family: EquipmentFamily, grade = 1) => equipmentCatalog.find(entry => entry.family === family && entry.grade === grade)!;
function command(state: GymState, action: GymAction, at = state.updatedAt) {
  const result = dispatchGym(state, state.revision, action, at);
  expect(result.error).toBeUndefined();
  return result.state;
}
function buy(state: GymState, family: EquipmentFamily, grade = 1, replaceId?: string) {
  return command(state, {type: 'buy-equipment', id: item(family, grade).id, replaceId});
}
function shots(state: GymState, count: number) {
  for (let i = 0; i < count; i++) {
    const player = state.player!;
    const staminaAt = player.stamina ? state.updatedAt : state.updatedAt + recoverySeconds(state) * 1_000 - player.recoveryMs;
    state = command(state, {type: 'train', id: player.id}, Math.max(staminaAt, player.nextShotAt));
  }
  return state;
}
function qualifyBasic(state: GymState) {
  state.player!.templateId = templateRules.find(template => template.tier === 'rotation')!.id;
  return state;
}

describe('V3 equipment behavior', () => {
  it('requires an explicit same-family replacement even with empty slots and preserves the old asset', () => {
    let state = buy(fixture(), 'recovery');
    const old = item('recovery');
    const next = item('recovery', 2);
    const failed = dispatchGym(state, state.revision, {type: 'buy-equipment', id: next.id}, state.updatedAt);
    expect(failed.state).toBe(state);
    expect(failed.error).toContain('同类');
    state = buy(state, 'recovery', 2, old.id);
    expect(state.ownedEquipment).toContain(old.id);
    expect(state.equippedEquipment).toEqual([next.id]);
    expect(equipmentEffects(state).recovery).toBe(2);
  });

  it('does not allow replacing an unrelated item to evade family exclusivity', () => {
    const state = buy(buy(fixture(), 'recovery'), 'capacity');
    const result = dispatchGym(state, state.revision, {type: 'buy-equipment', id: item('recovery', 3).id, replaceId: item('capacity').id}, state.updatedAt);
    expect(result.error).toContain('同类');
    expect(result.state).toBe(state);
  });

  it('adds integer XP consistently while preserving the manual cooldown', () => {
    const state = buy(buy(fixture(), 'experience', 3), 'automation', 3);
    state.projects.automation = 5;
    for (const [outcome, base] of [['hold', 8], ['success', 12], ['great', 20]] as const) {
      expect(trainingShotExperience(state, outcome)).toBe(base + 3);
      state.player!.autoEnabled = true;
      expect(trainingShotExperience(state, outcome)).toBe(base + 11);
      state.player!.autoEnabled = false;
    }
    const next = command(state, {type: 'train', id: state.player!.id});
    expect(next.player!.nextShotAt - state.updatedAt).toBe(shotCooldownMs);
    expect(dispatchGym(next, next.revision, {type: 'train', id: next.player!.id}, next.updatedAt + 999).error).toBeTruthy();
  });

  it('extends offline time without giving offline shots extra experience', () => {
    const state = buy(buy(buy(fixture(), 'experience', 2), 'automation', 2), 'offline', 3);
    state.projects.automation = 1;
    state.player!.autoEnabled = true;
    expect(offlineLimitMs(state)).toBe(90 * 60_000);
    const automatic = dispatchGym(state, state.revision, {type: 'auto-step'}, state.updatedAt).state;
    const offline = settleOfflineGym(state, state.updatedAt + 1).state;
    expect(offline.player!.experience).toBe(automatic.player!.experience);
    expect(offline.player!.level).toBe(automatic.player!.level);
    state.projects.offline = 5;
    expect(offlineLimitMs(state)).toBe(240 * 60_000);
  });

  it('does not grant cooperation coupons merely for wearing gear at recommendation', () => {
    let state = fixture();
    state = command(state, {type: 'accept-cooperation', playerId: state.player!.id, id: cooperationOffers(state)[0].id});
    state = qualifyBasic(shots(state, 20));
    state = buy(state, 'cooperation', 3);
    expect(cooperationStatus(state).complete).toBe(true);
    expect(cooperationStatus(state).equipmentCredits).toBe(0);
  });

  it('earns each cooperation tier from two real courses and retains it after unequipping', () => {
    let state = buy(fixture(), 'cooperation');
    state = command(state, {type: 'accept-cooperation', playerId: state.player!.id, id: cooperationOffers(state)[0].id});
    state = qualifyBasic(shots(state, 10));
    expect(cooperationStatus(state).equipmentCredits).toBe(0);
    state = buy(state, 'cooperation', 3, item('cooperation').id);
    state = qualifyBasic(shots(state, 10));
    expect(cooperationStatus(state).equipmentCredits).toBe(1);
    state = qualifyBasic(shots(state, 10));
    expect(cooperationStatus(state).equipmentCredits).toBe(2);
    state = command(state, {type: 'unequip', id: item('cooperation', 3).id});
    expect(cooperationStatus(state).equipmentCredits).toBe(2);
    state = command(state, {type: 'abandon-cooperation', playerId: state.player!.id});
    expect(state.player!.equipmentTraining.cooperationCourses).toEqual([0, 0]);
  });

  it('uses actual training brand averages rather than last-second equipment', () => {
    let state = shots(fixture(), 20);
    state = qualifyBasic(buy(state, 'brand', 3));
    const baseline = recommendation(state).baseFame;
    state = command(state, {type: 'unequip', id: item('brand', 3).id});
    expect(recommendation(state).baseFame).toBe(baseline);
    state = command(state, {type: 'equip', id: item('brand', 3).id});
    state = shots(state, 10);
    expect(state.player!.equipmentTraining).toMatchObject({brandShots: 30, brandTotal: 500});
    const reward = recommendation(state);
    expect(reward.baseFame).toBe(Math.floor(reward.rawFame * (100 + 30 + 500 / 30) / 100));
    state = command(state, {type: 'unequip', id: item('brand', 3).id});
    expect(recommendation(state).baseFame).toBe(reward.baseFame);
  });

  it('stops extra focus weighting when the target stat is full and affects only the chosen direction', () => {
    const state = buy(fixture(), 'focus-three', 3);
    const player = state.player!;
    const weighted = effectiveTrainingBias(state);
    expect(weighted.three).toBeCloseTo(player.bias.three + 1.2);
    expect(weighted.mid).toBeCloseTo(player.bias.mid);
    player.stats.three = 99;
    expect(effectiveTrainingBias(state).three).toBeCloseTo(player.bias.three);
  });

  it('floors historical brand fame exactly once without floating-point underpayment', () => {
    const state = fixture();
    const player = state.player!;
    player.templateId = templateRules.find(template => template.tier === 'legend')!.id;
    const keys = ['three', 'mid', 'drive', 'inside', 'handle', 'defense'] as const;
    keys.forEach((key, index) => {player.stats[key] = player.entryStats[key] + (index < 3 ? 13 : 12);});
    player.shots = player.equipmentTraining.brandShots = 81;
    player.equipmentTraining.brandTotal = 1_260;
    player.training.completedCourses = 8;
    player.training.shots = 1;
    expect(recommendation(state)).toMatchObject({rawFame: 45, baseFame: 79});
  });

  it('shares supply and experience with every active trainee instead of only the selected athlete', () => {
    let state = buy(buy(fixture(), 'capacity', 3), 'experience', 3);
    state = command(state, {type: 'recruit'});
    expect(activePlayers(state).at(-1)!.stamina).toBe(40);
    for (const player of activePlayers(state)) expect(trainingShotExperience(state, 'success', player)).toBe(15);
    expect(state.player!.stamina).toBe(20);
  });
});
