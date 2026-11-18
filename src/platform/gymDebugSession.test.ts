import {describe, expect, it, vi} from 'vitest';
import {createGymDebugStore, createGymStore} from '../gymStore';
import {newGym, type GymState} from '../game/gym/engine';
import {validGym, writeGym, type GymStorage} from '../game/gym/save';
import {createGymLocalFirstStore} from './gymLocalFirst';

const initialTime = 1_800_000_000_000;
function fixture(allowed = true, source = newGym(initialTime, 99), debugFactory?: (level: number) => ReturnType<typeof createGymDebugStore>) {
 const values = new Map<string, string>();
 const storage: GymStorage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => {values.set(key, value);}};
 writeGym(storage, source);
 let time = initialTime;
 const now = () => time;
 const local = createGymStore(storage, 99, now);
 const transport = {enabled: () => false, account: vi.fn(async () => null), request: vi.fn(async () => {throw Error('No network expected');})};
 const store = createGymLocalFirstStore(local, storage, transport, {now, debugAvailable: () => allowed, debugFactory: debugFactory ?? (level => createGymDebugStore(level, now))});
 return {values, local, store, transport, advance: () => {time += 1_000;}};
}

describe('disposable local debug gyms', () => {
 it('creates valid gyms for all eight levels without invented recommendation history', () => {
  for (let level = 1; level <= 8; level++) {
   const state = createGymDebugStore(level, () => initialTime).getState().state;
   expect(state.gymLevel).toBe(level);
   expect(validGym(state)).toBe(true);
   expect(state.fame).toBe(0);
   expect(state.alumni).toEqual([]);
   expect(state.player!.enteredGymLevel).toBe(level);
  }
 });

 it('refuses unavailable or malformed debug requests without modifying the real save', async () => {
  const unavailable = fixture(false);
  const before = [...unavailable.values];
  await expect(unavailable.store.getState().debugSetGymLevel!(2)).rejects.toThrow('本地开发');
  expect([...unavailable.values]).toEqual(before);
  const f = fixture();
  for (const level of [0, 9, 1.5]) await expect(f.store.getState().debugSetGymLevel!(level)).rejects.toThrow('1至8');
  expect(f.store.getState().debugSessionActive).toBe(false);
 });

 it('keeps real players and cold alumni intact while every gameplay operation uses memory', async () => {
  const source = newGym(initialTime, 99);
  source.gymLevel = 8;
  source.alumni = Array.from({length: 235}, (_, i) => ({...structuredClone(source.player!), id: `old-${i}`,
   recommendedAt: initialTime, rewardCredits: 0, rewardFame: 0, finalValue: '320'}));
  source.nextPlayer = 237;
  expect(validGym(source)).toBe(true);
  const f = fixture(true, source);
  await f.store.getState().hydrate();
  const real = structuredClone(f.local.getState().state), before = [...f.values];
  const oldPage = await f.local.getState().loadAlumni(200, 100);
  await f.store.getState().debugSetGymLevel!(1);
  expect(f.store.getState().debugSessionActive).toBe(true);
  expect(f.store.getState().authorityCapabilities?.platformRewards).toBe(false);
  expect((await f.store.getState().loadAlumni()).total).toBe(0);
  const id = f.store.getState().state.player!.id;
  f.advance();
  expect((await f.store.getState().act({type: 'train', id})).error).toBeUndefined();
  await f.store.getState().tick();
  await f.store.getState().resume();
  await f.store.getState().suspend();
  await f.store.getState().flush();
  await f.store.getState().start();
  await f.store.getState().retryAuthority!();
  expect(f.local.getState().state).toEqual(real);
  expect([...f.values]).toEqual(before);
  expect(f.transport.request).not.toHaveBeenCalled();
  await expect(f.store.getState().restoreCloudArchive!('bad', {createdAt: 0, seed: 0, revision: 0, updatedAt: 0}, null)).rejects.toThrow('恢复测试前');
  await f.store.getState().debugRestoreGym!();
  expect(f.store.getState().debugSessionActive).toBe(false);
  expect(f.store.getState().state).toEqual(real);
  expect(await f.store.getState().loadAlumni(200, 100)).toEqual(oldPage);
 });

 it('does not publish real-store updates over a test gym, then restores the latest real state', async () => {
  const f = fixture();
  await f.store.getState().debugSetGymLevel!(8);
  const test = f.store.getState().state;
  const changed: GymState = {...f.local.getState().state, credits: 17};
  f.local.setState({state: changed});
  expect(f.store.getState().state).toBe(test);
  await f.store.getState().debugSetGymLevel!(2);
  expect(f.store.getState().state.gymLevel).toBe(2);
  expect(f.store.getState().state.credits).toBe(999);
  await f.store.getState().debugRestoreGym!();
  expect(f.store.getState().state).toBe(changed);
  expect(f.store.getState().state.credits).toBe(17);
 });

 it.each(['restore', 'flush'] as const)('cancels an unfinished test-gym transition after %s', async action => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => {release = resolve;});
  const next = createGymDebugStore(8, () => initialTime);
  const hydrate = next.getState().hydrate;
  next.setState({hydrate: async () => {await pending; await hydrate();}});
  const f = fixture(true, newGym(initialTime, 99), () => next);
  const entering = f.store.getState().debugSetGymLevel!(8);
  if(action === 'restore') await f.store.getState().debugRestoreGym!();
  else await f.store.getState().flush();
  const original = f.local.getState().state;
  release();
  await expect(entering).rejects.toThrow('已取消');
  expect(f.store.getState().debugSessionActive).toBe(false);
  expect(f.store.getState().state).toBe(original);
 });
});
