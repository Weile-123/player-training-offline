import {performance} from 'node:perf_hooks';
import {writeFile} from 'node:fs/promises';
import {IDBFactory, IDBKeyRange} from 'fake-indexeddb';
import {createGymStore} from '../src/gymStore';
import {dispatchGym, newGym, type GymState} from '../src/game/gym/engine';
import {encodeGym, gymSaveKeys, type GymStorage} from '../src/game/gym/save';
import {createGymHistory} from '../src/game/gym/history';
import {hash} from '../src/game/contract/random';

globalThis.IDBKeyRange = IDBKeyRange;
const summary = (values: number[]) => ({min: Math.min(...values), p50: values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)], max: Math.max(...values)});
const milliseconds = async (work: () => unknown | Promise<unknown>) => { const start = performance.now(); await work(); return performance.now() - start; };
function fixture(count: number): GymState {
  const state = newGym(1_000, 17);
  state.credits = 100;
  state.alumni = Array.from({length: count}, (_, index) => ({...structuredClone(state.player!), id: `old-${index}`,
    recommendedAt: 1_000, rewardCredits: 0, rewardFame: 0, finalValue: String(index)}));
  return state;
}
function quotaStorage() {
  const data = new Map<string, string>();
  const limit = 5 * 1024 * 1024;
  const bytes = () => [...data].reduce((size, [key, value]) => size + 2 * (key.length + value.length), 0);
  const storage: GymStorage = {getItem: key => data.get(key) ?? null, setItem: (key, value) => {
    const prior = data.get(key);
    const projected = bytes() - (prior === undefined ? 0 : 2 * (key.length + prior.length)) + 2 * (key.length + value.length);
    if (projected > limit) throw new DOMException('simulated quota', 'QuotaExceededError');
    data.set(key, value);
  }};
  return {storage, data, bytes, limit};
}

const cases = [];
for (const alumni of [100, 1_000, 5_000, 20_000]) {
  const state = fixture(alumni);
  const payload = JSON.stringify(state);
  const originalEnvelope = JSON.stringify({format: 'gym-management-envelope-v1', checksum: hash(payload), payload});
  let originalEncodeError: string | null = null;
  try { encodeGym(state); } catch (error) { originalEncodeError = (error as Error).message; }
  let legacyMigration: {milliseconds: number; hotEnvelopeCharacters: number; completeOldestPage: boolean} | null = null;
  if (!originalEncodeError) {
    const legacyData = new Map([[gymSaveKeys.main, originalEnvelope], [gymSaveKeys.backup, originalEnvelope]]);
    const legacyStorage: GymStorage = {getItem: key => legacyData.get(key) ?? null, setItem: (key, value) => { legacyData.set(key, value); }};
    const migrated = createGymStore(legacyStorage, 17, () => 1_000, {indexedDB: new IDBFactory(), databaseName: `legacy-benchmark-${alumni}`});
    const migrationMs = await milliseconds(() => migrated.getState().hydrate());
    const page = await migrated.getState().loadAlumni(alumni - 20, 20);
    legacyMigration = {milliseconds: migrationMs, hotEnvelopeCharacters: encodeGym(migrated.getState().state).length,
      completeOldestPage: page.total === alumni && page.players.at(-1)?.id === 'old-0'};
  }
  const quota = quotaStorage();
  const indexedDB = new IDBFactory();
  const options = {indexedDB, databaseName: `history-benchmark-${alumni}`};
  const history = createGymHistory(quota.storage, options);
  // Insert a structurally valid old-style state as one repository transaction.
  // The fake IDB has no storage quota. Only the mirror uses the explicit quota.
  const initialCommitMs = await milliseconds(() => history.transact(() => ({value: undefined, state})));
  let time = 1_000;
  const store = createGymStore(quota.storage, 17, () => time, options);
  await store.getState().hydrate();
  const baselineCommandMs: number[] = [];
  const boundedCommandMs: number[] = [];
  const boundedTrainMs: number[] = [];
  const laterPageMs: number[] = [];
  for (let iteration = 0; iteration < 15; iteration++) {
    if (iteration < 7) baselineCommandMs.push(await milliseconds(() => dispatchGym(state, state.revision, {type: 'train', id: state.player!.id}, 1_000)));
    boundedCommandMs.push(await milliseconds(async () => {
      const result = await store.getState().act({type: 'buy-drink'});
      if (result.error) throw new Error(result.error);
    }));
    time += 2_000;
    boundedTrainMs.push(await milliseconds(async () => {
      const result = await store.getState().act({type: 'train', id: store.getState().state.player!.id});
      if (result.error) throw new Error(result.error);
    }));
    laterPageMs.push(await milliseconds(async () => {
      const page = await store.getState().loadAlumni(Math.max(0, alumni - 20), 20);
      if (page.total !== alumni || page.players.length !== 20) throw new Error('missing-history');
    }));
  }
  const hot = store.getState().state;
  const reload = createGymStore(quota.storage, 17, () => time, options);
  await reload.getState().hydrate();
  const last = await reload.getState().loadAlumni(alumni - 20, 20);
  cases.push({alumni, originalEnvelopeCharacters: originalEnvelope.length, originalEncodeError, legacyMigrationFromUnlimitedInjectedMap: legacyMigration,
    hotEnvelopeCharacters: encodeGym(hot).length,
    originalTwoCopiesEstimatedUtf16Bytes: 4 * originalEnvelope.length + 2 * (gymSaveKeys.main.length + gymSaveKeys.backup.length),
    hotRecentRecords: hot.alumni.length, archivedRecords: hot.alumniArchive?.count ?? 0,
    initialCommitMs, fullHistoryDomainTrainingMs: summary(baselineCommandMs), boundedTransactionWithTwoIdbCopiesAndTwoMirrorsMs: summary(boundedCommandMs),
    boundedTrainingWithPersistenceMs: summary(boundedTrainMs),
    last20PageReadMs: summary(laterPageMs), simulatedLocalStorage: {quotaBytes: quota.limit, usedBytes: quota.bytes(),
      mainAndBackupPresent: !!quota.data.get(gymSaveKeys.main) && !!quota.data.get(gymSaveKeys.backup),
      reloadedCredits: reload.getState().state.credits, historyTailComplete: last.players.length === 20 && last.players.at(-1)!.id === 'old-0'}});
}
const report = {generatedAt: new Date().toISOString(), environment: {node: process.version, platform: process.platform,
  storage: 'fake-indexeddb in Node, not physical browser IndexedDB', localStorageQuota: 'explicit simulated 5MiB UTF-16 key/value quota',
  timingCaveat: 'Single-host synchronous in-memory IDB timings; neither disk I/O nor browser/mobile latency or actual device quota is measured.',
  fixtureCaveat: 'Structurally valid synthetic alumni, not natural gameplay duration or demonstrated browser capacity. Initial insert passes the full synthetic state directly to the new repository. The 20,000-record old envelope exceeds the normal 20M decoder limit, so this case demonstrates archive capacity and not recovery of a previously unreadable legacy localStorage envelope.'}, cases};
await writeFile(process.env.GYM_HISTORY_BENCHMARK_OUTPUT ?? 'docs/balance/gym-history-benchmark-20261114.json', JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
