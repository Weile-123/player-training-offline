import {createRequire} from 'node:module';
import {expect, it, vi} from 'vitest';
import {newGym} from '../src/game/gym/engine';
import {templateRules} from '../src/game/contract/templates';
import {buildAuthorityGymRankingProgress, verifiedGymRankingProgress} from '../server/gymRankProgress';
import {gzipSync} from 'node:zlib';
import {createCloudBaseGatewayAuthenticator} from '../server/gymCloudBaseAdapter.mjs';
const {createHandler, identity} = createRequire(import.meta.url)('../activity/cloudfunctions/activity_api/rankings.cjs');
const context = (user = 'one', nickname = '训练师') => Buffer.from(JSON.stringify({customUserId: user, nickname, applicationId: 'app_847cdb589a'})).toString('base64');
const reference = {event: 'gym-progress', runId: '1800000000000-23', revision: 42};

it('uses only gateway identity and a verified progress reference for score submission', async () => {
 const rpc = vi.fn().mockResolvedValue({accepted: true}), handler = createHandler({rpc});
 expect(await handler({method: 'POST', path: '/leaderboard/submit', context: context(), body: reference})).toEqual({accepted: true});
 expect(rpc).toHaveBeenCalledExactlyOnceWith('submit_gym_rank', {p_puid: 'one', p_name: '训练师', p_run: reference.runId, p_revision: 42});
});
it.each([{...reference, puid: 'victim'}, {...reference, score: '99999999'}, {...reference, best: {}}, {...reference, nickname: {puid:'victim'}}, {...reference, revision: -1}, {...reference, runId: '../other'}, {...reference, event: 'career-finished'}])('rejects self-reported identities and scores (%j)', async body => {
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
 let now = 0; const rpc = vi.fn(async (name: string) => name === 'submit_gym_rank' ? {accepted: true} : {entries: []}), handler = createHandler({rpc, now: () => now});
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

it('keeps ranking and authority gateway identities identical for opaque/numeric accounts and gzip contexts', async () => {
 const authenticate = createCloudBaseGatewayAuthenticator({GYM_AUTHORITY_AUTH_MODE: 'cloudbase-gateway', BUSINESS_ACTIVITY_ID: 'app_847cdb589a'}, 'app_847cdb589a');
 for (const payload of [{customUserId: 'opaque-account:one'}, {uid: 123456}, {userId: 'cloud-user', nickname: '教练'}, {customUserId: 'cloud-id', uid: 'other'}]) {
  for (const compressed of [false, true]) {
   const bytes = Buffer.from(JSON.stringify({...payload, applicationId: 'app_847cdb589a'}));
   const raw = (compressed ? gzipSync(bytes) : bytes).toString('base64');
   const authority = await authenticate({headers: {'x-cloudbase-context': raw}});
   const ranking = identity(raw);
   expect(ranking.puid).toBe(authority.id);
   if('nickname' in payload)expect(ranking.name).toBe(authority.name);
   else expect(ranking.name).toBe('');
  }
 }
});
it.each(['', 'not base64', Buffer.from('[]').toString('base64'), ...[{uid: ' a'}, {uid: 'bad\nname'}, {uid: 1.5}, {uid: 'one', applicationId: 'another-project'}].map(value => Buffer.from(JSON.stringify(value)).toString('base64'))])('rejects malformed gateway contexts (%s)', raw => {
 expect(() => identity(raw)).toThrow('请先登录');
});
it('refuses a malformed database acknowledgement instead of claiming sync succeeded', async () => {
 const handler = createHandler({rpc: async () => ({accepted: false})});
 await expect(handler({method: 'POST', path: '/leaderboard/submit', context: context(), body: reference})).rejects.toMatchObject({statusCode: 503});
});
function canonicalFixture() {
 const {state, evidenceId} = fixture();
 return {doc: {applicationId: 'app_847cdb589a', actorId: 'trusted-cloud-account', provenance: 'server-created' as const, state}, evidenceId};
}
it('excludes imported legacy gyms from ranking even when their local scores and existing checkpoint are high', () => {
 const {doc, evidenceId} = canonicalFixture();
 const ranking = buildAuthorityGymRankingProgress(doc, evidenceId)!;
 expect(buildAuthorityGymRankingProgress({...doc, provenance: 'legacy-unverified', ranking}, 'next-receipt')).toBeNull();
 expect(buildAuthorityGymRankingProgress({...doc, state: null}, evidenceId)).toBeNull();
 expect(ranking).toMatchObject({puid: doc.actorId, fame: 2500, historyCount: 0, evidenceId});
});
it('retains the already verified best when alumni move to cold storage without reading all historical players', () => {
 const {doc, evidenceId} = canonicalFixture(), player = doc.state.player!;
 doc.state.alumni = [{...structuredClone(player), id: 'gym-retired', recommendedAt: doc.state.updatedAt, rewardCredits: 0, rewardFame: 0, finalValue: '999999999999999999'}];
 const before = buildAuthorityGymRankingProgress(doc, evidenceId)!;
 expect(before.best?.value).toBe('999999999999999999'); expect(before.historyCount).toBe(1);
 const next = structuredClone(doc.state); next.revision++; next.alumni = [];
 next.alumniArchive = {id: 'cold-history', count: 1, effectiveCount: 0, legendCount: 0, bestTier: 0};
 const after = buildAuthorityGymRankingProgress({...doc, state: next, ranking: before}, 'receipt-next')!;
 expect(after.best).toEqual(before.best); expect(after.historyCount).toBe(1);
 expect(next.alumniArchive.count).toBe(1);
 expect(() => buildAuthorityGymRankingProgress({...doc, state: next}, 'missing-checkpoint')).toThrow('checkpoint is incomplete');
});
it('binds a checkpoint to the same actor/run and prevents changing evidence or scores without a revision', () => {
 const {doc, evidenceId} = canonicalFixture(), ranking = buildAuthorityGymRankingProgress(doc, evidenceId)!;
 expect(buildAuthorityGymRankingProgress({...doc, ranking}, 'another-receipt')).toEqual(ranking);
 for (const invalid of [{...ranking, puid: 'another-account'}, {...ranking, runId: 'another-run'}, {...ranking, revision: ranking.revision + 1}]) {
  expect(() => buildAuthorityGymRankingProgress({...doc, ranking: invalid}, 'next')).toThrow('checkpoint binding');
 }
 doc.state.fame++;
 expect(() => buildAuthorityGymRankingProgress({...doc, ranking}, 'changed')).toThrow('without a canonical revision');
});
