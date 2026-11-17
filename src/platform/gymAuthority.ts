import {create, type StoreApi, type UseBoundStore} from 'zustand';
import type {GymStore} from '../gymStore';
import {newGym, type GymAction, type GymEvent, type GymResult, type GymState} from '../game/gym/engine';
import {validGym, validGymAlumnus, type GymStorage} from '../game/gym/save';
import type {AlumniPage} from '../game/gym/history';
import type {OfflineTrainingReport} from '../game/gym/offline';
import {exportGymCloudArchive} from './gymCloudArchive';
import {getHupuUser} from './hupuAccount';
import {ensureColorboxSdk, sdkDeadline} from './hupuSdk';
import {assertHupuProject, hupuProject} from './hupuProject';
import authorityDeployment from '../../activity/timeflow.manifest.json';

export type GymAuthoritySnapshot = {
 applicationId: string; epoch: string; hasSave: boolean; mode: 'timeflow'; serverTime: number; revision: number;
 state?: GymState; events: GymEvent[]; offlineReport?: OfflineTrainingReport; error?: string;
 pending?: {pollAfterMs: number; retryable?: boolean; stage?: 'settlement' | 'ack' | 'baseline'};
 capabilities?: {platformRewards: boolean; legacyAdoption: boolean};
};
export type GymAuthorityTransport = {
 enabled: () => boolean;
 account: () => Promise<string | null>;
 request: (route: string, method: 'GET' | 'POST', data?: Record<string, unknown>) => Promise<unknown>;
};
const publishedAuthority = import.meta.env.PROD && authorityDeployment.deploymentStatus === 'active'
 && authorityDeployment.verification.gatewayVerified && authorityDeployment.verification.databaseMigrationApplied;
export const gymAuthorityConfig = Object.freeze({
 apiBase: String(import.meta.env.VITE_GYM_AUTHORITY_API_BASE ?? (publishedAuthority ? authorityDeployment.publicApiBase : '') ?? '').replace(/\/$/, ''),
 envId: String(import.meta.env.VITE_GYM_AUTHORITY_ENV_ID ?? (publishedAuthority ? authorityDeployment.environmentId : '') ?? ''),
});
export const gymAuthorityConfigured = () => /^https:\/\//.test(gymAuthorityConfig.apiBase) && !!gymAuthorityConfig.envId;

export function createGymAuthorityTransport(): GymAuthorityTransport {
 return {
  enabled: () => gymAuthorityConfigured() && typeof window !== 'undefined'
   && window.location.protocol !== 'file:' && !['localhost', '127.0.0.1', '::1', '[::1]'].includes(window.location.hostname),
  account: async () => (await getHupuUser())?.puid ?? null,
  request: async (route, method, data) => {
   if (!/^\/(?:session|start|adopt|actions|resume|suspend|alumni|rewards\/prepare)(?:\?offset=\d+&limit=\d+)?$/.test(route)) throw Error('离线训练接口无效');
   await ensureColorboxSdk(); assertHupuProject();
   const cloud = window.ColorboxAI?.cloud;
   if (!gymAuthorityConfigured() || !cloud) throw Error('平台离线训练服务尚未连接');
   const response = await sdkDeadline(cloud.request({url: `${gymAuthorityConfig.apiBase}/gym${route}`, method, data, envId: gymAuthorityConfig.envId, auth: true}), '平台同步结果暂不确定，请在设置中重新连接');
   assertHupuProject();
   if (response.statusCode < 200 || response.statusCode >= 300 || ![0, 200].includes(response.code)) {
    const details = response.data as {code?: string; retryable?: boolean} | undefined;
    const envelope = response as unknown as {retryable?: boolean};
    throw Object.assign(Error(response.message || '离线训练暂时无法同步，已有进度已保留'), {
     code: details?.code ?? String(response.code), statusCode: response.statusCode, retryable: details?.retryable === true || envelope.retryable === true,
    });
   }
   return response.data;
  },
 };
}

