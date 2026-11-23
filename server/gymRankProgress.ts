import {playerValue, type GymAlumnus, type GymState} from '../src/game/gym/engine';
import {playerLevelCap} from '../src/game/gym/progression';
import {challengeBest} from '../src/game/gym/challenge';
import {validGym} from '../src/game/gym/save';
import {templateById} from '../src/game/templates';
import {statKeys} from '../src/game/types';
import activity from '../hupu-skills/activity.json';
import type {GymRankPlayer} from '../src/platform/gymLeaderboard';

type VerifiedBinding = {applicationId: string; actor: string; runId: string};
type Input = {binding: VerifiedBinding; evidenceId: string; state: GymState; alumni?: readonly GymAlumnus[]; previousBest?: GymRankPlayer | null};
/** Trusted backend entry only. Never register this as a client-supplied snapshot route.
 * Call after an authenticated server settlement has committed its canonical state,
 * using that transaction's actor binding and unique verified evidence identifier.
 */
export function verifiedGymRankingProgress({binding, evidenceId, state, alumni = state.alumni, previousBest = null}: Input) {
 if (alumni.length !== state.alumni.length + (state.alumniArchive?.count ?? 0)) throw Error('Complete verified alumni history is required');
 return rankingProgress({binding, evidenceId, state, alumni, previousBest});
}

function rankingProgress({binding, evidenceId, state, alumni = state.alumni, previousBest = null}: Input) {
 if (typeof window !== 'undefined') throw Error('Verified ranking progress is server-only');
 if (binding.applicationId !== activity.activityId || !binding.actor || binding.runId !== `${state.createdAt}-${state.seed}` || !/^[A-Za-z0-9_:-]{1,128}$/.test(evidenceId) || !validGym(state)) throw Error('Invalid trusted gym progress');
 const candidates: GymRankPlayer[] = [];
 if (previousBest) candidates.push(previousBest);
 const add = (player: NonNullable<GymState['player']>, value: string) => {
  if (!templateById(player.templateId)) return;
  candidates.push({playerId: player.id, templateId: player.templateId!, value, level: player.level, stats: {...player.stats}});
 };
 for (const player of [state.player, ...state.bench]) if (player) add(player, playerValue(state, player));
 for (const player of alumni) add(player, player.finalValue);
 for (const player of candidates) {
  if (!templateById(player.templateId) || !/^(0|[1-9]\d{0,159})$/.test(player.value) || !Number.isInteger(player.level) || player.level < 0 || player.level > playerLevelCap || !statKeys.every(key => Number.isInteger(player.stats[key]) && player.stats[key] >= 0 && player.stats[key] <= 99)) throw Error('Invalid previous verified player record');
 }
 const best = candidates.reduce<GymRankPlayer | null>((record, player) => !record || BigInt(player.value) > BigInt(record.value) ? player : record, null);
 return {puid:binding.actor, runId:binding.runId, revision:state.revision, evidenceId, fame:state.fame,
  challenge:challengeBest(state.challenge), best:best?structuredClone(best):null};
}

export type VerifiedGymRankingProgress = ReturnType<typeof verifiedGymRankingProgress>;

export type AuthorityGymRankingProgress = Omit<VerifiedGymRankingProgress, 'challenge'> & {historyCount:number; challenge?:number};
type CanonicalRankingDocument = {
 applicationId: string; actorId: string; provenance: 'server-created' | 'legacy-unverified' | null;
 state: GymState | null; ranking?: AuthorityGymRankingProgress | null;
};

/** Called inside the authority settlement transaction, before alumni compaction.
 * Imported saves never become trusted merely by spending time on the server.
 * The previous checkpoint has already inspected archived players, so retaining
 * its best avoids reloading unbounded cold history on every training action.
 */
export function buildAuthorityGymRankingProgress(document: CanonicalRankingDocument, evidenceId: string): AuthorityGymRankingProgress | null {
 if (document.provenance !== 'server-created' || !document.state) return null;
 const state = document.state, runId = `${state.createdAt}-${state.seed}`, previous = document.ranking;
 if (document.applicationId !== activity.activityId || !validGym(state)) throw Error('Invalid canonical ranking state');
 if (previous && (previous.puid !== document.actorId || previous.runId !== runId || previous.revision > state.revision
  || !Number.isSafeInteger(previous.historyCount) || previous.historyCount < 0)) throw Error('Invalid ranking checkpoint binding');
 const archived = state.alumniArchive?.count ?? 0;
 if (archived > (previous?.historyCount ?? 0)) throw Error('Verified ranking history checkpoint is incomplete');
 const progress = rankingProgress({
  binding: {applicationId: document.applicationId, actor: document.actorId, runId}, evidenceId,
  // The previous trusted maximum covers cold records; referral counts still
  // need validation against the complete canonical state.
  state, alumni: state.alumni, previousBest: previous?.best,
 });
 if (previous?.revision === state.revision) {
  if (previous.fame !== progress.fame || previous.challenge !== undefined && previous.challenge !== progress.challenge
    || JSON.stringify(previous.best) !== JSON.stringify(progress.best)) throw Error('Ranking changed without a canonical revision');
  return {...structuredClone(previous),challenge:progress.challenge};
 }
 return {...progress, historyCount: state.alumni.length + archived};
}
