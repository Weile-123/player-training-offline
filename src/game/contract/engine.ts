import {cloneData} from '../../utils/cloneData';
import {addStatusSource} from './statusSources';
import {hotCounts,migrateHeat} from './heat';
import {isHighPotential} from './recruits';
import { statKeys, type Outcome, type Stats } from '../types';
import type { TemplateTier } from '../templates';
import { effectsFor, validateEquipment } from './effects';
import { add, bankGreat, fraction, ledger, levelFactor, multiply, rounded, quote, quota, type Ledger } from './money';
import { outcomeAt, probabilities } from './probability';
import { hash, random, stream, type Stream } from './random';
import { grow, match, shape, templateRules, type TemplateRule } from './templates';
import { integer, rules } from './rules';
import { freshHistory, freshProgress, inherit, historyOdds, onBreak, survivingEffects, checkProgress, unlock, type History, type Progress } from './progression';
import { newCommerce, makeMerchant, rollShop, legendaryCandidates, rollLegendaryShop, rerollPrice, purchasePrice, shopEntry, itemIds, armedItems, type ArmedItem, type Commerce, type ItemId } from './commerce';

export type Athlete = {
  history: History;
  highPotential?: boolean;
  shareRewardClaimed?: boolean;
  id: string; height: number; stats: Stats; bias: Stats; lastStyle: Stats; matchSeed: number;
  level: number; peakLevel: number; templateId: string | null; highestTier: TemplateTier | null;
  normalShots?: number; hotShotsRemaining?: number; hotShotsTotal?: number;
  shots: number; heat: number; hotUntil: number; hotDurationMs?: number; book: Ledger; peakValue: string; queued: boolean;
  armed: ArmedItem[]; traits: { holds: number; scars: number; greatLevels: number; firstNormalUsed: boolean; phoenixUsed: boolean; cornerUsed: boolean };
};
export type Collection = Record<string, { firstMonth: number; highestRating: number; highestValue: string }>;
export type CareerBestPlayer = {playerId:string;templateId:string;value:string;level:number;stats:Stats};
export type CompletionRecord={month:number;delivered:string;totalShots:number;bestPlayer:CareerBestPlayer|null;equipment:string[];acknowledged:boolean};
export type AdReward = 'heat'|'legendary-shop'|'injury-rewind'|'merchant-refresh'|'revive';
export type AdRewards = {legendaryOffer?:string;heatMonth:number;legendaryMonth:number;merchantMonth:number;revived:boolean;injuryUsed:string[];shields:Record<string,number>};
export const freshAdRewards=():AdRewards=>({heatMonth:0,legendaryMonth:0,merchantMonth:0,revived:false,injuryUsed:[],shields:{}});
export type Contract = {
  adRewards?:AdRewards;
  adInjury?:{playerId:string;before:Contract}|null;
  /** Persistent identity assigned by the store, independent of deterministic simulation. */
  careerId?: string;
  sponsorShareMonth?: number;
  version: 'contract-v3'; seed: number; revision: number; progress: Progress;
  month: number; credit: number; cash: string; credits: number; delivered: string; scrap: string;
  status: 'playing' | 'over'; completed: boolean; clockMs: number; nextShotAt: number;
  nextId: number; players: Athlete[]; equipment: string[]; collection: Collection;
  rng: { economy: Stream; attributes: Stream; market: Stream }; totalShots: number;
  commerce: Commerce; undo: { playerId: string; before: Contract } | null;
  /** Full snapshot at the career's highest template-player value, including departed players. */
  bestPlayer?:CareerBestPlayer|null;
  completion?:CompletionRecord;
};
export type Event = { type: string; playerId?: string; outcome?: Outcome; drawn?: Outcome; value?: string; templateId?: string; month?: number; met?: boolean; itemId?: string };
export type Result = { state: Contract; events: Event[]; error?: string };
export type Options = { catalog?: readonly TemplateRule[]; gain?: number; loss?: number; noSevere?:boolean;shopRarityWeights?:readonly [number,number,number] };
export type Action =
  | { type: 'sponsor-share-reward'; careerId:string; month:number }
  | { type: 'ad-reward'; reward:AdReward; careerId:string; revision:number; playerId?:string }
  | { type: 'dismiss-ad-injury' }
  | { type: 'advance'; milliseconds: number }
  | { type: 'train'; playerId: string }
  | { type: 'share-reward'; playerId: string; careerId: string }
  | { type: 'queue'; playerId: string; queued: boolean }
  | { type: 'exchange'; playerId: string }
  | { type: 'buy-equipment'; id: string; replaceId?: string }
  | { type: 'discard-equipment'; id: string }
  | { type: 'reroll' }
  | { type: 'buy-merchant'; id: string }
  | { type: 'use-item'; id: ItemId; playerId: string }
  | { type: 'rewind' }
  | { type: 'continue-endless' }
  | { type: 'settle' };

