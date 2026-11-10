/** 可序列化的独立随机流；不使用 Math.random 或系统时间。 */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
export type Stream = { state: number };
export function stream(seed: number, label: string): Stream { return { state: hash(`${seed}:${label}`) }; }
export function random(s: Stream): number {
  s.state = (s.state + 0x6D2B79F5) >>> 0;
  let t = s.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function weighted(s: Stream, weights: readonly number[]): number {
  if (!weights.length || weights.some(w => !Number.isFinite(w) || w < 0)) throw new Error('无效权重');
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) throw new Error('权重总和必须大于0');
  let roll = random(s) * sum;
  for (let i = 0; i < weights.length; i++) { roll -= weights[i]; if (roll < 0) return i; }
  return weights.length - 1;
}
