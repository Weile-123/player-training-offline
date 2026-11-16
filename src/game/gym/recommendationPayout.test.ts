import {describe, expect, it} from 'vitest';
import {gymEconomyVersion, maximumRecommendationCredits, postgameRepeatTemplateCredits} from './catalog';
import {activePlayers, alumniProgress, cooperationOffers, cooperationStatus, dispatchGym, newGym, recommendation,
  recommendationPayout, type GymAlumnus, type GymState} from './engine';
import {decodeGym, encodeGym, gymSaveKeys, readGym, validGym, writeGym, type GymStorage} from './save';
import {nbaTemplates} from '../templates';
import {createGymStore} from '../../gymStore';

function fixture(credits = 0, gymLevel = 8): GymState {
  const state = {...newGym(1_000, 17), credits, gymLevel};
  const player = state.player!;
  player.enteredGymLevel = gymLevel;
  player.level = player.peakLevel = 25;
  player.templateId = 'bryant'; player.highestTier = 'legend';
  player.stats.three += 10;
  player.shots = 100;
  player.training.completedCourses = 10;
  const offer = cooperationOffers(state, player).at(-1)!;
  player.cooperation = {id: offer.id, playerId: player.id, acceptedShots: 0, acceptedCourses: 0};
  player.equipmentTraining.cooperationCourses = [2, 2];
  expect(cooperationStatus(state).complete).toBe(true);
  expect(validGym(state)).toBe(true);
  return state;
}

function addBench(state: GymState, templateId = 'bryant') {
  const second = structuredClone(state.player!);
  second.id = `gym-p${state.nextPlayer++}`;
  second.templateId = templateId;
  second.cooperation = {...second.cooperation!, id: `${second.id}:legend`, playerId: second.id};
  state.bench.push(second);
  return second;
}
function recommend(state: GymState) {
  const result = dispatchGym(state, state.revision, {type: 'recommend', id: state.player!.id}, state.updatedAt);
  expect(result.error).toBeUndefined();
  return result;
}

