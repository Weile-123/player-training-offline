import {describe, expect, it} from 'vitest';
import {statKeys} from '../types';
import {cooperationOffers, cooperationStatus, dispatchGym, newGym, recommendationPayout, type GymAction, type GymState} from './engine';

const at = 1_800_000_000_000;
function command(state: GymState, action: GymAction) {
  const result = dispatchGym(state, state.revision, action, state.updatedAt);
  expect(result.error).toBeUndefined();
  return result.state;
}
function fixture(level: 98 | 99, complete = false) {
  let state = newGym(at, 7);
  state.gymLevel = 8; state.credits = 100; state.player = null;
  state = command(state, {type: 'recruit', preference: 'forward'});
  const player = state.player!;
  player.level = player.peakLevel = level;
  player.experience = 0; player.templateId = 'bryant'; player.highestTier = 'legend';
  for (const key of statKeys) player.stats[key] = 99;
  player.shots = 4_000; player.training.completedCourses = 400;
  player.equipmentTraining.brandShots = player.shots;
  if (complete) {
    player.cooperation = {id: cooperationOffers(state).find(offer => offer.kind === 'legend')!.id,
      playerId: player.id, acceptedShots: 0, acceptedCourses: 0};
    player.equipmentTraining.cooperationCourses = [2, 2];
  }
  return state;
}

describe('level cap resource protection', () => {
  it('rejects a new cooperation at 99 without changing the player, eligibility or RNG', () => {
    const state = fixture(99), before = structuredClone(state);
    const offer = cooperationOffers(state)[0];
    const denied = dispatchGym(state, state.revision, {type: 'accept-cooperation', id: offer.id, playerId: state.player!.id}, at);
    expect(denied.error).toContain('无法新接或更换合作');
    expect(denied.state).toBe(state);
    expect(denied.events).toEqual([]);
    expect(state).toEqual(before);
  });

  it.each([false, true])('preserves completed cooperation and actual settlement when a capped replacement is refused (repeat=%s)', repeat => {
    const state = fixture(99, true);
    if (repeat) state.postgameRecommendedTemplates = [state.player!.templateId!];
    const original = structuredClone(state), originalStatus = cooperationStatus(state), expected = recommendationPayout(state);
    expect(originalStatus.complete).toBe(true);
    expect(originalStatus.equipmentCredits).toBe(2);
    expect(expected.credits).toBe(repeat ? 29 : 33);
    const replacement = cooperationOffers(state).find(offer => offer.kind === 'basic')!;
    const denied = dispatchGym(state, state.revision, {type: 'accept-cooperation', id: replacement.id, playerId: state.player!.id}, at);
    expect(denied.error).toContain('无法新接或更换合作');
    expect(denied.state).toBe(state);
    expect(state).toEqual(original);
    expect(cooperationStatus(state)).toEqual(originalStatus);
    expect(recommendationPayout(state)).toEqual(expected);
    const settled = command(state, {type: 'recommend', id: state.player!.id});
    expect(settled.credits - state.credits).toBe(expected.credits);
    expect(settled.fame - state.fame).toBe(expected.fame);
    expect(settled.alumni.at(-1)!.cooperation).toEqual(original.player!.cooperation);
    expect(settled.alumni.at(-1)!.equipmentTraining.cooperationCourses).toEqual([2, 2]);
  });

  it('still accepts and replaces cooperation at 98 using the ordinary new baseline', () => {
    let state = fixture(98);
    const basic = cooperationOffers(state)[0], specialist = cooperationOffers(state)[1];
    state = command(state, {type: 'accept-cooperation', id: basic.id, playerId: state.player!.id});
    expect(state.player!.cooperation).toMatchObject({id: basic.id, acceptedShots: 4_000, acceptedCourses: 400});
    state.player!.equipmentTraining.cooperationCourses = [2, 2];
    state = command(state, {type: 'accept-cooperation', id: specialist.id, playerId: state.player!.id});
    expect(state.player!.cooperation).toMatchObject({id: specialist.id, acceptedShots: 4_000, acceptedCourses: 400});
    expect(state.player!.equipmentTraining.cooperationCourses).toEqual([0, 0]);
  });

  it('keeps explicit abandonment available at 99', () => {
    const state = fixture(99, true);
    const abandoned = command(state, {type: 'abandon-cooperation', playerId: state.player!.id});
    expect(abandoned.player!.cooperation).toBeNull();
    expect(abandoned.player!.equipmentTraining.cooperationCourses).toEqual([0, 0]);
    expect(abandoned.credits).toBe(state.credits);
    expect(abandoned.fame).toBe(state.fame);
  });

  it('does not consume a drink at 99, while allowing purchases for other or future players', () => {
    const state = fixture(99);
    state.player!.stamina = 0; state.inventory.drink = 1;
    const before = structuredClone(state);
    const denied = dispatchGym(state, state.revision, {type: 'use-drink', id: state.player!.id}, at);
    expect(denied.error).toContain('无需使用运动饮料');
    expect(denied.state).toBe(state);
    expect(denied.events).toEqual([]);
    expect(state).toEqual(before);
    const stocked = command(state, {type: 'buy-drink'});
    expect(stocked.inventory.drink).toBe(2);
    expect(stocked.credits).toBe(state.credits - 1);
    expect(stocked.player!.stamina).toBe(0);
  });

  it('still uses one drink to restore ten stamina at 98', () => {
    const state = fixture(98);
    state.player!.stamina = 0; state.inventory.drink = 1;
    const restored = command(state, {type: 'use-drink', id: state.player!.id});
    expect(restored.inventory.drink).toBe(0);
    expect(restored.player!.stamina).toBe(10);
    expect(restored.credits).toBe(state.credits);
  });
});