export function parseGymAuthoritySnapshot(value: unknown): GymAuthoritySnapshot {
 const s = value as GymAuthoritySnapshot;
 if (!s || s.applicationId !== hupuProject.applicationId || s.mode !== 'timeflow' || typeof s.epoch !== 'string'
  || !s.epoch || s.epoch.length > 128 || typeof s.hasSave !== 'boolean' || !Number.isSafeInteger(s.serverTime)
  || s.serverTime < 0 || !Number.isSafeInteger(s.revision) || s.revision < 0 || !Array.isArray(s.events)
  || !s.events.every(event => event && typeof event.type === 'string')
  || (s.hasSave && (!s.state || !validGym(s.state) || s.state.revision !== s.revision))
  || (s.error !== undefined && typeof s.error !== 'string')
  || (s.capabilities !== undefined && (typeof s.capabilities.platformRewards !== 'boolean' || typeof s.capabilities.legacyAdoption !== 'boolean'))
  || (s.pending !== undefined && (!Number.isSafeInteger(s.pending.pollAfterMs) || s.pending.pollAfterMs < 0 || s.pending.retryable !== undefined && typeof s.pending.retryable !== 'boolean'))) {
  throw Error('平台返回的球馆进度无效，未覆盖任何存档');
 }
 if (s.offlineReport) {
  const r = s.offlineReport;
  if (![r.from, r.to, r.elapsedMs, r.creditedMs, r.capMs, r.totalShots, r.totalExperience].every(n => Number.isSafeInteger(n) && n >= 0)
   || r.to < r.from || r.elapsedMs !== r.to - r.from || r.creditedMs > r.elapsedMs || !Array.isArray(r.players)) {
   throw Error('平台离线报告无效，未重复领取收益');
  }
 }
 return s;
}

