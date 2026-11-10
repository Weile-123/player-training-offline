import type { ProbabilityEffect } from './probability';
import { fraction, multiply, type Fraction } from './money';
import { rules } from './rules';
import { shopCatalog } from './commerce';

/** 首批明确效果；未在列表的参考条目不静默当作无效果装备。 */
export const supportedEquipment = shopCatalog.map(r => r.id);
export function validateEquipment(ids: readonly string[]) {
  if (ids.length > rules.equipmentSlots || new Set(ids).size !== ids.length) throw new Error('器材最多8件且不可重复');
  for (const id of ids) if (!(supportedEquipment as readonly string[]).includes(id)) throw new Error(`尚未实现的器材: ${id}`);
}
export function effectsFor(ids: readonly string[], level: number, hot: boolean) {
  validateEquipment(ids);
  const has = (id: number) => ids.includes(`relic_${String(id).padStart(3, '0')}`);
  const probability: ProbabilityEffect[] = [];
  function add(id: number, outcome: 'severe' | 'minor' | 'hold' | 'success' | 'great', value: number) {
    if (has(id)) probability.push({ id: String(id), op: 'add', outcome, value });
  }
  add(2, 'success', 4); add(12, 'great', 1); add(14, 'hold', 3); add(30, 'severe', -2);
  add(37, 'great', 2); add(73, 'success', 6); add(75, 'severe', 3); add(75, 'great', 5); add(97, 'great', 4);
  add(17, 'hold', 2); add(86, 'hold', 6);
  add(84, 'minor', 3);
  if (has(33)) probability.push({id:'33',op:'transfer',from:'hold',to:'minor',value:2});
  if (has(71)&&level>=8) probability.push({id:'71',op:'transfer',from:'success',to:'great',value:2});
  if (hot) add(87, 'great', 6);
  if (has(4)) probability.push({ id: '4', op: 'transfer', from: 'minor', to: 'success', value: 1 });
  if (has(19)) probability.push({ id: '19', op: 'transfer', from: 'hold', to: 'success', value: 2 });
  if (has(3)) probability.push({ id: '3', op: 'risk', value: 0.9 });
  if (has(60) && level >= 6) probability.push({ id: '60', op: 'risk', value: 0.75 });
  if (has(80)) probability.push({ id: '80', op: 'replace', weights: { severe: 5, minor: 5, hold: 5, success: 5, great: 5 } });
  let multiplier: Fraction = fraction(1);
  if (has(10)) multiplier = multiply(multiplier, fraction(115, 100));
  if (has(33)) multiplier = multiply(multiplier, fraction(11,10));
  if (has(58) && level >= 8) multiplier = multiply(multiplier, fraction(13, 10));
  if (has(96) && level >= 12) multiplier = multiply(multiplier, fraction(3, 2));
  return {
    probability, multiplier,
    hotShots: rules.frenzyShots + (has(72) ? 2 : 0) + (has(95) ? 4 : 0) + (has(57) ? 1 : 0) + (has(88) ? 2 : 0),
    normalHeatEvery: has(11) ? 5 : 0,
    extraGreatLevels: hot && has(63) ? 1 : 0,
    firstHeat: has(48) ? 2 : 0, minorHeat: has(26) ? 1 : 0,
    flatHold: has(8) ? 180 : 0, flatSuccess: has(9) ? 100 : 0, flatMinor: has(13) ? 140 : 0,
    severeCash: has(1) ? 500 : 0, severeScrap: has(20),
  };
}
