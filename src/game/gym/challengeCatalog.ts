import originals from '../contract/runtime/equipment.json';
import {templateById} from '../templates';
import {statKeys, type StatKey, type Stats} from '../types';
import starters from './challengeStarters.json';

// Frozen entry cards, with columns in statKeys order. The catalog test verifies
// each card against the full matcher, without running it during game startup.
export const challengeCards = new Map(Object.entries(starters).map(([id,row]) => {
  const template=templateById(id)!;
  const stats = Object.fromEntries(statKeys.map((key,i) => [key,row[i]])) as Stats;
  // This version's sheet also pins draw order for saved fixtures and replays.
  return [id,{id,name:template.name,tier:template.tier,stats}] as const;
}));
export const challengeTemplateIds = [...challengeCards.keys()];
export const challengeMeans = Object.fromEntries(statKeys.map(key => [
  key, [...challengeCards.values()].reduce((sum, card) => sum + card.stats[key], 0) / challengeCards.size,
])) as Stats;

const specialtyItems: Record<StatKey, number[]> = {
  three: [2,21,32,37,41,51,61,69,71,73,87,97],
  mid: [4,12,19,22,42,52,59,64,81],
  drive: [3,17,30,38,40,47,48,55,70,75,88],
  inside: [33,36,49,62,78,84],
  handle: [8,11,14,15,18,24,26,44,57,63,72,95],
  defense: [1,13,20,23,34,56,60,65,79,90],
};
export const challengeEquipment = new Map(originals.relics.map(item => {
  const key:StatKey|'all' = statKeys.find(stat => specialtyItems[stat].includes(Number(item.id.slice(6)))) ?? 'all';
  return [item.id, {id:item.id, name:item.name.replace(/^停用/, ''), key}] as const;
}));
export const challengeEquipmentGroups = new Map((['all', ...statKeys] as const).map(key => [
  key, [...challengeEquipment.values()].filter(item => item.key === key),
]));
