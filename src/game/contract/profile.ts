import {cloneData} from '../../utils/cloneData';
import {type Collection, newContract} from './engine';
import {validContract} from './save';
import {shopEntry} from './commerce';
import {hash} from './random';
export type Profile={collection:Collection;unlocked:string[]};
export const profileKey='player-training.contract.profile.v1';
export const mergeCollection=(a:Collection,b:Collection):Collection=>{
 const result=cloneData(a);
 for(const [id,r] of Object.entries(b)){const old=result[id];result[id]={firstMonth:Math.min(old?.firstMonth??r.firstMonth,r.firstMonth),highestRating:Math.max(old?.highestRating??0,r.highestRating),highestValue:BigInt(old?.highestValue??'0')>BigInt(r.highestValue)?old.highestValue:r.highestValue};}
 return result;
};
export function mergeProfile(a:Profile,b:Profile):Profile {return {collection:mergeCollection(a.collection,b.collection),unlocked:[...new Set([...a.unlocked,...b.unlocked])]};}
export function decodeProfile(raw:string|null):Profile|null {
 try{
  const e=JSON.parse(raw??'null');if(e?.version!==1||typeof e.payload!=='string'||e.checksum!==hash(e.payload))return null;
  const p=JSON.parse(e.payload);if(!p||!Array.isArray(p.unlocked)||!p.unlocked.every((id:unknown)=>typeof id==='string'&&shopEntry(id)?.locked))return null;
  const sample=newContract(1);sample.collection=p.collection;
  return validContract(sample)?{collection:p.collection,unlocked:[...new Set(p.unlocked)] as string[]}:null;
 }catch{return null;}
}
export function readProfile(storage:Pick<Storage,'getItem'>):Profile {
 try{return mergeProfile(decodeProfile(storage.getItem(profileKey))??{collection:{},unlocked:[]},decodeProfile(storage.getItem(profileKey+'.backup'))??{collection:{},unlocked:[]});}catch{return {collection:{},unlocked:[]};}
}
type ProfileStorage=Pick<Storage,'getItem'|'setItem'>;
const writtenProfiles=new WeakMap<ProfileStorage,{raw:string;profile:Profile}>();
export function writeProfile(storage:ProfileStorage,profile:Profile):boolean {
 try{
  const main=storage.getItem(profileKey),backup=storage.getItem(profileKey+'.backup'),cached=writtenProfiles.get(storage);
  const prior=cached&&cached.raw===main&&cached.raw===backup?cached.profile:readProfile(storage);
  const merged=mergeProfile(prior,profile),payload=JSON.stringify(merged),raw=JSON.stringify({version:1,payload,checksum:hash(payload)});
  if(backup!==raw)storage.setItem(profileKey+'.backup',raw);
  if(main!==raw)storage.setItem(profileKey,raw);
  if(storage.getItem(profileKey)!==raw||storage.getItem(profileKey+'.backup')!==raw)return false;
  writtenProfiles.set(storage,{raw,profile:merged});return true;
 }catch{return false;}
}
