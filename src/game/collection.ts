import { config } from './config';
import { gameSaleValue, rating } from './economy';
import { fitsHeight } from './matching';
import { templateById } from './templates';
import type { Game, Player } from './types';
export type CollectionRecord = { firstMonth:number; bestRating:number; bestValue:number; bestSale:number };
export type Collection = Record<string, CollectionRecord>;
export type CollectionAction = 'observe'|'train'|'sell'|'month'|'restart';
export function mergeCollections(...collections:Collection[]):Collection {
 const result:Collection={};
 for(const source of collections) for(const [id,record] of Object.entries(source)) {
  const old=result[id]; result[id]=old ? {firstMonth:old.firstMonth,bestRating:Math.max(old.bestRating,record.bestRating),bestValue:Math.max(old.bestValue,record.bestValue),bestSale:Math.max(old.bestSale,record.bestSale)} : {...record};
 }
 return result;
}
function recordPlayer(collection:Collection, game:Game, player:Player, sale=0):Collection {
 const template=templateById(player.templateId); if(!template || !fitsHeight(player.height,template)) return collection;
 return mergeCollections(collection,{[template.id]:{firstMonth:game.month,bestRating:rating(player),bestValue:gameSaleValue(game,player),bestSale:sale}});
}
const roster=(game:Game)=>[...game.recruits,...game.lounge,...(game.activePlayer?[game.activePlayer]:[])];
export function observeCollection(collection:Collection,game:Game):Collection {
 return roster(game).reduce((result,p)=>recordPlayer(result,game,p),collection);
}
// Capture the outgoing roster before removal; rest moves never count as a sale.
export function updateCollection(collection:Collection,before:Game,after:Game,action:CollectionAction):Collection {
 let result=observeCollection(collection,before);
 if(action==='sell'||action==='month'||action==='train') {
  const remaining=new Set(roster(after).map(p=>p.id));
  for(const p of roster(before)) if(!remaining.has(p.id)) {
   result=recordPlayer(result,before,p,action==='train'?config.economy.minimumSale:gameSaleValue(before,p));
  }
 }
 return observeCollection(result,after);
}
