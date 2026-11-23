import type {GymState} from '../game/gym/engine';
import {playerLevelCap} from '../game/gym/progression';
import {templateById} from '../game/templates';
import {statKeys, type Stats} from '../game/types';
import {getHupuUser} from './hupuAccount';
import {ensureColorboxSdk, sdkDeadline, type HupuSdk} from './hupuSdk';
import {assertHupuProject, hupuProject} from './hupuProject';
import leaderboardDeployment from '../../activity/leaderboard.manifest.json';

const gymBoards = ['player', 'fame', 'challenge'] as const;
export type GymBoard = typeof gymBoards[number];
export type GymRankPlayer = {playerId: string; templateId: string; value: string; level: number; stats: Stats};
export type GymRankRow = {id: string; coach: string; score: string; best: GymRankPlayer | null};
export type GymRanking = {entries: GymRankRow[]; me: {rank: number; entry: GymRankRow} | null; personalError?: string};
export type GymRankReference = {runId: string; revision: number};
const publishedLeaderboard = import.meta.env.PROD && leaderboardDeployment.deploymentStatus === 'active'
 && leaderboardDeployment.verification.deployedHealth && leaderboardDeployment.verification.realGateway;
export const gymLeaderboardConfig = Object.freeze({
 applicationId: hupuProject.applicationId,
 apiBase: String(import.meta.env.VITE_GYM_LEADERBOARD_API_BASE ?? (publishedLeaderboard ? leaderboardDeployment.publicBaseUrl : '') ?? '').replace(/\/$/, ''),
 envId: String(import.meta.env.VITE_GYM_LEADERBOARD_ENV_ID ?? (publishedLeaderboard ? leaderboardDeployment.envId : '') ?? ''),
});
export const gymRankReference = (state: GymState): GymRankReference => ({runId: `${state.createdAt}-${state.seed}`, revision: state.revision});
export const gymLeaderboardConfigured = () => /^https:\/\//.test(gymLeaderboardConfig.apiBase) && !!gymLeaderboardConfig.envId;
const score = (value: unknown): value is string => typeof value === 'string' && /^(0|[1-9]\d{0,159})$/.test(value);
function validRow(value: GymRankRow, board: GymBoard) {
 if (!value || typeof value.id !== 'string' || value.id.length > 200 || typeof value.coach !== 'string' || Array.from(value.coach).length > 60 || !score(value.score)) return false;
 const best = value.best;
 if (board === 'challenge') return best === null && Number.isSafeInteger(Number(value.score)) && Number(value.score)>0;
 if (board === 'fame') return best === null;
 return !!best && typeof best.playerId === 'string' && !!templateById(best.templateId) && score(best.value)
  && best.value === value.score && Number.isInteger(best.level) && best.level >= 0 && best.level <= playerLevelCap
  && !!best.stats && statKeys.every(key => Number.isInteger(best.stats[key]) && best.stats[key] >= 0 && best.stats[key] <= 99);
}
type Dependencies = {
 enabled: () => boolean;
 user: () => Promise<{puid?: string;nickname?: unknown} | null>;
 request: (path: string, method: 'GET' | 'POST', data?: Record<string, unknown>, auth?: boolean) => Promise<unknown>;
 localProgress?: () => Promise<{runId: string; revision: number; archive: string} | null>;
};

class GymRankingRequestError extends Error {
 constructor(message: string, readonly statusCode: number) {super(message);}
}

/** Presentation only: never use this nickname to establish account identity. */
export const cleanGymRankingNickname=(value:unknown)=>typeof value==='string'?Array.from(value
 .replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g,'')
 .replace(/[\ud800-\udfff]/gu,'').trim()).slice(0,60).join(''):'';

