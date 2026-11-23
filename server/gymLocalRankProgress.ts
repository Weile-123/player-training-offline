import {createHash} from 'node:crypto';
import {parseGymCloudArchive} from '../src/platform/gymCloudArchive';
import {playerValue} from '../src/game/gym/engine';
import {challengeBest,challengeFamePerStage} from '../src/game/gym/challenge';
import {templateById} from '../src/game/templates';
import type {GymRankPlayer} from '../src/platform/gymLeaderboard';

/** Local-first scores have a separate provenance. This validates a portable
 * game checkpoint and derives scores; it does not claim replayed server history. */
export function validateLocalGymRankingArchive(raw: unknown, reference: {runId: string; revision: number}, now = Date.now()) {
 if (typeof window !== 'undefined' || typeof raw !== 'string') throw Error('球馆成绩档案无效');
 const {archive, state} = parseGymCloudArchive(raw);
 if (reference.runId !== `${state.createdAt}-${state.seed}` || reference.revision !== state.revision
  || state.updatedAt > now + 300_000 || archive.uploadedAt > now + 300_000) throw Error('球馆成绩与当前档案不一致');
 const players = [...(state.player ? [state.player] : []), ...state.bench, ...state.alumni];
 const ids = new Set(players.map(player => player.id));
 if (ids.size !== players.length || state.nextPlayer < players.length + 1) throw Error('球馆球员记录不完整');
 const archivedFame = state.alumni.reduce((sum, player) => sum + BigInt(player.rewardFame), 0n);
 const recommended = BigInt(state.nextPlayer - 1 - (state.player ? 1 : 0) - state.bench.length);
 // Unmatched recommendations are deliberately absent from alumni. They may
 // still earn cooperation fame, so do not replace legitimate fame with the
 // alumni sum. The engine's maximum growth/course/brand/cooperation is <1000.
 const challenge = challengeBest(state.challenge);
 const businessFame=BigInt(state.fame)-BigInt(challenge)*BigInt(challengeFamePerStage);
 if (businessFame < archivedFame || businessFame > recommended * 1000n) throw Error('球馆声望与推荐记录不一致');
 let best: GymRankPlayer | null = null;
 for (const player of players) {
  if (!templateById(player.templateId)) continue;
  let value: string;
  if ('finalValue' in player) {
   if (typeof player.finalValue !== 'string' || !/^(0|[1-9]\d{0,159})$/.test(player.finalValue)) throw Error('球员身价超过排行支持范围');
   const saved = BigInt(player.finalValue), base = 320n * BigInt(player.level + 1) ** 3n;
   // Validate a historical value against the same level/brand formula. Gear at
   // retirement can differ from today's loadout; old legal brand effects went
   // up to 280%, so infer that bounded integer percentage rather than applying
   // today's gear or trusting an arbitrary decimal score.
   const guess = saved * 100n / base - 100n;
   const percentage = [guess, guess + 1n].find(p => p >= 0n && p <= 280n && base * (100n + p) / 100n === saved);
   if (percentage === undefined) throw Error('校友最终身价与培养等级不一致');
   value = (base * (100n + percentage) / 100n).toString();
  } else value = playerValue(state, player);
  if (!/^(0|[1-9]\d{0,159})$/.test(value)) throw Error('球员身价超过排行支持范围');
  // A completed record can include the equipment effects at recommendation,
  // which cannot be reconstructed from today's equipment. Its saved final
  // value is part of the checked historical business record, not a score field.
  if (!best || BigInt(value) > BigInt(best.value)) best = {playerId: player.id, templateId: player.templateId!, value, level: player.level, stats: {...player.stats}};
 }
 const content = JSON.stringify(state);
 return {runId: reference.runId, revision: state.revision, updatedAt: state.updatedAt,
  evidenceId: createHash('sha256').update(content).digest('hex'), source: 'local-validated' as const,
  fame: state.fame, challenge, best};
}
