import { config } from './config';
import { fitsHeight, overallRating, refreshTemplate, tierConfig } from './matching';
import { templateById } from './templates';
import { assetCatalog, assetEffects, initialAssets } from './assets';
import { assetIds } from './types';
import { equipmentById } from './equipment';
import { statKeys, type Game, type Player } from './types';
export type StorageLike = Pick<Storage,'getItem'|'setItem'>;
const finiteInt=(x:unknown,min=0,max=Number.MAX_SAFE_INTEGER):x is number => typeof x==='number' && Number.isSafeInteger(x) && x>=min && x<=max;
function validPlayer(value:unknown): value is Player {
  if(!value||typeof value!=='object') return false;
  const p=value as Player;
  return typeof p.id==='string' && p.id.length>0 && typeof p.name==='string' && p.name.length<=100 && finiteInt(p.age,18,23) && finiteInt(p.height,178,218) && finiteInt(p.level) && finiteInt(p.shots) && (p.heat === undefined || finiteInt(p.heat,0,config.feel.maximum)) && (p.hotShots === undefined || finiteInt(p.hotShots,0,config.feel.hotShots)) && (p.iceShots === undefined || finiteInt(p.iceShots,0,config.consumables.ice.protectedShots)) && !!p.stats && statKeys.every(k=>finiteInt(p.stats[k],0,99));
}
function restorePlayer(original: Player): Player {
  const player = { ...original, heat: original.heat ?? 0, hotShots: original.hotShots ?? 0, iceShots: original.iceShots ?? 0 };
  const template = templateById(player.templateId);
  const rating = overallRating(player.stats);
  const tier = template && tierConfig(template.tier);
  const nextTier = tier && config.matching.tiers.find(t => t.minimumRating > tier.minimumRating);
  if (template && tier && fitsHeight(player.height, template) &&
    rating >= tier.minimumRating - config.matching.downgradeBuffer &&
    (!nextTier || rating < nextTier.minimumRating)) return player;
  return refreshTemplate(player);
}

export function decodeSave(raw:string|null):Game|null {
  try {
    if(!raw) return null; const g=JSON.parse(raw) as Game;
    if(!g||g.version!==1||!finiteInt(g.month,1)||!finiteInt(g.cash)||!finiteInt(g.debt,0,config.economy.debtCap)||!finiteInt(g.credit,0,3)||!finiteInt(g.totalShots)||!finiteInt(g.totalPaid)||!finiteInt(g.totalSales)||!finiteInt(g.revision)) return null;
    const levels = g.assetLevels === undefined ? initialAssets() : g.assetLevels;
    if (!levels || typeof levels !== 'object' || !assetIds.every(id => finiteInt(levels[id],0,assetCatalog.find(a=>a.id===id)!.costs.length))) return null;
    if (g.totalInterest !== undefined && !finiteInt(g.totalInterest)) return null;
    if (g.totalPassiveIncome !== undefined && !finiteInt(g.totalPassiveIncome)) return null;
    if(!Array.isArray(g.recruits)||g.recruits.length>2||!Array.isArray(g.lounge)||g.lounge.length>assetEffects(levels).loungeCapacity||![...g.recruits,...g.lounge].every(validPlayer)) return null;
    if(g.activePlayer!==undefined&&g.activePlayer!==null&&!validPlayer(g.activePlayer))return null;
    if(g.activeSource!==undefined&&g.activeSource!==null&&!['recruits','lounge'].includes(g.activeSource))return null;
    if(g.activePlayer&&g.selectedId!==g.activePlayer.id)return null;
    if(!g.activePlayer&&g.activeSource)return null;
    const ids=[...g.recruits,...g.lounge,...(g.activePlayer?[g.activePlayer]:[])].map(p=>p.id); if(new Set(ids).size!==ids.length) return null;
    if(g.selectedId!==null&&!ids.includes(g.selectedId)) return null;
    if(!['playing','over'].includes(g.status)||(g.status==='over')!==(g.credit===0)) return null;
    if(!Array.isArray(g.logs)||g.logs.length>config.logLimit||!g.logs.every(x=>typeof x==='string')) return null;
    if(g.lastOutcome!==null&&!['severe','minor','hold','success','great'].includes(g.lastOutcome)) return null;
    const owned = g.ownedEquipment === undefined ? [] : g.ownedEquipment, equipped = g.equippedEquipment === undefined ? [] : g.equippedEquipment, inventory = g.consumables === undefined ? { ...config.consumables.starter } : g.consumables;
    if (!Array.isArray(owned) || owned.length > config.equipment.catalog.length || !owned.every(id => typeof id === 'string' && equipmentById(id)) || new Set(owned).size !== owned.length) return null;
    if (!Array.isArray(equipped) || equipped.length > config.equipment.slots || !equipped.every(id => owned.includes(id)) || new Set(equipped).size !== equipped.length) return null;
    if (!inventory || !finiteInt(inventory.drink,0,config.consumables.maximumStock) || !finiteInt(inventory.ice,0,config.consumables.maximumStock)) return null;
    // v1 存档沿用同一 key；缺失/过期的模板信息按有效球员属性修复。
    return { ...g, assetLevels:levels, totalInterest:g.totalInterest ?? 0, totalPassiveIncome:g.totalPassiveIncome ?? 0, ownedEquipment: owned, equippedEquipment: equipped, consumables: inventory, recruits: g.recruits.map(restorePlayer), lounge: g.lounge.map(restorePlayer),...(g.activePlayer?{activePlayer:restorePlayer(g.activePlayer),activeSource:g.activeSource??'recruits'}:{}) };
  } catch {return null;}
}
export function loadSave(storage:StorageLike):{game:Game|null;message:string} {
  try {
    const raw=storage.getItem(config.saveKey), backup=storage.getItem(config.backupKey);
    const game=decodeSave(raw); if(game) return {game,message:'已恢复本地存档'};
    const recovered=decodeSave(backup); if(recovered) return {game:recovered,message:'主存档异常，已恢复备份'};
    return {game:null,message:raw||backup?'存档损坏或版本不兼容，已开启新游戏':'每次操作自动保存在本机'};
  }catch {return {game:null,message:'无法读取本地存档，仅当前会话有效'};}
}
export function writeSave(storage:StorageLike, game:Game):boolean {
  try {
    const previous=storage.getItem(config.saveKey); if(decodeSave(previous)) storage.setItem(config.backupKey,previous!);
    storage.setItem(config.saveKey,JSON.stringify(game)); return true;
  }catch {return false;}
}
