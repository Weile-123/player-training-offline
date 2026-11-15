import {describe, expect, it} from 'vitest';
import {gymLevels} from './catalog';
import {dispatchGym, gymUpgrade, newGym, type GymAlumnus, type GymState} from './engine';
import {decodeGym, encodeGym, gymSaveKeys, readGym, writeGym} from './save';
import {createGymStore} from '../../gymStore';
import {nbaTemplates} from '../templates';
import {statKeys} from '../types';

const at = 1_800_000_000_000;
const prices = [0, 0, 10, 20, 40, 80, 140, 220];

function eligible(gymLevel: number, credits: number): GymState {
  const state = {...newGym(at, 17), gymLevel, fame: 18_000, credits};
  const legend = nbaTemplates.find(template => template.tier === 'legend')!;
  state.collection = Object.fromEntries(nbaTemplates.slice(0, 25).map(template => [template.id,
    {firstAt: at, highestRating: 0, highestValue: '0'}]));
  state.alumni = Array.from({length: 15}, (_, index) => {
    const player = structuredClone(state.player!);
    for (const key of statKeys) player.stats[key]++;
    return {...player, id: `construction-alumnus-${index}`, level: 25, peakLevel: 25,
      templateId: legend.id, highestTier: 'legend', recommendedAt: at,
      rewardCredits: 33, rewardFame: 100, finalValue: '5624320'} as GymAlumnus;
  });
  return state;
}