type Pending = {route: string; body: Record<string, unknown>; account: string};
type Hook = UseBoundStore<StoreApi<GymStore>>;
const prefix = `legend-gym-authority-v1.${hupuProject.applicationId}`;
const errorText = (error: unknown) => {
 const message = error instanceof Error ? error.message : '';
 // Never surface provider URLs, credentials, identity/scope details or raw stacks.
 if (/[\u3400-\u9fff]/.test(message) && message.length <= 180
  && !/shaper|bearer|token|signature|workspace|scope|cookie|credential|https?:\/\/|\bat\s+\w+\s*\(/i.test(message)) return message;
 return '平台同步暂时中断，已保存进度保留，请在设置中重新连接';
};
const copyData = (s: GymStore) => ({state: s.state, hasSave: s.hasSave, hydrating: s.hydrating,
 actionError: s.actionError, saveMessage: s.saveMessage, isSuspended: s.isSuspended, pendingOfflineReport: s.pendingOfflineReport});
const blank = (): GymState => ({...newGym(0, 1), player: null});

/** Remote state has its own cache. It is never written into the guest history DB. */
export function createGymAuthorityStore(local: Hook, storage: GymStorage, transport: GymAuthorityTransport,
 options: {requestId?: () => string; now?: () => number; heartbeatMs?: number; sleep?: (ms: number) => Promise<void>} = {}): Hook {
 if (!transport.enabled()) return local;
 const requestId = options.requestId ?? (() => crypto.randomUUID());
 const now = options.now ?? Date.now, heartbeatMs = options.heartbeatMs ?? 2_000;
 const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
 let account: string | null = null, epoch = '', connected = false, blocked = false;
 let generation = 0, nextHeartbeat = 0, pendingPolls = 0;
 let connectTask: Promise<void> | null = null, queue: Promise<unknown> = Promise.resolve();
 const key = (suffix: string, owner = account) => `${prefix}.${suffix}${owner ? '.' + encodeURIComponent(owner) : ''}`;
 const read = <T>(path: string): T | null => {
  const raw = storage.getItem(path); if (raw === null) return null;
  try {return JSON.parse(raw) as T;} catch {throw Error('平台同步记录损坏，请保留本地备份后重试');}
 };
 const persist = (path: string, value: unknown) => storage.setItem(path, JSON.stringify(value));
 let store: Hook;
 const fail = (error: unknown): GymResult => {
  blocked = true;
  const message = errorText(error);
  store.setState({authorityMode: 'error', authorityMessage: message, actionError: message, saveMessage: '平台同步暂停；未切换为本地发奖', hydrating: false});
  return {state: store.getState().state, events: [], error: message};
 };
 const publish = (raw: unknown): GymAuthoritySnapshot => {
  const incoming = parseGymAuthoritySnapshot(raw), previous = store.getState();
  if (connected && epoch === incoming.epoch && previous.hasSave && (!incoming.hasSave || incoming.revision < previous.state.revision
   || incoming.state!.updatedAt < previous.state.updatedAt || incoming.state!.seed !== previous.state.seed || incoming.state!.createdAt !== previous.state.createdAt)) {
   throw Error('平台返回了过期或不一致的进度，已保留当前球馆');
  }
  const snapshot = connected && epoch === incoming.epoch && previous.hasSave && incoming.revision <= previous.state.revision
   ? {...incoming, events: []} : incoming;
  let report = previous.pendingOfflineReport;
  if (snapshot.offlineReport) {
   const dismissed = read<{epoch: string; from: number; to: number}>(key('dismissed-report'));
   if (!dismissed || dismissed.epoch !== snapshot.epoch || dismissed.from !== snapshot.offlineReport.from || dismissed.to !== snapshot.offlineReport.to) {
    if (!report || report.from !== snapshot.offlineReport.from || report.to !== snapshot.offlineReport.to) report = snapshot.offlineReport;
   }
  }
  if(snapshot.state?.offlineReward)report=snapshot.state.offlineReward.dismissed?null:snapshot.state.offlineReward.report;
  epoch = snapshot.epoch; connected = true;
  persist(key('cache'), snapshot);
  const pending = !!snapshot.pending;
  store.setState({state: snapshot.state ?? blank(), hasSave: snapshot.hasSave, hydrating: false,
   authorityMode: pending ? 'connecting' : 'timeflow', authorityMessage: pending ? '离线收益已在处理中，等待平台确认' : '平台离线训练已连接',
   actionError: snapshot.error ? errorText(Error(snapshot.error)) : '', saveMessage: pending ? '等待结算确认' : '进度已由平台保存',
   isSuspended: pending, pendingOfflineReport: report});
  store.setState({authorityCapabilities: snapshot.capabilities ?? {platformRewards: false, legacyAdoption: false}});
  return snapshot;
 };
 const sameAccount = async (expected: string) => {
  if (await transport.account() !== expected) {
   generation++; connected = false; epoch = '';
   store.setState({state: blank(), hasSave: false, pendingOfflineReport: null});
   throw Error('虎扑账号已切换，请在设置中重新连接离线训练');
  }
 };
 const submit = async (pending: Pending): Promise<GymAuthoritySnapshot> => {
  const owner = pending.account, version = generation;
  await sameAccount(owner);
  // Keep the exact body and logical key before the first network request.
  persist(key('pending', owner), pending);
  let raw: unknown;
  try {raw = await transport.request(pending.route, 'POST', pending.body);}
  catch (error) {
   const status = (error as {statusCode?: number})?.statusCode;
   if (status && status >= 400 && status < 500 && status !== 408 && status !== 429 && (error as {retryable?:boolean})?.retryable!==true) persist(key('pending', owner), null);
   throw error;
  }
  await sameAccount(owner);
  if (version !== generation || owner !== account) throw Error('账号连接已变化，已忽略旧进度');
  const result = publish(raw);
  if (!result.pending) {persist(key('pending', owner), null); pendingPolls = 0;}
  else {
   nextHeartbeat = now() + Math.max(heartbeatMs, result.pending.pollAfterMs);
   pendingPolls++;
   if (result.pending.retryable !== true || pendingPolls >= 3) blocked = true;
  }
  return result;
 };
 const finishInitialPending = async (first: GymAuthoritySnapshot): Promise<GymAuthoritySnapshot> => {
  let snapshot = first;
  for (let attempt = 0; attempt < 2 && snapshot.pending?.retryable === true && pendingPolls < 3; attempt++) {
   await sleep(Math.max(250, Math.min(2_000, snapshot.pending.pollAfterMs)));
   const pending = read<Pending>(key('pending'));
   if (pending) snapshot = await submit(pending);
   else {const raw = await transport.request('/session', 'GET'); await sameAccount(account!); snapshot = publish(raw);}
  }
  return snapshot;
 };
 const connect = async () => {
  if (connectTask) return connectTask;
  connectTask = (async () => {
   blocked = false; pendingPolls = 0; store.setState({hydrating: true, authorityMode: 'connecting', authorityMessage: '正在连接平台离线训练', actionError: ''});
   try {
    const owner = await transport.account();
    if (!owner) {
     if (read(key('cutover', null))) {store.setState({state: blank(), hasSave: false, pendingOfflineReport: null}); throw Error('请登录虎扑后继续平台球馆，未重复计算本地离线收益');}
     account = null; connected = false;
     await local.getState().hydrate();
     store.setState({...copyData(local.getState()), authorityMode: 'local', authorityMessage: '登录虎扑后启用平台离线训练'});
     return;
    }
    if (account !== owner) {generation++; account = owner; epoch = ''; connected = false; store.setState({state: blank(), hasSave: false, pendingOfflineReport: null});}
    const pending = read<Pending>(key('pending'));
    if (pending && pending.account !== owner) throw Error('平台同步记录所属账号不一致');
    let snapshot: GymAuthoritySnapshot;
    if (pending) snapshot = await submit(pending);
    else {const raw = await transport.request('/session', 'GET'); await sameAccount(owner); snapshot = publish(raw);}
    await sameAccount(owner);
    const cutover = read<{account: string}>(key('cutover', null));
    if (!snapshot.hasSave && !snapshot.pending && (!cutover || cutover.account === owner)) {
     // IndexedDB may hold the current gym even when its startup mirror is absent.
     await local.getState().hydrate();
     if (local.getState().actionError) throw Error(local.getState().actionError);
    }
    if (!snapshot.hasSave && !snapshot.pending && local.getState().hasSave && (!cutover || cutover.account === owner)) {
     // Preserve every alumni record before entering the authoritative timeline.
     const archive = read<{archive: string}>(key('legacy-backup'))?.archive ?? await exportGymCloudArchive(local);
     persist(key('legacy-backup'), {archive});
     persist(key('cutover', null), {account: owner});
     snapshot = await submit({route: '/adopt', account: owner, body: {requestId: requestId(), epoch, archive}});
    }
    if (snapshot.pending) snapshot = await finishInitialPending(snapshot);
    if (snapshot.hasSave) persist(key('cutover', null), {account: owner});
    if (!snapshot.pending) blocked = false;
   } catch (error) {fail(error);}
   finally {store.setState({hydrating: false});}
  })().finally(() => {connectTask = null;});
  return connectTask;
 };
 const serial = <T>(work: () => Promise<T>): Promise<T> => {
  const next = queue.catch(() => {}).then(work); queue = next; return next;
 };
 const result = (snapshot: GymAuthoritySnapshot): GymResult => {
  const waiting = snapshot.pending && snapshot.pending.stage !== 'ack';
  if (waiting) store.setState({actionError: '离线训练正在结算，请稍候或在设置中重新连接'});
  return {state: snapshot.state ?? store.getState().state, events: waiting ? [] : snapshot.events,
   ...(snapshot.error ? {error: errorText(Error(snapshot.error))} : waiting ? {error: '离线训练正在结算，请稍候或在设置中重新连接'} : {})};
 };
 const remote = (route: string, action?: GymAction, heartbeat = false, rewardProof?:{challengeId:string;confirmation:'native-sdk-confirmation'}): Promise<GymResult> => serial(async () => {
  if (!connected && store.getState().authorityMode !== 'local' && !blocked) await connect();
  if (store.getState().authorityMode === 'local') {
   if (route === '/start') return local.getState().start();
   if (action) return local.getState().act(action);
   if (route === '/suspend') {await local.getState().suspend(); return {state: local.getState().state, events: []};}
   return heartbeat ? local.getState().tick() : local.getState().resume();
  }
  if (blocked) {
   const error = store.getState().authorityMessage || '请在设置中重新连接平台离线训练';
   if (!heartbeat) store.setState({actionError: error});
   return {state: store.getState().state, events: [], error};
  }
  if (heartbeat && now() < nextHeartbeat) return {state: store.getState().state, events: []};
  if (heartbeat) nextHeartbeat = now() + heartbeatMs;
  try {
   if (!account) throw Error('请先登录虎扑');
   await sameAccount(account);
   const pending = read<Pending>(key('pending'));
   if (pending) {
    const resumed = await submit(pending);
    const sameAction = !action || JSON.stringify(pending.body.action) === JSON.stringify(action);
    if (resumed.pending || pending.route === route && sameAction) return result(resumed);
   }
   if (route === '/start' && store.getState().hasSave) throw Error('球馆已在经营中，请继续经营');
   const body: Record<string, unknown> = {requestId: requestId(), epoch};
   if (route !== '/start') body.expectedRevision = store.getState().state.revision;
   if (action) body.action = action;
   if (rewardProof) body.rewardProof = rewardProof;
   let snapshot = await submit({route, body, account});
   if (route === '/start' && snapshot.pending) snapshot = await finishInitialPending(snapshot);
   return result(snapshot);
  } catch (error) {return fail(error);}
 });
 store = create<GymStore>(() => ({...local.getState(), hydrating: true, authorityMode: 'connecting', authorityMessage: '正在连接平台离线训练',
  hydrate: () => serial(connect), retryAuthority: () => serial(connect),
  start: () => remote('/start'), act: (action,proof) => remote('/actions', action, false, proof), tick: () => remote('/resume', undefined, true),
  preparePlatformReward: action => serial(async()=>{
   if(store.getState().authorityMode==='local')return undefined;
   if(!connected||blocked||!account||!store.getState().authorityCapabilities?.platformRewards)throw Error('平台奖励暂时无法连接，请先重新连接');
   await sameAccount(account);
   const response=await transport.request('/rewards/prepare','POST',{epoch,action}) as {challengeId?:unknown;confirmation?:unknown};
   await sameAccount(account);
   if(typeof response?.challengeId!=='string'||!/^[A-Za-z0-9-]{36}$/.test(response.challengeId)||response.confirmation!=='native-sdk-confirmation')throw Error('奖励确认信息无效，未打开广告或发帖');
   return{challengeId:response.challengeId,confirmation:'native-sdk-confirmation' as const};
  }),
  resume: () => remote('/resume', undefined, true),
  suspend: async () => {const r = await remote('/suspend'); if (!r.error) store.setState({isSuspended: true});},
  flush: async () => {const r = await remote('/suspend'); if (r.error) throw Error(r.error);},
  dismissOfflineReport: () => {
   const report = store.getState().pendingOfflineReport;
   if(report?.reportId&&store.getState().state.offlineReward?.report.reportId===report.reportId){void remote('/actions',{type:'dismiss-offline-report',reportId:report.reportId});return;}
   if (account && report) persist(key('dismissed-report'), {epoch, from: report.from, to: report.to});
   store.setState({pendingOfflineReport: null});
   if (store.getState().authorityMode === 'local') local.getState().dismissOfflineReport();
  },
  loadAlumni: (offset = 0, limit = 20) => serial(async () => {
   if (!connected && !blocked) await connect();
   if (store.getState().authorityMode === 'local') return local.getState().loadAlumni(offset, limit);
   if (!account || blocked) throw Error('请先重新连接平台档案');
   await sameAccount(account);
   const value = await transport.request('/alumni', 'POST', {offset, limit, epoch}) as AlumniPage;
   await sameAccount(account);
   if (!value || !Number.isSafeInteger(value.total) || value.total < 0 || !Array.isArray(value.players) || value.players.length > limit || !value.players.every(player => validGymAlumnus(player, store.getState().state))) throw Error('平台校友档案无效');
   return value;
  }),
  restoreCloudArchive: async (...args) => {
   if (store.getState().authorityMode !== 'local') throw Error('平台球馆已自动保存，不能用旧云档覆盖结算进度');
   await local.getState().restoreCloudArchive?.(...args);
  },
 }));
 local.subscribe(s => {if (store.getState().authorityMode === 'local') store.setState(copyData(s));});
 return store;
}
