import {initializeRecommendationRecords, recommendation, recommendedTemplateIds, type GymAlumnus, type GymState} from './engine';
import {decodeGym, encodeGym, gymSaveKeys, readGym, validGymAlumnus, writeGym, type GymStorage} from './save';

export const recentAlumniLimit = 100;
export const gymHistoryDatabaseName = 'gym-management-history-v1';
const memoryPrefix = 'gym-management-v1.alumni.';
const snapshotPrefix = 'gym-management-v1.migration.';

export type AlumniPage = {players: GymAlumnus[]; total: number};
type Current = ReturnType<typeof readGym>;
export type GymCommit<T> = {value: T; state?: GymState};
export type GymCommitted<T> = {value: T; state: GymState | null; saved: boolean; backupOk: boolean};
type ArchivedPlayer = {archiveId: string; sequence: number; player: GymAlumnus};
type Compacted = {state: GymState; additions: ArchivedPlayer[]};
export type GymHistoryOptions = {indexedDB?: IDBFactory; databaseName?: string};

/** The injected storage path remains synchronous and works without browser APIs. */
export function isBrowserGymStorage(storage: GymStorage): boolean {
  try { return typeof window !== 'undefined' && storage === window.localStorage; }
  catch { return true; }
}

function compact(state: GymState): Compacted {
  const overflow = Math.max(0, state.alumni.length - recentAlumniLimit);
  if (!overflow) return {state, additions: []};
  // A portable cloud snapshot has no local archive pointer. Restoring it can
  // recreate the same gym/run while older cold records still back a recovery
  // snapshot, so every newly created archive needs its own storage namespace.
  const archive = {...(state.alumniArchive ?? {id: `${state.createdAt}-${state.seed}-${Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16).padStart(8, '0')).join('')}`, count: 0,
    effectiveCount: 0, legendCount: 0, bestTier: 0})};
  const additions = state.alumni.slice(0, overflow).map((player, index) => {
    const reward = recommendation(player);
    if (reward.growth > 0 && reward.tier >= 1) {
      archive.effectiveCount++;
      if (reward.tier === 5) archive.legendCount++;
      archive.bestTier = Math.max(archive.bestTier, reward.tier);
    }
    return {archiveId: archive.id, sequence: archive.count + index, player};
  });
  archive.count += overflow;
  return {state: {...state, alumniArchive: archive, alumni: state.alumni.slice(overflow)}, additions};
}

function pageRange(offset: number, limit: number) {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error('invalid-alumni-page');
}

function recentPage(state: GymState, offset: number, limit: number) {
  const total = state.alumni.length + (state.alumniArchive?.count ?? 0);
  const players = state.alumni.slice().reverse().slice(offset, offset + limit);
  return {players, total, missing: Math.max(0, Math.min(limit, total - offset) - players.length),
    archivedOffset: Math.max(0, offset - state.alumni.length)};
}

/**
 * IndexedDB commits the hot envelope and new historical records in one transaction.
 * localStorage is only a synchronous startup mirror after that commit. A failed
 * mirror never turns a successful IDB transaction into a refused game action.
 */
