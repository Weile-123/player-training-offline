import { config, statLabels } from './config';
import { assetById, assetEffects, initialAssets, loungeCapacity, upgradeCost } from './assets';
import { gameSaleValue, monthPreview } from './economy';
export { rating, saleValue, gameSaleValue, saleBreakdown, requiredPayment, monthPreview, monthlyInterest } from './economy';
import { equipmentById, equipmentEffects } from './equipment';
import { refreshTemplate } from './matching';
import { templateById } from './templates';
import { statKeys, type AssetId, type ConsumableId, type Game, type Player, type RNG, type Outcome, type StatKey } from './types';

const firstNames = ['杰伦','迈克','泰勒','卢卡','安东尼','凯文','德文','马库斯','以赛亚','卡梅隆','布兰登','科尔'];
const lastNames = ['威廉姆斯','约翰逊','布朗','米勒','戴维斯','威尔逊','汤普森','克拉克','沃克','罗宾逊'];
const integer = (rng: RNG, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

export function probabilities(level: number, equipped: readonly string[] = [], protection: Pick<Player, 'hotShots' | 'iceShots'> = { hotShots: 0, iceShots: 0 }, levels = initialAssets()): Record<Outcome, number> {
  const effects = equipmentEffects(equipped), assets = assetEffects(levels);
  let severe = Math.min(config.equipment.severeCap, Math.min(config.risk.severeCap, config.risk.severeBase + level * config.risk.severePerLevel) * effects.severeMultiplier * assets.severeMultiplier);
  let minor: number = config.risk.minor * assets.minorMultiplier;
  const great = Math.min(config.equipment.greatCap, config.risk.great + effects.greatBonus);
  let hold = Math.max(0, config.risk.hold - effects.successBonus - effects.greatBonus - assets.successBonus);
  const success = Math.max(0, 1 - severe - minor - hold - great);
  if (protection.hotShots > 0) { hold += severe; severe = 0; }
  if (protection.iceShots > 0) { hold += minor; minor = 0; }
  const result = { severe, minor, hold, success, great };
  const total = Object.values(result).reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(Object.entries(result).map(([key, value]) => [key, value / total])) as Record<Outcome, number>;
}
export const trainingProbabilities = (game: Game, player: Player) => probabilities(player.level, game.equippedEquipment, player, game.assetLevels);

export function generatePlayer(month: number, index: number, rng: RNG): Player {
  return refreshTemplate({ id: `m${month}-p${index}`, name: `${firstNames[integer(rng,0,firstNames.length-1)]}·${lastNames[integer(rng,0,lastNames.length-1)]}`,
    age: integer(rng,...config.age), height: integer(rng,...config.height),
    stats: Object.fromEntries(statKeys.map(key => [key, integer(rng,...config.initialStat)])) as Player['stats'],
    level: 0, shots: 0, templateId: null, heat: 0, hotShots: 0, iceShots: 0 });
}
export function newGame(rng: RNG = Math.random): Game {
  const recruits = Array.from({ length: config.recruitsPerMonth }, (_, index) => generatePlayer(1,index,rng));
  return { version:1, month:1, cash:0, debt:config.initialDebt, credit:config.initialCredit, recruits, lounge:[], selectedId:recruits[0].id,
    status:'playing', totalSales:0, totalPaid:0, totalShots:0, logs:['训练营开张。两位新人已到场，月底需偿还 $50,000。'], lastOutcome:null, revision:0,
    ownedEquipment: [], equippedEquipment: [], consumables: { ...config.consumables.starter }, assetLevels:initialAssets(), totalInterest:0, totalPassiveIncome:0 };
}
export const players = (g: Game) => [...g.recruits,...g.lounge,...(g.activePlayer?[g.activePlayer]:[])];
export const selectedPlayer = (g: Game) => players(g).find(p => p.id === g.selectedId);
function log(g: Game, text: string): Game { return { ...g, revision:g.revision+1, logs:[text,...g.logs].slice(0,config.logLimit) }; }
function replacePlayer(g: Game, p: Player): Game {
  return { ...g, recruits:g.recruits.map(x => x.id === p.id ? p : x), lounge:g.lounge.map(x => x.id === p.id ? p : x),...(g.activePlayer?.id===p.id?{activePlayer:p}:{}) };
}
function removePlayer(g: Game, id: string): Game {
  const recruits = g.recruits.filter(p => p.id !== id), lounge = g.lounge.filter(p => p.id !== id);
  if(g.activePlayer?.id===id)return {...g,recruits,lounge,activePlayer:null,activeSource:null,selectedId:null};
  return { ...g, recruits, lounge, selectedId:g.selectedId === id ? recruits[0]?.id ?? lounge[0]?.id ?? null : g.selectedId };
}
export function select(g: Game, id: string): Game {
  if(g.status!=='playing'||g.activePlayer?.id===id)return g;
  const player=g.recruits.find(p=>p.id===id)??g.lounge.find(p=>p.id===id);
  if(!player)return g;
  const source=g.recruits.some(p=>p.id===id)?'recruits':'lounge';
  const recruits=g.recruits.filter(p=>p.id!==id),lounge=g.lounge.filter(p=>p.id!==id);
  if(g.activePlayer){
    if(lounge.length>=loungeCapacity(g))return log(g,'休息室已满，请先腾出位置或出售当前训练球员，再切换球员。');
    lounge.push(g.activePlayer);
  }
  return {...g,recruits,lounge,activePlayer:player,activeSource:source,selectedId:id,lastOutcome:null,revision:g.revision+1};
}
export function sell(g: Game, id: string, severe = false): Game {
  const p = players(g).find(p => p.id === id);
  if (!p || g.status === 'over') return g;
  const price = severe ? config.economy.minimumSale : gameSaleValue(g,p);
  return log({ ...removePlayer(g,id), cash:g.cash+price, totalSales:g.totalSales+1, lastOutcome:severe ? 'severe' : null },
    `${p.name}${severe ? '重伤离营，按最低价' : '交给球探，获得'} $${price.toLocaleString('en-US')}。`);
}
export function rest(g: Game, id: string): Game {
  const p = g.activePlayer?.id===id?g.activePlayer:g.recruits.find(p => p.id === id);
  if (!p || g.status === 'over' || g.lounge.length >= loungeCapacity(g)) return g;
  return log({ ...g, recruits:g.recruits.filter(x => x.id !== id), lounge:[...g.lounge,p],...(g.activePlayer?.id===id?{activePlayer:null,activeSource:null,selectedId:null}:{}), lastOutcome:null }, `${p.name}进入休息室，训练与手感状态跨月保留。`);
}
function pickStat(available: StatKey[], rng: RNG, weights: Record<StatKey, number>): StatKey {
  const total = available.reduce((sum, key) => sum + weights[key], 0);
  let target = rng() * total;
  const index = available.findIndex(key => { target -= weights[key]; return target < 0; });
  return available.splice(index < 0 ? available.length - 1 : index, 1)[0];
}
export function train(g: Game, rng: RNG = Math.random): Game {
  // A full meter from an older save protects the next shot immediately.
  g = activateHot(g);
  const p = selectedPlayer(g);
  if (!p || g.status === 'over') return g;
  const chances = trainingProbabilities(g,p), roll = rng();
  let cumulative = 0, outcome: Outcome = 'great';
  for (const key of ['severe','minor','hold','success','great'] as Outcome[]) {
    cumulative += chances[key]; if (roll < cumulative) { outcome = key; break; }
  }
  const base = { ...g, totalShots:g.totalShots+1 };
  if (outcome === 'severe') return sell(base,p.id,true);
  const effects = equipmentEffects(g.equippedEquipment), assets = assetEffects(g.assetLevels);
  const updated = { ...p, stats:{ ...p.stats }, shots:p.shots+1, hotShots:Math.max(0,p.hotShots-1), iceShots:Math.max(0,p.iceShots-1) };
  const changes: string[] = [];
  if (outcome === 'success' || outcome === 'great' || outcome === 'minor') {
    const available = [...statKeys], count = config.growth[`${outcome}Count`], range = config.growth[outcome];
    const weights = outcome === 'minor' ? equipmentEffects().statWeights : effects.statWeights;
    for (let index=0; index<count; index++) {
      const key = pickStat(available,rng,weights), before = updated.stats[key];
      const amount = integer(rng,range[0],range[1]) + (outcome === 'minor' ? 0 : effects.growthBonus + effects.statGrowth[key] + assets.growthBonus);
      updated.stats[key] = Math.max(0,Math.min(config.maxStat,before+amount*(outcome === 'minor' ? -1 : 1)));
      changes.push(`${statLabels[key]} ${updated.stats[key]-before >= 0 ? '+' : ''}${updated.stats[key]-before}`);
    }
    updated.level += outcome === 'great' ? 2 : outcome === 'success' ? 1 : 0;
    if (p.hotShots === 0) updated.heat = Math.max(0,Math.min(config.feel.maximum,p.heat + (outcome === 'great' ? config.feel.greatGain : outcome === 'success' ? config.feel.successGain : -config.feel.minorLoss)));
  }
  const charged = automaticHot(updated);
  const matched = outcome === 'hold' ? charged : refreshTemplate(charged);
  const templateChange = p.templateId !== matched.templateId ? ` 模板变化：${templateById(p.templateId)?.name ?? '待发掘'} → ${templateById(matched.templateId)?.name ?? '待发掘'}。` : '';
  const labels = { minor:'轻伤', hold:'维持', success:'训练成功', great:'大成功' };
  const protection = p.hotShots > 0 || p.iceShots > 0 ? ` 保护剩余：火热 ${updated.hotShots} 次、冰敷 ${updated.iceShots} 次。` : '';
  return log({ ...replacePlayer(base,matched), lastOutcome:outcome }, `${p.name}：${labels[outcome]}${changes.length ? ' · '+changes.join(' / ') : '，属性不变'}。手感 ${matched.heat}/${config.feel.maximum}。${charged!==updated?` 自动进入火热，接下来 ${charged.hotShots} 次免疫重伤。`:''}${templateChange}${protection}`);
}
function automaticHot(p:Player):Player {
  return p.hotShots===0&&p.heat>=config.feel.activationCost
    ? {...p,heat:p.heat-config.feel.activationCost,hotShots:config.feel.hotShots} : p;
}
export function activateHot(g: Game): Game {
  const p = selectedPlayer(g);
  if (!p || g.status === 'over' || p.hotShots > 0 || p.heat < config.feel.activationCost) return g;
  return log({ ...replacePlayer(g,{ ...p,heat:p.heat-config.feel.activationCost,hotShots:config.feel.hotShots }),lastOutcome:null },
    `${p.name}开启手感火热，接下来 ${config.feel.hotShots} 次训练免疫重伤。`);
}
export function buyEquipment(g: Game, id: string): Game {
  const item = equipmentById(id);
  if (!item || g.status === 'over' || g.ownedEquipment.includes(id) || g.cash < item.price) return g;
  return log({ ...g,cash:g.cash-item.price,ownedEquipment:[...g.ownedEquipment,id],lastOutcome:null }, `购买 ${item.name}，花费 $${item.price.toLocaleString('en-US')}，装配后生效。`);
}
export function toggleEquipment(g: Game, id: string): Game {
  const item = equipmentById(id);
  if (!item || g.status === 'over' || !g.ownedEquipment.includes(id)) return g;
  const active = g.equippedEquipment.includes(id);
  if (!active && g.equippedEquipment.length >= config.equipment.slots) return g;
  return log({ ...g,equippedEquipment:active ? g.equippedEquipment.filter(x => x !== id) : [...g.equippedEquipment,id],lastOutcome:null }, `${active ? '卸下' : '装配'} ${item.name}。`);
}
export function buyConsumable(g: Game, id: ConsumableId, quantity = 1): Game {
  if ((id !== 'drink' && id !== 'ice') || !Number.isSafeInteger(quantity) || quantity <= 0) return g;
  const item = config.consumables[id];
  if (g.status === 'over' || g.cash < item.price * quantity || g.consumables[id] + quantity > config.consumables.maximumStock) return g;
  return log({ ...g,cash:g.cash-item.price*quantity,consumables:{ ...g.consumables,[id]:g.consumables[id]+quantity },lastOutcome:null }, `购买 ${item.name} ×${quantity}，花费 $${(item.price*quantity).toLocaleString('en-US')}。`);
}
export function useConsumable(g: Game, id: ConsumableId): Game {
  const p = selectedPlayer(g);
  if (!p || g.status === 'over' || (id !== 'drink' && id !== 'ice') || g.consumables[id] <= 0) return g;
  if ((id === 'drink' && (p.heat >= config.feel.maximum || p.hotShots > 0)) || (id === 'ice' && p.iceShots > 0)) return g;
  const updated = id === 'drink' ? { ...p,heat:Math.min(config.feel.maximum,p.heat+config.consumables.drink.heatGain) } : { ...p,iceShots:config.consumables.ice.protectedShots };
  const charged=automaticHot(updated);
  return log({ ...replacePlayer(g,charged),consumables:{ ...g.consumables,[id]:g.consumables[id]-1 },lastOutcome:null }, `${p.name}使用${config.consumables[id].name}：${id === 'drink' ? charged.hotShots>0?`自动进入火热，接下来 ${charged.hotShots} 次免疫重伤`:`手感 ${charged.heat}/${config.feel.maximum}` : '下一次训练免疫轻伤'}。`);
}
export function upgradeAsset(g: Game, id: AssetId): Game {
  const asset = assetById(id), cost = upgradeCost(g.assetLevels,id);
  if (!asset || cost === null || g.status === 'over' || g.cash < cost) return g;
  return log({ ...g,cash:g.cash-cost,assetLevels:{ ...g.assetLevels,[id]:g.assetLevels[id]+1 },lastOutcome:null },
    `${asset.name}升至 Lv.${g.assetLevels[id]+1}，投资 $${cost.toLocaleString('en-US')}。`);
}
export function nextMonth(g: Game, rng: RNG = Math.random): Game {
  if (g.status === 'over') return g;
  const report = monthPreview(g);
  const ending = { ...g,...('activePlayer' in g?{activePlayer:null,activeSource:null}:{}),cash:report.cashAfter,debt:report.debtAfter,credit:report.creditAfter,
    totalSales:g.totalSales+report.autoSales,totalPaid:g.totalPaid+report.paid,
    totalInterest:g.totalInterest+report.interest,totalPassiveIncome:g.totalPassiveIncome+report.passiveIncome,lastOutcome:null };
  const summary = `第 ${g.month} 月结算：出售 $${report.saleIncome.toLocaleString('en-US')}，租金 $${report.passiveIncome.toLocaleString('en-US')}，利息 $${report.interest.toLocaleString('en-US')}；${report.canPay ? `还款 $${report.paid.toLocaleString('en-US')}` : '资金不足，信用 -1'}。`;
  if (report.creditAfter === 0) return log({ ...ending,status:'over',recruits:[],selectedId:null },summary+'信用归零，训练营关闭。');
  const recruits = Array.from({ length:config.recruitsPerMonth },(_,i) => generatePlayer(g.month+1,i,rng));
  return log({ ...ending,month:g.month+1,recruits,selectedId:recruits[0].id },summary+(report.debtAfter === 0 ? '债务已清，自由经营！' : '新月到来，两位新人加入。'));
}
export function repay(g: Game, amount: number): Game {
  if (g.status === 'over' || !Number.isFinite(amount) || amount <= 0) return g;
  const paid = Math.min(Math.floor(amount),g.cash,g.debt); if (!paid) return g;
  return log({ ...g,cash:g.cash-paid,debt:g.debt-paid,totalPaid:g.totalPaid+paid,lastOutcome:null }, `主动还款 $${paid.toLocaleString('en-US')}。${g.debt === paid ? '债务已清，进入自由经营。' : ''}`);
}
export function seededRandom(seed: number): RNG { let value=seed>>>0; return () => { value=(Math.imul(value,1664525)+1013904223)>>>0; return value/4294967296; }; }
