import {describe, expect, it} from 'vitest';
import {random} from '../contract/random';
import {statKeys} from '../types';
import {maximumRecommendationCredits, selectedRecruitmentPrice, selectedRecruitmentUnlockLevel} from './catalog';
import {activePlayers, dispatchGym, newGym, recommendation, type GymAction, type GymState} from './engine';
import {selectedRecruitmentDirections} from './selectedRecruitment';

const now = 1_000;
function fixture(seed = 1, project = 0): GymState {
  const state = newGym(now, seed);
  state.gymLevel = selectedRecruitmentUnlockLevel;
  state.credits = 72;
  state.projects.recruitment = project;
  return state;
}
function command(state: GymState, action: GymAction) {
  const result = dispatchGym(state, state.revision, action, now);
  expect(result.error).toBeUndefined();
  return result.state;
}
function lastPlayer(state: GymState) { return activePlayers(state).at(-1)!; }

describe('optional selected recruitment', () => {
  it.each(selectedRecruitmentDirections)('$id boosts only its two base attributes using independent real recruit-stream draws', direction => {
    for (const project of [0, 5]) for (let seed = 1; seed <= 64; seed++) {
      const initial = fixture(seed, project);
      const free = command(initial, {type: 'recruit', preference: 'forward'});
      const selected = command(initial, {type: 'recruit', preference: 'forward', mode: 'selected', direction: direction.id, expectedNextPlayer: initial.nextPlayer});
      const ordinary = lastPlayer(free), paid = lastPlayer(selected);
      const expectedStream = {...free.rng.recruits};
      for (const key of statKeys) {
        if (!direction.keys.includes(key)) expect(paid.stats[key]).toBe(ordinary.stats[key]);
      }
      for (const key of direction.keys) {
        const base = ordinary.stats[key] - project;
        const expected = base >= 46 ? base : 46 + Math.floor(random(expectedStream) * 3);
        expect(paid.stats[key]).toBe(expected + project);
      }
      expect(selected.rng.recruits).toEqual(expectedStream);
      expect(paid.bias).toEqual(ordinary.bias);
      expect(paid.height).toBe(ordinary.height);
      expect(paid.matchSeed).toBe(ordinary.matchSeed);
      expect(paid.entryStats).toEqual(paid.stats);
      expect(paid.level).toBe(0);
      expect(paid.templateId).toBeNull();
      expect(paid.shots).toBe(0);
      expect(paid.nextShotAt).toBe(now + 1_000);
      expect(selected.credits).toBe(initial.credits - selectedRecruitmentPrice);
      expect(free.credits).toBe(initial.credits);
      expect(selected.rng.economy).toEqual(initial.rng.economy);
      expect(selected.rng.attributes).toEqual(initial.rng.attributes);
    }
  });

  it('retains free recruitment and the ordinary additive project bonus', () => {
    const low = command(fixture(19), {type: 'recruit'});
    const high = command(fixture(19, 5), {type: 'recruit'});
    for (const key of statKeys) expect(lastPlayer(high).stats[key] - lastPlayer(low).stats[key]).toBe(5);
    expect(high.rng).toEqual(low.rng);
    expect(high.credits).toBe(72);
  });

  it('rejects stale duplicate admissions even with a fresh state revision and vacant slots', () => {
    const state = fixture();
    const action = {type: 'recruit', mode: 'selected', direction: 'shooting', expectedNextPlayer: state.nextPlayer} as const;
    const paid = command(state, action);
    const duplicate = dispatchGym(paid, paid.revision, action, now);
    expect(duplicate.error).toBe('招生名单已变化，请重新确认');
    expect(duplicate.state).toBe(paid);
    expect(paid.credits).toBe(72 - selectedRecruitmentPrice);
    expect(paid.nextPlayer).toBe(state.nextPlayer + 1);
    const staleFree = dispatchGym(paid, paid.revision, {type: 'recruit', expectedNextPlayer: state.nextPlayer}, now);
    expect(staleFree.error).toBe('招生名单已变化，请重新确认');
  });

  it('pays exactly eight when only eight remain, with no preview recruit generated beforehand', () => {
    expect(selectedRecruitmentPrice).toBe(8);
    const state = {...fixture(), credits: 8};
    const paid = command(state, {type: 'recruit', mode: 'selected', direction: 'interior', expectedNextPlayer: state.nextPlayer});
    expect(paid.credits).toBe(0);
    expect(paid.nextPlayer).toBe(state.nextPlayer + 1);
    expect(state.nextPlayer).toBe(2);
    expect(activePlayers(state)).toHaveLength(1);
  });

  it.each([
    ['locked stage', (state: GymState) => {state.gymLevel = 5;}, {}],
    ['insufficient credits', (state: GymState) => {state.credits = 7;}, {}],
    ['missing confirmation', () => {}, {expectedNextPlayer: undefined}],
    ['invalid direction', () => {}, {direction: 'balanced'}],
    ['missing direction', () => {}, {direction: undefined}],
    ['invalid preference', () => {}, {preference: 'tall'}],
    ['invalid mode', () => {}, {mode: 'preview'}],
    ['invalid sequence', () => {}, {expectedNextPlayer: 2.5}],
  ])('refuses %s without payment, RNG consumption, or admission', (_label, prepare, overrides) => {
    const state = fixture();
    prepare(state);
    const before = structuredClone(state);
    const action = {type: 'recruit', mode: 'selected', direction: 'shooting', expectedNextPlayer: state.nextPlayer, ...overrides} as GymAction;
    const denied = dispatchGym(state, state.revision, action, now);
    expect(denied.error).toBeTruthy();
    expect(denied.state).toBe(state);
    expect(state).toEqual(before);
  });

  it('refuses an occupied last slot without consuming the recruit stream or cash', () => {
    let state = fixture();
    while (activePlayers(state).length < state.gymLevel) state = command(state, {type: 'recruit'});
    const before = structuredClone(state);
    const denied = dispatchGym(state, state.revision, {type: 'recruit', mode: 'selected', direction: 'shooting', expectedNextPlayer: state.nextPlayer}, now);
    expect(denied.error).toContain('训练位已满');
    expect(denied.state).toBe(state);
    expect(state).toEqual(before);
  });

  it('keeps a normal first reward up to 33 and charges a net seven for a later selected repeat', () => {
    const initial = {...fixture(), player: null};
    const paid = command(initial, {type: 'recruit', preference: 'forward', mode: 'selected', direction: 'finishing', expectedNextPlayer: initial.nextPlayer});
    const player = paid.player!;
    // Isolate the published upper reward boundary after a real atomic paid admission.
    player.level = player.peakLevel = 99;
    for (const key of statKeys) player.stats[key] = 99;
    player.templateId = 'bryant'; player.highestTier = 'legend';
    player.shots = 100; player.training.completedCourses = 10;
    player.cooperation = {id: `${player.id}:legend`, playerId: player.id, acceptedShots: 0, acceptedCourses: 0};
    player.equipmentTraining.cooperationCourses = [2, 2];
    const reward = recommendation(paid);
    expect(reward.credits).toBe(maximumRecommendationCredits);
    expect(reward.credits).toBe(33);
    const settled = command(paid, {type: 'recommend', id: player.id});
    expect(settled.credits - initial.credits).toBe(33 - selectedRecruitmentPrice);
    expect(recommendation({...player, level: 25, peakLevel: 25}).credits).toBe(23);
    const repeated = command(settled, {type: 'recruit', preference: 'forward', mode: 'selected', direction: 'finishing', expectedNextPlayer: settled.nextPlayer});
    repeated.player = {...structuredClone(player), id: repeated.player!.id};
    repeated.player.cooperation = null;
    repeated.player.equipmentTraining.cooperationCourses = [0, 0];
    const repeatedPayout = command(repeated, {type: 'recommend', id: repeated.player.id});
    expect(settled.credits - repeatedPayout.credits).toBe(7);
  });
});