function statsFrom(fn: (key: typeof statKeys[number]) => number): Stats { return Object.fromEntries(statKeys.map(k => [k, fn(k)])) as Stats; }
function maxMoney(a: string, b: string): string { return BigInt(a) >= BigInt(b) ? a : b; }
function rank(tier: TemplateTier | null): number { return rules.tiers.findIndex(t => t.id === tier); }
export const freshTraits = () => ({ holds: 0, scars: 0, greatLevels: 0, firstNormalUsed: false, phoenixUsed: false, cornerUsed: false });
function spawn(s: Contract, special = false, initialLevel = 0): Athlete {
  const id = `p${s.nextId++}`, r = s.rng.attributes;
  const stats = statsFrom(() => rules.growth.initialMin + Math.floor(random(r) * (rules.growth.initialMax - rules.growth.initialMin + 1)));
  const bias = statsFrom(() => random(r) ** 3);
  const level = Math.max(initialLevel, !special && s.equipment.includes('relic_098') ? 7 : 0), book = ledger(special);
  return { id, highPotential: special, height: 178 + Math.floor(random(r) * 41), stats, bias, lastStyle: shape(stats), matchSeed: hash(`${s.seed}:${id}`), level, peakLevel: level, templateId: null, highestTier: null, shots: 0, normalShots:0, heat: 0, hotUntil: 0, hotDurationMs:0, hotShotsRemaining:0, hotShotsTotal:0, book, peakValue: quote(book, level), queued: false, armed: [], traits: freshTraits(), history:freshHistory() };
}
export function newContract(seed: number, equipment: readonly string[] = [], collection: Collection = {}): Contract {
  integer(seed, 0, 0xffffffff); validateEquipment(equipment);
  const market = stream(seed, 'market');
  const state: Contract = { version: rules.version, seed, revision: 0, month: 1, credit: rules.credit, cash: '0', credits: 0, delivered: '0', scrap: '0', status: 'playing', completed: false, clockMs: 0, nextShotAt: 0, nextId: 1, players: [], equipment: [...equipment], collection: cloneData(collection), rng: { economy: stream(seed, 'economy'), attributes: stream(seed, 'attributes'), market }, totalShots: 0, commerce: newCommerce(1, equipment, rules.credit, market), progress:freshProgress(), undo: null };
  state.bestPlayer=null;state.adRewards=freshAdRewards();
  state.players = Array.from({ length: rules.recruits }, () => spawn(state));
  for (const p of state.players) refresh(state, p, []);
  return state;
}
function passiveBase(s: Contract): number { return (s.equipment.includes('relic_006') ? 80 : 0) + (s.equipment.includes('relic_083') ? 20 * s.commerce.paidMonths : 0); }
export function playerValue(s: Contract, p: Athlete): string {
  return quote({ ...p.book, base: add(p.book.base, fraction(passiveBase(s))) }, p.level, effectsFor(s.equipment, p.level, false).multiplier);
}
/** 旧无限等级档收敛至99级，超出部分转入已赚取基值，保留当前估值。 */
export function migrateLevelCap(s:Contract){
 for(const p of s.players){
  if(p.level>rules.trainingLevelCap){
   const factor=levelFactor(p.level-rules.trainingLevelCap),passive=fraction(passiveBase(s));
   p.book.base=add(multiply(add(p.book.base,passive),factor),multiply(passive,fraction(-1)));
   p.book.greatBank=multiply(p.book.greatBank,factor);
   p.level=rules.trainingLevelCap;
  }
  p.peakLevel=Math.min(p.peakLevel,rules.trainingLevelCap);
 }
}
function rememberBestPlayer(s:Contract,p:Athlete){
 if(!p.templateId)return;
 const value=playerValue(s,p);
 if(!s.bestPlayer||BigInt(value)>BigInt(s.bestPlayer.value)){
  s.bestPlayer={playerId:p.id,templateId:p.templateId,value,level:p.level,stats:{...p.stats}};
 }
}
/** Also backfills old saves from players still present; never invents historical six stats. */
export function captureBestPlayer(s:Contract){
 for(const p of s.players)rememberBestPlayer(s,p);
}
export function shotProbabilityInputs(s: Contract, p: Athlete) {
  p=cloneData(p); inherit(s,p,false);
  const hot = hotCounts(s,p).remaining > 0 || p.heat >= rules.heat;
  const effects = [...effectsFor(s.equipment, p.level, hot).probability,...historyOdds(s,p)];
  if (p.traits.scars) effects.push({ id: 'scars', op: 'risk', value: 1 - Math.min(0.60, p.traits.scars * 0.15) });
  if (p.armed.includes('item_003')) effects.push({ id: 'chalk', op: 'multiply', outcome: 'great', value: 2 });
  return {player:p,effects,hot,powder:p.armed.includes('item_004')};
}
export function previewShot(s: Contract, p: Athlete, options:Pick<Options,'noSevere'> = {}) {
  const input=shotProbabilityInputs(s,p);
  return probabilities(input.player.level,input.effects,input.hot,input.powder,options.noSevere);
}
export function previewSettlement(s: Contract) {
  const value = s.players.filter(p => p.queued).reduce((sum, p) => sum + BigInt(playerValue(s, p)), BigInt(s.scrap));
  const base = BigInt(quota(s.month)), discounted = s.equipment.includes('relic_066') ? BigInt(rounded(fraction(base * 9n, 10))) : base;
  const maximum = discounted * 3n / 10n, carry = BigInt(s.commerce.carry);
  const required = String(discounted - (carry > maximum ? maximum : carry));
  return { value: String(value), required, met: value >= BigInt(required) };
}
function refresh(s: Contract, p: Athlete, events: Event[], catalog?: readonly TemplateRule[], appearanceOnly=false) {
  const previous = p.templateId;
  p.peakLevel = Math.max(p.peakLevel, p.level);
  const result = match(p, catalog ?? templateRules);
  p.templateId = result.templateId; p.lastStyle = result.lastStyle;
  if (rank(result.tier) > rank(p.highestTier)) p.highestTier = result.tier;
  const value = playerValue(s, p);
  if(!appearanceOnly){p.peakValue = maxMoney(value, p.peakValue);rememberBestPlayer(s,p);}
  if (p.templateId) {
    const old = s.collection[p.templateId];
    const rating = statKeys.reduce((n, k) => n + p.stats[k], 0) / 6;
    s.collection[p.templateId] = { firstMonth: old?.firstMonth ?? s.month, highestRating: Math.max(old?.highestRating ?? 0, rating), highestValue: maxMoney(old?.highestValue ?? '0', value) };
    if (!old) events.push({ type: 'unlock', playerId: p.id, templateId: p.templateId });
  }
  if (previous !== p.templateId) events.push({ type: 'template', playerId: p.id, templateId: p.templateId ?? undefined });
}
/** Re-evaluate anonymous athletes in existing saves, without changing training or RNG. */
export function refreshUnmatchedTemplates(s:Contract){
  for(const p of s.players)if(!p.templateId)refresh(s,p,[],undefined,true);
}
/** expectedRevision 必填：重复/过期动作无副作用，不扣物品、不消耗随机数。 */
export function dispatch(original: Contract, expectedRevision: number, action: Action, options: Options = {}): Result {
  if (expectedRevision !== original.revision) return { state: original, events: [], error: 'stale-revision' };
  if (original.status !== 'playing' && !(action.type==='ad-reward'&&action.reward==='revive')) return { state: original, events: [], error: 'game-over' };
  const fail = (error: string): Result => ({ state: original, events: [], error });
  if(action.type==='sponsor-share-reward'){
    if(!original.careerId||action.careerId!==original.careerId||action.month!==original.month)return fail('share-context-changed');
    if(original.sponsorShareMonth!==undefined&&original.month-original.sponsorShareMonth<3)return fail('share-cooldown');
    const grant=(state:Contract):Contract=>({...state,credits:integer(state.credits+1),sponsorShareMonth:original.month,
      undo:state.undo?{...state.undo,before:grant(state.undo.before)}:state.undo,
      adInjury:state.adInjury?{...state.adInjury,before:grant(state.adInjury.before)}:state.adInjury});
    return {state:{...grant(original),revision:original.revision+1},events:[]};
  }
  if(action.type==='ad-reward'){
    if(!original.careerId||action.careerId!==original.careerId||action.revision!==original.revision)return fail('ad-context-changed');
    const unavailable=adRewardUnavailable(original,action.reward,action.playerId);if(unavailable)return fail(unavailable);
    const s=cloneData(action.reward==='injury-rewind'?original.adInjury!.before:original);
    const ads=s.adRewards=cloneData(original.adRewards??freshAdRewards());
    s.adInjury=null;s.undo=null;s.revision=original.revision+1;s.clockMs=original.clockMs;s.nextShotAt=0;
    const events:Event[]=[{type:'ad-reward',itemId:action.reward}];
    if(action.reward==='injury-rewind'){
      const id=original.adInjury!.playerId;
      // Keep consumed randomness and permanent discoveries; reverse this shot's economic effects.
      s.nextId=original.nextId;s.rng=cloneData(original.rng);s.collection=cloneData(original.collection);
      s.commerce.unlocked=[...original.commerce.unlocked];
      ads.injuryUsed.push(id);ads.shields[id]=1;
      events.push({type:'rewound',playerId:id});
    }else if(action.reward==='heat'){
      const p=s.players.find(p=>p.id===action.playerId)!;ads.heatMonth=s.month;
      p.heat=Math.min(10,p.heat+3);
      if(p.heat===10){
        p.heat=0;p.hotUntil=0;p.hotDurationMs=0;p.hotShotsTotal=effectsFor(s.equipment,p.level,true).hotShots;p.hotShotsRemaining=p.hotShotsTotal;
        s.progress.frenzies++;
      }
    }else if(action.reward==='legendary-shop'){
      s.commerce.shop.offers=rollLegendaryShop(s.month,s.equipment,s.commerce.unlocked,s.rng.market);ads.legendaryMonth=s.month;ads.legendaryOffer=s.commerce.shop.offers[0];
    }else if(action.reward==='merchant-refresh'){
      s.commerce.merchant=makeMerchant(s.month,s.equipment,s.credit,s.commerce.incenseUsed,s.rng.market);ads.merchantMonth=s.month;
    }else{
      s.status='playing';s.credit=rules.credit;ads.revived=true;
      const rookies=Array.from({length:3},()=>spawn(s));s.players.push(...rookies);
      for(const p of rookies)refresh(s,p,events,options.catalog);
      events.push({type:'revived',playerId:rookies[0].id});
    }
    checkProgress(s,events);return {state:s,events};
  }
  if (action.type === 'rewind') {
    if (!original.undo || original.commerce.inventory.item_002 < 1) return fail('no-rewind');
    const restored = cloneData(original.undo.before);
    restored.revision = integer(original.revision + 1);
    restored.adRewards=cloneData(original.adRewards??freshAdRewards());restored.adInjury=null;
    restored.undo = null; restored.clockMs = original.clockMs; restored.nextShotAt = 0;
    restored.nextId = original.nextId;
    restored.rng = cloneData(original.rng); restored.collection = cloneData(original.collection);
    restored.commerce.unlocked=[...original.commerce.unlocked];
    restored.commerce.inventory = { ...original.commerce.inventory, item_002: original.commerce.inventory.item_002 - 1 };
    // 只清除本次投篮消耗的道具；其他球员已预备的道具仍属于他们。
    const rewoundPlayer = restored.players.find(p => p.id === original.undo!.playerId);
    if (rewoundPlayer) {
      rewoundPlayer.armed = [];
      const current=original.players.find(p=>p.id===rewoundPlayer.id);
      if(current&&(hotCounts(restored,rewoundPlayer).remaining>0||rewoundPlayer.heat>=rules.heat)){
        const spent=hotCounts(original,current);rewoundPlayer.hotShotsRemaining=spent.remaining;rewoundPlayer.hotShotsTotal=spent.total;rewoundPlayer.heat=0;rewoundPlayer.hotUntil=0;rewoundPlayer.hotDurationMs=0;
      }
    }
    captureBestPlayer(restored);
    return { state: restored, events: [{ type: 'rewound', playerId: original.undo.playerId }] };
  }
  // 仅复制可能修改的分支，正式输入始终不变。
  const s: Contract = { ...original, adRewards:cloneData(original.adRewards??freshAdRewards()), adInjury:action.type==='advance'?original.adInjury:null, players: original.players.map(player=>{if(player.hotShotsRemaining!==undefined)return player;const p=cloneData(player);migrateHeat(original,p);return p;}), nextShotAt:0, equipment: [...original.equipment], collection: { ...original.collection }, commerce: cloneData(original.commerce), progress:cloneData(original.progress), rng: { economy: { ...original.rng.economy }, attributes: { ...original.rng.attributes }, market: { ...original.rng.market } }, undo: action.type === 'advance' ? original.undo : null };
  const events: Event[] = [];
  try {
    // Capture before delivery, signing, injury or equipment removal changes the roster/value.
    if(action.type!=='advance')captureBestPlayer(s);
    if(action.type==='dismiss-ad-injury'){
      if(!injuryRewindOffer(original))return fail('no-ad-injury');
    }else if(action.type==='continue-endless'){
      if(!s.completion||s.completion.acknowledged)return fail('no-pending-completion');
      s.completion={...s.completion,acknowledged:true};events.push({type:'endless-started'});
    } else if (action.type === 'advance') {
      integer(action.milliseconds, 0, 86400000);
      if (!action.milliseconds) return fail('no-time-change');
      s.clockMs = integer(s.clockMs + action.milliseconds);

    } else if (action.type === 'buy-equipment' || action.type === 'discard-equipment') {
      // 记录弃置前的历史最高报价，卸下加值器材不抹掉保险基准。
      const previousValues = new Map(s.players.map(p => [p.id, playerValue(s, p)]));
      if (action.type === 'discard-equipment') {
        if (!s.equipment.includes(action.id)) return fail('not-owned');
        s.equipment = s.equipment.filter(id => id !== action.id);
      } else {
        const entry = shopEntry(action.id), shop = s.commerce.shop;
        if (shop.month !== s.month || !entry || !shop.offers.includes(action.id) || s.equipment.includes(action.id)) return fail('unavailable-equipment');
        if (s.month === 1 ? !entry.starter : (entry.month > s.month && !(s.adRewards?.legendaryMonth===s.month&&s.adRewards.legendaryOffer===entry.id)) || (entry.locked && !s.commerce.unlocked.includes(entry.id))) return fail('equipment-locked');
        if (s.month === 1 && !shop.giftAvailable) return fail('gift-already-claimed');
        const cost = equipmentOfferPrice(s,entry.id);
        if (s.credits < cost) return fail('insufficient-credits');
        if (action.replaceId && !s.equipment.includes(action.replaceId)) return fail('replacement-not-owned');
        const next = action.replaceId ? s.equipment.filter(id => id !== action.replaceId) : [...s.equipment];
        if (next.length >= rules.equipmentSlots) return fail('equipment-full');
        s.equipment = [...next, action.id]; s.credits -= cost;
        if(s.adRewards?.legendaryOffer===action.id)delete s.adRewards.legendaryOffer;
        shop.offers = s.month === 1 ? [] : shop.offers.filter(id => id !== action.id); shop.giftAvailable = false;
      }
      for (let i = 0; i < s.players.length; i++) {
        const p = cloneData(s.players[i]); s.players[i] = p;
        if(action.type==='buy-equipment'&&action.id==='relic_005')p.history.milestone=Math.max(p.history.milestone,Math.floor(p.peakLevel/4));
        p.peakValue = maxMoney(p.peakValue, previousValues.get(p.id)!);
        refresh(s, p, events, options.catalog);
      }
      events.push({ type: action.type, itemId: action.id });
    } else if (action.type === 'reroll') {
      if (s.month === 1) return fail('gift-cannot-reroll');
      const shop = s.commerce.shop, free = s.equipment.includes('relic_043') && !shop.freeUsed;
      const cost = free ? '0' : rerollPrice(s.month, shop.paidRerolls);
      if (BigInt(s.cash) < BigInt(cost)) return fail('insufficient-cash');
      const offers = rollShop(s.month, s.equipment, s.commerce.unlocked, s.rng.market,undefined,options.shopRarityWeights);
      if (!offers.length) return fail('empty-shop-pool');
      s.cash = String(BigInt(s.cash) - BigInt(cost)); shop.offers = offers;
      if(s.adRewards)delete s.adRewards.legendaryOffer;
      if (free) shop.freeUsed = true; else shop.paidRerolls++;
      events.push({ type: 'reroll', value: cost });
    } else if (action.type === 'buy-merchant') {
      const merchant = s.commerce.merchant, offer = merchant.offers.find(o => o.id === action.id);
      if (merchant.month !== s.month || !offer || offer.purchased >= offer.stock || s.month % 3 !== 0) return fail('merchant-unavailable');
      if (action.id === 'item_006' && (s.commerce.incenseUsed || s.credit >= rules.credit)) return fail('no-credit-to-repair');
      const price = purchasePrice(offer);
      if (BigInt(s.cash) < BigInt(price)) return fail('insufficient-cash');
      s.cash = String(BigInt(s.cash) - BigInt(price)); offer.purchased++;
      if (action.id === 'basic' || action.id === 'special') {
        const p = spawn(s, action.id === 'special', offer.level); s.players.push(p); refresh(s, p, events, options.catalog);
      } else if (action.id === 'item_006') { s.credit++; s.commerce.incenseUsed = true; }
      else if (action.id === 'item_007') {s.commerce.supplySources=addStatusSource(s.commerce.supplySources,'item_007',s.commerce.nextSupply);s.commerce.nextSupply += 2;}
      else if ((itemIds as readonly string[]).includes(action.id)) s.commerce.inventory[action.id as ItemId]++;
      else return fail('unknown-item');
      events.push({ type: 'merchant-purchase', itemId: action.id, value: price });
      if(merchant.offers.every(o=>o.purchased===o.stock))unlock(s,'relic_082',events);
    } else if (action.type === 'settle') {
      const result = previewSettlement(s), month = s.month;
      const bestDelivered=Math.max(0,...s.players.filter(p=>p.queued).map(p=>p.level));
      const supplyFloor=result.met&&s.equipment.includes('relic_050')?2:0;
      const inherited=result.met&&bestDelivered>=10&&s.equipment.includes('relic_067')?Math.floor(bestDelivered*.3):0;
      if(result.met){if(s.credit===1)unlock(s,'relic_077',events);if(BigInt(result.value)>=BigInt(result.required)*3n)unlock(s,'relic_089',events);if(s.completed)s.progress.overtime++;}
      else if(s.equipment.includes('relic_039')){s.progress.ticketSources??={};s.progress.ticketSources.great=addStatusSource(s.progress.ticketSources.great,'relic_039',s.progress.tickets.great);s.progress.tickets.great++;}
      s.cash = String(BigInt(s.cash) + BigInt(result.value));
      s.delivered = String(BigInt(s.delivered) + BigInt(result.value));
      s.scrap = '0'; s.players = s.players.filter(p => !p.queued);
      if (!result.met) s.credit--;
      else { s.commerce.paidMonths++; if (s.equipment.includes('relic_068')) s.credits++; }
      s.commerce.carry = result.met && s.equipment.includes('relic_089') ? String((BigInt(result.value) - BigInt(result.required)) * 3n / 10n) : '0';
      if (s.credit === 0 && s.equipment.includes('relic_077')) { s.credit = 1; s.equipment = s.equipment.filter(id => id !== 'relic_077'); events.push({ type: 'credit-rescue', itemId: 'relic_077' }); }
      if(!s.completed&&month>=rules.contractMonths&&s.credit>0){
        s.completed=true;
        s.completion={month,delivered:s.delivered,totalShots:s.totalShots,bestPlayer:s.bestPlayer?cloneData(s.bestPlayer):null,equipment:[...s.equipment],acknowledged:false};
      }
      checkProgress(s,events);
      if (s.credit === 0) s.status = 'over';
      else {
        s.month = integer(month + 1, 1, rules.maxLevel);
        const count = rules.recruits + s.commerce.nextSupply + (s.equipment.includes('relic_091') ? 1 : 0);
        s.players.push(...Array.from({ length: count }, (_,i) => spawn(s,false,Math.max(supplyFloor,i===0?inherited:0))));
        s.progress.hookUsed=false;s.progress.extraSupply=0;
        // 新供给可带初始等级；达标次数也可能改变持有球员的报价。
        s.players = s.players.map(player => { const p = cloneData(player); refresh(s, p, events, options.catalog); return p; });
        s.commerce.nextSupply = 0; delete s.commerce.supplySources; s.commerce.monthlyRescueUsed = false;
        s.commerce.shop = { month: s.month, offers: rollShop(s.month, s.equipment, s.commerce.unlocked, s.rng.market,undefined,options.shopRarityWeights), giftAvailable: false, paidRerolls: 0, freeUsed: false };
        s.commerce.merchant = makeMerchant(s.month, s.equipment, s.credit, s.commerce.incenseUsed, s.rng.market);
      }
      events.push({ type: 'settlement', month, value: result.value, met: result.met });
    } else {
      const index = s.players.findIndex(p => p.id === action.playerId);
      if (index < 0) return fail('missing-player');
      const p = cloneData(s.players[index]); p.highPotential=isHighPotential(p); migrateHeat(s,p); s.players[index] = p;
      if (action.type === 'use-item') {
        if(p.level>=rules.trainingLevelCap)return fail('level-cap');
        if (p.queued) return fail('withdraw-first');
        if (!(itemIds as readonly string[]).includes(action.id) || action.id === 'item_002') return fail('use-rewind-action');
        if (s.commerce.inventory[action.id] < 1) return fail('item-unavailable');
        const hot = hotCounts(s,p).remaining > 0 || p.heat >= rules.heat;
        if (action.id !== 'item_003' && hot) return fail('item-blocked-during-frenzy');
        if (action.id === 'item_005') {
          if (p.armed.includes('item_001') || p.armed.includes('item_004')) return fail('normal-shot-item-already-armed');
          p.heat = Math.min(rules.heat, p.heat + 3);
        } else {
          if (p.armed.includes(action.id as ArmedItem)) return fail('item-already-armed');
          p.armed.push(action.id as ArmedItem);
        }
        s.commerce.inventory[action.id]--; events.push({ type: 'item-used', playerId: p.id, itemId: action.id });
      } else if (action.type === 'queue') {
        if (p.queued === action.queued) return fail('unchanged-queue');
        p.queued = action.queued;
        events.push({ type: action.queued ? 'queued' : 'withdrawn', playerId: p.id });
      } else if (action.type === 'exchange') {
        if (p.queued) return fail('withdraw-first');
        const bonus=s.equipment.includes('relic_045')&&!s.progress.hookUsed&&(s.commerce.shop.paidRerolls>0||s.commerce.shop.freeUsed)&&p.level===0&&p.shots===0;
        if(bonus)s.progress.hookUsed=true;
        s.players.splice(index, 1); s.credits = integer(s.credits + (bonus?2:1));
        events.push({ type: 'exchange', playerId: p.id });
      } else {
        const sharing=action.type==='share-reward';
        if(sharing&&(!s.careerId||action.careerId!==s.careerId))return fail('share-career-changed');
        if(sharing&&p.shareRewardClaimed)return fail('share-already-rewarded');
        if(sharing&&!p.templateId)return fail('share-no-template');
        if (p.queued) return fail('withdraw-first');
        if(p.level>=rules.trainingLevelCap)return fail('level-cap');
        if(sharing)p.shareRewardClaimed=true;
        if (!sharing&&s.commerce.inventory.item_002 > 0) s.undo = { playerId: p.id, before: cloneData({ ...original, undo: null, adInjury:null }) };
        if(!sharing)inherit(s,p,true);
        // 继承直接到顶时仅领取继承，不扣物品、火热次数或随机抽签。
        if(p.level>=rules.trainingLevelCap){refresh(s,p,events,options.catalog);checkProgress(s,events);s.undo=null;s.revision=integer(s.revision+1);events.push({type:'level-cap',playerId:p.id});return {state:s,events};}
        const startHot = !sharing&&p.heat >= rules.heat && !p.hotShotsRemaining;
        if (startHot) { s.progress.frenzies++; p.heat = 0; p.hotShotsTotal = effectsFor(s.equipment, p.level, true).hotShots; p.hotShotsRemaining = p.hotShotsTotal; }
        const hot = !sharing&&(p.hotShotsRemaining??0)>0, effects = effectsFor(s.equipment, p.level, hot);
        const odds = previewShot(s, p, options);
        const drawn = sharing?'success':outcomeAt(odds.tickets, Math.floor(random(s.rng.economy) * 1000));
        let result = drawn, blocked = false, spineUsed=false;
        if (drawn === 'severe') {
          if (p.armed.includes('item_001')) blocked = true;
          else if ((s.adRewards!.shields[p.id]??0)>0) {blocked=true;s.adRewards!.shields[p.id]--;events.push({type:'ad-injury-protected',playerId:p.id});}
          else if (s.equipment.includes('relic_056') && !s.commerce.monthlyRescueUsed) { result = 'minor'; s.commerce.monthlyRescueUsed = true; }
          else if (s.equipment.includes('relic_090') && !p.traits.cornerUsed) { result = 'minor'; p.traits.cornerUsed = true; }
          else if (s.equipment.includes('relic_062')&&p.history.spineReady) {result='minor';spineUsed=true;p.history.spineReady=false;}
          else if (s.equipment.includes('relic_079') && !p.traits.phoenixUsed) { blocked = true; p.traits.phoenixUsed = true; p.book.permanent = multiply(p.book.permanent, fraction(3,5)); }
        }
        if(!sharing)p.armed = [];
        s.nextShotAt = 0;
        s.totalShots++; p.shots++;
        events.push({ type: blocked ? 'shot-blocked' : 'shot', playerId: p.id, outcome: result, drawn });
        if(sharing)events.push({type:'share-reward',playerId:p.id});
        p.peakValue = maxMoney(p.peakValue, playerValue(s, p));
        if (result === 'severe' && !blocked) {
          if(!s.adRewards!.injuryUsed.includes(p.id))s.adInjury={playerId:p.id,before:cloneData({...original,undo:null,adInjury:null})};
          onBreak(s,p);
          s.cash = String(BigInt(s.cash) + BigInt(effects.severeCash));
          const scrap = effects.severeScrap ? BigInt(p.peakValue) * 3n / 10n : 0n;
          s.scrap = String(BigInt(s.scrap) + scrap);
          s.players.splice(index, 1);
          events.push({ type: 'departed', playerId: p.id, value: String(effects.severeCash) });
          if (scrap) events.push({ type: 'scrap', playerId: p.id, value: String(scrap) });
        } else {
          const before = p.level;
          if (result === 'great') {
            const effective = { ...p.book, base: add(p.book.base, fraction(passiveBase(s))) };
            p.book.greatBank = bankGreat(effective, before).greatBank;
            p.level += rules.reference.sword_value.great_level_delta + effects.extraGreatLevels + p.traits.greatLevels; p.traits.greatLevels = 0;
          }
          if (result === 'success') p.level += rules.reference.sword_value.success_level_delta;
          if (result === 'minor') p.level = Math.max(rules.reference.sword_value.minimum_level, p.level + rules.reference.sword_value.damage_level_delta);
          if (result === 'hold') {
            if (s.equipment.includes('relic_017')) { p.traits.holds++; if (p.traits.holds % 2 === 0) p.level++; }
            if (s.equipment.includes('relic_041')) p.traits.greatLevels = Math.min(4, p.traits.greatLevels + 1);

          } else p.traits.holds = 0;
          if (result === 'minor' && s.equipment.includes('relic_036')) p.traits.scars = Math.min(4, p.traits.scars + 1);
          survivingEffects(s,p,result,hot,before,add(p.book.base,fraction(passiveBase(s))),blocked,spineUsed);
          p.level=Math.min(rules.trainingLevelCap,integer(p.level, 0, rules.maxLevel));
          p.stats = grow(p.stats, p.bias, result, p.level - before, s.rng.attributes, options.gain, options.loss);
          if (!hot) {
            p.normalShots=(p.normalShots??0)+1;
            p.heat = Math.min(rules.heat, p.heat + 1 + (effects.normalHeatEvery&&p.normalShots%effects.normalHeatEvery===0?1:0) + (!p.traits.firstNormalUsed ? effects.firstHeat : 0) + (result === 'minor' ? effects.minorHeat : 0));
            p.traits.firstNormalUsed = true;
          }
          if(hot){
            p.hotShotsRemaining=Math.max(0,(p.hotShotsRemaining??0)-1);
            if(p.hotShotsRemaining===0&&s.equipment.includes('relic_070')&&p.level<rules.trainingLevelCap){p.level++;events.push({type:'frenzy-end-level',playerId:p.id});}
          }
          refresh(s, p, events, options.catalog);
          if (s.equipment.includes('relic_093') && random(s.rng.economy) < 0.02) {
            const clone = cloneData(p); clone.id = `p${s.nextId++}`; clone.matchSeed = hash(`${s.seed}:${clone.id}`); clone.queued = false;
            s.players.push(clone); events.push({ type: 'duplicate', playerId: clone.id });
          }
        }
      }
    }
    checkProgress(s,events);
    s.revision = integer(s.revision + 1);
    return { state: s, events };
  } catch (error) { return fail(error instanceof Error ? error.message : 'invalid-action'); }
}