export function createGymHistory(storage: GymStorage, options: GymHistoryOptions = {}) {
  const factory = options.indexedDB ?? (isBrowserGymStorage(storage) && typeof indexedDB !== 'undefined' ? indexedDB : undefined);
  const browser = !!factory || isBrowserGymStorage(storage);
  let opening: Promise<IDBDatabase> | undefined;
  const database = () => {
    if (!factory) return Promise.reject(new Error('history-storage-unavailable'));
    if (!opening) opening = new Promise<IDBDatabase>((resolve, reject) => {
      let abandoned = false;
      const request = factory.open(options.databaseName ?? gymHistoryDatabaseName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('hot');
        db.createObjectStore('alumni', {keyPath: ['archiveId', 'sequence']});
        db.createObjectStore('snapshots');
      };
      request.onsuccess = () => {
        const db = request.result;
        if (abandoned) { db.close(); return; }
        db.onversionchange = () => { db.close(); opening = undefined; };
        resolve(db);
      };
      request.onerror = () => { opening = undefined; reject(request.error ?? new Error('history-storage-unavailable')); };
      request.onblocked = () => { abandoned = true; reject(new Error('history-storage-blocked')); };
    }).catch(error => { opening = undefined; throw error; });
    return opening;
  };

  function memoryTransaction<T>(work: (current: Current) => GymCommit<T>): GymCommitted<T> {
    const current = readGym(storage);
    if (current.error === 'storage-unavailable') throw new Error(current.error);
    let prepared = current.state;
    if (prepared && prepared.recommendationRulesVersion !== 11) {
      const archivedIds = new Set<string>();
      const archive = prepared.alumniArchive;
      if (archive) for (let sequence = 0; sequence < archive.count; sequence++) {
        const raw = storage.getItem(`${memoryPrefix}${archive.id}.${sequence}`);
        if (!raw) throw new Error('alumni-unavailable');
        const player: unknown = JSON.parse(raw);
        if (!validGymAlumnus(player, prepared)) throw new Error('invalid-alumni-record');
        if (player.templateId) archivedIds.add(player.templateId);
      }
      prepared = initializeRecommendationRecords(prepared, archivedIds);
    }
    const before = prepared ? compact(prepared) : undefined;
    // Never trust an archive pointer when its backing storage is unavailable.
    if (before?.state.alumniArchive?.count) {
      const archive = before.state.alumniArchive;
      const priorCount = current.state!.alumniArchive?.count ?? 0;
      if (priorCount && !storage.getItem(`${memoryPrefix}${archive.id}.${priorCount - 1}`)) throw new Error('alumni-unavailable');
    }
    const outcome = work(before ? {...current, state: before.state} : current);
    const after = outcome.state ? compact(outcome.state) : undefined;
    const next = after?.state ?? before?.state ?? null;
    const changed = !!outcome.state || !!before?.additions.length || prepared !== current.state;
    if (!changed || !next) return {value: outcome.value, state: next, saved: false, backupOk: true};
    const additions = [...(before?.additions ?? []), ...(after?.additions ?? [])];
    // Staging keys are immutable from the perspective of committed archive
    // counts. Failure leaves only unreachable staging data; the old main and
    // backup still refer to their original complete history.
    const restarting = current.state && (next.createdAt !== current.state.createdAt || next.seed !== current.state.seed);
    if ((before?.additions.length && !current.state?.alumniArchive) || restarting || (current.error && outcome.state)) {
      const snapshotKey = `${snapshotPrefix}${current.state ? `${current.state.createdAt}-${current.state.seed}` : `invalid-${next.createdAt}-${next.seed}`}${restarting ? `-restart-${current.state!.revision}` : ''}`;
      if (!storage.getItem(snapshotKey)) storage.setItem(snapshotKey, JSON.stringify({
        main: storage.getItem(gymSaveKeys.main), backup: storage.getItem(gymSaveKeys.backup),
      }));
    }
    for (const entry of additions) storage.setItem(`${memoryPrefix}${entry.archiveId}.${entry.sequence}`, JSON.stringify(entry.player));
    const saved = writeGym(storage, next);
    if (!saved.ok) throw new Error(saved.error ?? 'save-failed');
    return {value: outcome.value, state: next, saved: true, backupOk: !!saved.backupOk};
  }

  async function indexedTransaction<T>(work: (current: Current) => GymCommit<T>, repairMirror: boolean): Promise<GymCommitted<T>> {
    const db = await database();
    const committed = await new Promise<GymCommitted<T>>((resolve, reject) => {
      const tx = db.transaction(['hot', 'alumni', 'snapshots'], 'readwrite');
      const hot = tx.objectStore('hot');
      let result: GymCommitted<T>;
      let failure: unknown;
      const transition = (stored: GymState | null, source: 'main' | 'backup', encoded?: unknown) => {
        try {
          const current: Current = stored ? {state: stored, source} : readGym(storage);
          if (current.error === 'storage-unavailable') throw new Error(current.error);
          if (!stored && current.state?.alumniArchive?.count) throw new Error('alumni-unavailable');
          const finish = (prepared: GymState | null) => {
            const before = prepared ? compact(prepared) : undefined;
            const outcome = work(before ? {...current, state: before.state} : current);
            const after = outcome.state ? compact(outcome.state) : undefined;
            const next = after?.state ?? before?.state ?? null;
            const saved = !!outcome.state || !!before?.additions.length || prepared !== current.state || (!stored && !!next) || (source === 'backup' && !!next);
            if (saved && next) {
              // Encode before queuing any writes, then let IDB commit all queued
              // records together. Request, quota or transaction failures abort all.
              const hotEncoded = encodeGym(next);
              if (!stored) {
                const snapshot = {main: storage.getItem(gymSaveKeys.main), backup: storage.getItem(gymSaveKeys.backup)};
                if (snapshot.main || snapshot.backup) tx.objectStore('snapshots').put(snapshot,
                  current.state ? `${current.state.createdAt}-${current.state.seed}` : `invalid-${next.createdAt}-${next.seed}`);
              } else if (next.createdAt !== stored.createdAt || next.seed !== stored.seed) {
                const previous = typeof encoded === 'string' ? encoded : encodeGym(stored);
                tx.objectStore('snapshots').put({main: previous, backup: previous}, `restart-${stored.createdAt}-${stored.seed}-${stored.revision}`);
              }
              const archive = tx.objectStore('alumni');
              for (const entry of [...(before?.additions ?? []), ...(after?.additions ?? [])]) archive.add(entry);
              hot.put(hotEncoded, 'current');
              hot.put(hotEncoded, 'backup');
            }
            result = {value: outcome.value, state: next, saved, backupOk: true};
          };
          const legacy = current.state;
          if (legacy && legacy.recommendationRulesVersion !== 11 && legacy.alumniArchive?.count) {
            // Read only this gym's committed history once. The marker and IDs
            // become visible together with the transaction; a missing/corrupt
            // record must not grant a mistaken new first reward.
            const archive = legacy.alumniArchive;
            const ids = new Set(recommendedTemplateIds(legacy));
            let count = 0;
            const range = IDBKeyRange.bound([archive.id, 0], [archive.id, archive.count - 1]);
            const request = tx.objectStore('alumni').openCursor(range);
            request.onsuccess = () => {
              try {
                const cursor = request.result;
                if (!cursor) {
                  if (count !== archive.count) throw new Error('alumni-unavailable');
                  finish(initializeRecommendationRecords(legacy, ids));
                  return;
                }
                const entry = cursor.value as ArchivedPlayer;
                if (entry.sequence !== count || !validGymAlumnus(entry.player, legacy)) throw new Error('invalid-alumni-record');
                if (entry.player.templateId) ids.add(entry.player.templateId);
                count++;
                cursor.continue();
              } catch (error) { failure = error; tx.abort(); }
            };
          } else finish(legacy ? initializeRecommendationRecords(legacy) : null);
        } catch (error) { failure = error; tx.abort(); }
      };
      hot.get('current').onsuccess = event => {
        const encoded = (event.target as IDBRequest<unknown>).result;
        const state = typeof encoded === 'string' ? decodeGym(encoded) : null;
        if (state) { transition(state, 'main', encoded); return; }
        hot.get('backup').onsuccess = backupEvent => {
          const backup = (backupEvent.target as IDBRequest<unknown>).result;
          const restored = typeof backup === 'string' ? decodeGym(backup) : null;
          if (!restored && (encoded !== undefined || backup !== undefined)) {
            failure = new Error('invalid-history-save'); tx.abort(); return;
          }
          // Both IDB copies are written in the same commit. Recovery never
          // replaces committed progress with a stale localStorage mirror.
          transition(restored, restored ? 'backup' : 'main', backup);
        };
      };
      tx.oncomplete = () => resolve(result!);
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('history-commit-failed'));
      tx.onerror = () => { /* onabort is the sole failure notification. */ };
    });
    if ((committed.saved || repairMirror) && committed.state) {
      const mirror = writeGym(storage, committed.state);
      committed.backupOk = mirror.ok && !!mirror.backupOk;
    }
    return committed;
  }

  const transact = <T>(work: (current: Current) => GymCommit<T>, repairMirror = false): Promise<GymCommitted<T>> =>
    browser ? indexedTransaction(work, repairMirror) : Promise.resolve().then(() => memoryTransaction(work));

  async function loadAlumni(offset = 0, limit = 20): Promise<AlumniPage> {
    pageRange(offset, limit);
    if (!browser) {
      const current = readGym(storage);
      if (!current.state) throw new Error(current.error ?? 'no-save');
      const state = current.state;
      const page = recentPage(state, offset, limit);
      for (let index = 0; index < page.missing; index++) {
        const archive = state.alumniArchive!;
        const raw = storage.getItem(`${memoryPrefix}${archive.id}.${archive.count - 1 - page.archivedOffset - index}`);
        if (!raw) throw new Error('alumni-unavailable');
        const player: unknown = JSON.parse(raw);
        if (!validGymAlumnus(player, state)) throw new Error('invalid-alumni-record');
        page.players.push(player);
      }
      return {players: page.players, total: page.total};
    }
    const db = await database();
    return new Promise<AlumniPage>((resolve, reject) => {
      const tx = db.transaction(['hot', 'alumni'], 'readonly');
      let page: ReturnType<typeof recentPage>;
      let failure: unknown;
      tx.objectStore('hot').get('current').onsuccess = event => {
        try {
          const state = decodeGym((event.target as IDBRequest<string>).result);
          if (!state) throw new Error('invalid-history-save');
          page = recentPage(state, offset, limit);
          if (!page.missing) return;
          const archive = state.alumniArchive!;
          // Limit cursor scope by archive and sequence, never walk all older
          // alumni merely to render a later page.
          const end = archive.count - 1 - page.archivedOffset;
          const range = IDBKeyRange.bound([archive.id, Math.max(0, end - page.missing + 1)], [archive.id, end]);
          const request = tx.objectStore('alumni').openCursor(range, 'prev');
          request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) return;
            const player: unknown = (cursor.value as ArchivedPlayer).player;
            if (!validGymAlumnus(player, state)) { failure = new Error('invalid-alumni-record'); tx.abort(); return; }
            page.players.push(player);
            cursor.continue();
          };
        } catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => {
        if (!page! || page.players.length !== Math.max(0, Math.min(limit, page.total - offset))) reject(new Error('alumni-unavailable'));
        else resolve({players: page.players, total: page.total});
      };
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('alumni-unavailable'));
      tx.onerror = () => { /* onabort handles errors. */ };
    });
  }

  return {asynchronous: browser, transact, loadAlumni};
}
