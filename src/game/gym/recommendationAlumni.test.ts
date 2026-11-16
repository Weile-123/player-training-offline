import {afterEach, describe, expect, it, vi} from 'vitest';
import {IDBFactory, IDBKeyRange} from 'fake-indexeddb';
import {createGymStore} from '../../gymStore';
import {activePlayers, alumniCount, alumniProgress, dispatchGym, newGym, recommendationPayout, type GymState} from './engine';
import {validGym, writeGym, type GymStorage} from './save';

const now = 1_000;
afterEach(() => { vi.unstubAllGlobals(); });

describe('alumni admission requires a discovered template', () => {
  it('allows an undiscovered player to leave without creating alumni, fame qualifications or a consumed first template', () => {
    const state = newGym(now, 17);
    const playerId = state.player!.id;
    const result = dispatchGym(state, state.revision, {type: 'recommend', id: playerId}, now);

    expect(result.error).toBeUndefined();
    expect(result.state.player).toBeNull();
    expect(result.state.credits).toBe(0);
    expect(alumniProgress(result.state)).toEqual({total: 0, effectiveCount: 0, legendCount: 0, bestTier: 0});
    expect(result.state.postgameRecommendedTemplates).toEqual([]);
    expect(result.events).toContainEqual(expect.objectContaining({type: 'recommended', playerId, credits: 0}));
    expect(state.player!.id).toBe(playerId);

    const replacement = dispatchGym(result.state, result.state.revision, {type: 'recruit'}, now);
    expect(replacement.error).toBeUndefined();
    expect(replacement.state.player!.id).not.toBe(playerId);
    expect(activePlayers(replacement.state)).toHaveLength(1);
    expect(alumniCount(replacement.state)).toBe(0);
    const repeated = dispatchGym(result.state, result.state.revision, {type: 'recommend', id: playerId}, now);
    expect(repeated.error).toBeTruthy();
    expect(repeated.state).toBe(result.state);
  });

  it('keeps earned fame and the other trainee while excluding a trained undiscovered player from the archive', () => {
    let state: GymState = {...newGym(now, 24), gymLevel: 2};
    state = dispatchGym(state, state.revision, {type: 'recruit'}, now).state;
    state.player!.stats.mid += 10;
    state.player!.level = 1;
    state.player!.shots = 4;
    const before = structuredClone(state);
    const payout = recommendationPayout(state);
    expect(payout).toMatchObject({credits: 0, tierId: null});
    expect(payout.fame).toBeGreaterThan(0);

    const result = dispatchGym(state, state.revision, {type: 'recommend', id: state.player!.id}, now);
    expect(result.error).toBeUndefined();
    expect(result.state.fame).toBe(state.fame + payout.fame);
    expect(result.state.player).toEqual(state.bench[0]);
    expect(result.state.alumni).toEqual([]);
    expect(result.state.alumniArchive).toBeUndefined();
    expect(result.state.postgameRecommendedTemplates).toEqual([]);
    expect(state).toEqual(before);
  });

  it('continues recording both first and repeat recommendations of discovered templates', () => {
    let state = newGym(now, 51);
    for (let index = 0; index < 2; index++) {
      const player = state.player!;
      player.templateId = 'caruso';
      player.highestTier = 'rotation';
      player.stats.mid++;
      const result = dispatchGym(state, state.revision, {type: 'recommend', id: player.id}, now);
      expect(result.error).toBeUndefined();
      expect(result.state.alumni[result.state.alumni.length - 1]).toMatchObject({id: player.id, templateId: 'caruso', rewardCredits: 1});
      state = result.state;
      if (index === 0) state = dispatchGym(state, state.revision, {type: 'recruit'}, now).state;
    }
    expect(alumniProgress(state)).toMatchObject({total: 2, effectiveCount: 2, legendCount: 0});
    expect(state.postgameRecommendedTemplates).toEqual(['caruso']);
  });

  it('does not grow durable hot or cold alumni history and preserves existing records across reload', async () => {
    vi.stubGlobal('IDBKeyRange', IDBKeyRange);
    const state = newGym(now, 17);
    // Legacy history remains intact, including previously admitted undiscovered players.
    state.alumni = Array.from({length: 120}, (_, index) => ({...structuredClone(state.player!), id: `old-${index}`,
      recommendedAt: now, rewardCredits: 0, rewardFame: 0, finalValue: '320'}));
    expect(validGym(state)).toBe(true);
    const data = new Map<string, string>();
    const storage: GymStorage = {getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }};
    expect(writeGym(storage, state).ok).toBe(true);
    const options = {indexedDB: new IDBFactory(), databaseName: 'undiscovered-alumni-test'};
    const store = createGymStore(storage, 17, () => now, options);
    await store.getState().hydrate();
    expect(store.getState().state.alumni).toHaveLength(100);
    expect(store.getState().state.alumniArchive?.count).toBe(20);
    const pageBefore = await store.getState().loadAlumni(98, 10);
    const progressBefore = alumniProgress(store.getState().state);
    const result = await store.getState().act({type: 'recommend', id: state.player!.id});
    expect(result.error).toBeUndefined();
    expect(result.state.player).toBeNull();
    expect(result.state.alumni).toHaveLength(100);
    expect(result.state.alumniArchive?.count).toBe(20);
    expect(alumniProgress(result.state)).toEqual(progressBefore);
    expect(await store.getState().loadAlumni(98, 10)).toEqual(pageBefore);

    const reloaded = createGymStore(storage, 17, () => now, options);
    await reloaded.getState().hydrate();
    expect(reloaded.getState().state.player).toBeNull();
    expect(alumniCount(reloaded.getState().state)).toBe(120);
    expect(await reloaded.getState().loadAlumni(98, 10)).toEqual(pageBefore);
    const replacement = await reloaded.getState().act({type: 'recruit'});
    expect(replacement.error).toBeUndefined();
    expect(replacement.state.player!.id).not.toBe(state.player!.id);
  });
});