/** A departed player can use a stopwatch even after their one ad rewind was spent. */
export function injuryRewindOffer(s:Contract):{kind:'stopwatch'|'ad';playerId:string}|null{
 if(s.status!=='playing')return null;
 if(s.undo&&s.commerce.inventory.item_002>0&&!s.players.some(p=>p.id===s.undo!.playerId))return {kind:'stopwatch',playerId:s.undo.playerId};
 if(s.adInjury&&!s.adRewards?.injuryUsed.includes(s.adInjury.playerId))return {kind:'ad',playerId:s.adInjury.playerId};
 return null;
}
/** Returns the same eligibility reason before opening an ad and before committing its reward. */
export function adRewardUnavailable(s:Contract,reward:AdReward,playerId?:string):string|null{
 const a=s.adRewards??freshAdRewards();
 if(reward==='revive')return s.status!=='over'?'revive-not-needed':a.revived?'ad-already-used':null;
 if(s.status!=='playing')return 'game-over';
 if(s.completion&&!s.completion.acknowledged)return 'completion-pending';
 if(reward==='heat'){
  const p=s.players.find(p=>p.id===playerId);
  if(a.heatMonth===s.month)return 'ad-already-used';
  if(!p||p.queued)return 'missing-player';
  if(p.level>=rules.trainingLevelCap)return 'level-cap';
  if(hotCounts(s,p).remaining>0||p.heat>=rules.heat)return 'already-hot';
  
 }
 if(reward==='legendary-shop'){
  if(legendaryAdCooldown(s)>0)return 'ad-already-used';
  if(!legendaryCandidates(s.month,s.equipment,s.commerce.unlocked).length)return 'no-ad-legendary';
 }
 if(reward==='merchant-refresh'){
  if(a.merchantMonth===s.month)return 'ad-already-used';
  if(s.month<3||s.month%3!==0||s.commerce.merchant.month!==s.month)return 'merchant-unavailable';
 }
 if(reward==='injury-rewind'){
  if(!s.adInjury||s.adInjury.playerId!==playerId)return 'no-ad-injury';
  if(a.injuryUsed.includes(playerId!))return 'ad-already-used';
  if(injuryRewindOffer(s)?.kind==='stopwatch')return 'stopwatch-available';
 }
 return null;
}

export function legendaryAdCooldown(s:Contract):number{
 const last=s.adRewards?.legendaryMonth??0;return last>0?Math.max(0,last+3-s.month):0;
}
export function equipmentOfferPrice(s:Contract,id:string):number{
 return s.month===1||(s.adRewards?.legendaryMonth===s.month&&s.adRewards.legendaryOffer===id)?0:shopEntry(id)?.price??0;
}
