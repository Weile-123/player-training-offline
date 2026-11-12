import {afterEach, describe, expect, it, vi} from 'vitest';
import {createGymStore} from './gymStore';
import {gymSaveKeys, readGym, writeGym, type GymStorage} from './game/gym/save';
import {hash} from './game/contract/random';
import {dispatchGym, newGym, recommendation} from './game/gym/engine';

function setup() {
  const data = new Map<string, string>();
  let time = 1_000;
  let failMain = false;
  const storage: GymStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => {
      if (failMain && key === gymSaveKeys.main) throw new Error('quota');
      data.set(key, value);
    },
  };
  return {data, storage, clock: () => time, advance: (ms: number) => { time += ms; }, fail: (value: boolean) => { failMain = value; }};
}

async function trainedStore(context: ReturnType<typeof setup>) {
  const store = createGymStore(context.storage, 17, context.clock);
  await store.getState().start();
  for (let i = 0; i < 3_000 && !store.getState().state.player?.templateId; i++) {
    if (store.getState().state.player!.stamina < 1) context.advance(20_000);
    const result = await store.getState().act({type: 'train', id: store.getState().state.player!.id});
    expect(result.error).toBeUndefined();
    context.advance(1_000);
  }
  expect(store.getState().state.player!.templateId).not.toBeNull();
  return store;
}

describe('online multi-player training commits', () => {
  it('throttles idle save writes while accepting an automatic shot at its exact 1.8-second boundary', async () => {
    const context = setup();
    const state = {...newGym(context.clock(), 17), gymLevel: 2};
    state.projects.automation = 1;
    writeGym(context.storage, state);
    const store = createGymStore(context.storage, 17, context.clock);
    await store.getState().act({type: 'set-auto', id: state.player!.id, enabled: true});
    const writes = vi.spyOn(context.storage, 'setItem');
    context.advance(200);
    await store.getState().tick();
    expect(writes).not.toHaveBeenCalled();
    context.advance(800);
    await store.getState().tick();
    expect(writes).toHaveBeenCalledTimes(2);
    context.advance(600);
    await store.getState().tick();
    expect(writes).toHaveBeenCalledTimes(2);
    context.advance(200);
    await store.getState().tick();
    expect(writes).toHaveBeenCalledTimes(4);
    expect(store.getState().state.player!.shots).toBe(1);
  });

  it('keeps a refused manual command visible through background ticks until a new action succeeds', async () => {
    const context = setup();
    const store = createGymStore(context.storage, 17, context.clock);
    await store.getState().start();
    await store.getState().act({type: 'buy-drink'});
    const error = store.getState().actionError;
    expect(error).toBeTruthy();
    context.advance(200);
    await store.getState().tick();
    expect(store.getState().actionError).toBe(error);
    context.advance(1_000);
    await store.getState().tick();
    expect(store.getState().actionError).toBe(error);
    await store.getState().act({type: 'train', id: store.getState().state.player!.id});
    expect(store.getState().actionError).toBe('');
  });
  it('serializes concurrent automatic ticks and trains only enabled players once', async () => {
    const context = setup();
    const original = {...newGym(context.clock(), 17), gymLevel: 2};
    const state = dispatchGym(original, original.revision, {type: 'recruit'}, context.clock()).state;
    writeGym(context.storage, state);
    const first = createGymStore(context.storage, 17, context.clock);
    const enabledId = state.bench[0].id;
    expect((await first.getState().act({type: 'set-auto', id: enabledId, enabled: true})).error).toBeUndefined();
    const second = createGymStore(context.storage, 17, context.clock);
    context.advance(2_000);
    const results = await Promise.all([first.getState().tick(), second.getState().tick()]);
    expect(results.every(result => !result.error)).toBe(true);
    const saved = readGym(context.storage).state!;
    expect(saved.player!.shots).toBe(0);
    expect(saved.bench[0].shots).toBe(1);
    expect(saved.bench[0].experience).toBeGreaterThanOrEqual(0);
    expect(saved.bench[0].stamina).toBe(19);
  });

  it('does not replay missed automatic shots on reload or flush', async () => {
    const context = setup();
    const state = {...newGym(context.clock(), 17), gymLevel: 2};
    writeGym(context.storage, state);
    const first = createGymStore(context.storage, 17, context.clock);
    await first.getState().act({type: 'set-auto', id: state.player!.id, enabled: true});
    context.advance(86_400_000);
    const resumed = createGymStore(context.storage, 17, context.clock);
    expect(resumed.getState().state.player!.shots).toBe(0);
    await resumed.getState().flush();
    expect(readGym(context.storage).state!.player!.shots).toBe(0);
    await resumed.getState().tick();
    expect(readGym(context.storage).state!.player!.shots).toBe(1);
    await resumed.getState().tick();
    expect(readGym(context.storage).state!.player!.shots).toBe(1);
  });

  it('keeps an automatic shot uncommitted when saving fails and allows one retry', async () => {
    const context = setup();
    const state = {...newGym(context.clock(), 17), gymLevel: 2};
    writeGym(context.storage, state);
    const store = createGymStore(context.storage, 17, context.clock);
    await store.getState().act({type: 'set-auto', id: state.player!.id, enabled: true});
    context.advance(2_000);
    context.fail(true);
    expect((await store.getState().tick()).error).toBe('save-failed');
    expect(readGym(context.storage).state!.player!.shots).toBe(0);
    expect(store.getState().state.player!.shots).toBe(0);
    context.fail(false);
    expect((await store.getState().tick()).error).toBeUndefined();
    expect(readGym(context.storage).state!.player!.shots).toBe(1);
  });
});

