import { nbaTemplates, type NbaTemplate } from '../templates';
import { statKeys, type Stats, type StatKey } from '../types';
import { hash, weighted, type Stream } from './random';
import { integer, rules } from './rules';
import {specialistCores,matureSpecialistCores} from '../specialistTemplates';

export type TemplateRule = NbaTemplate & {
  minLevel: number; coreMinimums: Partial<Stats>; enter: number;
  evidence: 'basketball_design'; reviewed: boolean; reviewScope:'mechanics'; balanceReviewed:boolean;
  branches?: {coreMinimums:Partial<Stats>;keys:StatKey[];enter:number}[];
  ratingFloor?:number; statFloor?:number;
};
/** Game-design ratings, not NBA measurements.
 * reviewed covers rules/reachability only, never a claim of finished population balance. */
export const templateRules: readonly TemplateRule[] = nbaTemplates.map(t => {
  const tier = rules.tiers.find(v => v.id === t.tier)!;
  const allRound = ['lebron', 'jordan', 'bird'].includes(t.id);
  const keys = allRound ? statKeys : [...statKeys].sort((a, b) => t.stats[b] - t.stats[a]).slice(0, 3);
  const result:TemplateRule={ ...t, minLevel: tier.level, coreMinimums: Object.fromEntries(keys.map(k => [k, Math.ceil(t.stats[k] * tier.coreRatio)])), enter: rules.matching.enter, evidence: 'basketball_design', reviewed: true, reviewScope:'mechanics', balanceReviewed:false };
  const floor={rotation:55,starter:75,star:85,superstar:90,legend:94}[t.tier];
  const enter={rotation:.6,starter:.68,star:.74,superstar:.78,legend:.82}[t.tier];
  result.branches=specialistCores[t.id]?.map(keys=>({keys,enter,coreMinimums:Object.fromEntries(keys.map(k=>[k,Math.min(t.stats[k],Math.max(floor,Math.ceil(t.stats[k]*tier.coreRatio)))]))}));
  for(const keys of matureSpecialistCores[t.id]??[]) (result.branches??=[]).push({keys,enter,coreMinimums:Object.fromEntries(keys.map(k=>[k,90]))});
  // Francis is a starter entry; Rose and Hill keep the star progression above him.
  if(t.id==='steve-francis'){
    result.coreMinimums={drive:85,handle:88,inside:62};
    result.branches=[{keys:['drive','handle'],enter:.72,coreMinimums:{drive:85,handle:88}}];
  }
  if(t.id==='amare-stoudemire')result.coreMinimums={mid:63,drive:85,inside:85};
  if(t.id==='eric-gordon')result.coreMinimums={three:85,inside:85,drive:65};
  if(t.id==='derrick-rose')result.branches=[{keys:['drive','handle'],enter:.76,coreMinimums:{drive:95,handle:92}}];
  if(t.id==='jokic')result.branches=[{keys:['inside','handle'],enter:.78,coreMinimums:{inside:95,handle:93}}];
  if(t.id==='pippen')result.coreMinimums={defense:90,handle:85,drive:85};
  if(t.id==='bryant')result.coreMinimums={mid:92,drive:88,handle:87};
  if(t.id==='durant')result.coreMinimums={mid:92,three:88,drive:84};
  if(t.id==='jordan'){result.coreMinimums={mid:90,drive:90,defense:90};result.ratingFloor=80;result.statFloor=60;}
  if(t.id==='lebron'){result.coreMinimums={drive:90,inside:90,handle:88};result.ratingFloor=78;result.statFloor=55;}
  if(t.id==='bird'){result.coreMinimums={three:90,mid:90,handle:86};result.ratingFloor=78;result.statFloor=55;}
  return result;
});
const tierRank = (tier: NbaTemplate['tier']) => rules.tiers.findIndex(t => t.id === tier);
export type MatchInput = { level: number; peakLevel?: number; height: number; stats: Stats; templateId: string | null; matchSeed: number; lastStyle: Stats };
export function shape(stats: Stats): Stats {
  const mean = statKeys.reduce((s, k) => s + stats[k], 0) / 6;
  const spread = Math.max(8, Math.sqrt(statKeys.reduce((s, k) => s + (stats[k] - mean) ** 2, 0) / 6));
  return Object.fromEntries(statKeys.map(k => [k, (stats[k] - mean) / spread])) as Stats;
}
export function similarity(a: Stats, b: Stats): number {
  const z = shape(b), error = Math.sqrt(statKeys.reduce((s, k) => s + (a[k] - z[k]) ** 2, 0) / 6);
  return Math.max(0, 1 - error / 2);
}
/** Attribute coverage, not relative proportions: extra strength never becomes a penalty.
 * Each of the six dimensions contributes equally; overqualification is capped at 1.
 * Coordinate-wise growth can only increase this score, including at the 99 cap. */