/** A progress reference and optional display nickname; never client scores or identity. */
export function createGymLeaderboardClient(deps: Dependencies) {
 let message = '', pending: {reference: GymRankReference; result: Promise<boolean>} | null = null;
 const freshBoards = new Set<GymBoard>();
 const listeners = new Set<() => void>();
 const update = (next: string) => {message = next; listeners.forEach(listener => listener());};
 const assertEnabled = () => {if (!deps.enabled()) throw Error('排行榜服务尚未连接，本地球馆进度已保留');};
 function sync(reference: GymRankReference): Promise<boolean> {
   if (!/^\d{1,16}-\d{1,10}$/.test(reference.runId) || !Number.isSafeInteger(reference.revision) || reference.revision < 0) return Promise.reject(Error('球馆进度标识无效'));
   if (pending) {
    if (pending.reference.runId===reference.runId && pending.reference.revision>=reference.revision) return pending.result;
    // Wait for the previous upload, then read the latest archived progress.
    // Joining an older request would leave an already cleared stage unsubmitted.
    const next = () => sync(reference);
    return pending.result.then(next,next);
   }
   const task = (async () => {
   assertEnabled();
   try {
    const user = await deps.user();
    if (!user?.puid) {update('登录虎扑后可查看个人排名并同步成绩'); return false;}
    const nickname=cleanGymRankingNickname(user.nickname);
    const local = await deps.localProgress?.();
    if ((await deps.user())?.puid !== user.puid) throw Error('虎扑账号已切换，请刷新排行榜');
    const receipt = await deps.request('/leaderboard/submit', 'POST', local
     ? {event: 'gym-local-progress', ...local, ...(nickname?{nickname}:{})}
     : {event: 'gym-progress', runId: reference.runId, revision: reference.revision,...(nickname?{nickname}:{})}, true) as {accepted?: boolean; source?: string};
    if ((await deps.user())?.puid !== user.puid) throw Error('虎扑账号已切换，请刷新排行榜');
    if (receipt?.accepted !== true || local && receipt.source !== 'local-validated') throw Error('排行同步尚未确认，本地进度已保留');
    for (const board of gymBoards) freshBoards.add(board);
    update('球馆排行成绩已同步'); return true;
   } catch (error) {update(error instanceof Error ? error.message : '排行同步失败，本地进度已保留'); throw error;}
   })();
   pending = {reference,result:task};
   const clear = () => {if (pending?.result === task) pending = null;};
   void task.then(clear, clear);
   return task;
 }
 return {
  subscribe: (listener: () => void) => {listeners.add(listener); return () => {listeners.delete(listener);};},
  getMessage: () => message,
  sync,
  async list(board: GymBoard): Promise<GymRanking> {
   assertEnabled();
   if (!gymBoards.includes(board)) throw Error('排行榜分类无效');
   // Old clients reject an entire response when one player is above level 99.
   const levels = board === 'player' ? '&levels=extended' : '';
   let publicResult: {entries?: GymRankRow[]};
   try {
    publicResult = await deps.request(`/leaderboard?board=${board}${levels}&limit=50${freshBoards.has(board)?'&fresh=1':''}`, 'GET') as {entries?: GymRankRow[]};
   } catch (error) {
    if (board==='challenge' && error instanceof GymRankingRequestError && error.statusCode===400) {
     // Older gateways reject the new board parameter. Only show the rollout
     // message when the same project's advertised boards confirm it is absent.
     const health = await deps.request('/health','GET').catch(()=>null) as {applicationId?: unknown; boards?: unknown}|null;
     if (health?.applicationId===hupuProject.applicationId && Array.isArray(health.boards) &&
         health.boards.includes('player') && health.boards.includes('fame') && !health.boards.includes('challenge')) throw Error('挑战榜暂未开放，请稍后刷新');
    }
    throw error;
   }
   if (!Array.isArray(publicResult?.entries) || publicResult.entries.length > 50 || !publicResult.entries.every(row => validRow(row, board))) throw Error('排行榜返回格式异常');
   freshBoards.delete(board);
   try {
    const user = await deps.user();
    let profileError='';
    const nickname=cleanGymRankingNickname(user?.nickname);
    if(user?.puid&&nickname){
     try{
      const acknowledgement=await deps.request('/leaderboard/submit','POST',{event:'gym-profile',nickname},true) as {accepted?:boolean};
      if(acknowledgement?.accepted!==true)throw Error('profile not acknowledged');
     }catch{profileError='昵称暂未同步，请稍后刷新；公开榜单仍可查看。';}
    }
    const personal = user?.puid ? await deps.request(`/leaderboard/me?board=${board}${levels}`, 'GET', undefined, true) as {me?: GymRanking['me']} : {me: null};
    if (!personal || personal.me === undefined || personal.me && (!Number.isSafeInteger(personal.me.rank) || personal.me.rank < 1 || !validRow(personal.me.entry, board))) throw Error('个人排名返回格式异常');
    if (user?.puid && (await deps.user())?.puid !== user.puid) throw Error('虎扑账号已切换，请刷新个人排名');
    // The public response may predate the authenticated display-name update.
    // Match only the server's public row ID; never expose or compare a PUID.
    const entries=personal.me?publicResult.entries.map(row=>row.id===personal.me!.entry.id?{...row,coach:personal.me!.entry.coach}:row):publicResult.entries;
    return {entries, me: personal.me,...(profileError?{personalError:profileError}:{})};
   } catch {
    // Public scores do not require an account. A failed/changed identity must
    // hide private results without discarding a successfully validated board.
    return {entries: publicResult.entries, me: null, personalError: '个人排名暂不可用，请刷新重试；公开榜单仍可查看。'};
   }
  },
 };
}

