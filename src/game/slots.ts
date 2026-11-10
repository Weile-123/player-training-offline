import { config } from './config';
import { decodeSave, loadSave, type StorageLike } from './save';
import type { Game } from './types';
export const slotIds=[1,2,3] as const;
export type SlotId=typeof slotIds[number];
export type SaveSlot={game:Game;updatedAt:number};
export const slotKey=(id:SlotId,backup=false)=>`player-training.slot.${id}.${backup?'backup.':''}v1`;
export function decodeSlot(raw:string|null):SaveSlot|null{
 try{if(!raw)return null;const s=JSON.parse(raw),game=decodeSave(JSON.stringify(s.game));return s.version===1&&game&&Number.isSafeInteger(s.updatedAt)&&s.updatedAt>=0?{game,updatedAt:s.updatedAt}:null;}catch{return null;}
}
export function readSlots(storage:StorageLike):Record<SlotId,SaveSlot|null>{
 const result:Record<SlotId,SaveSlot|null>={1:null,2:null,3:null};
 for(const id of slotIds)try{result[id]=decodeSlot(storage.getItem(slotKey(id)))??decodeSlot(storage.getItem(slotKey(id,true)));}catch{/* session-only fallback is handled in store */}
 return result;
}
export function writeSlot(storage:StorageLike,id:SlotId,game:Game,updatedAt=Date.now()):boolean{
 try{const previous=storage.getItem(slotKey(id));if(decodeSlot(previous))storage.setItem(slotKey(id,true),previous!);else {const backup=storage.getItem(slotKey(id,true));if(!decodeSlot(backup))storage.setItem(slotKey(id,true),JSON.stringify({version:1,game,updatedAt}));}storage.setItem(slotKey(id),JSON.stringify({version:1,game,updatedAt}));return true;}catch{return false;}
}
export function migrateLegacySlot(storage:StorageLike):string{
 const marker='player-training.slots.migrated.v1';
 try{
  if(storage.getItem(marker))return '';
  const slots=readSlots(storage),legacy=loadSave(storage);
  if(!slots[1]&&legacy.game&&!writeSlot(storage,1,legacy.game))return '旧存档迁移未写入，请保留浏览器缓存';
  storage.setItem(marker,'done');return legacy.game?'旧存档已保留在存档 01':'';
 }catch{return '存档读取受限，仅当前会话有效';}
}
