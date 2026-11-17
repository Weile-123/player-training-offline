import {describe, expect, it} from 'vitest';
import {grow, match, templateRules} from '../contract/templates';
import {statKeys, type Stats} from '../types';
import {
  cooperationOffers, cooperationStatus, dispatchGym, effectiveTrainingBias, newGym,
  recommendationPayout, staminaMax, staminaRewardMethod, type GymAction, type GymState,
} from './engine';
import {decodeGym, encodeGym, validGym} from './save';

const at = 1_800_000_000_000;
function fixture(): GymState {
  const state = newGym(at, 83), player = state.player!;
  state.gymLevel = 3;
  const template = templateRules.find(entry => entry.tier === 'rotation')!;
  player.templateId = template.id;
  player.highestTier = template.tier;
  player.height = template.height[0];
  player.stats = Object.fromEntries(statKeys.map(key => [key, 60])) as Stats;
  player.level = player.peakLevel = 10;
  player.experience = 7;
  return state;
}
function act(state: GymState, action: GymAction, now = at): GymState {
  const result = dispatchGym(state, state.revision, action, now);
  expect(result.error).toBeUndefined();
  expect(validGym(result.state)).toBe(true);
  return result.state;
}
function adAction(state: GymState, offerIndex = 0): Extract<GymAction, {type: 'complete-cooperation-ad'}> {
  const player = state.player!;
  return {type: 'complete-cooperation-ad', playerId: player.id, id: cooperationOffers(state)[offerIndex].id,
    expectedCooperationId: player.cooperation?.id ?? null,
    expectedCooperationRevision: player.cooperation ? player.cooperation.acceptedRevision ?? 0 : null};
}

describe('per-player sharing reward', () => {
  it('adds exactly three real levels with normal growth and matching, without inventing training', () => {
    const state = fixture(), original = structuredClone(state), player = state.player!;
    const attributes = {...state.rng.attributes};
    const expectedStats = grow(player.stats, effectiveTrainingBias(state, player), 'success', 3, attributes);
    const expectedMatch = match({...player, stats: expectedStats, level: 13, peakLevel: 13});
    const result = dispatchGym(state, state.revision, {type: 'share-player-levels', playerId: player.id}, at);
    expect(result.error).toBeUndefined();
    expect(result.state.player).toMatchObject({level: 13, peakLevel: 13, experience: 7, shareLevelClaimed: true,
      stats: expectedStats, templateId: expectedMatch.templateId, lastStyle: expectedMatch.lastStyle,
      shots: player.shots, stamina: player.stamina, nextShotAt: player.nextShotAt,
      training: player.training, equipmentTraining: player.equipmentTraining, book: player.book});
    expect(result.state.rng.attributes).toEqual(attributes);
    expect(result.state.rng.economy).toEqual(state.rng.economy);
    expect(result.state.collection[result.state.player!.templateId!]).toBeDefined();
    expect(result.events).toContainEqual(expect.objectContaining({type: 'player-share-rewarded', levelGain: 3}));
    expect(state).toEqual(original);
    expect(validGym(result.state)).toBe(true);
    expect(decodeGym(encodeGym(result.state))).toEqual(result.state);
  });

  it('never grants a second reward even after template changes or reloads', () => {
    let state = fixture();
    const action: GymAction = {type: 'share-player-levels', playerId: state.player!.id};
    state = decodeGym(encodeGym(act(state, action)))!;
    state.player!.templateId = templateRules.find(entry => entry.tier === 'starter')!.id;
    const repeated = dispatchGym(state, state.revision, action, at);
    expect(repeated.state).toBe(state); expect(repeated.error).toContain('已领取');
  });

  it('caps sharing at 99, clears overflow XP and pauses automatic training', () => {
    const state = fixture(); state.player!.level = state.player!.peakLevel = 98; state.player!.autoEnabled = true;
    const result = act(state, {type: 'share-player-levels', playerId: state.player!.id});
    expect(result.player).toMatchObject({level: 99, peakLevel: 99, experience: 0, autoEnabled: false, shareLevelClaimed: true});
    expect(result.player!.shots).toBe(0);
  });

  it('refuses absent templates, stale player IDs and capped players atomically', () => {
    const state = fixture(), id = state.player!.id;
    expect(dispatchGym(state, state.revision, {type: 'share-player-levels', playerId: 'old'}, at).state).toBe(state);
    state.player!.templateId = null;
    expect(dispatchGym(state, state.revision, {type: 'share-player-levels', playerId: id}, at).error).toContain('模板');
    state.player!.templateId = templateRules[0].id; state.player!.level = state.player!.peakLevel = 99; state.player!.experience = 0;
    expect(dispatchGym(state, state.revision, {type: 'share-player-levels', playerId: id}, at).error).toContain('99');
    expect(state.player!.shareLevelClaimed).toBeUndefined();
  });
});

