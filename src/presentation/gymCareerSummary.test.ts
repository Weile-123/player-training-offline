import {expect, it} from 'vitest';
import {newGym, type GymAlumnus} from '../game/gym/engine';
import {templateRules} from '../game/contract/templates';
import {gymCareerSummary} from './gymCareerSummary';

const at = 1_800_000_000_000;
function alumnus(id: string, tier: string, value: string, shots: number, level = 15): GymAlumnus {
  const player = structuredClone(newGym(at, 17).player!);
  const template = templateRules.find(template => template.tier === tier)!;
  return {...player, id, templateId: template.id, level, peakLevel: level, shots,
    training: {...player.training, completedCourses: Math.floor(shots / 10)},
    recommendedAt: at + shots, rewardCredits: 1, rewardFame: 10, finalValue: value};
}

it('summarizes complete archived and recent alumni exactly once, with active training records included separately', () => {
  const state = newGym(at, 17), hot = alumnus('hot', 'starter', '1000', 40, 12), archived = alumnus('old', 'legend', '5000', 80, 30);
  state.player!.shots = 10; state.player!.training.completedCourses = 1;
  state.alumni = [hot];
  state.alumniArchive = {id: 'archive', count: 1, effectiveCount: 1, legendCount: 1, bestTier: 5};
  state.projects.automation = 2;
  const summary = gymCareerSummary(state, [hot, archived]);
  expect(summary).toMatchObject({recommended: 2, active: 1, automatic: 0, shots: 130, courses: 13, averageLevel: 21, peakLevel: 30, recommendedTemplates: 2, projectLevels: 2});
  expect(summary.best?.id).toBe('old');
  expect(summary.distribution.map(tier => tier.count)).toEqual([0, 1, 0, 0, 1]);
});

it('compares integer final values without Number precision loss and resolves ties using the newest record', () => {
  const state = newGym(at, 17);
  const first = alumnus('one', 'starter', '9007199254740992', 40);
  const larger = alumnus('two', 'starter', '9007199254740993', 30);
  const newer = {...larger, id: 'three', recommendedAt: at + 90};
  expect(gymCareerSummary(state, [first, larger]).best?.id).toBe('two');
  expect(gymCareerSummary(state, [newer, larger]).best?.id).toBe('three');
});

it('has meaningful empty and legacy statistics without inventing historical totals', () => {
  const state = newGym(at, 17);
  expect(gymCareerSummary(state, [])).toMatchObject({recommended: 0, averageLevel: 0, best: null, shots: 0, courses: 0, recommendedTemplates: 0});
  const legacy = {...alumnus('legacy', 'rotation', '120', 3), templateId: null};
  const summary = gymCareerSummary(state, [legacy]);
  expect(summary.unmatched).toBe(1);
  expect(summary.distribution.every(tier => tier.count === 0)).toBe(true);
  expect(summary.recommendedTemplates).toBe(0);
  expect(summary.shots).toBe(3);
});
