import type { Outcome } from '../types';
import { integer, rules } from './rules';

export const outcomes: readonly Outcome[] = ['severe', 'minor', 'hold', 'success', 'great'];
export type Weights = Record<Outcome, number>;
export type ProbabilityEffect =
  | { op: 'replace'; weights: Weights; id: string }
  | { op: 'add'; outcome: Outcome; value: number; id: string }
  | { op: 'transfer'; from: Outcome; to: Outcome; value: number; id: string }
  | { op: 'multiply'; outcome: Outcome; value: number; id: string }
  | { op: 'risk'; value: number; id: string };
export function probabilities(level: number, effects: readonly ProbabilityEffect[] = [], hot = false, powder = false, noSevere = false) {
  integer(level, 0, rules.maxLevel);
  if (hot && powder) throw new Error('火热期间不能使用豪赌粉');
  const base = rules.reference.forging_odds.base_tickets;
  let w: Weights = { severe: base.break, minor: base.damage, hold: base.hold, success: base.success, great: base.great };
  const trace: { id: string; weights: Weights }[] = [];
  const order = ['replace', 'add', 'transfer', 'multiply', 'risk'];
  const sorted = [...effects].sort((a, b) => order.indexOf(a.op) - order.indexOf(b.op) || a.id.localeCompare(b.id, 'en'));
  if (sorted.filter(e => e.op === 'replace').length > 1) throw new Error('多个基础权重替换需显式定义优先级');
  let risk = 1;
  for (const e of sorted) {
    if (e.op !== 'replace' && (!Number.isFinite(e.value) || (e.op !== 'add' && e.value < 0))) throw new Error('无效概率效果');
    if (e.op === 'replace') w = { ...e.weights };
    if (e.op === 'add') w[e.outcome] = Math.max(0, w[e.outcome] + e.value);
    if (e.op === 'multiply') w[e.outcome] *= e.value;
    if (e.op === 'transfer') { const amount = Math.min(w[e.from], e.value); w[e.from] -= amount; w[e.to] += amount; }
    if (e.op === 'risk') risk *= e.value;
    if (outcomes.some(o => !Number.isFinite(w[o]) || w[o] < 0)) throw new Error('无效概率权重');
    trace.push({ id: e.id, weights: { ...w } });
  }
  const curve = rules.reference.forging_odds.break_chance_percent_by_level_0_to_30;
  const b = curve[Math.min(level, curve.length - 1)] / 100;
  // 曲线校准始终使用原始9/21权重，不能用装备修改后的权重重算。
  const baseOthers = base.damage + base.hold + base.success + base.great;
  w.severe *= (baseOthers * b) / (base.break * (1 - b));
  const total = outcomes.reduce((s, o) => s + w[o], 0);
  if (!(total > 0)) throw new Error('概率总权重为0');
  let p = outcomes.map(o => w[o] / total);
  const severe = hot ? 0 : Math.min(1, p[0] * risk);
  const others = p.slice(1).reduce((a, v) => a + v, 0);
  if (others === 0 && severe < 1) throw new Error('没有可分配的非重伤权重');
  p = [severe, ...p.slice(1).map(v => others ? v / others * (1 - severe) : 0)];
  if (powder) p = [p[0] + p[1] + p[2], 0, 0, 0, p[3] + p[4]];
  // Apply after consumable conversion, so the developer override also covers powder.
  if (noSevere) {
    const surviving = p.slice(1).reduce((a,v)=>a+v,0);
    p = surviving>0 ? [0,...p.slice(1).map(v=>v/surviving)] : [0,0,1,0,0];
  }
  const raw = p.map(v => v * 1000), tickets = raw.map(Math.floor);
  const rank = raw.map((v, i) => ({ i, remainder: v - tickets[i] })).sort((a, b) => Math.abs(b.remainder - a.remainder) < 1e-10 ? a.i - b.i : b.remainder - a.remainder);
  const left = 1000 - tickets.reduce((a, v) => a + v, 0);
  for (let i = 0; i < left; i++) tickets[rank[i].i]++;
  return { tickets: Object.fromEntries(outcomes.map((o, i) => [o, tickets[i]])) as Weights, trace };
}
export function outcomeAt(tickets: Weights, ticket: number): Outcome {
  integer(ticket, 0, 999);
  for (const o of outcomes) { ticket -= tickets[o]; if (ticket < 0) return o; }
  throw new Error('票数没有覆盖抽签');
}
