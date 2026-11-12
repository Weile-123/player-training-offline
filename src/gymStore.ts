import {create} from 'zustand';
import {activePlayers, advanceGym, dispatchGym, newGym, playerLevelCap, recoverySeconds, type GymAction, type GymResult, type GymState} from './game/gym/engine';
import {gymSaveKeys, readGym, writeGym, type GymStorage} from './game/gym/save';

const lockName = 'gym-management-v1.writer';
const queues = new WeakMap<GymStorage, Promise<unknown>>();
let database: Promise<IDBDatabase> | undefined;

function writerDatabase(): Promise<IDBDatabase> {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('gym-management-coordination-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('writer');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(request.error); };
    request.onblocked = () => { database = undefined; reject(new Error('writer-lock-unavailable')); };
  });
  return database;
}

async function indexedWriter<T>(work: () => T): Promise<T> {
  const db = await writerDatabase();
  return new Promise<T>((resolve, reject) => {
    // Readwrite transactions on this object store serialize all tabs, including
    // the synchronous localStorage read/dispatch/commit inside onsuccess.
    const transaction = db.transaction('writer', 'readwrite');
    let completed = false;
    let result: T;
    let failure: unknown;
    transaction.objectStore('writer').get('lock').onsuccess = () => {
      try { result = work(); completed = true; }
      catch (error) { failure = error; transaction.abort(); }
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => completed ? resolve(result) : reject(failure ?? transaction.error ?? new Error('writer-lock-unavailable'));
    transaction.onerror = () => { /* onabort handles the final outcome. */ };
  });
}

function isBrowserStorage(storage: GymStorage): boolean {
  try { return typeof window !== 'undefined' && storage === window.localStorage; }
  catch { return true; }
}

function exclusive<T>(storage: GymStorage, work: () => T): Promise<T> {
  const previous = queues.get(storage) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(() => {
    if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(lockName, work);
    if (!isBrowserStorage(storage)) return work();
    if (typeof indexedDB !== 'undefined') return indexedWriter(work);
    throw new Error('writer-lock-unavailable');
  });
  queues.set(storage, next);
  return next;
}

export type GymStore = {
  state: GymState;
  hasSave: boolean;
  actionError: string;
  saveMessage: string;
  start: () => Promise<GymResult>;
  act: (action: GymAction) => Promise<GymResult>;
  tick: () => Promise<GymResult>;
  flush: () => Promise<void>;
};

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const saveFailure = '本地保存失败，本次操作未生效，请检查存储空间后重试。';
const errorMessages: Record<string, string> = {
  'no-save': '请先从首页开启训练馆。',
  'invalid-save': '存档校验失败，请从首页重新开始。',
  'save-failed': saveFailure,
  'gym-changed': '球馆已在其他页面更新，请查看当前进度后重试。',
  'writer-lock-unavailable': '当前浏览器无法协调存档写入，请使用支持 Web Locks 或 IndexedDB 的浏览器。',
};

export function createGymStore(storage: GymStorage, seed: number | (() => number) = randomSeed, now: () => number = Date.now) {
  const loaded = readGym(storage);
  const initial = loaded.state ?? newGym(now(), typeof seed === 'number' ? seed : seed());
  const store = create<GymStore>((set, get) => {
    const fail = (error: string, message?: string): GymResult => {
      set({actionError: message ?? errorMessages[error] ?? error, ...(message ? {saveMessage: message} : {})});
      return {state: get().state, events: [], error};
    };

    const run = async (action?: GymAction, restart = false, automatic = false): Promise<GymResult> => {
      const requested = get();
      try {
        return await exclusive(storage, () => {
          const current = readGym(storage);
          if (current.error === 'storage-unavailable') return fail('save-failed', saveFailure);
          if (!restart && !current.state) return fail(current.error ?? 'no-save', current.error ? '存档校验失败，请从首页重新开始。' : undefined);
          const minimumTime = current.state ? current.state.updatedAt + (restart ? 1 : 0) : requested.state.updatedAt;
          const time = Math.max(now(), minimumTime);
          let result: GymResult;
          if (restart) {
            const state = newGym(time, typeof seed === 'number' ? seed : seed());
            if (current.state) {
              state.collection = {...current.state.collection};
              state.collectedEquipment = {...current.state.collectedEquipment};
            }
            result = {state, events: []};
          } else {
            const base = current.state!;
            // Rebase ordinary changes on the latest committed state. A queued
            // action from an older gym must not modify a newly started game.
            if (action && (base.createdAt !== requested.state.createdAt || base.seed !== requested.state.seed || base.revision < requested.state.revision)) {
              set({state: base, hasSave: true});
              return fail('gym-changed', '球馆已在其他页面更新，请查看当前进度后重试。');
            }
            if (automatic && !action && current.source === 'main' && time - base.updatedAt < 1_000) {
              const elapsed = time - base.updatedAt;
              const interval = recoverySeconds(base) * 1_000;
              const due = activePlayers(base).some(player => player.autoEnabled && player.level < playerLevelCap
                && player.nextShotAt <= time && (player.stamina >= 1 || player.recoveryMs + elapsed >= interval));
              // Keep 200ms precision for actual shots; idle recovery only needs
              // second-resolution UI updates, avoiding five full-save writes/sec.
              if (!due) {
                set({state: base, hasSave: true});
                return {state: base, events: []};
              }
            }
            const advanced = advanceGym(base, time);
            result = action ? dispatchGym(advanced, advanced.revision, action, time)
              : automatic ? dispatchGym(advanced, advanced.revision, {type: 'auto-step'}, time) : {state: advanced, events: []};
            if (result.state === base && current.source === 'main') {
              set({state: base, hasSave: true, actionError: result.error ?? ''});
              return result;
            }
          }
          const saved = writeGym(storage, result.state);
          if (!saved.ok) return fail('save-failed', saveFailure);
          set({state: result.state, hasSave: true, actionError: result.error ?? (automatic && get().actionError !== saveFailure ? get().actionError : ''),
            saveMessage: saved.backupOk ? '已自动保存' : '进度已保存，备份暂不可用。'});
          return result;
        });
      } catch (error) {
        const lockUnavailable = error instanceof Error && error.message === 'writer-lock-unavailable';
        return fail(lockUnavailable ? 'writer-lock-unavailable' : 'save-failed', lockUnavailable
          ? '当前浏览器无法协调存档写入，请使用支持 Web Locks 或 IndexedDB 的浏览器。' : saveFailure);
      }
    };

    return {
      state: initial, hasSave: !!loaded.state, actionError: '',
      saveMessage: loaded.error === 'storage-unavailable' ? saveFailure : loaded.error ? '存档校验失败，原数据已保留，可重新开始。'
        : loaded.source === 'backup' ? '已读取备份存档。' : '',
      start: () => run(undefined, true),
      act: action => run(action),
      // Visible gameplay calls tick. Loading a save and flush only restore stamina;
      // auto-step never replays missed shots from time spent outside the game.
      tick: () => run(undefined, false, true),
      flush: async () => { if (get().hasSave) await run(); },
    };
  });

  if (typeof window !== 'undefined' && isBrowserStorage(storage)) {
    window.addEventListener('storage', event => {
      if (event.key !== gymSaveKeys.main && event.key !== gymSaveKeys.backup) return;
      const current = readGym(storage);
      if (current.state) store.setState({state: current.state, hasSave: true, actionError: '',
        saveMessage: current.source === 'backup' ? '已读取备份存档。' : '已同步其他页面的进度。'});
    });
  }
  return store;
}

function browserStorage(): GymStorage {
  try { if (typeof window !== 'undefined') return window.localStorage; } catch { /* Report the failure on the first action. */ }
  return {getItem: () => null, setItem: () => { throw new Error('storage-unavailable'); }};
}

export const useGym = createGymStore(browserStorage());
