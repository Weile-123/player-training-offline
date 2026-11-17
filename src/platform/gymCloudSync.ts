import {useGym, type GymStore} from '../gymStore';
import {getHupuUser} from './hupuAccount';
import type {HupuUser} from './hupuSdk';
import {exportGymCloudArchive, gymCloudProgress, parseGymCloudArchive, type GymCloudProgress} from './gymCloudArchive';
import {gymCloudRateState, readGymCloud, writeGymCloud} from './gymCloudTransport';

type SyncState = {user: HupuUser | null; phase: 'idle' | 'loading' | 'ready' | 'guest' | 'error'; busy: 'account' | 'read' | 'write' | 'restore' | null; cloud: GymCloudProgress | null; cloudKnown: boolean; message: string; preview: string | null};
type Transport = {user: typeof getHupuUser; read: typeof readGymCloud; write: typeof writeGymCloud};
export function createGymCloudSync(store: {getState: () => GymStore}, transport: Transport = {user: getHupuUser, read: readGymCloud, write: writeGymCloud}) {
 let snapshot: SyncState = {user: null, phase: 'idle', busy: null, cloud: null, cloudKnown: false, message: '', preview: null};
 const listeners = new Set<() => void>();
 let generation = 0;
 let previewLocal: {createdAt: number; seed: number; revision: number; updatedAt: number} | null = null;
 let lastSuccessful:{account:string;content:string}|null=null;
 const content=(raw:string)=>JSON.stringify(parseGymCloudArchive(raw).state);
 const emit = (patch: Partial<SyncState>) => {snapshot = {...snapshot, ...patch}; listeners.forEach(listener => listener());};
 const failure = (error: unknown) => error instanceof Error ? error.message : '云存档服务暂不可用，本地进度已保留';
 const progressKey = () => {const {createdAt, seed, revision, updatedAt} = store.getState().state; return {createdAt, seed, revision, updatedAt};};
 const available = () => {if (snapshot.busy || snapshot.preview) throw Error('请先完成当前云存档操作'); if (!snapshot.user?.puid) throw Error('请先在虎扑登录，再刷新账号');};
 const accept = (raw: string | null) => {
  const cloud = raw === null ? null : gymCloudProgress(raw), local = store.getState();
  lastSuccessful=raw!==null&&snapshot.user?.puid?{account:snapshot.user.puid,content:content(raw)}:null;
  emit({cloud, cloudKnown: true, phase: 'ready', message: cloud && (!local.hasSave || cloud.updatedAt > local.state.updatedAt) ? '已有较新的云端进度，请先同步；上传会覆盖云端存档。' : ''});
 };
 const refresh = async () => {
  if (snapshot.busy || snapshot.preview) return;
  const token = ++generation; emit({busy: 'account', message: '', phase: 'loading'});
  try {
   const user = await transport.user(); if (token !== generation) return;
   emit({user, cloud: null, cloudKnown: false});
   if (!user?.puid) {emit({user:null,phase: 'guest', message: '登录虎扑后可使用云存档，本地游玩不受影响。'}); return;}
   emit({busy: 'read'}); const raw = await transport.read(user.puid); if (token === generation) accept(raw);
  } catch (error) {if (token === generation) emit({phase: 'error', message: failure(error)});}
  finally {if (token === generation) emit({busy: null});}
 };
 const upload = async () => {
  available();
  if (!snapshot.cloudKnown) throw Error('尚未成功读取此账号的云存档，请先刷新账号');
  const token = ++generation, account = snapshot.user!.puid; emit({busy: 'write', message: ''});
  try {
   const raw = await exportGymCloudArchive(store); if (token !== generation) return;
   const current=content(raw);
   if(lastSuccessful&&lastSuccessful.account===account&&lastSuccessful.content===current){emit({phase:'ready',message:'进度未变化，云存档已是最新'});return;}
   await transport.write(raw, account); if (token === generation) {lastSuccessful={account:account!,content:current};emit({cloud: gymCloudProgress(raw), cloudKnown: true, phase: 'ready', message: '上传成功'});}
  } catch (error) {if (token === generation) emit({phase: 'error', message: failure(error)}); throw error;}
  finally {if (token === generation) emit({busy: null});}
 };
 const prepareSync = async () => {
  available(); const token = ++generation, account = snapshot.user!.puid, before = progressKey(); emit({busy: 'read', message: ''});
  try {
   const raw = await transport.read(account); if (token !== generation) return;
   if (JSON.stringify(before) !== JSON.stringify(progressKey())) throw Error('本地进度已变化，请重新同步');
   accept(raw);
   if (raw === null) {emit({message: '云端暂无存档，可先上传本地进度。'}); return;}
   previewLocal = before; emit({preview: raw});
  } catch (error) {if (token === generation) emit({phase: 'error', message: failure(error)}); throw error;}
  finally {if (token === generation) emit({busy: null});}
 };
 const cancelSync = () => {if (snapshot.busy !== 'restore') {previewLocal = null; emit({preview: null});}};
 const confirmSync = async () => {
  if (snapshot.busy || !snapshot.preview || !previewLocal) return;
  const raw = snapshot.preview, reviewed = previewLocal, account = snapshot.user?.puid, token = ++generation;
  emit({busy: 'restore', message: ''});
  try {
   const user = await transport.user();
   if (!user?.puid || user.puid !== account) throw Error('虎扑账号已切换，请取消同步并刷新账号');
   if (JSON.stringify(reviewed) !== JSON.stringify(progressKey())) throw Error('本地进度已变化，请重新同步确认');
   const backup = store.getState().hasSave ? await exportGymCloudArchive(store) : null;
   const latest = progressKey();
   // flush can advance time while preparing the portable backup; reject any other gameplay change.
   if (latest.createdAt !== reviewed.createdAt || latest.seed !== reviewed.seed || latest.revision !== reviewed.revision) throw Error('本地进度已变化，请重新同步确认');
   const restore = store.getState().restoreCloudArchive; if (!restore) throw Error('当前环境无法恢复球馆存档');
   await restore(raw, latest, backup); previewLocal = null;
   if (token === generation) emit({preview: null, phase: 'ready', user, message: '同步成功，已恢复云端球馆进度。'});
  } catch (error) {if (token === generation) emit({phase: 'error', message: failure(error)}); throw error;}
  finally {if (token === generation) emit({busy: null});}
 };
 return {
  getSnapshot: () => snapshot,
  subscribe: (listener: () => void) => {listeners.add(listener); return () => {listeners.delete(listener);};},
  start: () => {if (!snapshot.busy) void refresh(); return () => {
   if(snapshot.busy!=='restore'){generation++;previewLocal=null;emit({busy:null,preview:null});}
  };},
  refresh, upload, prepareSync, confirmSync, cancelSync,
  rate: gymCloudRateState,
 };
}
export const gymCloudSync = createGymCloudSync(useGym);
