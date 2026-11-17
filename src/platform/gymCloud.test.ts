import {afterEach, expect, it, vi} from 'vitest';
import {createGymStore} from '../gymStore';
import {newGym, type GymState} from '../game/gym/engine';
import {encodeGym, validGym, writeGym, type GymStorage} from '../game/gym/save';
import {exportGymCloudArchive, parseGymCloudArchive, gymCloudProgress} from './gymCloudArchive';
import {createGymCloudSync} from './gymCloudSync';
import {readGymCloud, writeGymCloud} from './gymCloudTransport';
import {hupuProject} from './hupuProject';

afterEach(() => {vi.unstubAllGlobals(); vi.useRealTimers();});
function context(state: GymState = newGym(1000, 17)) {
 const values = new Map<string, string>(); let fail = false;
 const storage: GymStorage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => {if (fail) throw Error('quota'); values.set(key, value);}};
 writeGym(storage, state);
 const store = createGymStore(storage, 17, () => 1000);
 return {store, values, fail: () => {fail = true;}};
}
const identify = (state: GymState) => {const {createdAt, seed, revision, updatedAt} = state; return {createdAt, seed, revision, updatedAt};};
function cloud(state: GymState) {return JSON.stringify({format: 'legend-gym-cloud-v1', applicationId: hupuProject.applicationId, uploadedAt: 2000, gym: encodeGym(state)});}
function transport(raw: string | null = null) {
 return {user: vi.fn(async () => ({islogin: 1, puid: 'coach', nickname: '训练师'})), read: vi.fn(async () => raw), write: vi.fn(async (_value: string, _expected?: string) => {})};
}
const deferred = <T,>() => {let resolve!: (value: T) => void; return {promise: new Promise<T>(done => {resolve = done;}), resolve: (value: T) => resolve(value)};};

it('uses only the latest slot APIs in this application and preserves null versus empty data', async () => {
 const auth = vi.fn(async () => ({code: 200, data: {islogin: 1, puid: 'coach'}}));
 const load = vi.fn(async () => ({code: 200, data: null as string | null})), save = vi.fn(async () => ({code: 200}));
 const getValue = vi.fn(), setValue = vi.fn();
 vi.stubGlobal('window', {ColorboxAI: {auth: {getUserInfo: auth}, cloudSave: {load, save, getValue, setValue}}, __COLORBOX_AI_CONFIG__: {projectId: hupuProject.applicationId}});
 expect(await readGymCloud('coach')).toBeNull();
 load.mockResolvedValue({code: 200, data: ''}); expect(await readGymCloud('coach')).toBe('');
 await writeGymCloud('gym-progress', 'coach');
 expect(load).toHaveBeenCalledWith({slot: 1}); expect(save).toHaveBeenCalledExactlyOnceWith({slot: 1, value: 'gym-progress'});
 expect(getValue).not.toHaveBeenCalled(); expect(setValue).not.toHaveBeenCalled();
});
it('rejects failed slot calls, wrong identity and legacy-only SDKs without falling back', async () => {
 const auth = vi.fn(async () => ({code: 200, data: {islogin: 1, puid: 'coach'}})), load = vi.fn(async () => ({code: 429, message: '读取受限'})), save = vi.fn(async () => ({code: 503, message: '平台繁忙'}));
 vi.stubGlobal('window', {ColorboxAI: {auth: {getUserInfo: auth}, cloudSave: {load, save}}, __COLORBOX_AI_CONFIG__: {projectId: hupuProject.applicationId}});
 await expect(readGymCloud('coach')).rejects.toThrow('读取受限'); await expect(writeGymCloud('value', 'coach')).rejects.toThrow('平台繁忙');
 await expect(writeGymCloud('value', 'another')).rejects.toThrow('账号已切换'); expect(save).toHaveBeenCalledTimes(1);
 window.ColorboxAI!.cloudSave = {getValue: vi.fn(), setValue: vi.fn()};
 await expect(readGymCloud('coach')).rejects.toThrow('新版云存档');
});
it('keeps an unresolved write locked after the UI times out, preventing an old write from overtaking a retry', async () => {
 vi.useFakeTimers(); const pending = deferred<{code: number}>(), save = vi.fn(() => pending.promise);
 vi.stubGlobal('window', {ColorboxAI: {auth: {getUserInfo: async () => ({code: 200, data: {islogin: 1, puid: 'coach'}})}, cloudSave: {save}}, __COLORBOX_AI_CONFIG__: {projectId: hupuProject.applicationId}});
 const result = expect(writeGymCloud('first', 'coach')).rejects.toThrow('结果暂不确定'); await vi.advanceTimersByTimeAsync(20001); await result;
 await expect(writeGymCloud('second', 'coach')).rejects.toThrow('仍在处理中'); expect(save).toHaveBeenCalledTimes(1);
 pending.resolve({code: 200}); await Promise.resolve(); await Promise.resolve();
 await writeGymCloud('third', 'coach'); expect(save).toHaveBeenCalledTimes(2);
});

