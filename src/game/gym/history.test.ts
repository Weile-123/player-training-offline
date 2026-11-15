import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {IDBFactory, IDBKeyRange, IDBObjectStore} from 'fake-indexeddb';
import {createGymStore} from '../../gymStore';
import {activePlayers, alumniProgress, newGym, recommendation, recommendationPayout, type GymState} from './engine';
import {createGymHistory, recentAlumniLimit} from './history';
import {encodeGym, gymSaveKeys, readGym, validGym, writeGym, type GymStorage} from './save';
import {templateRules} from '../contract/templates';

function fixture(count: number) {
  const state = newGym(1_000, 17);
  state.credits = 100;
  const legend = templateRules.find(template => template.tier === 'legend')!;
  state.alumni = Array.from({length: count}, (_, index) => {
    const player = structuredClone(state.player!);
    player.id = `old-${index}`;
    if (index % 3 === 0) {
      player.stats.three++;
      player.templateId = legend.id;
      player.highestTier = 'legend';
    }
    return {...player, recommendedAt: 1_000, rewardCredits: 0, rewardFame: 0, finalValue: String(index)};
  });
  expect(validGym(state)).toBe(true);
  return state;
}

function memory(initial?: GymState) {
  const data = new Map<string, string>();
  let failure: (key: string) => boolean = () => false;
  const storage: GymStorage = {getItem: key => data.get(key) ?? null, setItem: (key, value) => {
    if (failure(key)) throw new DOMException('quota', 'QuotaExceededError');
    data.set(key, value);
  }};
  if (initial) writeGym(storage, initial);
  return {data, storage, fail: (predicate: (key: string) => boolean) => { failure = predicate; }};
}

async function records(factory: globalThis.IDBFactory, store: string) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = factory.open('history-test', 1);
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  const values = await new Promise<unknown[]>((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return values;
}

async function replaceRecord(factory: globalThis.IDBFactory, store: string, key: string, value: unknown) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = factory.open('history-test', 1);
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
  db.close();
}

