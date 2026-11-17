import {createRequire} from 'node:module';
import {expect, it, vi} from 'vitest';
import {newGym} from '../src/game/gym/engine';
import {templateRules} from '../src/game/contract/templates';
import {verifiedGymRankingProgress} from '../server/gymRankProgress';
const {createHandler, identity} = createRequire(import.meta.url)('../activity/cloudfunctions/activity_api/rankings.cjs');
const context = (user = 'one', nickname = '训练师') => Buffer.from(JSON.stringify({customUserId: user, nickname, applicationId: 'app_847cdb589a'})).toString('base64');
const reference = {event: 'gym-progress', runId: '1800000000000-23', revision: 42};

it('uses only gateway identity and a verified progress reference for score submission', async () => {
 const rpc = vi.fn().mockResolvedValue({accepted: true}), handler = createHandler({rpc});
 expect(await handler({method: 'POST', path: '/leaderboard/submit', context: context(), body: reference})).toEqual({accepted: true});
 expect(rpc).toHaveBeenCalledExactlyOnceWith('submit_gym_rank', {p_puid: 'one', p_name: '训练师', p_run: reference.runId, p_revision: 42});
});
it.each([{...reference, puid: 'victim'}, {...reference, score: '99999999'}, {...reference, best: {}}, {...reference, nickname: 'other'}, {...reference, revision: -1}, {...reference, runId: '../other'}, {...reference, event: 'career-finished'}])('rejects self-reported identities and scores (%j)', async body => {
 const rpc = vi.fn(), handler = createHandler({rpc});
 await expect(handler({method: 'POST', path: '/leaderboard/submit', context: context(), body})).rejects.toMatchObject({statusCode: 400}); expect(rpc).not.toHaveBeenCalled();
});
it('requires gateway identity for personal reads and all submissions', async () => {
 const handler = createHandler({rpc: vi.fn()});
 await expect(handler({method: 'GET', path: '/leaderboard/me', query: {board: 'player'}})).rejects.toMatchObject({statusCode: 401});
 await expect(handler({method: 'POST', path: '/leaderboard/submit', body: reference})).rejects.toMatchObject({statusCode: 401});
 expect(() => identity(Buffer.from(JSON.stringify({customUserId: 'one', applicationId: 'old-game'})).toString('base64'))).toThrow('登录虎扑');
});
it('bounds public reads, caches briefly and invalidates after a verified submission', async () => {
 let now = 0; const rpc = vi.fn().mockResolvedValue({entries: []}), handler = createHandler({rpc, now: () => now});
 const query = {method: 'GET', path: '/leaderboard', query: {board: 'fame', limit: '50'}};
 await handler(query); await handler(query); expect(rpc).toHaveBeenCalledOnce();
 now = 3001; await handler(query); expect(rpc).toHaveBeenCalledTimes(2);
 await handler({method: 'POST', path: '/leaderboard/submit', context: context(), body: reference});
 await handler(query); expect(rpc).toHaveBeenCalledTimes(4);
 expect(rpc.mock.calls[0]).toEqual(['read_gym_rank', {p_board: 'fame', p_limit: 50, p_puid: null}]);
});
it.each([{board: 'endless'}, {board: 'player', limit: '101'}, {board: 'fame', limit: '0'}, {board: 'fame', puid: 'other'}])('rejects invalid public query (%j)', async query => {
 const handler = createHandler({rpc: vi.fn()}); await expect(handler({method: 'GET', path: '/leaderboard', query})).rejects.toMatchObject({statusCode: 400});
});
it('does not invent success when the canonical progress source is missing', async () => {
 const rpc = vi.fn().mockRejectedValue(Error('verified-progress-required')), handler = createHandler({rpc});
 await expect(handler({method: 'POST', path: '/leaderboard/submit', context: context(), body: reference})).rejects.toThrow('verified-progress-required'); expect(rpc).toHaveBeenCalledOnce();
});
function fixture() {
 const state = newGym(1_800_000_000_000, 23), template = templateRules.find(item => item.tier === 'rotation')!;
 state.player!.templateId = template.id; state.player!.highestTier = template.tier; state.player!.height = template.height[0];
 state.fame = 2500;
 return {state, binding: {applicationId: 'app_847cdb589a', actor: 'verified-user', runId: `${state.createdAt}-${state.seed}`}, evidenceId: 'verified-settlement-42'};
}
it('derives player value and fame from canonical state, retaining a higher earlier verified record', () => {
 const input = fixture(), result = verifiedGymRankingProgress(input);
 expect(result).toMatchObject({puid: 'verified-user', fame: 2500, best: {playerId: input.state.player!.id, templateId: input.state.player!.templateId, value: '320'}});
 const earlier = {...result.best!, value: '9999999999999999999'};
 expect(verifiedGymRankingProgress({...input, previousBest: earlier}).best?.value).toBe(earlier.value);
 expect(input.state.player).not.toHaveProperty('value');
});
it('rejects another project/run, invalid state or incomplete archived history', () => {
 const input = fixture();
 expect(() => verifiedGymRankingProgress({...input, binding: {...input.binding, applicationId: 'old-game'}})).toThrow('Invalid trusted');
 expect(() => verifiedGymRankingProgress({...input, binding: {...input.binding, runId: 'other-run'}})).toThrow('Invalid trusted');
 const malformed = {...input.state, fame: -1};
 expect(() => verifiedGymRankingProgress({...input, state: malformed})).toThrow('Invalid trusted');
 input.state.alumniArchive = {id: input.binding.runId, count: 1, effectiveCount: 0, legendCount: 0, bestTier: 0};
 expect(() => verifiedGymRankingProgress(input)).toThrow('Complete verified alumni');
});