describe('gym store commits', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('serializes recommendations from two stores so only one award commits', async () => {
    const context = setup();
    const first = await trainedStore(context);
    const second = createGymStore(context.storage, 17, context.clock);
    const id = first.getState().state.player!.id;
    const results = await Promise.all([first.getState().act({type: 'recommend', id}), second.getState().act({type: 'recommend', id})]);
    expect(results.filter(result => !result.error)).toHaveLength(1);
    const saved = readGym(context.storage).state!;
    expect(saved.alumni).toHaveLength(1);
    expect(saved.credits).toBe(saved.alumni[0].rewardCredits);
    expect(saved.fame).toBe(saved.alumni[0].rewardFame);
    expect(saved.player).toBeNull();
  });

  it('does not publish or return rewards after a failed main commit', async () => {
    const context = setup();
    const store = await trainedStore(context);
    const before = store.getState().state;
    const id = before.player!.id;
    context.fail(true);
    const refused = await store.getState().act({type: 'recommend', id});
    expect(refused.error).toBe('save-failed');
    expect(refused.events).toEqual([]);
    expect(store.getState().state).toBe(before);
    expect(store.getState().actionError).toContain('本地保存失败');
    expect(readGym(context.storage).state!.player?.id).toBe(id);
    context.fail(false);
    expect((await store.getState().act({type: 'recommend', id})).error).toBeUndefined();
    expect(readGym(context.storage).state!.alumni).toHaveLength(1);
  });

  it('uses the shared Web Lock before reading and committing different page storage wrappers', async () => {
    const context = setup();
    const first = await trainedStore(context);
    const second = createGymStore({...context.storage}, 17, context.clock);
    let pending: Promise<unknown> = Promise.resolve();
    const request = vi.fn((_name: string, work: () => unknown) => {
      const result = pending.then(work);
      pending = result.catch(() => {});
      return result;
    });
    vi.stubGlobal('navigator', {locks: {request}});
    const id = first.getState().state.player!.id;
    const results = await Promise.all([first.getState().act({type: 'recommend', id}), second.getState().act({type: 'recommend', id})]);
    expect(request).toHaveBeenCalledTimes(2);
    expect(results.filter(result => !result.error)).toHaveLength(1);
    expect(readGym(context.storage).state!.alumni).toHaveLength(1);
  });

  it('rejects a queued action after the other store restarts with the same seed', async () => {
    const context = setup();
    const previous = await trainedStore(context);
    const other = createGymStore(context.storage, 17, context.clock);
    const oldId = previous.getState().state.player!.id;
    const oldRun = previous.getState().state.createdAt;
    const restarting = other.getState().start();
    const stale = previous.getState().act({type: 'recommend', id: oldId});
    await restarting;
    const result = await stale;
    expect(result.error).toBe('gym-changed');
    expect(previous.getState().actionError).toContain('其他页面更新');
    const saved = readGym(context.storage).state!;
    expect(saved.createdAt).toBeGreaterThan(oldRun);
    expect(saved.seed).toBe(17);
    expect(saved.alumni).toEqual([]);
    expect(saved.credits).toBe(0);
    expect(saved.player?.level).toBe(0);
  });

  it('persists recovery on refused commands and keeps time monotone', async () => {
    const context = setup();
    const store = createGymStore(context.storage, 17, context.clock);
    await store.getState().start();
    const id = store.getState().state.player!.id;
    await store.getState().act({type: 'train', id});
    context.advance(20_000);
    const refused = await store.getState().act({type: 'buy-drink'});
    expect(refused.error).toBeTruthy();
    expect(store.getState().state.player!.stamina).toBe(20);
    const at = store.getState().state.updatedAt;
    context.advance(-10_000);
    await store.getState().tick();
    expect(store.getState().state.updatedAt).toBe(at);
    expect(readGym(context.storage).state!.updatedAt).toBe(at);
  });

  it('retains permanent collections when starting a new gym', async () => {
    const context = setup();
    const store = await trainedStore(context);
    const collection = store.getState().state.collection;
    await store.getState().act({type: 'recommend', id: store.getState().state.player!.id});
    await store.getState().act({type: 'buy-equipment', id: 'relic_002'});
    const collected = store.getState().state.collectedEquipment;
    const reset = await store.getState().start();
    expect(reset.error).toBeUndefined();
    expect(reset.state.collection).toEqual(collection);
    expect(reset.state.collectedEquipment).toEqual(collected);
    expect(reset.state.credits).toBe(0);
    expect(reset.state.alumni).toEqual([]);
    expect(reset.state.ownedEquipment).toEqual([]);
  });

  it('continues a v1 save without retroactive course rewards and persists the new fields on the next action', async () => {
    const context = setup();
    const old = JSON.parse(JSON.stringify(newGym(context.clock(), 17)));
    old.credits = 7;
    old.fame = 400;
    old.player.shots = 29;
    delete old.player.training;
    delete old.player.enteredGymLevel;
    delete old.bench;
    delete old.balanceVersion;
    for (const field of ['experience', 'nextShotAt', 'autoEnabled', 'cooperation']) delete old.player[field];
    delete old.cooperation;
    const payload = JSON.stringify(old);
    context.data.set(gymSaveKeys.main, JSON.stringify({format: 'gym-management-envelope-v1', checksum: hash(payload), payload}));
    const store = createGymStore(context.storage, 17, context.clock);
    expect(store.getState().hasSave).toBe(true);
    expect(store.getState().state.player!.training.completedCourses).toBe(0);
    const result = await store.getState().act({type: 'train', id: old.player.id});
    expect(result.error).toBeUndefined();
    expect(result.events.some(event => event.type === 'course-completed')).toBe(false);
    const saved = readGym(context.storage).state!;
    expect(saved.player!.training.shots).toBe(1);
    expect(saved.player!.training.completedCourses).toBe(0);
    expect(saved.credits).toBe(7);
    expect(saved.fame).toBe(400);
    expect(saved.player!.cooperation).toBeNull();
  });

  it('keeps a course and its recovery uncommitted when saving its tenth shot fails', async () => {
    const context = setup();
    const store = createGymStore(context.storage, 17, context.clock);
    await store.getState().start();
    const id = store.getState().state.player!.id;
    for (let i = 0; i < 9; i++) {
      expect((await store.getState().act({type: 'train', id})).error).toBeUndefined();
      context.advance(1_000);
    }
    const before = store.getState().state;
    context.fail(true);
    const refused = await store.getState().act({type: 'train', id});
    expect(refused.error).toBe('save-failed');
    expect(refused.events).toEqual([]);
    expect(store.getState().state).toBe(before);
    expect(readGym(context.storage).state!.player!.training.shots).toBe(9);
    context.fail(false);
    const completed = await store.getState().act({type: 'train', id});
    expect(completed.events.filter(event => event.type === 'course-completed')).toHaveLength(1);
    expect(completed.state.player!.training).toEqual({planId: 'balanced', shots: 0, completedCourses: 1});
    expect(completed.state.player!.stamina).toBe(before.player!.stamina + 3);
  });

  it('persists plans and cooperation across reload and commits the full recommendation only once', async () => {
    const context = setup();
    const first = createGymStore(context.storage, 17, context.clock);
    await first.getState().start();
    const id = first.getState().state.player!.id;
    await first.getState().act({type: 'set-training-plan', id: 'shooting', playerId: id});
    await first.getState().act({type: 'accept-cooperation', id: `${id}:basic`, playerId: id});
    for (let i = 0; i < 20; i++) {
      expect((await first.getState().act({type: 'train', id})).error).toBeUndefined();
      context.advance(1_000);
    }
    const expected = recommendation(first.getState().state);
    expect(expected.cooperationCredits).toBeGreaterThan(0);
    const second = createGymStore(context.storage, 17, context.clock);
    expect(second.getState().state.player!.cooperation).toEqual(first.getState().state.player!.cooperation);
    expect(second.getState().state.player!.training.planId).toBe('shooting');
    const results = await Promise.all([first.getState().act({type: 'recommend', id}), second.getState().act({type: 'recommend', id})]);
    expect(results.filter(result => !result.error)).toHaveLength(1);
    const saved = readGym(context.storage).state!;
    expect(saved.alumni).toHaveLength(1);
    expect(saved.credits).toBe(expected.credits);
    expect(saved.fame).toBe(expected.fame);
    expect(saved.cooperation).toBeUndefined();
    expect(saved.player).toBeNull();
  });
});
