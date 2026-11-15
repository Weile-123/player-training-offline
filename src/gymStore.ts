import {create} from 'zustand';
import {activePlayers, advanceGym, dispatchGym, newGym, playerLevelCap, recoverySeconds, type GymAction, type GymResult, type GymState} from './game/gym/engine';
import {gymSaveKeys, readGym, type GymStorage} from './game/gym/save';
import {createGymHistory, isBrowserGymStorage, type AlumniPage, type GymHistoryOptions} from './game/gym/history';
import {legacyOfflineLimitMs, settleOfflineGym, type OfflineTrainingReport} from './game/gym/offline';

const lockName = 'gym-management-v1.writer';
const queues = new WeakMap<GymStorage, Promise<unknown>>();
function exclusive<T>(storage: GymStorage, work: () => Promise<T>): Promise<T> {
  const previous = queues.get(storage) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(() => {
    if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(lockName, work);
    // The browser repository uses one readwrite IDB transaction for the latest
    // state, domain transition and appended history, which serializes tabs even
    // without Web Locks. Injected synchronous stores share this local queue.
    return work();
  });
  queues.set(storage, next);
  return next;
}

export type GymStore = {
  state: GymState;
  hasSave: boolean;
  hydrating: boolean;
  hydrate: () => Promise<void>;
  loadAlumni: (offset?: number, limit?: number) => Promise<AlumniPage>;
  actionError: string;
  saveMessage: string;
  isSuspended: boolean;
  pendingOfflineReport: OfflineTrainingReport | null;
  resume: () => Promise<GymResult>;
  suspend: () => Promise<void>;
  dismissOfflineReport: () => void;
  start: () => Promise<GymResult>;
  act: (action: GymAction) => Promise<GymResult>;
  tick: () => Promise<GymResult>;
  flush: () => Promise<void>;
};

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const saveFailure = '本地保存失败，本次操作未生效，请检查存储空间后重试。';
const historyFailure = '历史档案暂时无法读取，原有数据已保留，请关闭其他页面或恢复浏览器存储后重试。';
const errorMessages: Record<string, string> = {
  'no-save': '请先从首页开启训练馆。',
  'invalid-save': '存档校验失败，请从首页重新开始。',
  'save-failed': saveFailure,
  'gym-changed': '球馆已在其他页面更新，请查看当前进度后重试。',
};

