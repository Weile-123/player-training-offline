import {cloneData} from '../../utils/cloneData';
import {type Contract,type CareerBestPlayer,newContract} from './engine';
import {validContract} from './save';
import {hash} from './random';
import {shopEntry} from './commerce';

export type CareerRecord={id:string;month:number;shots:number;delivered:string;status:'playing'|'over'|'abandoned';best:CareerBestPlayer|null;equipment:string[]};
export type CareerLedger=Record<string,CareerRecord>;
export const careerStatsKey='player-training.contract.career-stats.v1';
type StoragePort=Pick<Storage,'getItem'|'setItem'>;
const emptySample=newContract(1);
export function decodeCareerStats(raw:string|null):CareerLedger|null{
 try{
  const e=JSON.parse(raw??'null');
  if(e?.version!==1||typeof e.payload!=='string'||e.checksum!==hash(e.payload))return null;
  const rows=JSON.parse(e.payload);
  if(!rows||typeof rows!=='object'||Array.isArray(rows))return null;
  for(const [id,r] of Object.entries(rows) as [string,CareerRecord][]){
   if(!r||r.id!==id||id.length>120||!Number.isSafeInteger(r.month)||r.month<1||!Number.isSafeInteger(r.shots)||r.shots<0||typeof r.delivered!=='string'||r.delivered.length>20000||!/^\d+$/.test(r.delivered)||!['playing','over','abandoned'].includes(r.status)||!Array.isArray(r.equipment)||!r.equipment.every(v=>typeof v==='string'&&shopEntry(v))||!validContract({...emptySample,bestPlayer:r.best}))return null;
  }
  return rows;
 }catch{return null;}
}
export function readCareerStats(storage:Pick<Storage,'getItem'>):CareerLedger{
 try{return decodeCareerStats(storage.getItem(careerStatsKey))??decodeCareerStats(storage.getItem(careerStatsKey+'.backup'))??{};}catch{return {};}
}
export function recordCareer(ledger:CareerLedger,state:Contract,status:CareerRecord['status']=state.status):CareerLedger{
 if(!state.careerId)return ledger;
 const prior=ledger[state.careerId];
 return {...ledger,[state.careerId]:{id:state.careerId,month:state.month,shots:state.totalShots,delivered:state.delivered,status,
  best:state.bestPlayer?cloneData(state.bestPlayer):null,equipment:[...new Set([...(prior?.equipment??[]),...state.equipment])]}};
}
export function writeCareerStats(storage:StoragePort,ledger:CareerLedger):boolean{
 try{const payload=JSON.stringify(ledger),raw=JSON.stringify({version:1,payload,checksum:hash(payload)});storage.setItem(careerStatsKey+'.backup',raw);storage.setItem(careerStatsKey,raw);return true;}catch{return false;}
}
export function careerSummary(ledger:CareerLedger){
 const rows=Object.values(ledger);
 let best:CareerBestPlayer|null=null;
 for(const row of rows)if(row.best&&(!best||BigInt(row.best.value)>BigInt(best.value)))best=row.best;
 return {started:rows.length,finished:rows.filter(r=>r.status==='over').length,abandoned:rows.filter(r=>r.status==='abandoned').length,
  highestMonth:rows.reduce((n,r)=>Math.max(n,r.month),0),shots:rows.reduce((n,r)=>n+r.shots,0),
  delivered:String(rows.reduce((n,r)=>n+BigInt(r.delivered),0n)),best,equipment:[...new Set(rows.flatMap(r=>r.equipment))]};
}
/** Collection discovery requires actual ownership, not entry into the shop pool. */
export function collectedEquipment(ledger:CareerLedger,current:readonly string[]=[]):string[]{
 return [...new Set([...Object.values(ledger).flatMap(r=>r.equipment),...current])].filter(id=>!!shopEntry(id));
}