export function aptitude(stats: Stats, target: Stats): number {
  return statKeys.reduce((sum, k) => sum + (target[k]<=0?1:Math.min(1, stats[k] / target[k])), 0) / statKeys.length;
}
export function specialistAptitude(stats:Stats,target:Stats,keys:StatKey[]):number{
  const mean=(list:readonly StatKey[])=>list.reduce((s,k)=>s+(target[k]<=0?1:Math.min(1,stats[k]/target[k])),0)/list.length;
  return .7*mean(keys)+.3*mean(statKeys.filter(k=>!keys.includes(k)));
}
export function match(input: MatchInput, catalog = templateRules) {
  integer(input.level, 0, rules.maxLevel);
  const peakLevel = Math.max(input.level, input.peakLevel ?? input.level);
  integer(peakLevel, 0, rules.maxLevel);
  if (!Number.isFinite(input.height) || statKeys.some(k => !Number.isFinite(input.stats[k]) || input.stats[k] < 0 || input.stats[k] > 99)) throw new Error('无效匹配输入');
  const full = statKeys.every(k => input.stats[k] === 99);
  const style = full ? input.lastStyle : shape(input.stats);
  const rows = catalog.map(t => {
    const reasons: string[] = [];
    if (input.height < t.height[0] || input.height > t.height[1]) reasons.push('height');
    if (peakLevel < t.minLevel) reasons.push('level');
    const baseScore=aptitude(input.stats,t.stats);
    const baseEligible=baseScore>=t.enter&&statKeys.every(k=>input.stats[k]>=(t.coreMinimums[k]??0));
    const branch=!baseEligible?t.branches?.find(b=>specialistAptitude(input.stats,t.stats,b.keys)>=b.enter&&statKeys.every(k=>input.stats[k]>=(b.coreMinimums[k]??0))):undefined;
    const core=branch?.coreMinimums??t.coreMinimums;
    const gaps = statKeys.filter(k => core[k] !== undefined).map(k => ({ key: k, actual: input.stats[k], required: core[k]!, gap: Math.max(0, core[k]! - input.stats[k]) }));
    if (gaps.some(v => v.gap > 0)) reasons.push('core');
    const score = branch?specialistAptitude(input.stats,t.stats,branch.keys):baseScore, styleScore = similarity(style, t.stats), threshold = branch?.enter??t.enter;
    if (score < threshold) reasons.push('aptitude');
    if(t.ratingFloor!==undefined&&statKeys.reduce((s,k)=>s+input.stats[k],0)/6<t.ratingFloor)reasons.push('rating-floor');
    if(t.statFloor!==undefined&&statKeys.some(k=>input.stats[k]<t.statFloor!))reasons.push('stat-floor');
    return { id: t.id, name: t.name, tier: t.tier, minLevel: t.minLevel, height: t.height, gaps, score, styleScore, threshold, eligible: reasons.length === 0, reasons };
  });
  // A developed specialist must not stay anonymous solely because a secondary core
  // stat is low. This entry only awards rotation appearances; higher tiers keep
  // every original gate. Height and overall aptitude still apply.
  if(!rows.some(r=>r.eligible)&&peakLevel>=rules.matching.specialistLevel
    &&statKeys.reduce((sum,k)=>sum+input.stats[k],0)/6>=rules.matching.specialistRating
    &&statKeys.filter(k=>input.stats[k]>=rules.matching.specialistStat).length>=2){
    for(const row of rows)if(row.tier==='rotation'&&row.reasons.length===1&&row.reasons[0]==='core'){
      row.eligible=true;row.reasons=['specialist-entry'];
    }
  }
  const candidates = rows.filter(r => r.eligible).sort((a, b) => tierRank(b.tier) - tierRank(a.tier) || b.styleScore - a.styleScore || a.id.localeCompare(b.id, 'en'));
  let best = candidates[0];
  if (best) {
    const ties = candidates.filter(r => r.tier === best.tier && best.styleScore - r.styleScore <= rules.matching.tie);
    best = [...ties].sort((a, b) => hash(`${input.matchSeed}:${a.id}`) - hash(`${input.matchSeed}:${b.id}`) || a.id.localeCompare(b.id, 'en'))[0];
    const old = candidates.find(r => r.id === input.templateId);
    if (old?.tier === best.tier && best.styleScore - old.styleScore <= rules.matching.margin) best = old;
  }
  // Acquisition requires height, core stats and monotone aptitude. An earned appearance is
  // permanent for this athlete, and changes only on earning a higher tier at a peak.
  const earned = rows.find(r => r.id === input.templateId && !r.reasons.includes('height'));
  const retained = !!earned && (input.level < peakLevel || !best || tierRank(best.tier) <= tierRank(earned.tier));
  const selected = retained ? earned : best;
  if (retained) earned.reasons.push('earned-appearance');
  for (const row of rows) if (row.eligible && row.id !== selected?.id) row.reasons.push(tierRank(row.tier) < tierRank(selected!.tier) ? 'lower-tier' : 'stability');
  return { templateId: selected?.id ?? null, tier: selected?.tier ?? null, aptitude: selected?.score ?? 0, similarity: selected?.styleScore ?? 0, rows, lastStyle: style, retained };
}

export function grow(stats: Stats, bias: Stats, result: string, delta: number, rng: Stream, gain: number = rules.growth.gain, loss: number = rules.growth.loss): Stats {
  integer(gain, 0, 100); integer(loss, 0, 100);
  const up = result === 'success' || result === 'great';
  const budget = up ? gain * Math.max(0, delta) : result === 'minor' ? loss * Math.max(1, -delta) : 0;
  const weights = statKeys.map(k => up ? rules.growth.epsilon + bias[k] : 1);
  const next = { ...stats };
  for (let i = 0; i < budget; i++) {
    const key: StatKey = statKeys[weighted(rng, weights)];
    next[key] = Math.max(0, Math.min(99, next[key] + (up ? 1 : -1)));
  }
  return next;
}