export async function gymLeaderboardRequest(path: string, method: 'GET' | 'POST', data?: Record<string, unknown>, auth = false, api?: HupuSdk['cloud']) {
 await ensureColorboxSdk(); assertHupuProject();
 const cloud = api ?? window.ColorboxAI?.cloud;
 if (!gymLeaderboardConfigured() || !cloud) throw Error('排行榜服务尚未连接，本地球馆进度已保留');
 const health = path==='/health' && method==='GET' && !auth && data===undefined;
 if (!health && !/^\/leaderboard(?:\/submit|\/me)?(?:\?board=(?:player(?:&levels=extended)?|fame|challenge)(?:&limit=50(?:&fresh=1)?)?)?$/.test(path)) throw Error('排行榜接口无效');
 const response = await sdkDeadline(cloud.request({url: gymLeaderboardConfig.apiBase + path, method, data, envId: gymLeaderboardConfig.envId, auth}), '排行请求超时，请稍后手动刷新');
 assertHupuProject();
 if (response.statusCode < 200 || response.statusCode >= 300 || ![0, 200].includes(response.code)) throw new GymRankingRequestError(response.message || '排行榜读取失败，请稍后重试',response.statusCode);
 return response.data;
}
export async function currentLocalGymRankingProgress() {
 // Load only when a score submission is requested. Importing the store at
 // module initialization would create a leaderboard/store bootstrap cycle.
 const [{useGym}, {exportGymCloudArchive, parseGymCloudArchive}] = await Promise.all([import('../gymStore'), import('./gymCloudArchive')]);
 if (useGym.getState().debugSessionActive) throw Error('独立测试球馆不参与排行榜，请先恢复正式球馆');
 if (useGym.getState().authorityMode !== 'local') return null;
 const archive = await exportGymCloudArchive(useGym);
 if (useGym.getState().debugSessionActive) throw Error('独立测试球馆不参与排行榜，请先恢复正式球馆');
 const {state} = parseGymCloudArchive(archive);
 return {...gymRankReference(state), archive};
}
export const gymLeaderboard = createGymLeaderboardClient({enabled: gymLeaderboardConfigured, user: getHupuUser, request: gymLeaderboardRequest, localProgress: currentLocalGymRankingProgress});
