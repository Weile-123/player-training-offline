import { integer, rules } from './rules';

/** 精确有理数用十进制字符串存储，JSON 无 BigInt/浮点精度损失。 */
export type Fraction = { n: string; d: string };
function gcd(a: bigint, b: bigint): bigint { while (b) [a, b] = [b, a % b]; return a < 0n ? -a : a; }
export function fraction(n: bigint | number | string, d: bigint | number | string = 1): Fraction {
  let a = BigInt(n), b = BigInt(d);
  if (b === 0n) throw new Error('除数为0');
  if (b < 0n) { a = -a; b = -b; }
  const g = gcd(a, b); return { n: String(a / g), d: String(b / g) };
}
export function add(a: Fraction, b: Fraction): Fraction { return fraction(BigInt(a.n) * BigInt(b.d) + BigInt(b.n) * BigInt(a.d), BigInt(a.d) * BigInt(b.d)); }
export function multiply(a: Fraction, b: Fraction): Fraction { return fraction(BigInt(a.n) * BigInt(b.n), BigInt(a.d) * BigInt(b.d)); }
export function divide(a: Fraction, b: Fraction): Fraction { return multiply(a, fraction(b.d, b.n)); }
export function rounded(a: Fraction): string {
  if (BigInt(a.n) < 0n) throw new Error('金额不能为负');
  return String((BigInt(a.n) * 2n + BigInt(a.d)) / (2n * BigInt(a.d)));
}
export const zero = () => fraction(0);
function decimal(value: number): Fraction {
  if (!Number.isFinite(value) || value < 0) throw new Error('无效配置倍率');
  const parts = String(value).split('.');
  if (parts.some(p => /[^0-9]/.test(p))) throw new Error('配置倍率须为普通十进制');
  return fraction(parts.join(''), 10n ** BigInt(parts[1]?.length ?? 0));
}
export type Ledger = { base: Fraction; greatBank: Fraction; flat: Fraction; permanent: Fraction };
export function ledger(special = false): Ledger {
  return { base: fraction(special ? rules.reference.sword_value.merchant_base : rules.reference.sword_value.base), greatBank: zero(), flat: zero(), permanent: fraction(1) };
}
export function levelFactor(level: number): Fraction {
  integer(level, 0, rules.maxLevel);
  const factor = decimal(rules.reference.sword_value.per_level_multiplier);
  return fraction(BigInt(factor.n) ** BigInt(level), BigInt(factor.d) ** BigInt(level));
}
export function quote(book: Ledger, level: number, multiplier = fraction(1)): string {
  return rounded(multiply(add(multiply(add(book.base, book.greatBank), levelFactor(level)), book.flat), multiply(book.permanent, multiplier)));
}
/** 大成功常规+2比普通两级多出10/9；固定值组合属于明示适配。 */
export function bankGreat(book: Ledger, oldLevel: number): Ledger {
  const delta = Math.min(rules.reference.sword_value.great_level_delta, Math.max(0,rules.trainingLevelCap-oldLevel));
  if(!delta)return book;
  // 临近封顶只结算实际升级；保留大成功相对普通升级的溢价。
  const target = multiply(decimal(rules.reference.sword_value.great_total_value_multiplier),divide(levelFactor(delta),levelFactor(rules.reference.sword_value.great_level_delta)));
  const extraRatio = add(divide(target, levelFactor(delta)), fraction(-1));
  const premium = add(multiply(add(book.base, book.greatBank), extraRatio), divide(multiply(book.flat, add(target, fraction(-1))), levelFactor(oldLevel + delta)));
  return { ...book, greatBank: add(book.greatBank, premium) };
}
export function quota(month: number): string {
  integer(month, 1, rules.maxLevel);
  const early = rules.reference.tribute.days[month - 1];
  if (early) return String(early.quota);
  const table = rules.reference.tribute.after_day_21_known as Record<string, number>;
  if (table[month] !== undefined) return String(table[month]);
  return rounded(fraction(BigInt(table[47]) * 6n ** BigInt(month - 47), 5n ** BigInt(month - 47)));
}
