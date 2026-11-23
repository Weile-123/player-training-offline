import {afterEach, expect, it, vi} from 'vitest';
import {cleanGymRankingNickname,createGymLeaderboardClient, gymRankReference, type GymRankRow} from './gymLeaderboard';
import {newGym} from '../game/gym/engine';
import {playerLevelCap} from '../game/gym/progression';
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
 expect(client.getMessage()).toBe('球馆排行成绩已同步');
});
it('uploads the current SDK nickname as display data with a progress reference, never a client identity or score',async()=>{
 const request=vi.fn().mockResolvedValue({accepted:true});
 const client=createGymLeaderboardClient({enabled:()=>true,user:async()=>({puid:'private-owner',nickname:'  J\u0000R球迷\u202e🏀  '}),request});
 await client.sync(reference);
 expect(request).toHaveBeenCalledExactlyOnceWith('/leaderboard/submit','POST',{event:'gym-progress',...reference,nickname:'JR球迷🏀'},true);
});
it('cleans display controls and lone surrogates and caps nicknames by Unicode code points',()=>{
 const nickname=cleanGymRankingNickname(' \ud800\u0085\u2066'+ '🏀'.repeat(70)+'\u2069 ');
 expect(Array.from(nickname)).toHaveLength(60);expect(nickname).toBe('🏀'.repeat(60));
 expect(cleanGymRankingNickname({nickname:'not-a-string'})).toBe('');expect(cleanGymRankingNickname('\u0000\u202e ')).toBe('');
});
it('repairs the signed-in user’s cached public display name by public row ID after profile sync and personal read',async()=>{
 const mine={...fameRow,coach:'虎扑训练师'},other={...fameRow,id:'another-public-row',coach:'另一位用户'};
 const renamed={...mine,coach:'真实虎扑昵称'};
 const request=vi.fn(async(path:string)=>path.includes('/submit')?{accepted:true,updated:2}:path.includes('/me?')?{me:{rank:1,entry:renamed}}:{entries:[mine,other]});
 const client=createGymLeaderboardClient({enabled:()=>true,user:async()=>({puid:'private-owner',nickname:'真实虎扑昵称'}),request});
 expect(await client.list('fame')).toEqual({entries:[renamed,other],me:{rank:1,entry:renamed}});
 expect(request.mock.calls).toEqual([
  ['/leaderboard?board=fame&limit=50','GET'],
  ['/leaderboard/submit','POST',{event:'gym-profile',nickname:'真实虎扑昵称'},true],
  ['/leaderboard/me?board=fame','GET',undefined,true],
 ]);
 expect(mine.coach).toBe('虎扑训练师');
});
it.each(['request-failed','unacknowledged'])('preserves public and personal results when display-name sync is unavailable (%s)',async failure=>{
 const request=vi.fn(async(path:string)=>{
  if(path.includes('/submit')){if(failure==='request-failed')throw Error('profile unavailable');return{accepted:false};}
  return path.includes('/me?')?{me:{rank:1,entry:fameRow}}:{entries:[fameRow]};
 });
 const client=createGymLeaderboardClient({enabled:()=>true,user:async()=>({puid:'owner',nickname:'我的昵称'}),request});
 expect(await client.list('fame')).toEqual({entries:[fameRow],me:{rank:1,entry:fameRow},personalError:expect.stringContaining('昵称暂未同步')});
});
it('does not invent a ranking entry when profile sync succeeds without any existing scores',async()=>{
 const request=vi.fn(async(path:string,_method:'GET'|'POST',_data?:Record<string,unknown>,_auth?:boolean)=>path.includes('/submit')?{accepted:true,updated:0}:path.includes('/me?')?{me:null}:{entries:[]});
 const client=createGymLeaderboardClient({enabled:()=>true,user:async()=>({puid:'owner',nickname:'JR'}),request});
 expect(await client.list('player')).toEqual({entries:[],me:null});
 expect(request.mock.calls.find(([path])=>String(path).includes('/submit'))?.[2]).toEqual({event:'gym-profile',nickname:'JR'});
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
it('preserves big integer player values and reads the extended public and personal ranks', async () => {
 const extendedRow = {...playerRow, best: {...playerRow.best!, level: playerLevelCap}};
 const request = vi.fn(async (path: string) => path.includes('/me?') ? {me: {rank: 1, entry: extendedRow}} : {entries: [extendedRow]});
 const client = createGymLeaderboardClient({enabled: () => true, user: async () => ({puid: 'one'}), request});
 const data = await client.list('player');
 expect(data.me?.entry.score).toBe('12345678901234567890');
 expect(data.me?.entry.best?.level).toBe(2000);
 expect(request.mock.calls).toEqual([['/leaderboard?board=player&levels=extended&limit=50', 'GET'], ['/leaderboard/me?board=player&levels=extended', 'GET', undefined, true]]);
});
it('hides stale personal data but preserves public scores after an account switch; submission still rejects', async () => {
 const user = vi.fn().mockResolvedValueOnce({puid: 'one'}).mockResolvedValue({puid: 'two'});
 const request = vi.fn(async (path: string) => path.includes('/submit') ? {accepted: true} : path.includes('/me?') ? {me: {rank: 1, entry: fameRow}} : {entries: [fameRow]});
 const client = createGymLeaderboardClient({enabled: () => true, user, request});
 expect(await client.list('fame')).toEqual({entries: [fameRow], me: null, personalError: expect.stringContaining('个人排名暂不可用')});
 user.mockReset().mockResolvedValueOnce({puid: 'one'}).mockResolvedValue({puid: 'two'});
 await expect(client.sync(reference)).rejects.toThrow('账号已切换');
});
it('preserves public results when the account query fails without making a private request', async () => {
 const request = vi.fn().mockResolvedValue({entries: [fameRow]});
 const client = createGymLeaderboardClient({enabled: () => true, user: async () => {throw Error('account offline');}, request});
 expect(await client.list('fame')).toEqual({entries: [fameRow], me: null, personalError: expect.stringContaining('公开榜单仍可查看')});
 expect(request).toHaveBeenCalledExactlyOnceWith('/leaderboard?board=fame&limit=50', 'GET');
});
it.each(['request-failed', 'invalid-result'])('preserves public scores when personal ranking is unavailable (%s)', async failure => {
 const request = vi.fn(async (path: string) => {
  if (!path.includes('/me?')) return {entries: [playerRow]};
  if (failure === 'request-failed') throw Error('personal offline');
  return {me: {rank: -1, entry: playerRow}};
 });
 const client = createGymLeaderboardClient({enabled: () => true, user: async () => ({puid: 'one'}), request});
 expect(await client.list('player')).toEqual({entries: [playerRow], me: null, personalError: expect.stringContaining('个人排名暂不可用')});
});
it('still rejects a failed public request before looking up an account', async () => {
 const user = vi.fn(), request = vi.fn().mockRejectedValue(Error('public offline'));
 const client = createGymLeaderboardClient({enabled: () => true, user, request});
 await expect(client.list('fame')).rejects.toThrow('public offline'); expect(user).not.toHaveBeenCalled();
});
it.each([{entries: Array(51).fill(fameRow)}, {entries: [{...fameRow, score: 'NaN'}]}, {entries: [{...fameRow, score: '-1'}]}, {}])('rejects malformed/oversized public results (%j)', async response => {
 const client = createGymLeaderboardClient({enabled: () => true, user: async () => null, request: async () => response});
 await expect(client.list('fame')).rejects.toThrow('格式异常');
});
it.each([
 {...playerRow, best: null},
 {...playerRow, best: {...playerRow.best!, value: '99'}},
 {...playerRow, best: {...playerRow.best!, level: playerLevelCap + 1}},
 {...playerRow, best: {...playerRow.best!, level: 100.5}},
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
 expect(request).toHaveBeenCalledOnce(); expect(client.getMessage()).not.toBe('球馆排行成绩已同步');
});
it('joins simultaneous submissions so a rank-page refresh waits for a pending home submission, and releases after failure', async () => {
 let reject!: (reason: unknown) => void;
 const request = vi.fn().mockImplementationOnce(() => new Promise((_, fail) => {reject = fail;})).mockResolvedValue({accepted: true});
 const client = createGymLeaderboardClient({enabled: () => true, user: async () => ({puid: 'one'}), request});
 const first = client.sync(reference); for(let index=0;index<5;index++)await Promise.resolve();
 expect(client.sync(reference)).toBe(first);
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
 await expect(gymLeaderboardRequest('/leaderboard?board=player&levels=extended&limit=50&fresh=1', 'GET', undefined, false, {request})).resolves.toEqual({entries: []});
 expect(request).toHaveBeenCalledWith({url: 'https://current-project.example/api/leaderboard?board=fame&limit=50', method: 'GET', data: undefined, envId: 'current-project-env', auth: false});
 for (const response of [{statusCode: 403, code: 0, message: '无权限'}, {statusCode: 200, code: 500, message: '维护中'}]) {
  request.mockResolvedValue(response); await expect(gymLeaderboardRequest('/leaderboard', 'GET', undefined, false, {request})).rejects.toThrow(response.message);
 }
 await expect(gymLeaderboardRequest('/other-app/submit', 'POST', {}, true, {request})).rejects.toThrow('接口无效');
 expect(request).toHaveBeenCalledTimes(4);
});
