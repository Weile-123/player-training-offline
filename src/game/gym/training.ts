import {type StatKey, type Stats} from '../types';

export type TrainingPlanId = 'balanced' | 'shooting' | 'finishing' | 'interior';
export type TrainingProgress = {planId: TrainingPlanId; shots: number; completedCourses: number};
export type TrainingPlan = {id: TrainingPlanId; name: string; focusKeys: readonly StatKey[]; description: string};

export const trainingPlans: readonly TrainingPlan[] = [
  {id: 'balanced', name: '基础训练', focusKeys: [], description: '沿用球员原固有成长偏好。'},
  {id: 'shooting', name: '投射专项', focusKeys: ['three', 'mid'], description: '升级时更容易提升三分与中投。'},
  {id: 'finishing', name: '持球突破', focusKeys: ['drive', 'handle'], description: '升级时更容易提升突破与控球。'},
  {id: 'interior', name: '内线防守', focusKeys: ['inside', 'defense'], description: '升级时更容易提升篮下与防守。'},
];

export function trainingBias(bias: Stats, planId: TrainingPlanId, focus: Stats): Stats {
  const plan = trainingPlans.find(entry => entry.id === planId)!;
  const next = {...bias};
  for (const key of Object.keys(bias) as StatKey[]) {
    const original = .1 + bias[key];
    const equipment = Math.min(1.5, focus[key]);
    next[key] = plan.focusKeys.includes(key) ? original * 2 + .5 + equipment - .1 : bias[key] + equipment;
  }
  return next;
}
