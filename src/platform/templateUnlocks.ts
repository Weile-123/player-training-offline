import {nbaTemplates} from '../game/templates';

export const unlockStatsKey='player-training.unlock-statistics.v1';
type Entry={templateId:string;source:'history'|'unlock'};
type Dependencies={storage:Pick<Storage,'getItem'|'setItem'>;enabled:()=>boolean;user:()=>Promise<{puid?:string}|null>;send:(entries:Entry[])=>Promise<unknown>};
/** Separate telemetry only. A local collection belongs to its first reporting account. */
export function createTemplateUnlockReporter(deps:Dependencies){
 const valid=new Set(nbaTemplates.map(t=>t.id));
 let owner:string|null=null,entries:Entry[]=[],confirmed=new Set<string>(),busy=false;
 try{const raw=JSON.parse(deps.storage.getItem(unlockStatsKey)??'null');
  if(raw&&typeof raw.owner==='string'){
   owner=raw.owner;
   entries=Array.isArray(raw.entries)?raw.entries.filter((e:Entry)=>valid.has(e?.templateId)&&['history','unlock'].includes(e.source)):[];
   confirmed=new Set(Array.isArray(raw.confirmed)?raw.confirmed.filter((id:string)=>valid.has(id)):[]);
  }
 }catch{/* telemetry storage is optional */}
 const persist=()=>{try{deps.storage.setItem(unlockStatsKey,JSON.stringify({owner,entries,confirmed:[...confirmed]}));}catch{/* never touch game storage */}};
 const observe=(ids:string[],source:Entry['source'])=>{
  if(!deps.enabled())return;
  for(const templateId of ids)if(valid.has(templateId)&&!confirmed.has(templateId)&&!entries.some(e=>e.templateId===templateId))entries.push({templateId,source});
  if(owner)persist();
 };
 const flush=async()=>{
  if(busy||!deps.enabled()||!entries.length)return;
  busy=true;
  try{
   const user=await deps.user();if(!user?.puid)return;
   if(owner&&owner!==user.puid)return;
   owner=user.puid;persist();
   const batch=entries.slice(0,119);
   if((await deps.user())?.puid!==owner)return;
   const response=await deps.send(batch) as {accepted?:boolean};
   if(response?.accepted!==true)return;
   for(const e of batch)confirmed.add(e.templateId);
   entries=entries.filter(e=>!confirmed.has(e.templateId));persist();
  }catch{/* keep pending; retry later without interrupting gameplay */}finally{busy=false;}
 };
 return {observe,flush};
}
