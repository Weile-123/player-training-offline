import type {GymState} from '../game/gym/engine';
import {templateById} from '../game/templates';
import {statKeys, type Stats} from '../game/types';
import {getHupuUser} from './hupuAccount';
import {ensureColorboxSdk, sdkDeadline, type HupuSdk} from './hupuSdk';
import {assertHupuProject, hupuProject} from './hupuProject';

export type GymBoard = 'player' | 'fame';
export type GymRankPlayer = {playerId: string; templateId: string; value: string; level: number; stats: Stats};
export type GymRankRow = {id: string; coach: string; score: string; best: GymRankPlayer | null};
export type GymRanking = {entries: GymRankRow[]; me: {rank: number; entry: GymRankRow} | null};
export type GymRankReference = {runId: string; revision: number};
export const gymLeaderboardConfig = Object.freeze({
 applicationId: hupuProject.applicationId,
 apiBase: (import.meta.env.VITE_GYM_LEADERBOARD_API_BASE ?? '').replace(/\/$/, ''),
 envId: import.meta.env.VITE_GYM_LEADERBOARD_ENV_ID ?? '',
});
export const gymRankReference = (state: GymState): GymRankReference => ({runId: `${state.createdAt}-${state.seed}`, revision: state.revision});
export const gymLeaderboardConfigured = () => /^https:\/\//.test(gymLeaderboardConfig.apiBase) && !!gymLeaderboardConfig.envId;
const score = (value: unknown): value is string => typeof value === 'string' && /^(0|[1-9]\d{0,159})$/.test(value);
function validRow(value: GymRankRow, board: GymBoard) {
 if (!value || typeof value.id !== 'string' || value.id.length > 200 || typeof value.coach !== 'string' || Array.from(value.coach).length > 60 || !score(value.score)) return false;
 const best = value.best;
 if (board === 'fame') return best === null;
 return !!best && typeof best.playerId === 'string' && !!templateById(best.templateId) && score(best.value)
  && best.value === value.score && Number.isInteger(best.level) && best.level >= 0 && best.level <= 99
  && !!best.stats && statKeys.every(key => Number.isInteger(best.stats[key]) && best.stats[key] >= 0 && best.stats[key] <= 99);
}
type Dependencies = {
 enabled: () => boolean;
 user: () => Promise<{puid?: string} | null>;
 request: (path: string, method: 'GET' | 'POST', data?: Record<string, unknown>, auth?: boolean) => Promise<unknown>;
};

/** Client submits only a server-verifiable progress reference, never scores or identity. */
export function createGymLeaderboardClient(deps: Dependencies) {
 let message = '', pending = false;
 const listeners = new Set<() => void>();
 const update = (next: string) => {message = next; listeners.forEach(listener => listener());};
 const assertEnabled = () => {if (!deps.enabled()) throw Error('排行榜服务尚未连接，本地球馆进度已保留');};
 return {
  subscribe: (listener: () => void) => {listeners.add(listener); return () => {listeners.delete(listener);};},
  getMessage: () => message,
  async sync(reference: GymRankReference) {
   assertEnabled();
   if (pending) throw Error('成绩正在同步，请稍候');
   if (!/^\d{1,16}-\d{1,10}$/.test(reference.runId) || !Number.isSafeInteger(reference.revision) || reference.revision < 0) throw Error('球馆进度标识无效');
   pending = true;
   try {
    const user = await deps.user();
    if (!user?.puid) {update('登录虎扑后可查看个人排名并同步成绩'); return false;}
    const receipt = await deps.request('/leaderboard/submit', 'POST', {event: 'gym-progress', runId: reference.runId, revision: reference.revision}, true) as {accepted?: boolean};
    if ((await deps.user())?.puid !== user.puid) throw Error('虎扑账号已切换，请刷新排行榜');
    if (receipt?.accepted !== true) throw Error('排行同步尚未确认，本地进度已保留');
    update('最佳球员与声望成绩已同步'); return true;
   } catch (error) {update(error instanceof Error ? error.message : '排行同步失败，本地进度已保留'); throw error;}
   finally {pending = false;}
  },
  async list(board: GymBoard): Promise<GymRanking> {
   assertEnabled();
   if (!['player', 'fame'].includes(board)) throw Error('排行榜分类无效');
   const publicResult = await deps.request(`/leaderboard?board=${board}&limit=50`, 'GET') as {entries?: GymRankRow[]};
   if (!Array.isArray(publicResult?.entries) || publicResult.entries.length > 50 || !publicResult.entries.every(row => validRow(row, board))) throw Error('排行榜返回格式异常');
   const user = await deps.user();
   const personal = user?.puid ? await deps.request(`/leaderboard/me?board=${board}`, 'GET', undefined, true) as {me?: GymRanking['me']} : {me: null};
   if (!personal || personal.me === undefined || personal.me && (!Number.isSafeInteger(personal.me.rank) || personal.me.rank < 1 || !validRow(personal.me.entry, board))) throw Error('个人排名返回格式异常');
   if (user?.puid && (await deps.user())?.puid !== user.puid) throw Error('虎扑账号已切换，请刷新排行榜');
   return {entries: publicResult.entries, me: personal.me};
  },
 };
}

export async function gymLeaderboardRequest(path: string, method: 'GET' | 'POST', data?: Record<string, unknown>, auth = false, api?: HupuSdk['cloud']) {
 await ensureColorboxSdk(); assertHupuProject();
 const cloud = api ?? window.ColorboxAI?.cloud;
 if (!gymLeaderboardConfigured() || !cloud) throw Error('排行榜服务尚未连接，本地球馆进度已保留');
 if (!/^\/leaderboard(?:\/submit|\/me)?(?:\?board=(?:player|fame)(?:&limit=50)?)?$/.test(path)) throw Error('排行榜接口无效');
 const response = await sdkDeadline(cloud.request({url: gymLeaderboardConfig.apiBase + path, method, data, envId: gymLeaderboardConfig.envId, auth}), '排行请求超时，请稍后手动刷新');
 assertHupuProject();
 if (response.statusCode < 200 || response.statusCode >= 300 || ![0, 200].includes(response.code)) throw Error(response.message || '排行榜读取失败，请稍后重试');
 return response.data;
}
export const gymLeaderboard = createGymLeaderboardClient({enabled: gymLeaderboardConfigured, user: getHupuUser, request: gymLeaderboardRequest});
