import {describe, expect, it} from 'vitest';
import {nbaTemplates} from '../templates';
import {alumniCount, alumniProgress, gymUpgrade, newGym, type GymAlumnus} from './engine';

function alumnus(sequence: number, templateId: string | null, grown = true): GymAlumnus {
  const player = newGym(1_000, sequence).player!;
  player.id = `gym-p${sequence}`;
  player.templateId = templateId;
  if (grown) player.stats.mid++;
  return {...player, recommendedAt: 1_000, rewardCredits: 0, rewardFame: 0, finalValue: '0'};
}

describe('bounded alumni progress summaries', () => {
  it('uses original positive growth and earned template gates, not the stored cash reward', () => {
    const state = newGym(1_000);
    state.alumni = [alumnus(2, 'caruso'), alumnus(3, 'duncan'), alumnus(4, 'duncan', false), alumnus(5, null)];
    state.alumni[2].rewardCredits = 33;
    state.alumniArchive = {id: 'archive-fixture', count: 200, effectiveCount: 180, legendCount: 50, bestTier: 5};
    const before = structuredClone(state);
    expect(alumniCount(state)).toBe(204);
    expect(alumniProgress(state)).toEqual({total: 204, effectiveCount: 182, legendCount: 51, bestTier: 5});
    expect(state).toEqual(before);
  });

  it('retains exactly the same construction requirements when old history moves into an archive', () => {
    const legacy = newGym(1_000);
    legacy.gymLevel = 7; legacy.fame = 18_000; legacy.credits = 220;
    legacy.collection = Object.fromEntries(nbaTemplates.slice(0, 25).map(template => [template.id, {firstAt: 1_000, highestRating: 0, highestValue: '0'}]));
    legacy.alumni = Array.from({length: 160}, (_, i) => alumnus(i + 2, i < 15 ? 'duncan' : 'caruso'));
    const compact = {...legacy, alumni: legacy.alumni.slice(60),
      alumniArchive: {id: 'archive-fixture', count: 60, effectiveCount: 60, legendCount: 15, bestTier: 5}};
    expect(alumniProgress(compact)).toEqual(alumniProgress(legacy));
    expect(gymUpgrade(compact)).toEqual(gymUpgrade(legacy));
    expect(gymUpgrade(compact).canUpgrade).toBe(true);
  });
});