beforeEach(() => { vi.stubGlobal('IDBKeyRange', IDBKeyRange); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('bounded recent alumni with durable history', () => {
  it('migrates a valid 5,000-record old envelope and preserves the oldest complete page', async () => {
    const original = fixture(5_000);
    const context = memory(original);
    const raw = context.data.get(gymSaveKeys.main)!;
    const indexedDB = new IDBFactory();
    const store = createGymStore(context.storage, 17, () => 1_000, {indexedDB, databaseName: 'history-test'});
    await store.getState().hydrate();
    expect(store.getState().state.alumni).toHaveLength(100);
    expect(store.getState().state.alumniArchive?.count).toBe(4_900);
    expect(encodeGym(store.getState().state).length).toBeLessThan(160_000);
    expect(await records(indexedDB, 'alumni')).toHaveLength(4_900);
    expect(await records(indexedDB, 'snapshots')).toEqual([{main: raw, backup: raw}]);
    expect(await store.getState().loadAlumni(4_980, 20)).toEqual({players: original.alumni.slice(0, 20).reverse(), total: 5_000});
  });
  it('losslessly migrates old saves, preserves original snapshots, and pages in newest-first order', async () => {
    const original = fixture(1_003);
    const context = memory(original);
    const raw = context.data.get(gymSaveKeys.main)!;
    const indexedDB = new IDBFactory();
    const store = createGymStore(context.storage, 17, () => 1_000, {indexedDB, databaseName: 'history-test'});
    expect(store.getState().hydrating).toBe(true);
    await store.getState().hydrate();
    expect(store.getState().hydrating).toBe(false);
    const current = store.getState().state;
    expect(current.alumni).toHaveLength(recentAlumniLimit);
    expect(current.alumniArchive?.count).toBe(903);
    expect(alumniProgress(current)).toEqual(alumniProgress(original));
    expect(encodeGym(current).length).toBeLessThan(160_000);
    expect(await records(indexedDB, 'snapshots')).toEqual([{main: raw, backup: raw}]);
    expect(await records(indexedDB, 'alumni')).toHaveLength(903);
    const all = [];
    for (let offset = 0; offset < 1_003; offset += 37) {
      const page = await store.getState().loadAlumni(offset, 37);
      expect(page.total).toBe(1_003);
      all.push(...page.players);
    }
    expect(all).toEqual(original.alumni.slice().reverse());
    expect(await store.getState().loadAlumni(2_000, 20)).toEqual({players: [], total: 1_003});
    const reloaded = createGymStore(context.storage, 17, () => 1_000, {indexedDB, databaseName: 'history-test'});
    await reloaded.getState().hydrate();
    expect(await reloaded.getState().loadAlumni(98, 5)).toEqual({players: original.alumni.slice().reverse().slice(98, 103), total: 1_003});
    expect(await records(indexedDB, 'alumni')).toHaveLength(903);
  });

  it('aborts an incomplete migration without replacing either original localStorage copy', async () => {
    const original = fixture(180);
    const context = memory(original);
    const raw = context.data.get(gymSaveKeys.main)!;
    const indexedDB = new IDBFactory();
    const add = IDBObjectStore.prototype.add;
    const broken = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (this: globalThis.IDBObjectStore, value, key) {
      if (this.name === 'alumni' && (value as {sequence: number}).sequence === 25) throw new DOMException('quota', 'QuotaExceededError');
      return add.call(this, value, key);
    });
    const store = createGymStore(context.storage, 17, () => 1_000, {indexedDB, databaseName: 'history-test'});
    await store.getState().hydrate();
    expect(store.getState().actionError).toContain('历史档案');
    expect(store.getState().state.alumni).toHaveLength(180);
    expect(context.data.get(gymSaveKeys.main)).toBe(raw);
    expect(context.data.get(gymSaveKeys.backup)).toBe(raw);
    expect(await records(indexedDB, 'hot')).toEqual([]);
    expect(await records(indexedDB, 'alumni')).toEqual([]);
    expect(await records(indexedDB, 'snapshots')).toEqual([]);
    broken.mockRestore();
    await store.getState().hydrate();
    expect(store.getState().state.alumniArchive?.count).toBe(80);
    expect((await store.getState().loadAlumni(100, 80)).players).toEqual(original.alumni.slice(0, 80).reverse());
  });

  it('commits recommendation, reward and overflow together and awards concurrent pages once', async () => {
    const original = fixture(100);
    original.player!.stats.three++;
    original.player!.templateId = templateRules.find(template => template.tier === 'legend')!.id;
    original.player!.highestTier = 'legend';
    const payout = recommendation(original).credits;
    expect(payout).toBeGreaterThan(0);
    const context = memory(original);
    const indexedDB = new IDBFactory();
    const options = {indexedDB, databaseName: 'history-test'};
    const first = createGymStore(context.storage, 17, () => 1_000, options);
    await first.getState().hydrate();
    const before = first.getState().state;
    const add = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(() => { throw new Error('quota'); });
    const refused = await first.getState().act({type: 'recommend', id: original.player!.id});
    expect(refused.error).toBe('save-failed');
    expect(first.getState().state).toBe(before);
    expect(readGym(context.storage).state!.credits).toBe(100);
    expect((await records(indexedDB, 'alumni'))).toHaveLength(0);
    add.mockRestore();
    const second = createGymStore(context.storage, 17, () => 1_000, options);
    const outcomes = await Promise.all([first, second].map(store => store.getState().act({type: 'recommend', id: original.player!.id})));
    expect(outcomes.filter(result => !result.error)).toHaveLength(1);
    await first.getState().hydrate();
    expect(first.getState().state.credits).toBe(100 + payout);
    expect(first.getState().state.player).toBeNull();
    expect(first.getState().state.alumniArchive?.count).toBe(1);
    expect(first.getState().state.alumni).toHaveLength(100);
    const pages = await Promise.all([first.getState().loadAlumni(0, 100), first.getState().loadAlumni(100, 100)]);
    const ids = pages.flatMap(page => page.players.map(player => player.id));
    expect(new Set(ids).size).toBe(101);
    expect(ids[0]).toBe(original.player!.id);
  });

  it('recovers an authoritative IDB commit when every localStorage mirror write fails', async () => {
    const original = fixture(1_000);
    const context = memory(original);
    const raw = context.data.get(gymSaveKeys.main)!;
    const indexedDB = new IDBFactory();
    const options = {indexedDB, databaseName: 'history-test'};
    context.fail(() => true);
    const store = createGymStore(context.storage, 17, () => 1_000, options);
    await store.getState().hydrate();
    const result = await store.getState().act({type: 'buy-drink'});
    expect(result.error).toBeUndefined();
    expect(result.state.credits).toBe(99);
    expect(store.getState().saveMessage).toContain('启动镜像');
    expect(context.data.get(gymSaveKeys.main)).toBe(raw);
    const reloaded = createGymStore(context.storage, 17, () => 1_000, options);
    expect(reloaded.getState().state.credits).toBe(100);
    await reloaded.getState().hydrate();
    expect(reloaded.getState().state.credits).toBe(99);
    expect((await reloaded.getState().loadAlumni(990, 10)).players).toEqual(original.alumni.slice(0, 10).reverse());
    context.fail(() => false);
    await reloaded.getState().hydrate();
    expect(readGym(context.storage).state!.credits).toBe(99);
    expect(readGym(context.storage).state!.alumni).toHaveLength(100);
  });

  it('refuses creating a replacement gym while IndexedDB opening is unavailable', async () => {
    const context = memory(fixture(120));
    const raw = context.data.get(gymSaveKeys.main);
    const indexedDB = new IDBFactory();
    const unavailable = vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new Error('temporarily unavailable'); });
    const store = createGymStore(context.storage, 17, () => 1_000, {indexedDB, databaseName: 'history-test'});
    expect((await store.getState().start()).error).toBe('save-failed');
    expect(context.data.get(gymSaveKeys.main)).toBe(raw);
    expect(store.getState().state.alumni).toHaveLength(120);
    unavailable.mockRestore();
    await store.getState().hydrate();
    expect(store.getState().state.alumniArchive?.count).toBe(20);
  });

  it('repairs a damaged IDB current from its same-commit backup and protects both-damaged copies', async () => {
    const original = fixture(120);
    const context = memory(original);
    const indexedDB = new IDBFactory();
    const options = {indexedDB, databaseName: 'history-test'};
    const store = createGymStore(context.storage, 17, () => 1_000, options);
    await store.getState().hydrate();
    await store.getState().act({type: 'buy-drink'});
    await replaceRecord(indexedDB, 'hot', 'current', 'corrupt');
    // The startup mirror can also be old; only the authoritative IDB backup is
    // eligible for restoring this newer transaction.
    writeGym(context.storage, original);
    await store.getState().hydrate();
    expect(store.getState().state.credits).toBe(99);
    expect(store.getState().saveMessage).toContain('备份');
    const restored = await records(indexedDB, 'hot');
    expect(restored).toHaveLength(2);
    expect(restored[0]).toBe(restored[1]);
    await replaceRecord(indexedDB, 'hot', 'current', 'corrupt-current');
    await replaceRecord(indexedDB, 'hot', 'backup', 'corrupt-backup');
    const before = context.data.get(gymSaveKeys.main);
    expect((await store.getState().start()).error).toBe('save-failed');
    expect(context.data.get(gymSaveKeys.main)).toBe(before);
    expect(await records(indexedDB, 'hot')).toEqual(['corrupt-backup', 'corrupt-current']);
  });

  it('aborts currency changes if writing the IDB backup fails after the current write was queued', async () => {
    const context = memory(fixture(120));
    const indexedDB = new IDBFactory();
    const store = createGymStore(context.storage, 17, () => 1_000, {indexedDB, databaseName: 'history-test'});
    await store.getState().hydrate();
    const original = await records(indexedDB, 'hot');
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: globalThis.IDBObjectStore, value, key) {
      if (this.name === 'hot' && key === 'backup') throw new Error('quota');
      return put.call(this, value, key);
    });
    expect((await store.getState().act({type: 'buy-drink'})).error).toBe('save-failed');
    expect(store.getState().state.credits).toBe(100);
    expect(await records(indexedDB, 'hot')).toEqual(original);
    expect(readGym(context.storage).state!.credits).toBe(100);
  });

  it.each(['write-error', 'transaction-abort'] as const)('keeps a confirmed eight-coupon selected admission atomic on an IDB %s, then accepts the same request once', async failure => {
    const original = fixture(120);
    original.gymLevel = 6;
    original.credits = 8;
    const context = memory(original);
    const indexedDB = new IDBFactory();
    const options = {indexedDB, databaseName: 'history-test'};
    const store = createGymStore(context.storage, 17, () => 1_000, options);
    await store.getState().hydrate();
    const before = store.getState().state;
    const coldBefore = await records(indexedDB, 'alumni');
    const hotBefore = await records(indexedDB, 'hot');
    const mirrorBefore = context.data.get(gymSaveKeys.main);
    const request = {type: 'recruit', mode: 'selected', direction: 'shooting', expectedNextPlayer: before.nextPlayer} as const;
    const put = IDBObjectStore.prototype.put;
    const broken = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: globalThis.IDBObjectStore, value, key) {
      if (this.name === 'hot' && key === 'current' && failure === 'write-error') throw new DOMException('quota', 'QuotaExceededError');
      const queued = put.call(this, value, key);
      if (this.name === 'hot' && key === 'current' && failure === 'transaction-abort') {
        queued.addEventListener('success', () => this.transaction.abort());
      }
      return queued;
    });
    const refused = await store.getState().act(request);
    expect(refused.error).toBe('save-failed');
    expect(refused.events).toEqual([]);
    expect(store.getState().state).toBe(before);
    expect(store.getState().state).toMatchObject({credits: 8, nextPlayer: original.nextPlayer, rng: original.rng, bench: []});
    expect(activePlayers(store.getState().state)).toHaveLength(1);
    expect(await records(indexedDB, 'hot')).toEqual(hotBefore);
    expect(await records(indexedDB, 'alumni')).toEqual(coldBefore);
    expect(context.data.get(gymSaveKeys.main)).toBe(mirrorBefore);
    broken.mockRestore();
    const admitted = await store.getState().act(request);
    expect(admitted.error).toBeUndefined();
    expect(admitted.state.credits).toBe(0);
    expect(admitted.state.nextPlayer).toBe(before.nextPlayer + 1);
    expect(activePlayers(admitted.state)).toHaveLength(2);
    expect(admitted.state.bench[0].entryStats).toEqual(admitted.state.bench[0].stats);
    expect(admitted.state.rng.recruits).not.toEqual(before.rng.recruits);
    const paidRng = structuredClone(admitted.state.rng);
    const duplicate = await store.getState().act(request);
    expect(duplicate.error).toBe('招生名单已变化，请重新确认');
    expect(duplicate.state.credits).toBe(0);
    expect(duplicate.state.nextPlayer).toBe(before.nextPlayer + 1);
    expect(duplicate.state.rng).toEqual(paidRng);
    expect(activePlayers(duplicate.state)).toHaveLength(2);
    expect(await records(indexedDB, 'alumni')).toEqual(coldBefore);
    const reloaded = createGymStore(context.storage, 17, () => 1_000, options);
    await reloaded.getState().hydrate();
    expect(reloaded.getState().state.credits).toBe(0);
    expect(activePlayers(reloaded.getState().state)).toHaveLength(2);
    expect(await reloaded.getState().loadAlumni(100, 20)).toEqual({players: original.alumni.slice(0, 20).reverse(), total: 120});
  });

  it('serializes two page wrappers confirming the same paid sequence, even with enough funds for two admissions', async () => {
    const original = fixture(120);
    original.gymLevel = 6;
    original.credits = 16;
    const context = memory(original);
    const indexedDB = new IDBFactory();
    const options = {indexedDB, databaseName: 'history-test'};
    const first = createGymStore(context.storage, 17, () => 1_000, options);
    // Distinct wrapper identities bypass the same-object in-process queue, so
    // IDB's cross-page transaction ordering must enforce the sequence guard.
    const second = createGymStore({getItem: context.storage.getItem, setItem: context.storage.setItem}, 17, () => 1_000, options);
    await Promise.all([first.getState().hydrate(), second.getState().hydrate()]);
    const coldBefore = await records(indexedDB, 'alumni');
    const request = {type: 'recruit', mode: 'selected', direction: 'interior', expectedNextPlayer: original.nextPlayer} as const;
    const outcomes = await Promise.all([first.getState().act(request), second.getState().act(request)]);
    expect(outcomes.filter(result => !result.error)).toHaveLength(1);
    expect(outcomes.find(result => result.error)?.error).toBe('招生名单已变化，请重新确认');
    await first.getState().hydrate();
    expect(first.getState().state.credits).toBe(8);
    expect(first.getState().state.nextPlayer).toBe(original.nextPlayer + 1);
    expect(activePlayers(first.getState().state)).toHaveLength(2);
    expect(await records(indexedDB, 'alumni')).toEqual(coldBefore);
    expect(await first.getState().loadAlumni(100, 20)).toEqual({players: original.alumni.slice(0, 20).reverse(), total: 120});
  });

  it('retains the previous recent records and corrupt legacy raw data in recovery snapshots when restarting', async () => {
    const context = memory(fixture(120));
    const indexedDB = new IDBFactory();
    const options = {indexedDB, databaseName: 'history-test'};
    const store = createGymStore(context.storage, 17, () => 1_000, options);
    await store.getState().hydrate();
    const before = encodeGym(store.getState().state);
    expect((await store.getState().start()).error).toBeUndefined();
    expect(await records(indexedDB, 'alumni')).toHaveLength(20);
    expect(await records(indexedDB, 'snapshots')).toContainEqual({main: before, backup: before});
    const corrupt = memory();
    corrupt.data.set(gymSaveKeys.main, 'broken-main');
    corrupt.data.set(gymSaveKeys.backup, 'broken-backup');
    const alternateFactory = new IDBFactory();
    const replacement = createGymStore(corrupt.storage, 17, () => 1_000, {indexedDB: alternateFactory, databaseName: 'history-test'});
    expect((await replacement.getState().start()).error).toBeUndefined();
    expect(await records(alternateFactory, 'snapshots')).toEqual([{main: 'broken-main', backup: 'broken-backup'}]);
  });

  it('does not read or rewrite archived records during ordinary hot-state actions', async () => {
    const context = memory(fixture(1_000));
    const indexedDB = new IDBFactory();
    const store = createGymStore(context.storage, 17, () => 1_000, {indexedDB, databaseName: 'history-test'});
    await store.getState().hydrate();
    const get = vi.spyOn(IDBObjectStore.prototype, 'get');
    const add = vi.spyOn(IDBObjectStore.prototype, 'add');
    const cursor = vi.spyOn(IDBObjectStore.prototype, 'openCursor');
    for (let index = 0; index < 10; index++) expect((await store.getState().act({type: 'buy-drink'})).error).toBeUndefined();
    expect(get.mock.instances.every(instance => (instance as globalThis.IDBObjectStore).name === 'hot')).toBe(true);
    expect(add).not.toHaveBeenCalled();
    expect(cursor).not.toHaveBeenCalled();
    expect(store.getState().state.alumni).toHaveLength(100);
    expect(store.getState().state.alumniArchive?.count).toBe(900);
  });

  it('keeps injected memory storage atomic across archival and primary-write failures', async () => {
    const original = fixture(103);
    const context = memory(original);
    const raw = context.data.get(gymSaveKeys.main);
    context.fail(key => key.startsWith('gym-management-v1.alumni.'));
    const store = createGymStore(context.storage, 17, () => 1_000);
    expect((await store.getState().act({type: 'buy-drink'})).error).toBe('save-failed');
    expect(context.data.get(gymSaveKeys.main)).toBe(raw);
    context.fail(key => key === gymSaveKeys.main);
    expect((await store.getState().act({type: 'buy-drink'})).error).toBe('save-failed');
    expect(context.data.get(gymSaveKeys.main)).toBe(raw);
    expect(store.getState().state.credits).toBe(100);
    context.fail(() => false);
    expect((await store.getState().act({type: 'buy-drink'})).error).toBeUndefined();
    expect(store.getState().state.credits).toBe(99);
    expect((await store.getState().loadAlumni(98, 5)).players).toEqual(original.alumni.slice().reverse().slice(98, 103));
    const reloaded = createGymStore(context.storage, 17, () => 1_000);
    expect(await reloaded.getState().loadAlumni(100, 10)).toEqual({players: original.alumni.slice(0, 3).reverse(), total: 103});
  });

  it('reports missing history and invalid page requests instead of returning an empty history', async () => {
    const context = memory(fixture(120));
    const history = createGymHistory(context.storage);
    await history.transact(current => ({value: current}));
    const state = readGym(context.storage).state!;
    context.data.delete(`gym-management-v1.alumni.${state.alumniArchive!.id}.0`);
    await expect(history.loadAlumni(119, 20)).rejects.toThrow('alumni-unavailable');
    await expect(history.loadAlumni(-1, 20)).rejects.toThrow('invalid-alumni-page');
    await expect(history.loadAlumni(0, 101)).rejects.toThrow('invalid-alumni-page');
  });
});
