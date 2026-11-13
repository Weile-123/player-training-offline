import {type StatKey} from '../types';
import {hash} from '../contract/random';
import {type GymPlayer, type GymState} from './engine';

export type Cooperation = {id: string; playerId: string; acceptedShots: number; acceptedCourses: number};
export type CooperationOffer = {
  id: string; kind: 'basic' | 'specialist' | 'rising' | 'elite' | 'legend'; name: string; description: string;
  requiredShots: number; requiredCourses: number; requiredTier: number; focusKeys: readonly StatKey[];
  requiredAttribute: number; credits: number; fame: number;
};
export type CooperationStatus = {
  offer: CooperationOffer | null; requirements: {label: string; current: number; required: number; met: boolean}[];
  complete: boolean; rewardCredits: number; rewardFame: number; equipmentCredits: number;
};

export function buildCooperationOffers(state: GymState, player: GymPlayer | null = state.player): CooperationOffer[] {
  if (!player) return [];
  const prefixes = `${player.id}:`;
  const pairs = [['three', 'mid'], ['drive', 'handle'], ['inside', 'defense']] as const;
  const pair = pairs[hash(`${state.seed}:${player.id}:cooperation`) % pairs.length];
  const basic: CooperationOffer = {id: prefixes + 'basic', kind: 'basic', name: '基础培养合作',
    description: '接取后完成 10 次训练、1 节课程，并培养到替补及以上。', requiredShots: 10, requiredCourses: 1,
    requiredTier: 1, focusKeys: [], requiredAttribute: 0, credits: 1, fame: 10};
  const specialist: CooperationOffer = {id: prefixes + 'specialist', kind: 'specialist', name: '专项培养合作',
    description: '接取后完成 20 次训练、2 节课程，达到首发及以上，并满足两项专项能力。', requiredShots: 20, requiredCourses: 2,
    requiredTier: 2, focusKeys: pair, requiredAttribute: 65, credits: 3, fame: 55};
  const level = player.enteredGymLevel;
  const third: CooperationOffer = level <= 2
    ? {id: prefixes + 'rising', kind: 'rising', name: '新星培养合作', description: '接取后完成 30 次训练、3 节课程，并培养到全明星及以上。', requiredShots: 30, requiredCourses: 3, requiredTier: 3, focusKeys: [], requiredAttribute: 0, credits: 5, fame: 100}
    : level <= 4
      ? {id: prefixes + 'elite', kind: 'elite', name: '精英培养合作', description: '接取后完成 40 次训练、4 节课程，并培养到巨星及以上。', requiredShots: 40, requiredCourses: 4, requiredTier: 4, focusKeys: [], requiredAttribute: 0, credits: 6, fame: 150}
      : {id: prefixes + 'legend', kind: 'legend', name: '传奇培养合作', description: '接取后完成 50 次训练、5 节课程，并培养到传奇。', requiredShots: 50, requiredCourses: 5, requiredTier: 5, focusKeys: [], requiredAttribute: 0, credits: 8, fame: 220};
  return [basic, specialist, third];
}
