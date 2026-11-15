import {random, type Stream} from '../contract/random';
import type {StatKey, Stats} from '../types';
import type {TrainingPlanId} from './training';

export type SelectedRecruitmentDirection = 'shooting' | 'finishing' | 'interior';
export const selectedRecruitmentDirections: readonly {
  id: SelectedRecruitmentDirection; label: string; keys: readonly StatKey[]; planId: TrainingPlanId;
}[] = [
  {id: 'shooting', label: '投射', keys: ['three', 'mid'], planId: 'shooting'},
  {id: 'finishing', label: '持球', keys: ['drive', 'handle'], planId: 'finishing'},
  {id: 'interior', label: '内线', keys: ['inside', 'defense'], planId: 'interior'},
];

export function isSelectedRecruitmentDirection(value: unknown): value is SelectedRecruitmentDirection {
  return selectedRecruitmentDirections.some(direction => direction.id === value);
}

/** Called only after admission checks, with the actual recruit stream, before project bonuses. */
export function selectedRecruitmentBase(stats: Stats, direction: SelectedRecruitmentDirection, source: Stream): Stats {
  const result = {...stats};
  const option = selectedRecruitmentDirections.find(option => option.id === direction);
  if (!option) throw new Error('精选方向无效');
  for (const key of option.keys) if (result[key] < 46) result[key] = 46 + Math.floor(random(source) * 3);
  return result;
}
