import {getHupuUser} from './hupuAccount';
import {sdkDeadline} from './hupuSdk';
import {assertHupuProject} from './hupuProject';

/** Slot 1 belongs only to this application's gym progress. Legacy Contract keys are untouched. */
export const gymCloudSlot = 1;
type Calls = Partial<Record<'read' | 'write', {pending: boolean; started: number}>>;
const calls = new WeakMap<object, Calls>();
export function gymCloudRateState() {
 const api = typeof window === 'undefined' ? undefined : window.ColorboxAI?.cloudSave, state = api ? calls.get(api) : undefined;
 return {readUntil: state?.read ? state.read.started + 3000 : 0, writeUntil: state?.write ? state.write.started + 3000 : 0};
}
async function user(expected?: string) {
 const identity = await getHupuUser();
 if (!identity?.puid) throw Error('请先在虎扑登录，再刷新账号');
 if (expected && identity.puid !== expected) throw Error('虎扑账号已切换，请刷新账号后再操作');
 return identity;
}
async function call<T>(api: object, kind: 'read' | 'write', work: () => Promise<T>) {
 const state = calls.get(api) ?? {}, previous = state[kind];
 if (previous?.pending) throw Error('云存档请求仍在处理中，请等待平台确认后再试');
 const current = {pending: true, started: Date.now()}; state[kind] = current; calls.set(api, state);
 // Keep the in-flight lock until the actual SDK operation ends, even if our UI deadline expires.
 const task = Promise.resolve().then(work).finally(() => {current.pending = false;});
 return sdkDeadline(task, kind === 'write' ? '上传结果暂不确定，请等待平台确认，暂不重复上传' : '云存档读取超时，本地进度已保留');
}
export async function readGymCloud(expected?: string): Promise<string | null> {
 const identity = await user(expected), api = window.ColorboxAI?.cloudSave;
 if (!api?.load) throw Error('当前环境不支持新版云存档，请在本项目虎扑活动页内打开');
 const response = await call(api, 'read', () => api.load!({slot: gymCloudSlot}));
 assertHupuProject(); await user(identity.puid);
 if (response.code !== 200) throw Error(response.message || '云存档读取失败，本地进度已保留');
 if (response.data !== null && typeof response.data !== 'string') throw Error('云存档格式异常，本地进度已保留');
 return response.data;
}
export async function writeGymCloud(value: string, expected?: string) {
 if (new TextEncoder().encode(value).byteLength > 2 * 1024 * 1024) throw Error('球馆档案超过云端 2 MiB 限制，未上传或删减任何进度');
 const identity = await user(expected), api = window.ColorboxAI?.cloudSave;
 if (!api?.save) throw Error('当前环境不支持新版云存档，请在本项目虎扑活动页内打开');
 const response = await call(api, 'write', () => api.save!({slot: gymCloudSlot, value}));
 assertHupuProject(); await user(identity.puid);
 if (response.code !== 200) throw Error(response.message || '云存档上传失败，本地进度已保留');
}
