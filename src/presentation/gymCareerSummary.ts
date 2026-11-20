import {templateById, type TemplateTier} from '../game/templates';
import type {GymAlumnus, GymState} from '../game/gym/engine';
import {playerLevelCap} from '../game/gym/progression';

export const careerTiers: readonly {id: TemplateTier; label: string}[] = [
  {id: 'rotation', label: '替补'}, {id: 'starter', label: '首发'}, {id: 'star', label: '全明星'},
  {id: 'superstar', label: '巨星'}, {id: 'legend', label: '传奇'},
];

/** Alumni here are the complete hot + archived records, never archive aggregates plus records. */
export function gymCareerSummary(state: GymState, alumni: readonly GymAlumnus[]) {
  const active = state.player ? [state.player, ...state.bench] : state.bench;
  const recorded = [...active, ...alumni];
  const distribution = careerTiers.map(tier => ({...tier, count: alumni.filter(player => templateById(player.templateId)?.tier === tier.id).length}));
  const matched = alumni.filter(player => !!templateById(player.templateId));
  const best = alumni.reduce<GymAlumnus | null>((record, player) => {
    if (!record || BigInt(player.finalValue) > BigInt(record.finalValue)
      || player.finalValue === record.finalValue && player.recommendedAt > record.recommendedAt) return player;
    return record;
  }, null);
  return {
    active: active.length,
    automatic: active.filter(player => player.autoEnabled && player.level < playerLevelCap).length,
    recommended: alumni.length,
    distribution,
    unmatched: alumni.length - matched.length,
    averageLevel: alumni.length ? alumni.reduce((sum, player) => sum + player.level, 0) / alumni.length : 0,
    peakLevel: recorded.reduce((maximum, player) => Math.max(maximum, player.peakLevel), 0),
    shots: recorded.reduce((sum, player) => sum + player.shots, 0),
    courses: recorded.reduce((sum, player) => sum + player.training.completedCourses, 0),
    recommendedTemplates: new Set(matched.map(player => player.templateId)).size,
    projectLevels: Object.values(state.projects).reduce((sum, level) => sum + level, 0),
    best,
  };
}