describe('all-level per-template recommendation rewards', () => {
  it('publishes economy 11 with a one-coupon repeated-template reward and unchanged 33-coupon theoretical maximum', () => {
    expect(gymEconomyVersion).toBe(11);
    expect(postgameRepeatTemplateCredits).toBe(1);
    expect(maximumRecommendationCredits).toBe(33);
    expect(newGym(1_000).postgameRecommendedTemplates).toEqual([]);
    expect(newGym(1_000).recommendationRulesVersion).toBe(11);
  });

  it.each([0, 499, 500, 501, 5_000])('pays the first G8 recommendation normally at balance %i and records its template once', credits => {
    const state = fixture(credits);
    const before = structuredClone(state);
    const raw = recommendation(state);
    expect(raw.credits).toBe(33);
    expect(recommendationPayout(state)).toEqual({...raw, rawCredits: 33, withheldCredits: 0,
      repeatTemplate: false, isFirstPostgameRecommendation: true});
    const result = recommend(state);
    expect(result.state.credits).toBe(credits + 33);
    expect(result.state.fame - state.fame).toBe(raw.fame);
    expect(result.state.postgameRecommendedTemplates).toEqual(['bryant']);
    expect(result.events.find(event => event.type === 'recommended')).toMatchObject({
      credits: 33, rawCredits: 33, withheldCredits: 0, repeatTemplate: false, isFirstPostgameRecommendation: true,
    });
    expect(result.state.alumni[0]).toMatchObject({rewardCredits: 33, rewardFame: raw.fame});
    expect(validGym(result.state)).toBe(true);
    expect(state).toEqual(before);
  });

  it.each([0, 499, 500, 501, 5_000])('pays exactly one for an already recommended G8 template at balance %i', credits => {
    const state = fixture(credits);
    state.postgameRecommendedTemplates = ['bryant'];
    const before = structuredClone(state);
    const raw = recommendation(state);
    const payout = recommendationPayout(state);
    expect(payout).toMatchObject({credits: 1, rawCredits: 33, withheldCredits: 32,
      repeatTemplate: true, isFirstPostgameRecommendation: false, baseCredits: 5, trainingCredits: 18, cooperationCredits: 10});
    const result = recommend(state);
    expect(result.state.credits).toBe(credits + 1);
    expect(result.state.fame - state.fame).toBe(raw.fame);
    expect(result.state.alumni[0]).toMatchObject({rewardCredits: 1, rewardFame: raw.fame});
    expect(result.state.postgameRecommendedTemplates).toEqual(['bryant']);
    expect(result.events.find(event => event.type === 'recommended')).toMatchObject({credits: 1, rawCredits: 33, withheldCredits: 32,
      repeatTemplate: true, isFirstPostgameRecommendation: false});
    expect(alumniProgress(result.state)).toMatchObject({total: 1, effectiveCount: 1, legendCount: 1, bestTier: 5});
    expect(validGym(result.state)).toBe(true);
    expect(state).toEqual(before);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('records a normal first reward and limits repeats to one at gym level %i', gymLevel => {
    const firstState = fixture(1_000, gymLevel);
    const raw = recommendation(firstState);
    const first = recommend(firstState);
    expect(first.state.credits).toBe(1_000 + raw.credits);
    expect(first.state.postgameRecommendedTemplates).toEqual(['bryant']);
    expect(first.events.find(event => event.type === 'recommended')).toMatchObject({isFirstPostgameRecommendation: true});
    const state = fixture(1_000, gymLevel);
    state.postgameRecommendedTemplates = ['bryant'];
    expect(recommendationPayout(state)).toEqual({...raw, credits: 1, rawCredits: raw.credits, withheldCredits: raw.credits - 1,
      repeatTemplate: true, isFirstPostgameRecommendation: false});
    const result = recommend(state);
    expect(result.state.credits).toBe(1_001);
    expect(result.state.postgameRecommendedTemplates).toEqual(['bryant']);
    expect(result.state.alumni[0].rewardCredits).toBe(1);
  });

  it('makes a later, more cultivated player of the same template a repeat without changing raw fame or cooperation', () => {
    const state = fixture();
    const second = addBench(state);
    second.level = second.peakLevel = 99;
    for (const key of Object.keys(second.stats) as (keyof typeof second.stats)[]) second.stats[key] = 99;
    state.player!.cooperation = null;
    const firstRaw = recommendation(state);
    expect(firstRaw.credits).toBe(23);
    const first = recommend(state);
    const secondRaw = recommendation(first.state);
    expect(secondRaw.credits).toBe(33);
    expect(cooperationStatus(first.state).complete).toBe(true);
    const actual = recommendationPayout(first.state);
    expect(actual).toMatchObject({credits: 1, rawCredits: 33, withheldCredits: 32, repeatTemplate: true,
      fame: secondRaw.fame, growth: secondRaw.growth, cooperationCredits: secondRaw.cooperationCredits});
    expect(actual.growth).toBeGreaterThan(firstRaw.growth);
    const paid = recommend(first.state);
    expect(paid.state.credits).toBe(24);
    expect(paid.state.fame).toBe(firstRaw.fame + secondRaw.fame);
  });

  it('gives a different template its own first reward even in the same tier, then only one for either repeat', () => {
    const state = fixture(700);
    addBench(state, 'jordan'); addBench(state, 'bryant'); addBench(state, 'jordan');
    let current = state;
    const rewards = [];
    while (current.player) {
      const result = recommend(current);
      rewards.push(result.events.find(event => event.type === 'recommended')!.credits);
      current = result.state;
    }
    expect(rewards).toEqual([33, 33, 1, 1]);
    expect(current.credits).toBe(768);
    expect(current.postgameRecommendedTemplates).toEqual(['bryant', 'jordan']);
    expect(alumniProgress(current)).toMatchObject({total: 4, effectiveCount: 4, legendCount: 4});
  });

  it('keeps unmatched recommendations at zero without consuming any template first reward', () => {
    const state = {...newGym(1_000, 17), gymLevel: 8, credits: 500};
    expect(recommendationPayout(state)).toMatchObject({credits: 0, rawCredits: 0, withheldCredits: 0, tier: 0,
      repeatTemplate: false, isFirstPostgameRecommendation: false});
    const paid = recommend(state);
    expect(paid.state.credits).toBe(500);
    expect(paid.state.postgameRecommendedTemplates).toEqual([]);
    expect(paid.state.alumni).toHaveLength(0);
  });

  it('keeps the earlier recommendation counted after upgrading from seven to eight', () => {
    const state = fixture(1_000, 7);
    addBench(state);
    state.fame = 18_000;
    state.collection = Object.fromEntries(nbaTemplates.slice(0, 25).map(template => [template.id,
      {firstAt: 1_000, highestRating: 0, highestValue: '0'}]));
    state.alumni = Array.from({length: 15}, (_, index) => ({...structuredClone(state.player!), id: `old-${index}`,
      cooperation: {...state.player!.cooperation!, id: `old-${index}:legend`, playerId: `old-${index}`},
      recommendedAt: 1_000, rewardCredits: 33, rewardFame: 100, finalValue: '0'} as GymAlumnus));
    const early = recommend(state);
    expect(early.state.postgameRecommendedTemplates).toEqual(['bryant']);
    const upgraded = dispatchGym(early.state, early.state.revision, {type: 'upgrade-gym', targetLevel: 8}, 1_000);
    expect(upgraded.error).toBeUndefined();
    expect(upgraded.state.gymLevel).toBe(8);
    expect(recommendationPayout(upgraded.state)).toMatchObject({credits: 1, repeatTemplate: true, isFirstPostgameRecommendation: false});
    expect(recommend(upgraded.state).state.postgameRecommendedTemplates).toEqual(['bryant']);
  });

  it('unions an old counter with actual hot alumni templates without using collection appearances', () => {
    const legacy = fixture(5_000);
    delete legacy.recommendationRulesVersion;
    legacy.postgameRecommendedTemplates = ['jordan'];
    legacy.collection.curry = {firstAt: 1_000, highestRating: 0, highestValue: '0'};
    legacy.alumni = [{...structuredClone(legacy.player!), id: 'old-bryant', recommendedAt: 1_000,
      cooperation: {...legacy.player!.cooperation!, id: 'old-bryant:legend', playerId: 'old-bryant'},
      rewardCredits: 33, rewardFame: 100, finalValue: '0'}];
    const restored = decodeGym(encodeGym(legacy))!;
    expect(recommendationPayout(restored)).toMatchObject({credits: 1, repeatTemplate: true, isFirstPostgameRecommendation: false});
    const paid = recommend(restored).state;
    expect(paid.credits).toBe(5_001);
    expect(paid.recommendationRulesVersion).toBe(11);
    expect(paid.postgameRecommendedTemplates).toEqual(['jordan', 'bryant']);
    const newTemplate = {...paid, player: {...legacy.player!, templateId: 'curry'}};
    expect(recommendationPayout(newTemplate).isFirstPostgameRecommendation).toBe(true);
  });

  it('does not guess a first reward when a legacy cold archive has not been initialized by the history transaction', () => {
    const legacy = fixture(5_000);
    delete legacy.recommendationRulesVersion;
    legacy.alumniArchive = {id: 'old-history', count: 900, effectiveCount: 900, legendCount: 900, bestTier: 5};
    const refused = dispatchGym(legacy, legacy.revision, {type: 'recommend', id: legacy.player!.id}, legacy.updatedAt);
    expect(refused.error).toContain('推荐记录尚未恢复');
    expect(refused.state).toBe(legacy);
    expect(refused.events).toEqual([]);
  });

  it('roundtrips the bounded template set and rejects duplicate or unknown gameplay IDs', () => {
    const state = fixture();
    state.postgameRecommendedTemplates = ['bryant', 'jordan'];
    const restored = decodeGym(encodeGym(state))!;
    expect(restored.postgameRecommendedTemplates).toEqual(['bryant', 'jordan']);
    expect(recommendationPayout(restored).credits).toBe(1);
    expect(validGym({...state, postgameRecommendedTemplates: nbaTemplates.map(template => template.id)})).toBe(true);
    for (const value of [['bryant', 'bryant'], ['unknown-template'], null, 'bryant', [17]]) {
      expect(validGym({...state, postgameRecommendedTemplates: value})).toBe(false);
    }
    expect(validGym({...state, recommendationRulesVersion: 10})).toBe(false);
    const missingList = {...state};
    delete missingList.postgameRecommendedTemplates;
    expect(validGym(missingList)).toBe(false);
    delete missingList.recommendationRulesVersion;
    expect(validGym(missingList)).toBe(true);
  });

  it('does not consume first status when a command is rejected or its payout exceeds numeric limits', () => {
    const state = fixture(Number.MAX_SAFE_INTEGER);
    const before = structuredClone(state);
    const refused = dispatchGym(state, state.revision, {type: 'recommend', id: state.player!.id}, state.updatedAt);
    expect(refused.error).toBe('经营记录已达到数值上限');
    expect(refused.state).toBe(state);
    expect(refused.events).toEqual([]);
    expect(state).toEqual(before);
    expect(recommendationPayout(state).isFirstPostgameRecommendation).toBe(true);
  });

  it('preserves first status through a failed commit and persists it together with the eventual normal reward', async () => {
    const state = fixture();
    addBench(state);
    const data = new Map<string, string>();
    let failMain = false;
    const storage: GymStorage = {getItem: key => data.get(key) ?? null, setItem: (key, value) => {
      if (failMain && key === gymSaveKeys.main) throw new Error('quota');
      data.set(key, value);
    }};
    writeGym(storage, state);
    const store = createGymStore(storage, 17, () => 1_000);
    const before = store.getState().state;
    failMain = true;
    const failed = await store.getState().act({type: 'recommend', id: state.player!.id});
    expect(failed.error).toBe('save-failed');
    expect(failed.events).toEqual([]);
    expect(store.getState().state).toBe(before);
    expect(readGym(storage).state!.postgameRecommendedTemplates).toEqual([]);
    expect(recommendationPayout(readGym(storage).state!).credits).toBe(33);
    failMain = false;
    const first = await store.getState().act({type: 'recommend', id: state.player!.id});
    expect(first.error).toBeUndefined();
    expect(first.state.credits).toBe(33);
    expect(readGym(storage).state!.postgameRecommendedTemplates).toEqual(['bryant']);
    const reloaded = createGymStore(storage, 17, () => 1_000);
    const second = await reloaded.getState().act({type: 'recommend', id: first.state.player!.id});
    expect(second.error).toBeUndefined();
    expect(second.state.credits).toBe(34);
    expect(second.state.alumni.map(player => player.rewardCredits)).toEqual([33, 1]);
    expect(second.state.postgameRecommendedTemplates).toEqual(['bryant']);
    expect(activePlayers(second.state)).toHaveLength(0);
  });
});
