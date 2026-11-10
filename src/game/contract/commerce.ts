import type {StatusSources} from './statusSources';
import input from './runtime/equipment.json';
import { rules, integer } from './rules';
import { fraction, multiply, quota, rounded } from './money';
import { random, weighted, type Stream } from './random';

export type Rarity = 'common' | 'rare' | 'legendary';
export type ShopEntry = { id: string; name: string; rarity: Rarity; month: number; price: number; locked: boolean; starter: boolean; defensive: boolean; earlyValue: boolean };
const id = (n: number) => `relic_${String(n).padStart(3, '0')}`;
// [编号, 开放月, 积分价格]：价格逐条记录，不从稀有度推导。
const common = [[1,2,1],[2,2,1],[3,2,1],[4,2,1],[6,2,1],[8,2,1],[9,2,1],[10,2,1],[11,2,1],[12,2,1],[13,2,1],[14,2,1],[17,2,1],[19,2,1],[24,3,1],[26,3,1],[30,3,1]];
const rare = [[20,2,1],[36,3,2],[37,3,2],[41,3,2],[43,3,2],[46,4,1],[48,4,2],[56,4,2],[57,4,2],[58,5,2],[60,5,2],[63,5,2],[64,5,2],[66,5,2],[68,5,3],[69,6,2],[72,6,2],[73,6,2],[74,6,2],[83,7,3],[91,8,4]];
const legendary = [[75,6,3],[77,6,4],[79,6,3],[80,6,4],[82,6,3],[86,7,4],[87,7,4],[88,7,3],[89,7,4],[90,7,4],[92,8,4],[93,8,4],[95,8,4],[96,9,3],[97,9,3],[98,10,5]];
common.push(...[5,7,15,18].map(n=>[n,2,1]), ...[21,22,23,27,28,29,32,33].map(n=>[n,3,1]));
rare.push(...[[34,3,1],[35,3,1],[38,3,2],[39,3,1],[40,3,1],[42,3,2],[45,4,2],[47,4,3],[49,4,2],[50,4,2],[51,4,1],[52,4,2],[53,4,3],[54,4,2],[55,4,2],[59,5,3],[61,5,2],[62,5,2],[65,5,3],[67,5,2],[70,6,2],[71,6,2]]);
legendary.push(...[[76,6,3],[78,6,3],[81,6,3],[84,7,4],[85,7,4],[94,8,4]]);
const starter = [2,3,9,17,36,41,11,12];
const locked = [75,76,77,80,82,84,85,86,87,89,90,92,93,94,95,98];
export const shopCatalog: readonly ShopEntry[] = ([['common', common], ['rare', rare], ['legendary', legendary]] as const).flatMap(([rarity, rows]) => rows.map(([n, month, price]) => ({
  id: id(n), name: input.relics.find(r => r.id === id(n))!.name, rarity, month, price,
  locked: locked.includes(n), starter: starter.includes(n), defensive: [3,20,30,34,36,56].includes(n), earlyValue: [6,7,8,9,10,13,18].includes(n),
})));
export const shopEntry = (key: string) => shopCatalog.find(r => r.id === key);
export type ShopState = { month: number; offers: string[]; giftAvailable: boolean; paidRerolls: number; freeUsed: boolean };
export type MerchantOffer = { id: string; basePrice: string; stock: number; purchased: number; level: number };
export type Commerce = {
  shop: ShopState; merchant: { month: number; offers: MerchantOffer[] };
  inventory: Record<ItemId, number>; unlocked: string[]; incenseUsed: boolean;
  nextSupply: number; supplySources?:StatusSources; paidMonths: number; carry: string; monthlyRescueUsed: boolean;
};
export const itemIds = ['item_001','item_002','item_003','item_004','item_005'] as const;
export type ItemId = typeof itemIds[number];
export const armedItems = ['item_001','item_003','item_004'] as const;
export type ArmedItem = typeof armedItems[number];
export function rarityWeights(month: number): readonly number[] {
  const t = rules.reference.relic_shop.rarity_weights_by_period;
  return month <= 3 ? t.day_2_3 : month <= 5 ? t.day_4_5 : month === 6 ? t.day_6 : month <= 8 ? t.day_7_8 : month <= 12 ? t.day_9_12 : month <= 16 ? t.day_13_16 : t.day_17_plus;
}
export function offerWeight(entry: ShopEntry, month: number): number {
  return entry.defensive && month >= 2 && month <= 6 ? 1.75 : entry.earlyValue && month >= 8 ? 0.45 : 1;
}
/** 稀有度池为空时在剩余有效稀有度中重归一；不生成空效果物品。 */
export function rollShop(month: number, owned: readonly string[], unlocked: readonly string[], rng: Stream, catalog = shopCatalog, rarityOverride?:readonly [number,number,number], count=3): string[] {
  integer(month, 1, rules.maxLevel);
  let pool = catalog.filter(r => !owned.includes(r.id) && (month === 1 ? r.starter : r.month <= month && (!r.locked || unlocked.includes(r.id))));
  const offers: string[] = [], rarities: Rarity[] = ['common','rare','legendary'];
  while (offers.length < count && pool.length) {
    let candidates = pool;
    if (month > 1) {
      const weights = (rarityOverride??rarityWeights(month)).map((w, i) => pool.some(r => r.rarity === rarities[i]) ? w : 0);
      if (!weights.some(w => w > 0)) break;
      const rarity = rarities[weighted(rng, weights)]; candidates = pool.filter(r => r.rarity === rarity);
    }
    const entry = candidates[weighted(rng, candidates.map(r => month === 1 ? 1 : offerWeight(r, month)))];
    offers.push(entry.id); pool = pool.filter(r => r.id !== entry.id);
  }
  return offers;
}
export function rerollPrice(month: number, count: number): string {
  integer(count, 0, 1000);
  const base = BigInt(rounded(multiply(fraction(quota(month)), fraction(15,100))));
  return rounded(multiply(fraction(base < 150n ? 150n : base), fraction(5n ** BigInt(count), 2n ** BigInt(count))));
}
const merchantKeys: Record<string, string> = { basic: 'basic_sword', special: 'special_sword', item_001: 'cracked_dragon_scale', item_002: 'regret_clockwork', item_003: 'red_chalk', item_004: 'powder_pouch', item_005: 'cold_star_shard', item_006: 'incense_of_oblivion', item_007: 'ghost_delivery_note' };
export const merchantItems = [
  { id: 'item_001', month: 3, stock: 3, percent: 30, minimum: 500, markup: 140 },
  { id: 'item_002', month: 3, stock: 1, percent: 85, minimum: 1500, markup: 180 },
  { id: 'item_003', month: 6, stock: 3, percent: 40, minimum: 700, markup: 140 },
  { id: 'item_004', month: 6, stock: 1, percent: 50, minimum: 800, markup: 180 },
  { id: 'item_005', month: 6, stock: 3, percent: 50, minimum: 800, markup: 140 },
  { id: 'item_006', month: 9, stock: 1, percent: 120, minimum: 3500, markup: 180 },
  { id: 'item_007', month: 6, stock: 3, percent: 65, minimum: 1000, markup: 140 },
] as const;
export function merchantPrice(month: number, key: string): string {
  const table = rules.reference.merchant.item_price_by_visit as Record<string, Record<string, number | null>>;
  const listed = table[month]?.[merchantKeys[key]];
  if (listed !== undefined && listed !== null) return String(listed);
  const q = BigInt(quota(month));
  if (key === 'basic') { const v = BigInt(rounded(fraction(q * 4n,10))); return String(v < 700n ? 700n : v); }
  // 表外价格公式/向上取十位为明示篮球适配，保留所有表内金额。
  const def = merchantItems.find(r => r.id === key);
  const percent = def?.percent ?? 65, minimum = def?.minimum ?? 1100;
  const raw = q * BigInt(percent), base = raw < BigInt(minimum * 100) ? BigInt(minimum * 100) : raw;
  const markup = def?.markup ?? 175;
  const factor = key === 'special' ? month >= 15 ? 24n : month >= 9 ? 16n : 10n : 10n;
  if (!def && key !== 'special') throw new Error('未知球探商品');
  const n = base * BigInt(markup) * factor;
  return String(((n + 999999n) / 1000000n) * 10n);
}
export function makeMerchant(month: number, equipment: readonly string[], credit: number, incenseUsed: boolean, rng: Stream): Commerce['merchant'] {
  if (month < 3 || month % 3 !== 0) return { month, offers: [] };
  const visit = month / 3, stock = (visit === 1 ? 2 : visit <= 3 ? 3 : visit <= 7 ? 4 : 5) + (equipment.includes('relic_074') ? 2 : 0);
  const offers: MerchantOffer[] = [
    { id: 'basic', basePrice: merchantPrice(month, 'basic'), stock, purchased: 0, level: 0 },
    { id: 'special', basePrice: merchantPrice(month, 'special'), stock: 1, purchased: 0, level: month < 9 ? 0 : month < 15 ? 2 : 4 },
  ];
  const slots = (month < 6 ? 4 : month < 15 ? 5 : 6) + (equipment.includes('relic_082') ? 2 : 0);
  let pool = merchantItems.filter(i => i.month <= month && (i.id !== 'item_006' || (credit < rules.credit && !incenseUsed && random(rng) < 0.22)));
  while (offers.length < slots && pool.length) {
    const i = Math.floor(random(rng) * pool.length), item = pool[i];
    offers.push({ id: item.id, basePrice: merchantPrice(month, item.id), stock: item.stock, purchased: 0, level: 0 });
    pool = pool.filter(p => p.id !== item.id);
  }
  return { month, offers };
}
export function newCommerce(month: number, equipment: readonly string[], credit: number, rng: Stream, unlocked: string[] = []): Commerce {
  return { shop: { month, offers: rollShop(month, equipment, unlocked, rng), giftAvailable: month === 1, paidRerolls: 0, freeUsed: false }, merchant: makeMerchant(month, equipment, credit, false, rng), inventory: Object.fromEntries(itemIds.map(i => [i, 0])) as Record<ItemId, number>, unlocked: [...unlocked], incenseUsed: false, nextSupply: 0, paidMonths: 0, carry: '0', monthlyRescueUsed: false };
}
export const purchasePrice = (offer: MerchantOffer) => String(BigInt(offer.basePrice) * 3n ** BigInt(offer.purchased));

export const legendaryCandidates=(month:number,owned:readonly string[],unlocked:readonly string[])=>shopCatalog.filter(r=>month>1&&r.rarity==='legendary'&&!owned.includes(r.id)&&(!r.locked||unlocked.includes(r.id)));
export function rollLegendaryShop(month:number,owned:readonly string[],unlocked:readonly string[],rng:Stream):string[]{
 const pool=legendaryCandidates(month,owned,unlocked);if(!pool.length)return [];
 const guaranteed=pool[weighted(rng,pool.map(r=>offerWeight(r,month)))].id;
 return [guaranteed,...rollShop(month,[...owned,guaranteed],unlocked,rng,shopCatalog,undefined,2)];
}