describe('stamina posting and advertisement rewards', () => {
  it('uses sharing once for the whole gym, then advertisements across players and reloads', () => {
    let state = fixture(); state.player!.stamina = 0; state.player!.recoveryMs = 123;
    const original = structuredClone(state.player!);
    expect(staminaRewardMethod(state)).toBe('share');
    state = act(state, {type: 'restore-stamina-reward', playerId: state.player!.id, method: 'share', expectedCount: 0});
    expect(state.player).toEqual({...original, stamina: staminaMax(state), recoveryMs: 0});
    expect(state.staminaRewardCount).toBe(1);
    state = decodeGym(encodeGym(state))!;
    state = act(state, {type: 'recommend', id: state.player!.id});
    state = act(state, {type: 'recruit'}); state.player!.stamina = 0;
    expect(staminaRewardMethod(state)).toBe('ad');
    state = act(state, {type: 'restore-stamina-reward', playerId: state.player!.id, method: 'ad', expectedCount: 1});
    expect(state.staminaRewardCount).toBe(2); expect(state.player!.stamina).toBe(staminaMax(state));
  });

  it('rejects callback replay after stamina is spent again and rejects the wrong reward method', () => {
    let state = fixture(); state.player!.stamina = 0;
    const action: GymAction = {type: 'restore-stamina-reward', playerId: state.player!.id, method: 'share', expectedCount: 0};
    state = act(state, action); state.player!.stamina = 0;
    const repeated = dispatchGym(state, state.revision, action, at);
    expect(repeated.state).toBe(state); expect(repeated.error).toContain('已领取');
    expect(dispatchGym(state, state.revision, {...action, expectedCount: 1}, at).error).toContain('方式');
  });

  it('allows natural recovery during the reward dialog but never wastes a full-stamina or level-99 reward', () => {
    const state = fixture(); state.player!.stamina = 0;
    const action: GymAction = {type: 'restore-stamina-reward', playerId: state.player!.id, method: 'share', expectedCount: 0};
    const restored = act(state, action, at + 21_000);
    expect(restored.player!.stamina).toBe(staminaMax(state)); expect(restored.staminaRewardCount).toBe(1);
    const full = dispatchGym(restored, restored.revision, {...action, method: 'ad', expectedCount: 1}, restored.updatedAt);
    expect(full.state).toBe(restored); expect(full.error).toContain('已满');
    state.player!.level = state.player!.peakLevel = 99; state.player!.experience = 0;
    expect(dispatchGym(state, state.revision, action, at).state).toBe(state);
    expect(state.staminaRewardCount).toBeUndefined();
  });
});