it('exports every archived alumni record instead of a pointer to another browser database', async () => {
 const initial = newGym(1000, 17);
 initial.alumni = Array.from({length: 113}, (_, index) => ({...structuredClone(initial.player!), id: `old-${index}`, recommendedAt: 1000, rewardCredits: 0, rewardFame: 0, finalValue: String(index)}));
 expect(validGym(initial)).toBe(true); const {store} = context(initial); await store.getState().hydrate();
 expect(store.getState().state.alumni).toHaveLength(100); expect(store.getState().state.alumniArchive?.count).toBe(13);
 const raw = await exportGymCloudArchive(store, 2000), {state} = parseGymCloudArchive(raw);
 expect(state.alumni).toEqual(initial.alumni); expect(state.alumniArchive).toBeUndefined();
 expect(gymCloudProgress(raw)).toMatchObject({level: 1, fame: 0, uploadedAt: 2000});
});
it('rejects another game, application, corrupt snapshot and incomplete cold history', () => {
 const state = newGym(1000, 17), raw = cloud(state);
 for (const value of ['', '{}', JSON.stringify({format: 'player-training-cloud-v1'}), raw.replace(hupuProject.applicationId, 'app_0123456789'), raw.replace('gym-management-envelope-v1', 'broken')]) expect(() => parseGymCloudArchive(value)).toThrow('本地进度已保留');
 state.alumniArchive = {id: 'old', count: 1, effectiveCount: 0, legendCount: 0, bestTier: 0};
 expect(() => parseGymCloudArchive(cloud(state))).toThrow('本地进度已保留');
});
it('only restores known persistent game fields, omitting unknown UI extensions and credentials', () => {
 const state=newGym(1000,17);
 Object.assign(state,{token:'private',loading:true});Object.assign(state.player!,{sessionToken:'private'});Object.assign(state.player!.stats,{preview:'private'});
 const {state:restored}=parseGymCloudArchive(cloud(state));
 expect(restored).not.toHaveProperty('token');expect(restored).not.toHaveProperty('loading');expect(restored.player).not.toHaveProperty('sessionToken');expect(restored.player!.stats).not.toHaveProperty('preview');
});
it('restores through the durable repository, keeps a portable backup and survives a new store instance', async () => {
 const {store, values} = context(); const before = await exportGymCloudArchive(store);
 const remote = newGym(900, 88); remote.credits = 37;
 await store.getState().restoreCloudArchive!(cloud(remote), identify(store.getState().state), before);
 expect(store.getState()).toMatchObject({hasSave: true, isSuspended: true, pendingOfflineReport: null});
 expect(store.getState().state).toMatchObject({seed: 88, credits: 37});
 expect(values.get('gym-management-v1.cloud-restore.backup')).toBe(before);
 const storage = {getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => {values.set(key, value);}};
 expect(createGymStore(storage).getState().state).toMatchObject({seed: 88, credits: 37});
});
it('refuses a stale local restore and preserves original state when local writing fails', async () => {
 const {store, fail} = context(), expected = identify(store.getState().state), original = structuredClone(store.getState().state);
 await expect(store.getState().restoreCloudArchive!(cloud(newGym(900, 88)), {...expected, revision: 999}, null)).rejects.toThrow('本地进度已变化');
 expect(store.getState().state).toEqual(original); fail();
 await expect(store.getState().restoreCloudArchive!(cloud(newGym(900, 88)), expected, 'backup')).rejects.toThrow(); expect(store.getState().state).toEqual(original);
});
it('reads on settings entry, never overwrites local data automatically, and uploads only on request', async () => {
 const {store} = context(), remote = newGym(2000, 88), api = transport(cloud(remote)), sync = createGymCloudSync(store, api);
 await sync.refresh(); expect(sync.getSnapshot()).toMatchObject({phase: 'ready', cloudKnown: true, user: {puid: 'coach'}});
 expect(store.getState().state.seed).toBe(17); expect(api.write).not.toHaveBeenCalled();
 await sync.upload(); expect(api.write).toHaveBeenCalledTimes(1);
 expect(parseGymCloudArchive(api.write.mock.calls[0][0] as string).state.seed).toBe(17);
});
it('requires a successful cloud read before upload and keeps malformed remote data intact', async () => {
 const {store} = context(), api = transport('broken'), sync = createGymCloudSync(store, api);
 await sync.refresh(); expect(sync.getSnapshot()).toMatchObject({phase: 'error', cloudKnown: false});
 await expect(sync.upload()).rejects.toThrow('尚未成功读取'); expect(api.write).not.toHaveBeenCalled(); expect(store.getState().state.seed).toBe(17);
});
it('skips a redundant manual upload when durable progress already matches the successful cloud read',async()=>{
 const {store}=context();const raw=await exportGymCloudArchive(store),api=transport(raw),sync=createGymCloudSync(store,api);
 await sync.refresh();await sync.upload();expect(api.write).not.toHaveBeenCalled();expect(sync.getSnapshot().message).toContain('进度未变化');
});
it('ignores an account response that finishes after the settings session closed',async()=>{
 const {store}=context(),api=transport(),pending=deferred<{islogin:number;puid:string;nickname:string}>();api.user.mockImplementationOnce(()=>pending.promise);
 const sync=createGymCloudSync(store,api),stop=sync.start();stop();pending.resolve({islogin:1,puid:'old',nickname:'old'});
 await Promise.resolve();await Promise.resolve();expect(sync.getSnapshot().user).toBeNull();expect(api.read).not.toHaveBeenCalled();
});
it('previews and confirms a selected remote snapshot, checking the current account again', async () => {
 const {store} = context(), api = transport(cloud(newGym(900, 88))), sync = createGymCloudSync(store, api);
 await sync.refresh(); await sync.prepareSync(); expect(sync.getSnapshot().preview).toBeTruthy(); expect(store.getState().state.seed).toBe(17);
 api.user.mockResolvedValueOnce({islogin: 1, puid: 'another', nickname: 'other'});
 await expect(sync.confirmSync()).rejects.toThrow('账号已切换'); expect(store.getState().state.seed).toBe(17);
 await sync.confirmSync(); expect(store.getState().state.seed).toBe(88); expect(sync.getSnapshot().preview).toBeNull();
});
it('rejects late remote data when the local gym changed during the read or confirmation', async () => {
 const initial = newGym(1000, 17); initial.credits = 3;
 const {store} = context(initial), api = transport(), sync = createGymCloudSync(store, api); await sync.refresh();
 const pending = deferred<string | null>(); api.read.mockImplementationOnce(() => pending.promise);
 const result = expect(sync.prepareSync()).rejects.toThrow('本地进度已变化');
 await store.getState().act({type: 'buy-drink'}); pending.resolve(cloud(newGym(900, 88))); await result;
 expect(sync.getSnapshot().preview).toBeNull();
});
