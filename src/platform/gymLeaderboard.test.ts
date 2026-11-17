import {afterEach, expect, it, vi} from 'vitest';
import {createGymLeaderboardClient, gymRankReference, type GymRankRow} from './gymLeaderboard';
import {newGym} from '../game/gym/engine';
import {nbaTemplates} from '../game/templates';

afterEach(() => {vi.unstubAllGlobals(); vi.unstubAllEnvs();});
const fameRow: GymRankRow = {id: 'rank-1', coach: '训练师', score: '2500', best: null};
const template = nbaTemplates[0];
const playerRow: GymRankRow = {id: 'rank-2', coach: '训练师', score: '12345678901234567890', best: {playerId: 'gym-p1', templateId: template.id, value: '12345678901234567890', level: 25, stats: {...template.stats}}};
const reference = {runId: '1800000000000-23', revision: 50};

it('submits only a canonical progress reference; scores and identity are not sent', async () => {
 const request = vi.fn().mockResolvedValue({accepted: true});
 const client = createGymLeaderboardClient({enabled: () => true, user: async () => ({puid: 'private-user'}), request});
 await expect(client.sync(reference)).resolves.toBe(true);
 expect(request).toHaveBeenCalledExactlyOnceWith('/leaderboard/submit', 'POST', {event: 'gym-progress', ...reference}, true);
 expect(client.getMessage()).toBe('最佳球员与声望成绩已同步');
});
it('keeps local references stable without imposing an end-of-career condition', () => {
 const state = newGym(1_800_000_000_000, 23);
 expect(gymRankReference(state)).toEqual({runId: '1800000000000-23', revision: 0});
});
it('does not query an account or issue requests before this project is configured', async () => {
 const user = vi.fn(), request = vi.fn(), client = createGymLeaderboardClient({enabled: () => false, user, request});
 await expect(client.sync(reference)).rejects.toThrow('尚未连接');
 await expect(client.list('player')).rejects.toThrow('尚未连接');
 expect(user).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled();
});
it('allows guests to read public fame rankings without a personal request', async () => {
 const request = vi.fn().mockResolvedValue({entries: [fameRow]});
 const client = createGymLeaderboardClient({enabled: () => true, user: async () => null, request});
 expect(await client.list('fame')).toEqual({entries: [fameRow], me: null});
 expect(request).toHaveBeenCalledExactlyOnceWith('/leaderboard?board=fame&limit=50', 'GET');
 await expect(client.sync(reference)).resolves.toBe(false);
 expect(client.getMessage()).toContain('登录虎扑');
});
it('preserves big integer player values and reads current-account personal ranking', async () => {
 const request = vi.fn(async (path: string) => path.includes('/me?') ? {me: {rank: 1, entry: playerRow}} : {entries: [playerRow]});
 const client = createGymLeaderboardClient({enabled: () => true, user: async () => ({puid: 'one'}), request});
 const data = await client.list('player');
 expect(data.me?.entry.score).toBe('12345678901234567890');
 expect(request.mock.calls).toEqual([['/leaderboard?board=player&limit=50', 'GET'], ['/leaderboard/me?board=player', 'GET', undefined, true]]);
});
it('rejects an account switch during personal lookup and submission', async () => {
 const user = vi.fn().mockResolvedValueOnce({puid: 'one'}).mockResolvedValue({puid: 'two'});
 const request = vi.fn(async (path: string) => path.includes('/submit') ? {accepted: true} : path.includes('/me?') ? {me: {rank: 1, entry: fameRow}} : {entries: [fameRow]});
 const client = createGymLeaderboardClient({enabled: () => true, user, request});
 await expect(client.list('fame')).rejects.toThrow('账号已切换');
 user.mockReset().mockResolvedValueOnce({puid: 'one'}).mockResolvedValue({puid: 'two'});
 await expect(client.sync(reference)).rejects.toThrow('账号已切换');
});
it.each([{entries: Array(51).fill(fameRow)}, {entries: [{...fameRow, score: 'NaN'}]}, {entries: [{...fameRow, score: '-1'}]}, {}])('rejects malformed/oversized public results (%j)', async response => {
 const client = createGymLeaderboardClient({enabled: () => true, user: async () => null, request: async () => response});
 await expect(client.list('fame')).rejects.toThrow('格式异常');
});
it.each([
 {...playerRow, best: null},
 {...playerRow, best: {...playerRow.best!, value: '99'}},
 {...playerRow, best: {...playerRow.best!, level: 100}},
 {...playerRow, best: {...playerRow.best!, templateId: 'unknown-template'}},
 {...playerRow, best: {...playerRow.best!, stats: {...template.stats, three: 100}}},
])('rejects invalid player snapshots (%j)', async row => {
 const client = createGymLeaderboardClient({enabled: () => true, user: async () => null, request: async () => ({entries: [row]})});
 await expect(client.list('player')).rejects.toThrow('格式异常');
});
it('never displays an unacknowledged submission as success and never retries implicitly', async () => {
 const request = vi.fn().mockResolvedValue({accepted: false});
 const client = createGymLeaderboardClient({enabled: () => true, user: async () => ({puid: 'one'}), request});
 await expect(client.sync(reference)).rejects.toThrow('未确认');
 expect(request).toHaveBeenCalledOnce(); expect(client.getMessage()).not.toBe('最佳球员与声望成绩已同步');
});
it('prevents simultaneous submissions and releases the lock after failure', async () => {
 let reject!: (reason: unknown) => void;
 const request = vi.fn().mockImplementationOnce(() => new Promise((_, fail) => {reject = fail;})).mockResolvedValue({accepted: true});
 const client = createGymLeaderboardClient({enabled: () => true, user: async () => ({puid: 'one'}), request});
 const first = client.sync(reference); await Promise.resolve();
 await expect(client.sync(reference)).rejects.toThrow('正在同步');
 const failure = expect(first).rejects.toThrow('offline'); reject(Error('offline')); await failure;
 await expect(client.sync(reference)).resolves.toBe(true); expect(request).toHaveBeenCalledTimes(2);
});
it.each([{runId: 'evil?score=100', revision: 1}, {runId: reference.runId, revision: -1}, {runId: reference.runId, revision: 1.5}])('validates references before requesting an account (%j)', async invalid => {
 const user = vi.fn(), request = vi.fn(), client = createGymLeaderboardClient({enabled: () => true, user, request});
 await expect(client.sync(invalid)).rejects.toThrow('标识无效'); expect(user).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled();
});
it('uses current project SDK cloud requests, checks HTTP and business errors, and rejects arbitrary paths', async () => {
 vi.resetModules(); vi.stubEnv('VITE_GYM_LEADERBOARD_API_BASE', 'https://current-project.example/api'); vi.stubEnv('VITE_GYM_LEADERBOARD_ENV_ID', 'current-project-env');
 vi.stubGlobal('window', {ColorboxAI: {}});
 const {gymLeaderboardRequest} = await import('./gymLeaderboard');
 const request = vi.fn().mockResolvedValue({statusCode: 200, code: 0, data: {entries: []}});
 await expect(gymLeaderboardRequest('/leaderboard?board=fame&limit=50', 'GET', undefined, false, {request})).resolves.toEqual({entries: []});
 expect(request).toHaveBeenCalledWith({url: 'https://current-project.example/api/leaderboard?board=fame&limit=50', method: 'GET', data: undefined, envId: 'current-project-env', auth: false});
 for (const response of [{statusCode: 403, code: 0, message: '无权限'}, {statusCode: 200, code: 500, message: '维护中'}]) {
  request.mockResolvedValue(response); await expect(gymLeaderboardRequest('/leaderboard', 'GET', undefined, false, {request})).rejects.toThrow(response.message);
 }
 await expect(gymLeaderboardRequest('/other-app/submit', 'POST', {}, true, {request})).rejects.toThrow('接口无效');
 expect(request).toHaveBeenCalledTimes(3);
});