describe('advertisement cooperation completion', () => {
  it('finishes only the selected cooperation without granting its payout or fabricating any training', () => {
    const state = fixture(), before = structuredClone(state), action = adAction(state, 1);
    const result = act(state, action), status = cooperationStatus(result);
    expect(status.complete).toBe(true); expect(status.offer!.id).toBe(action.id);
    expect(status.requirements.some(entry => !entry.met)).toBe(true);
    expect(status.equipmentCredits).toBe(0);
    expect(result.player).toEqual({...before.player!, cooperation: {
      id: action.id, playerId: before.player!.id, acceptedShots: 0, acceptedCourses: 0,
      acceptedRevision: 1, adCompleted: true,
    }});
    expect(result.credits).toBe(before.credits); expect(result.fame).toBe(before.fame); expect(result.rng).toEqual(before.rng);
    expect(recommendationPayout(result).cooperationCredits).toBe(3);
    const recommended = act(result, {type: 'recommend', id: result.player!.id});
    expect(recommended.credits).toBe(recommendationPayout(result).credits);
    expect(recommended.alumni[0].cooperation!.adCompleted).toBe(true);
    expect(decodeGym(encodeGym(recommended))).toEqual(recommended);
  });

  it('adds the completed ad cooperation to the one-coupon repeated-template base', () => {
    const state = fixture(); state.postgameRecommendedTemplates = [state.player!.templateId!];
    const result = act(state, adAction(state, 2));
    const payout = recommendationPayout(result);
    expect(payout.rawCredits).toBeGreaterThan(1); expect(payout.baseCredits).toBe(1);
    expect(payout.credits).toBe(1+payout.trainingCredits+payout.cooperationCredits);
    expect(payout.cooperationCredits).toBe(5);
    expect(act(result, {type: 'recommend', id: result.player!.id}).credits).toBe(6);
  });

  it('keeps unmatched recommendations at zero coupons even when advertising completes a cooperation', () => {
    const state = fixture(); state.player!.templateId = null;
    const completed = act(state, adAction(state, 2));
    expect(cooperationStatus(completed).complete).toBe(true);
    expect(recommendationPayout(completed).credits).toBe(0);
    const recommended = act(completed, {type: 'recommend', id: completed.player!.id});
    expect(recommended.credits).toBe(0); expect(recommended.alumni).toHaveLength(0);
  });

  it('does not double-complete and rejects a callback after the same offer was abandoned and reaccepted', () => {
    let state = fixture(), id = cooperationOffers(state)[0].id, playerId = state.player!.id;
    state = act(state, {type: 'accept-cooperation', id, playerId});
    const stale = adAction(state);
    state = act(state, {type: 'abandon-cooperation', playerId});
    state = act(state, {type: 'accept-cooperation', id, playerId});
    expect(dispatchGym(state, state.revision, stale, at).error).toContain('已变化');
    const completed = act(state, adAction(state));
    expect(dispatchGym(completed, completed.revision, adAction(completed), at).error).toContain('已经达成');
  });

  it('preserves real equipment qualification on the same offer but resets it when replacing an offer', () => {
    let state = fixture(); state.player!.shots = 20; state.player!.training.completedCourses = 2;
    const playerId = state.player!.id, id = cooperationOffers(state)[1].id;
    state.player!.cooperation = {id, playerId, acceptedShots: 0, acceptedCourses: 0};
    state.player!.equipmentTraining.cooperationCourses = [2, 0];
    const completed = act(state, adAction(state, 1));
    expect(cooperationStatus(completed).equipmentCredits).toBe(1);
    const replaced = act(state, adAction(state, 2));
    expect(replaced.player!.equipmentTraining.cooperationCourses).toEqual([0, 0]);
    expect(cooperationStatus(replaced).equipmentCredits).toBe(0);
  });

  it('supports roster targets and max-level players without affecting the selected player', () => {
    let state = act(fixture(), {type: 'recruit'});
    state.bench[0].level = state.bench[0].peakLevel = 99; state.bench[0].experience = 0;
    const before = structuredClone(state.player), player = state.bench[0];
    const action: GymAction = {type: 'complete-cooperation-ad', playerId: player.id,
      id: cooperationOffers(state, player)[0].id, expectedCooperationId: null, expectedCooperationRevision: null, scope: 'roster'};
    state = act(state, action);
    expect(state.player).toEqual(before); expect(cooperationStatus(state, state.bench[0]).complete).toBe(true);
  });
});

it('validates new optional reward metadata while keeping old saves compatible', () => {
  const state = fixture();
  expect(decodeGym(encodeGym(state))).toEqual(state);
  for (const count of [-1, 1.5, '1']) expect(validGym({...state, staminaRewardCount: count})).toBe(false);
  expect(validGym({...state, player: {...state.player!, shareLevelClaimed: 'true'}})).toBe(false);
  const completed = act(state, adAction(state));
  expect(validGym({...completed, player: {...completed.player!, cooperation: {...completed.player!.cooperation!, adCompleted: 'true'}}})).toBe(false);
  expect(validGym({...completed, player: {...completed.player!, cooperation: {...completed.player!.cooperation!, acceptedRevision: -1}}})).toBe(false);
});
