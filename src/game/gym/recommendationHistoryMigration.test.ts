import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {IDBFactory, IDBKeyRange, IDBObjectStore} from 'fake-indexeddb';
import {createGymStore} from '../../gymStore';
import {newGym, recommendationPayout, type GymState} from './engine';
import {createGymHistory} from './history';
import {encodeGym, gymSaveKeys, readGym, writeGym, type GymStorage} from './save';

const databaseName = 'recommendation-history-migration';
beforeEach(() => {vi.stubGlobal('IDBKeyRange', IDBKeyRange);});
afterEach(() => {vi.restoreAllMocks(); vi.unstubAllGlobals();});

async function replaceHot(factory: globalThis.IDBFactory, state: GymState) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = factory.open(databaseName, 1);
    open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('hot', 'readwrite');
    tx.objectStore('hot').put(encodeGym(state), 'current');
    tx.objectStore('hot').put(encodeGym(state), 'backup');
    tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
  });
  db.close();
}

async function archivedLegacy(indexedDB?: globalThis.IDBFactory) {
  const data = new Map<string, string>();
  const storage: GymStorage = {getItem: key => data.get(key) ?? null, setItem: (key, value) => {data.set(key, value);}};
  const state = newGym(1_000, 17);
  state.gymLevel = 7; state.credits = 5_000;
  state.player!.templateId = 'curry'; state.player!.highestTier = 'legend'; state.player!.stats.three++;
  state.collection.bird = {firstAt: 1_000, highestRating: 0, highestValue: '0'};
  state.alumni = Array.from({length: 101}, (_, index) => ({...structuredClone(state.player!), id: `old-${index}`,
    templateId: index === 0 ? 'curry' : null, highestTier: index === 0 ? 'legend' as const : null,
    recommendedAt: 1_000, rewardCredits: index === 0 ? 5 : 0, rewardFame: 0, finalValue: '0'}));
  expect(writeGym(storage, state).ok).toBe(true);
  const options = indexedDB ? {indexedDB, databaseName} : {};
  const history = createGymHistory(storage, options);
  await history.transact(current => ({value: null, state: current.state!}));
  const legacy = readGym(storage).state!;
  expect(legacy.alumni).toHaveLength(100);
  expect(legacy.alumniArchive?.count).toBe(1);
  delete legacy.recommendationRulesVersion;
  delete legacy.challengeReferralCounts;
  legacy.postgameRecommendedTemplates = ['jordan'];
  expect(writeGym(storage, legacy).ok).toBe(true);
  if (indexedDB) await replaceHot(indexedDB, legacy);
  return {data, storage, options, legacy};
}

describe('one-time all-level recommendation history initialization', () => {
  it.each(['memory', 'indexedDB'])('unions cold final templates with the old counter once in %s without changing cash or appearance records', async backend => {
    const indexedDB = backend === 'indexedDB' ? new IDBFactory() : undefined;
    const context = await archivedLegacy(indexedDB);
    const cursor = vi.spyOn(IDBObjectStore.prototype, 'openCursor');
    const store = createGymStore(context.storage, 17, () => 1_000, context.options);
    await store.getState().hydrate();
    const restored = store.getState().state;
    expect(restored.recommendationRulesVersion).toBe(11);
    expect(restored.postgameRecommendedTemplates).toEqual(['jordan', 'curry']);
    expect(restored.challengeReferralCounts).toEqual({curry:1});
    expect(restored.credits).toBe(5_000);
    expect(restored.fame).toBe(context.legacy.fame);
    expect(restored.rng).toEqual(context.legacy.rng);
    expect(restored.collection).toEqual(context.legacy.collection);
    expect(restored.alumni).toEqual(context.legacy.alumni);
    expect(recommendationPayout(restored)).toMatchObject({credits: 1, repeatTemplate: true});
    expect(cursor).toHaveBeenCalledTimes(indexedDB ? 1 : 0);
    await store.getState().hydrate();
    await store.getState().tick();
    expect(cursor).toHaveBeenCalledTimes(indexedDB ? 1 : 0);
    const result = await store.getState().act({type: 'recommend', id: restored.player!.id});
    expect(result.error).toBeUndefined();
    expect(result.state.credits).toBe(5_001);
    expect(result.state.alumni.at(-1)!.rewardCredits).toBe(1);
    expect(result.state.challengeReferralCounts).toEqual({curry:2});
    expect(result.state.postgameRecommendedTemplates).not.toContain('bird');
    const challenge = await store.getState().act({type:'start-challenge',attempt:0});
    expect(challenge.error).toBeUndefined();
    expect(challenge.state.challenge?.run.settings?.referrals).toEqual({curry:2});
    const restart = await store.getState().start();
    expect(restart.error).toBeUndefined();
    expect(restart.state.postgameRecommendedTemplates).toEqual([]);
    expect(restart.state.recommendationRulesVersion).toBe(11);
    expect(restart.state.collection).toEqual(context.legacy.collection);
  });

  it.each(['read-error', 'commit-abort'])('does not publish initialized IDs or an incorrect first reward after %s, then safely retries', async failure => {
    const indexedDB = new IDBFactory();
    const context = await archivedLegacy(indexedDB);
    const store = createGymStore(context.storage, 17, () => 1_000, context.options);
    const before = store.getState().state;
    const mirror = context.data.get(gymSaveKeys.main);
    const openCursor = IDBObjectStore.prototype.openCursor;
    const put = IDBObjectStore.prototype.put;
    const broken = failure === 'read-error'
      ? vi.spyOn(IDBObjectStore.prototype, 'openCursor').mockImplementation(function (this: globalThis.IDBObjectStore, ...args) {
        if (this.name === 'alumni') throw new Error('read-error');
        return openCursor.apply(this, args);
      })
      : vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: globalThis.IDBObjectStore, value, key) {
        const queued = put.call(this, value, key);
        if (this.name === 'hot' && key === 'current') queued.addEventListener('success', () => this.transaction.abort());
        return queued;
      });
    const denied = await store.getState().act({type: 'recommend', id: before.player!.id});
    expect(denied.error).toBe('save-failed');
    expect(denied.events).toEqual([]);
    expect(store.getState().state).toBe(before);
    expect(context.data.get(gymSaveKeys.main)).toBe(mirror);
    expect(readGym(context.storage).state!.recommendationRulesVersion).toBeUndefined();
    broken.mockRestore();
    await store.getState().hydrate();
    expect(store.getState().state.postgameRecommendedTemplates).toEqual(['jordan', 'curry']);
    const paid = await store.getState().act({type: 'recommend', id: before.player!.id});
    expect(paid.error).toBeUndefined();
    expect(paid.state.credits).toBe(5_001);
    expect(paid.state.alumni.at(-1)!.rewardCredits).toBe(1);
  });

  it('refuses a missing memory archive record before marking the recommendation history initialized', async () => {
    const context = await archivedLegacy();
    const archive = context.legacy.alumniArchive!;
    const key = `gym-management-v1.alumni.${archive.id}.0`;
    const record = context.data.get(key)!;
    context.data.delete(key);
    const store = createGymStore(context.storage, 17, () => 1_000);
    await store.getState().hydrate();
    expect(store.getState().state.recommendationRulesVersion).toBeUndefined();
    expect(store.getState().actionError).toContain('历史档案');
    expect((await store.getState().act({type: 'recommend', id: context.legacy.player!.id})).error).toBe('save-failed');
    expect(readGym(context.storage).state!.credits).toBe(5_000);
    context.data.set(key, record);
    await store.getState().hydrate();
    expect(recommendationPayout(store.getState().state).credits).toBe(1);
  });
});
