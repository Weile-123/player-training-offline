import { config } from './config';
import { mergeCollections, type Collection } from './collection';
import { templateById } from './templates';
import type { StorageLike } from './save';
export function decodeCollection(raw:string|null):Collection|null {
 try {
  if(!raw) return null; const data=JSON.parse(raw);
  if(data?.version!==1||!data.entries||typeof data.entries!=='object'||Array.isArray(data.entries)) return null;
  const entries:Collection={};
  for(const [id,record] of Object.entries(data.entries)) {
   if(!templateById(id)||!record||typeof record!=='object') return null;
   const r=record as Collection[string];
   if(!Number.isSafeInteger(r.firstMonth)||r.firstMonth<1||!Number.isFinite(r.bestRating)||r.bestRating<0||r.bestRating>99||
    !Number.isSafeInteger(r.bestValue)||r.bestValue<0||r.bestValue>config.economy.maximumSale||
    !Number.isSafeInteger(r.bestSale)||r.bestSale<0||r.bestSale>r.bestValue) return null;
   entries[id]={firstMonth:r.firstMonth,bestRating:r.bestRating,bestValue:r.bestValue,bestSale:r.bestSale};
  }
  return entries;
 } catch { return null; }
}
export function loadCollection(storage:StorageLike):{collection:Collection;message:string} {
 try {
  const raw=storage.getItem(config.collectionKey), backup=storage.getItem(config.collectionBackupKey);
  const main=decodeCollection(raw), prior=decodeCollection(backup);
  return {collection:mergeCollections(main??{},prior??{}),message:main?'':prior?'图鉴主存档异常，已恢复备份':raw||backup?'图鉴存档损坏，将补录现存球员':'图鉴永久保存在本机'};
 } catch {return {collection:{},message:'无法读取图鉴，仅当前会话有效'};}
}
export function writeCollection(storage:StorageLike,collection:Collection):boolean {
 try {
  // Two cumulative copies: a broken primary still retains the latest unlocks.
  const saved=loadCollection(storage).collection;
  const raw=JSON.stringify({version:1,entries:mergeCollections(saved,collection)});
  storage.setItem(config.collectionBackupKey,raw);
  storage.setItem(config.collectionKey,raw); return true;
 }catch{return false;}
}
