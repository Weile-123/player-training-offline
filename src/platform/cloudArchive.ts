import {decodeContract,encodeContract,contractSaveKeys} from '../game/contract/save';
import {decodeProfile,writeProfile,profileKey,type Profile} from '../game/contract/profile';
import {decodeCareerStats,writeCareerStats,careerStatsKey,type CareerLedger} from '../game/contract/careerStats';
import type {Contract} from '../game/contract/engine';
type StoragePort=Pick<Storage,'getItem'|'setItem'>&Partial<Pick<Storage,'removeItem'>>;
type Roster={selectedId:string|null;restingIds:string[];scoutNoticeSeen:boolean};
type Source=Roster&{state:Contract;hasSave:boolean;profile:Profile;careers:CareerLedger;updatedAt?:number|null};
export type CloudArchive={format:'player-training-cloud-v1';savedAt:string;updatedAt?:number|null;contract:string|null;profile:string;careers:string;roster:Roster};
export const localUpdatedAtKey='player-training.contract.updated-at.v1';
export function readLocalUpdatedAt(storage:Pick<Storage,'getItem'>):number|null{
 try{const value=Number(storage.getItem(localUpdatedAtKey));return Number.isSafeInteger(value)&&value>0?value:null;}catch{return null;}
}
const selectionKey='player-training.contract.selection',restingKey='player-training.contract.resting',scoutKey='player-training.contract.scout-notice';
const memory=()=>{const data=new Map<string,string>();return {data,getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};};
export function exportCloudArchive(source:Source):string{
 const temp=memory();writeProfile(temp,source.profile);writeCareerStats(temp,source.careers);
 return JSON.stringify({format:'player-training-cloud-v1',savedAt:new Date().toISOString(),updatedAt:source.updatedAt??null,contract:source.hasSave?encodeContract(source.state):null,
  profile:temp.getItem(profileKey),careers:temp.getItem(careerStatsKey),roster:{selectedId:source.selectedId,restingIds:source.restingIds,scoutNoticeSeen:source.scoutNoticeSeen}});
}
export function parseCloudArchive(raw:string){
 try{
  if(new TextEncoder().encode(raw).byteLength>2*1024*1024)throw Error();
  const archive:CloudArchive=JSON.parse(raw);
  if(archive?.updatedAt!==undefined&&archive.updatedAt!==null&&(!Number.isSafeInteger(archive.updatedAt)||archive.updatedAt<1))throw Error();
  if(!archive||archive.format!=='player-training-cloud-v1'||typeof archive.savedAt!=='string'||!Number.isFinite(Date.parse(archive.savedAt))||!(archive.contract===null||typeof archive.contract==='string')||typeof archive.profile!=='string'||typeof archive.careers!=='string')throw Error();
  const state=archive.contract===null?null:decodeContract(archive.contract),profile=decodeProfile(archive.profile),careers=decodeCareerStats(archive.careers),r=archive.roster;
  if((archive.contract!==null&&!state)||!profile||!careers||!r||!(r.selectedId===null||typeof r.selectedId==='string')||!Array.isArray(r.restingIds)||!r.restingIds.every(id=>typeof id==='string')||typeof r.scoutNoticeSeen!=='boolean')throw Error();
  const available=new Set(state?.players.filter(p=>!p.queued).map(p=>p.id));
  if(state&&((r.selectedId!==null&&!available.has(r.selectedId))||r.restingIds.some(id=>!available.has(id)||id===r.selectedId)))throw Error();
  return {archive,state,profile,careers,roster:state?r:{selectedId:null,restingIds:[],scoutNoticeSeen:false}};
 }catch{throw Error('云存档校验失败，本地进度已保留');}
}
/** Validate the entire snapshot first, then write only known game keys. Roll back on storage errors. */
export function restoreCloudArchive(storage:StoragePort,raw:string){
 const parsed=parseCloudArchive(raw),{archive,state,roster}=parsed;
 const values:Record<string,string|null>={
  [contractSaveKeys.main]:state&&(state.status==='playing'||!!state.adRewards)?encodeContract(state):null,
  [contractSaveKeys.backup]:state&&(state.status==='playing'||!!state.adRewards)?encodeContract(state):null,
  [profileKey]:archive.profile,[profileKey+'.backup']:archive.profile,
  [careerStatsKey]:archive.careers,[careerStatsKey+'.backup']:archive.careers,
  [selectionKey]:roster.selectedId??'',[restingKey]:JSON.stringify(roster.restingIds),
  [scoutKey]:JSON.stringify({seed:state?.seed,seen:roster.scoutNoticeSeen}),
  [localUpdatedAtKey]:String(archive.updatedAt??Date.parse(archive.savedAt)),
 };
 const previous=new Map<string,string|null>();
 const write=(key:string,value:string|null)=>{if(value===null&&storage.removeItem)storage.removeItem(key);else storage.setItem(key,value??'');};
 try{
  for(const key of Object.keys(values))previous.set(key,storage.getItem(key));
  // Keep a recovery copy before any replacement; never include credentials or unrelated storage.
  storage.setItem('player-training.cloud-restore.backup',JSON.stringify(Object.fromEntries(previous)));
  for(const [key,value] of Object.entries(values))write(key,value);
 }catch{
  for(const [key,value] of previous){try{write(key,value);}catch{/* Recovery copy remains available. */}}
  throw Error('本地存档写入失败，恢复未完成；原进度备份已保留');
 }
 return parsed;
}
