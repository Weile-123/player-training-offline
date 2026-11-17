import type {GymAlumnus} from '../game/gym/engine';

export type GymAlumniGroup = {key: string; count: number; player: GymAlumnus};
export type GymAlumniLoader = (offset?: number, limit?: number) => Promise<{players: GymAlumnus[]; total: number}>;

/** Keep one latest archive per final template. Legacy records without a template stay distinct. */
export function groupGymAlumni(players: GymAlumnus[]): GymAlumniGroup[] {
  const groups = new Map<string, GymAlumniGroup>();
  for (const player of players) {
    const key = player.templateId ? `template:${player.templateId}` : `player:${player.id}`;
    const existing = groups.get(key);
    if (!existing) groups.set(key, {key, count: 1, player});
    else {
      existing.count++;
      if (player.recommendedAt > existing.player.recommendedAt) existing.player = player;
    }
  }
  return [...groups.values()].sort((first, second) => second.player.recommendedAt - first.player.recommendedAt);
}

/** Read both hot and archived pages before grouping, so counts never stop at a page boundary. */
export async function loadAllGymAlumni(load: GymAlumniLoader): Promise<GymAlumnus[]> {
  const players: GymAlumnus[] = [];
  let total = 0;
  do {
    const page = await load(players.length, 100);
    if (players.length && page.total !== total) throw new Error('alumni-changed');
    total = page.total;
    if (page.players.length !== Math.min(100, Math.max(0, total - players.length))) throw new Error('alumni-incomplete');
    players.push(...page.players);
  } while (players.length < total);
  return players;
}
