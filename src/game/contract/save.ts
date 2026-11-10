import {cloneData} from '../../utils/cloneData';
import {validStatusSources} from './statusSources';
import {migrateHeat} from './heat';
import {isHighPotential} from './recruits';
import type { Contract, Collection } from './engine';
import { newContract, freshTraits, captureBestPlayer, migrateLevelCap, refreshUnmatchedTemplates } from './engine';
import { validateEquipment } from './effects';
import { statKeys } from '../types';
import { rules } from './rules';
import { hash, stream } from './random';
import { newCommerce, shopEntry, itemIds, armedItems, merchantItems } from './commerce';
import {freshHistory,freshProgress} from './progression';

// 独立命名空间：此批次不覆盖任何债务版档案或图鉴 key。
export const contractSaveKeys = { main: 'player-training.contract.v2', backup: 'player-training.contract.v2.backup' };
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
function number(v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number { return typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max; }
function money(v: unknown): v is string { return typeof v === 'string' && v.length <= 20000 && /^(0|[1-9]\d*)$/.test(v); }
function rational(v: unknown): boolean { return isRecord(v) && money(v.n) && money(v.d) && v.d !== '0'; }
function six(v: unknown, low: number, high: number, integral = true): boolean {
  return isRecord(v) && statKeys.every(k => typeof v[k] === 'number' && Number.isFinite(v[k]) && (v[k] as number) >= low && (v[k] as number) <= high && (!integral || Number.isInteger(v[k])));
}
function collectionValid(v: unknown): v is Collection {
  return isRecord(v) && Object.entries(v).every(([id, r]) => id.length <= 100 && !['__proto__', 'constructor', 'prototype'].includes(id) && isRecord(r) && number(r.firstMonth, 1, rules.maxLevel) && typeof r.highestRating === 'number' && Number.isFinite(r.highestRating) && r.highestRating >= 0 && r.highestRating <= 99 && money(r.highestValue));
}
/** 存档来自不可信JSON；先逐字段校验，再交给领域引擎。 */
export function validContract(v: unknown, nested = false): v is Contract {
  if(isRecord(v)&&v.careerId!==undefined&&(typeof v.careerId!=='string'||!v.careerId.length||v.careerId.length>120))return false;
  if (!isRecord(v) || v.version !== rules.version || !number(v.seed, 0, 0xffffffff) || !number(v.revision) || !number(v.month, 1, rules.maxLevel) || !number(v.credit, 0, rules.credit) || !money(v.cash) || !money(v.delivered) || !money(v.scrap) || !number(v.credits) || !number(v.clockMs) || !number(v.nextShotAt) || !number(v.nextId, 1) || !number(v.totalShots) || typeof v.completed !== 'boolean' || !['playing', 'over'].includes(String(v.status))) return false;
  if ((v.status === 'over') !== (v.credit === 0) || (v.completed && (v.month as number) < rules.contractMonths)) return false;
  const best=v.bestPlayer;
  if(v.sponsorShareMonth!==undefined&&!number(v.sponsorShareMonth,1,v.month as number))return false;
  if(best!==undefined&&best!==null&&(!isRecord(best)||typeof best.playerId!=='string'||!/^p[1-9]\d*$/.test(best.playerId)||typeof best.templateId!=='string'||!/^[a-z0-9-]+$/.test(best.templateId)||!money(best.value)||!number(best.level,0,rules.maxLevel)||!six(best.stats,0,99)))return false;
  if(v.completion!==undefined){
   const c=v.completion;
   if(!isRecord(c)||!v.completed||!number(c.month,rules.contractMonths,v.month as number)||!money(c.delivered)||!number(c.totalShots,0,v.totalShots as number)||typeof c.acknowledged!=='boolean'||!Array.isArray(c.equipment))return false;
   try{validateEquipment(c.equipment as string[]);}catch{return false;}
   if(c.bestPlayer!==null){const b=c.bestPlayer;if(!isRecord(b)||typeof b.playerId!=='string'||!/^p[1-9]\d*$/.test(b.playerId)||typeof b.templateId!=='string'||!/^[a-z0-9-]+$/.test(b.templateId)||!money(b.value)||!number(b.level,0,rules.maxLevel)||!six(b.stats,0,99))return false;}
  }
  if (!Array.isArray(v.equipment) || !v.equipment.every(id => typeof id === 'string')) return false;
  try { validateEquipment(v.equipment); } catch { return false; }
  if (!isRecord(v.rng) || !isRecord(v.rng.economy) || !number(v.rng.economy.state, 0, 0xffffffff) || !isRecord(v.rng.attributes) || !number(v.rng.attributes.state, 0, 0xffffffff) || !collectionValid(v.collection)) return false;
  if (!isRecord(v.rng.market) || !number(v.rng.market.state, 0, 0xffffffff)) return false;
  if(!isRecord(v.progress))return false;
  for(const [key,initial] of Object.entries(freshProgress())) {
    const actual=v.progress[key];
    if(typeof initial==='number'&&!number(actual))return false;
    if(typeof initial==='boolean'&&typeof actual!=='boolean')return false;
  }
  if(!validStatusSources(v.progress.inheritanceSources,['relic_028','relic_034','relic_076']))return false;
  if(v.progress.ticketSources!==undefined&&(!isRecord(v.progress.ticketSources)||!Object.entries(v.progress.ticketSources).every(([key,value])=>['severe','minor','hold','success','great'].includes(key)&&validStatusSources(value,key==='great'?['relic_039','relic_065']:['relic_065']))))return false;
  const tickets=v.progress.tickets;
  if(!isRecord(tickets)||!['severe','minor','hold','success','great'].every(k=>number(tickets[k])))return false;
  const c = v.commerce;
  if (!isRecord(c) || !isRecord(c.shop) || !isRecord(c.merchant) || !isRecord(c.inventory) || !Array.isArray(c.unlocked)) return false;
  if (!c.unlocked.every(id => typeof id === 'string' && shopEntry(id)?.locked) || new Set(c.unlocked).size !== c.unlocked.length || !number(c.nextSupply, 0, 100000) || !number(c.paidMonths, 0, rules.maxLevel) || !money(c.carry) || typeof c.incenseUsed !== 'boolean' || typeof c.monthlyRescueUsed !== 'boolean') return false;
  if (Object.keys(c.inventory).length !== itemIds.length || !itemIds.every(id => number((c.inventory as Record<string, unknown>)[id], 0, 100000))) return false;
  if(!validStatusSources(c.supplySources,['item_007','relic_094']))return false;
  const shop = c.shop;
  if (shop.month !== v.month || !Array.isArray(shop.offers) || shop.offers.length > 3 || new Set(shop.offers).size !== shop.offers.length || !shop.offers.every(id => typeof id === 'string' && shopEntry(id)) || !number(shop.paidRerolls, 0, 1000) || typeof shop.freeUsed !== 'boolean' || typeof shop.giftAvailable !== 'boolean' || (shop.giftAvailable && v.month !== 1)) return false;
  const merchant = c.merchant;
  if (merchant.month !== v.month || !Array.isArray(merchant.offers) || merchant.offers.length > 9 || new Set(merchant.offers.map(o => isRecord(o) ? o.id : null)).size !== merchant.offers.length) return false;
  for (const o of merchant.offers) if (!isRecord(o) || !['basic','special', ...merchantItems.map(i => i.id)].includes(String(o.id)) || !money(o.basePrice) || !number(o.stock, 1, 100) || !number(o.purchased, 0, o.stock as number) || !number(o.level, 0, 7)) return false;
  if(v.adRewards!==undefined){
    const a=v.adRewards;
    if(!isRecord(a)||!number(a.heatMonth,0,v.month as number)||!number(a.legendaryMonth,0,v.month as number)||!number(a.merchantMonth,0,v.month as number)||typeof a.revived!=='boolean'||!Array.isArray(a.injuryUsed)||a.injuryUsed.length>10000||new Set(a.injuryUsed).size!==a.injuryUsed.length||!isRecord(a.shields))return false;
    if(a.legendaryOffer!==undefined&&(typeof a.legendaryOffer!=='string'||shopEntry(a.legendaryOffer)?.rarity!=='legendary'))return false;
    const playerId=(id:unknown)=>typeof id==='string'&&/^p[1-9]\d*$/.test(id)&&number(Number(id.slice(1)),1,(v.nextId as number)-1);
    if(!a.injuryUsed.every(playerId)||!Object.entries(a.shields).every(([id,n])=>playerId(id)&&number(n,0,2)&&(a.injuryUsed as unknown[]).includes(id)))return false;
  }
  if(v.adInjury!==undefined&&v.adInjury!==null){
    const i=v.adInjury;
    if(nested||v.status!=='playing'||!isRecord(i)||typeof i.playerId!=='string'||!validContract(i.before,true)||i.before.adInjury||i.before.undo||i.before.month!==v.month||i.before.careerId!==v.careerId||i.before.revision>=(v.revision as number)||!i.before.players.some(p=>p.id===i.playerId)||!Array.isArray(v.players)||v.players.some(p=>isRecord(p)&&p.id===i.playerId))return false;
  }
  const undo = v.undo;
  if (undo !== null && (nested || !isRecord(undo) || typeof undo.playerId !== 'string' || !validContract(undo.before, true) || undo.before.undo !== null || undo.before.month !== v.month || undo.before.revision >= (v.revision as number) || !undo.before.players.some(p => p.id === undo.playerId))) return false;
  if (!Array.isArray(v.players) || v.players.length > 10000) return false;
  const ids = new Set();
  for (const p of v.players) {
    if (!isRecord(p) || typeof p.id !== 'string' || !/^p[1-9]\d*$/.test(p.id) || !number(Number(p.id.slice(1)), 1, (v.nextId as number) - 1) || ids.has(p.id) || !number(p.height, 178, 218) || !number(p.level, 0, rules.maxLevel) || !number(p.peakLevel, p.level as number, rules.maxLevel) || !number(p.shots) || !number(p.heat, 0, rules.heat) || !number(p.hotUntil) || (p.hotDurationMs!==undefined&&!number(p.hotDurationMs,0,86400000)) || typeof p.queued !== 'boolean' || !number(p.matchSeed, 0, 0xffffffff) || !money(p.peakValue)) return false;
    if(p.highPotential!==undefined&&typeof p.highPotential!=='boolean')return false;
    if(p.shareRewardClaimed!==undefined&&typeof p.shareRewardClaimed!=='boolean')return false;
    if(p.normalShots!==undefined&&!number(p.normalShots))return false;
    if(p.hotShotsRemaining!==undefined||p.hotShotsTotal!==undefined){if(!number(p.hotShotsRemaining,0,1000000)||!number(p.hotShotsTotal,0,1000000)||(p.hotShotsRemaining as number)>(p.hotShotsTotal as number))return false;}
    ids.add(p.id);
    if(!isRecord(p.history))return false;
    for(const [key,initial] of Object.entries(freshHistory())) {
      const actual=p.history[key];
      if(typeof initial==='number'&&!number(actual))return false;
      if(typeof initial==='boolean'&&typeof actual!=='boolean')return false;
    }
    if(!validStatusSources(p.history.successSources,['relic_028','relic_059']))return false;
    if(p.history.previous!==null&&!['severe','minor','hold','success','great'].includes(String(p.history.previous)))return false;
    if (!six(p.stats, 0, 99) || !six(p.bias, 0, 1, false) || !six(p.lastStyle, -3, 3, false) || !(p.templateId === null || (typeof p.templateId === 'string' && /^[a-z0-9-]+$/.test(p.templateId)))) return false;
    if (!(p.highestTier === null || rules.tiers.some(t => t.id === p.highestTier))) return false;
    if (!Array.isArray(p.armed) || new Set(p.armed).size !== p.armed.length || !p.armed.every(id => (armedItems as readonly unknown[]).includes(id))) return false;
    if (!isRecord(p.traits) || !number(p.traits.holds) || !number(p.traits.scars,0,4) || !number(p.traits.greatLevels,0,4) || typeof p.traits.firstNormalUsed !== 'boolean' || typeof p.traits.phoenixUsed !== 'boolean' || typeof p.traits.cornerUsed !== 'boolean') return false;
    if (!isRecord(p.book) || !['base', 'greatBank', 'flat', 'permanent'].every(k => rational((p.book as Record<string, unknown>)[k]))) return false;
  }
  return true;
}
export function encodeContract(state: Contract): string {
  if (!validContract(state)) throw new Error('拒绝保存无效合同档案');
  const payload = JSON.stringify(state);
  return JSON.stringify({ format: 'contract-envelope-v1', checksum: hash(payload), payload });
}
export function decodeContract(raw: string | null): Contract | null {
  try {
    if (!raw || raw.length > 10000000) return null;
    const envelope = JSON.parse(raw);
    if (envelope?.format !== 'contract-envelope-v1' || typeof envelope.payload !== 'string' || hash(envelope.payload) !== envelope.checksum) return null;
    const state: unknown = JSON.parse(envelope.payload);
    if (isRecord(state) && state.version === 'contract-v2.0-experimental') {
      if (!number(state.seed,0,0xffffffff) || !number(state.month,1,rules.maxLevel) || !number(state.credit,0,3) || !Array.isArray(state.equipment) || !state.equipment.every(id => typeof id === 'string') || !isRecord(state.rng) || !Array.isArray(state.players)) return null;
      validateEquipment(state.equipment);
      const market = stream(state.seed, 'market');
      state.commerce = newCommerce(state.month, state.equipment, state.credit, market);
      state.rng.market = market; state.undo = null; state.version = 'contract-v2.1-experimental';
      // 旧实验档未记录首个普通出手：已训练球员保守标记用过，避免迁移额外领奖。
      for (const p of state.players) { if (!isRecord(p)) return null; p.armed = []; p.traits = { ...freshTraits(), firstNormalUsed: typeof p.shots === 'number' && p.shots > 0 }; }
    }
    if(isRecord(state)&&state.version==='contract-v2.1-experimental'){
      if(!Array.isArray(state.players))return null;
      state.version=rules.version;state.progress=freshProgress();state.undo=null;
      for(const p of state.players){if(!isRecord(p))return null;p.history={...freshHistory(),milestone:typeof p.peakLevel==='number'?Math.floor(p.peakLevel/4):0};}
    }
    if(!validContract(state))return null;
    for(const p of state.players)if(p.highPotential===undefined)p.highPotential=isHighPotential(p);
    if(state.bestPlayer===undefined){state.bestPlayer=null;captureBestPlayer(state);}
    const migrate=(g:Contract)=>{migrateLevelCap(g);for(const p of g.players)migrateHeat(g,p);g.nextShotAt=0;if(g.undo)migrate(g.undo.before);if(g.adInjury)migrate(g.adInjury.before);};migrate(state);
    refreshUnmatchedTemplates(state);
    if(state.undo)refreshUnmatchedTemplates(state.undo.before);
    if(state.adInjury)refreshUnmatchedTemplates(state.adInjury.before);
    return state;
  } catch { return null; }
}
export function readContract(storage: StoragePort): { state: Contract | null; source: 'main' | 'backup' | 'none'; error?: string } {
  try {
    const rawMain = storage.getItem(contractSaveKeys.main), main = decodeContract(rawMain);
    if (main) return { state: main, source: 'main' };
    const rawBackup = storage.getItem(contractSaveKeys.backup), backup = decodeContract(rawBackup);
    return { state: backup, source: backup ? 'backup' : 'none', ...(!backup&&(rawMain||rawBackup)?{error:'invalid-save'}:{}) };
  } catch { return { state: null, source: 'none', error: 'storage-unavailable' }; }
}
// Cache only the exact, successfully written envelope. External writes/corruption
// invalidate the match and still go through the full decoder before backup rotation.
const lastWrittenEnvelope=new WeakMap<StoragePort,string>();
export function writeContract(storage: StoragePort, state: Contract): { ok: boolean; error?: string } {
  try {
    const encoded = encodeContract(state), previous = storage.getItem(contractSaveKeys.main);
    // 主档已损坏时不覆盖良好备份；首次保存先创建备份。
    try {
      if (previous!==null&&(lastWrittenEnvelope.get(storage)===previous||decodeContract(previous))) storage.setItem(contractSaveKeys.backup, previous);
      else if (!decodeContract(storage.getItem(contractSaveKeys.backup))) storage.setItem(contractSaveKeys.backup, encoded);
    } catch { /* An unavailable backup slot must not prevent writing the main save. */ }
    storage.setItem(contractSaveKeys.main, encoded);
    if(storage.getItem(contractSaveKeys.main)!==encoded)return {ok:false,error:'save-readback-mismatch'};
    lastWrittenEnvelope.set(storage,encoded);
    return { ok: true };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'save-failed' }; }
}
/** 只生成新合同，不换算旧债务/现金。正式界面由 contractStore 先归档再开始。 */
export function prepareNewCareer(seed: number, oldRaw: string | null, collection: Collection = {}) {
  if (!collectionValid(collection)) throw new Error('图鉴格式无效');
  return { state: newContract(seed), legacyArchive: oldRaw, legacyCollection: cloneData(collection) };
}