type Transition = {result: GymResult; patch?: Partial<GymStore>};
export function createGymStore(storage: GymStorage, seed: number | (() => number) = randomSeed, now: () => number = Date.now,
  historyOptions: GymHistoryOptions = {}) {
  const history = createGymHistory(storage, historyOptions);
  const loaded = readGym(storage);
  const initial = loaded.state ?? newGym(now(), typeof seed === 'number' ? seed : seed());
  let hydrated = false;
  let hydration: Promise<boolean> | undefined;
  const store = create<GymStore>((set, get) => {
    const fail = (error: string, message?: string): GymResult => {
      set({actionError: message ?? errorMessages[error] ?? error, ...(message ? {saveMessage: message} : {})});
      return {state: get().state, events: [], error};
    };
    const hydrate = (force = false): Promise<boolean> => {
      if (hydration) return hydration;
      if (hydrated && !force) return Promise.resolve(true);
      set({hydrating: true});
      hydration = exclusive(storage, async () => {
        try {
          const current = await history.transact(source => ({value: source}), true);
          const source = current.value;
          if (current.state) set({state: current.state, hasSave: true, actionError: '',
            saveMessage: !current.backupOk ? '进度已保存，启动镜像暂不可用。' : source.source === 'backup' ? '已读取备份存档。' : ''});
          else if (source.error) set({saveMessage: '存档校验失败，原数据已保留，可重新开始。'});
          hydrated = true;
          return true;
        } catch {
          set({actionError: historyFailure, saveMessage: historyFailure});
          return false;
        } finally { set({hydrating: false}); }
      }).finally(() => { hydration = undefined; });
      return hydration;
    };

    const run = async (action?: GymAction, restart = false, automatic = false, resuming = false, suspending = false): Promise<GymResult> => {
      const requested = get();
      try {
        return await exclusive(storage, async () => {
          const committed = await history.transact<Transition>(current => {
            if (current.error === 'storage-unavailable') throw new Error(current.error);
            if (!restart && !current.state) return {value: {result: fail(current.error ?? 'no-save', current.error ? '存档校验失败，请从首页重新开始。' : undefined)}};
            const minimumTime = current.state ? current.state.updatedAt + (restart ? 1 : 0) : requested.state.updatedAt;
            const time = Math.max(now(), minimumTime);
            let result: GymResult;
            let offlineReport: OfflineTrainingReport | undefined;
            let resumed = false;
            if (restart) {
              const state = newGym(time, typeof seed === 'number' ? seed : seed());
              if (current.state) {
                state.collection = {...current.state.collection};
                state.collectedEquipment = {...current.state.collectedEquipment};
                if (current.state.legacyEquipmentCollection) state.legacyEquipmentCollection = {...current.state.legacyEquipmentCollection};
              }
              result = {state, events: []};
            } else {
              const base = current.state!;
              if (suspending && get().isSuspended) return {value: {result: {state: base, events: []}}};
              if (action && (base.createdAt !== requested.state.createdAt || base.seed !== requested.state.seed || base.revision < requested.state.revision)) {
                return {value: {result: {state: base, events: [], error: 'gym-changed'},
                  patch: {actionError: '球馆已在其他页面更新，请查看当前进度后重试。'}}};
              }
              resumed = resuming || (!suspending && get().isSuspended) || time - base.updatedAt >= 10_000;
              if (!base.pendingLegacyEquipmentEffects && !resumed && automatic && !action && current.source === 'main' && time - base.updatedAt < 1_000) {
                const elapsed = time - base.updatedAt;
                const interval = recoverySeconds(base) * 1_000;
                const due = activePlayers(base).some(player => player.autoEnabled && player.level < playerLevelCap
                  && player.nextShotAt <= time && (player.stamina >= 1 || player.recoveryMs + elapsed >= interval));
                if (!due) return {value: {result: {state: base, events: []}}};
              }
              const settlement = (resumed && base.offlineRulesVersion) || base.pendingLegacyEquipmentEffects ? settleOfflineGym(base, time,
                !base.offlineRulesVersion ? 0 : base.offlineRulesVersion === 1 ? legacyOfflineLimitMs(base) : undefined) : undefined;
              const advanced = {...(settlement?.state ?? advanceGym(base, time)), offlineRulesVersion: 2 as const};
              if (settlement?.report && time - base.updatedAt >= 5_000 && settlement.report.totalShots > 0) offlineReport = settlement.report;
              result = action ? dispatchGym(advanced, advanced.revision, action, time)
                : automatic && !resumed ? dispatchGym(advanced, advanced.revision, {type: 'auto-step'}, time) : {state: advanced, events: []};
              if (result.state === base && current.source === 'main') return {value: {result, patch: {actionError: result.error ?? ''}}};
            }
            return {state: result.state, value: {result, patch: {
              actionError: result.error ?? (automatic && get().actionError !== saveFailure ? get().actionError : ''),
              isSuspended: suspending ? true : restart || resumed ? false : get().isSuspended,
              pendingOfflineReport: restart ? null : offlineReport ?? get().pendingOfflineReport,
            }}};
          });
          const {result, patch} = committed.value;
          hydrated = true;
          // Only publish training/rewards and reports after the authoritative
          // transaction completes, including archival of its overflow records.
          const state = committed.state ?? result.state;
          if (committed.state) set({state, hasSave: true, hydrating: false, ...patch,
            ...(committed.saved ? {saveMessage: committed.backupOk ? '已自动保存' : history.asynchronous
              ? '进度已保存，启动镜像暂不可用。' : '进度已保存，备份暂不可用。'} : {})});
          return {...result, state};
        });
      } catch { set({hydrating: false}); return fail('save-failed', saveFailure); }
    };

    return {
      state: initial, hasSave: !!loaded.state, hydrating: history.asynchronous, actionError: '', isSuspended: true, pendingOfflineReport: null,
      saveMessage: loaded.error === 'storage-unavailable' ? saveFailure : loaded.error ? '存档校验失败，原数据已保留，可重新开始。'
        : loaded.source === 'backup' ? '已读取备份存档。' : '',
      hydrate: async () => { await hydrate(true); },
      loadAlumni: async (offset = 0, limit = 20) => {
        if (!await hydrate()) throw new Error('alumni-unavailable');
        return history.loadAlumni(offset, limit);
      },
      start: () => run(undefined, true),
      act: action => run(action),
      tick: () => run(undefined, false, true),
      resume: () => run(undefined, false, false, true),
      dismissOfflineReport: () => set({pendingOfflineReport: null}),
      suspend: async () => { if (get().hasSave) await run(undefined, false, false, false, true); },
      flush: async () => { if (get().hasSave) await run(undefined, false, false, false, true); },
    };
  });

  if (typeof window !== 'undefined' && isBrowserGymStorage(storage)) {
    window.addEventListener('storage', event => {
      if (event.key === gymSaveKeys.main || event.key === gymSaveKeys.backup) void store.getState().hydrate();
    });
  }
  return store;
}

function browserStorage(): GymStorage {
  try { if (typeof window !== 'undefined') return window.localStorage; } catch { /* Report the failure on the first action. */ }
  return {getItem: () => null, setItem: () => { throw new Error('storage-unavailable'); }};
}

export const useGym = createGymStore(browserStorage());