describe('gym expansion construction coupons', () => {
  it('keeps the first expansion free and publishes all later permanent prices', () => {
    expect(gymLevels.map(level => level.upgradePrice)).toEqual(prices);
    expect(gymLevels.reduce((sum, level) => sum + level.upgradePrice, 0)).toBe(510);
    const state = eligible(1, 0);
    expect(gymUpgrade(state)).toMatchObject({price: 0, canUpgrade: true});
    const result = dispatchGym(state, state.revision, {type: 'upgrade-gym'}, at);
    expect(result.error).toBeUndefined();
    expect(result.state.gymLevel).toBe(2);
    expect(result.state.credits).toBe(0);
    expect(result.state.fame).toBe(state.fame);
  });

  it.each([3, 4, 5, 6, 7, 8])('charges exactly the published Lv.%i expansion at the funds boundary', target => {
    const price = prices[target - 1];
    const short = eligible(target - 1, price - 1);
    const offer = gymUpgrade(short);
    expect(offer.price).toBe(price);
    expect(offer.canUpgrade).toBe(false);
    expect(offer.requirements.some(requirement => !requirement.met && requirement.current === price - 1 && requirement.required === price)).toBe(true);
    const denied = dispatchGym(short, short.revision, {type: 'upgrade-gym'}, at);
    expect(denied.error).toContain('券');
    expect(denied.state).toBe(short);
    expect(denied.events).toEqual([]);
    const funded = {...short, credits: price};
    const result = dispatchGym(funded, funded.revision, {type: 'upgrade-gym'}, at);
    expect(result.error).toBeUndefined();
    expect(result.state.gymLevel).toBe(target);
    expect(result.state.credits).toBe(0);
    expect(result.state.fame).toBe(funded.fame);
    expect(result.state.projects).toEqual(funded.projects);
    expect(result.state.revision).toBe(funded.revision + 1);
    expect(funded.gymLevel).toBe(target - 1);
    expect(funded.credits).toBe(price);
    expect(decodeGym(encodeGym(result.state))).toEqual(result.state);
  });

  it('does not charge construction funds until the training achievements are satisfied', () => {
    const state = eligible(5, 80);
    state.fame = 5_999;
    const result = dispatchGym(state, state.revision, {type: 'upgrade-gym'}, at);
    expect(result.error).toBeTruthy();
    expect(result.state).toBe(state);
    expect(result.state.credits).toBe(80);
    expect(result.state.gymLevel).toBe(5);
    expect(result.events).toEqual([]);
  });

  it('rejects a repeated old-revision expansion without charging the next stage', () => {
    const state = eligible(6, 140);
    const first = dispatchGym(state, state.revision, {type: 'upgrade-gym'}, at);
    expect(first.error).toBeUndefined();
    expect(first.state.gymLevel).toBe(7);
    const replay = dispatchGym(first.state, state.revision, {type: 'upgrade-gym'}, at);
    expect(replay.error).toContain('过期');
    expect(replay.state).toBe(first.state);
    expect(replay.state.credits).toBe(0);
    expect(replay.events).toEqual([]);
    const unfundedNext = dispatchGym(first.state, first.state.revision, {type: 'upgrade-gym'}, at);
    expect(unfundedNext.error).toContain('券');
    expect(unfundedNext.state).toBe(first.state);
  });

  it('does not reinterpret a stale intended level as a purchase of the following expansion', () => {
    const state = eligible(2, 1_000);
    const action = {type: 'upgrade-gym', targetLevel: 3} as const;
    const first = dispatchGym(state, state.revision, action, at);
    expect(first.error).toBeUndefined();
    expect(first.state.credits).toBe(990);
    const staleIntent = dispatchGym(first.state, first.state.revision, action, at);
    expect(staleIntent.error).toBe('球馆已变化，请重新确认扩建');
    expect(staleIntent.state).toBe(first.state);
    expect(staleIntent.state.gymLevel).toBe(3);
    expect(staleIntent.state.credits).toBe(990);
  });

  it('does not retroactively charge an older existing gym when it is saved, loaded or already at the cap', () => {
    for (const gym of [2, 3, 4, 5, 6, 7, 8]) {
      const previous = eligible(gym, 0);
      const loaded = decodeGym(encodeGym(previous))!;
      expect(loaded).toEqual(previous);
      expect(loaded.credits).toBe(0);
      expect(loaded.gymLevel).toBe(gym);
    }
    const capped = eligible(8, 300);
    const result = dispatchGym(capped, capped.revision, {type: 'upgrade-gym'}, at);
    expect(result.error).toContain('最高');
    expect(result.state).toBe(capped);
    expect(result.state.credits).toBe(300);
  });

  it('keeps the old level and coupons if the construction purchase cannot be saved, then charges once on retry', async () => {
    const values = new Map<string, string>();
    let failWrites = false;
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {if (failWrites) throw Error('quota'); values.set(key, value);},
    };
    const original = eligible(6, 140);
    expect(writeGym(storage, original).ok).toBe(true);
    const raw = storage.getItem(gymSaveKeys.main);
    const store = createGymStore(storage, 17, () => at);
    failWrites = true;
    const denied = await store.getState().act({type: 'upgrade-gym'});
    expect(denied.error).toBe('save-failed');
    expect(store.getState().state).toEqual(original);
    expect(storage.getItem(gymSaveKeys.main)).toBe(raw);
    failWrites = false;
    const paid = await store.getState().act({type: 'upgrade-gym'});
    expect(paid.error).toBeUndefined();
    expect(store.getState().state.gymLevel).toBe(7);
    expect(store.getState().state.credits).toBe(0);
    expect(readGym(storage).state).toEqual(store.getState().state);
  });

  it('charges a shared two-page expansion intention once even when the following level is also affordable', async () => {
    const values = new Map<string, string>();
    const storage = {getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {values.set(key, value);}};
    expect(writeGym(storage, eligible(2, 1_000)).ok).toBe(true);
    const firstPage = createGymStore(storage, 17, () => at);
    const secondPage = createGymStore(storage, 17, () => at);
    const action = {type: 'upgrade-gym', targetLevel: 3} as const;
    const results = await Promise.all([firstPage.getState().act(action), secondPage.getState().act(action)]);
    expect(results.filter(result => !result.error)).toHaveLength(1);
    expect(results.find(result => result.error)?.error).toBe('球馆已变化，请重新确认扩建');
    expect(readGym(storage).state).toMatchObject({gymLevel: 3, credits: 990});
  });
});
