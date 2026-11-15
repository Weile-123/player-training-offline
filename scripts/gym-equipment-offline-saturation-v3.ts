import {mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {automaticIntervalMs,dispatchGym,equipmentCapacity,equipmentOffer,newGym,projectCap,staminaMax,type GymState} from '../src/game/gym/engine';
import {equipmentCatalog,gymEconomyVersion,gymLevels,type ProjectId} from '../src/game/gym/catalog';
import {offlineLimitMs,settleOfflineGym} from '../src/game/gym/offline';
import {validGym} from '../src/game/gym/save';
import {nbaTemplates} from '../src/game/templates';

const start=1_800_000_000_000;
const sampleSize=Number(process.env.EQUIPMENT_OFFLINE_SEEDS??16);
const gyms=(process.env.EQUIPMENT_OFFLINE_GYMS??'6,7,8').split(',').map(Number);
if(!Number.isInteger(sampleSize)||sampleSize<1||sampleSize>128||gyms.some(gym=>!Number.isInteger(gym)||gym<6||gym>8)) throw Error('Invalid offline experiment parameters');
const began=Date.now();
const best=(gym:number,family:string)=>equipmentCatalog.filter(item=>item.family===family&&item.unlockLevel<=gym).sort((a,b)=>b.grade-a.grade)[0];
function make(gym:number,maximum:boolean,ids:string[],seed:number) {
  let state=newGym(start,seed);state.gymLevel=gym;
  for(const id of Object.keys(state.projects) as ProjectId[]) {
    const cap=projectCap(id,gym);
    state.projects[id]=maximum?cap:id==='recovery'?Math.min(cap,gym-2):id==='offline'?0:Math.min(cap,Math.floor((gym-1)/2));
  }
  // Isolate extra time by granting equal slot capacity in both compared kits.
  state.projects.equipment=projectCap('equipment',gym);
  const byId=new Map(equipmentCatalog.map(item=>[item.id,item]));
  if(ids.some(id=>!byId.has(id))||ids.length>equipmentCapacity(state)||new Set(ids.map(id=>byId.get(id)!.family)).size!==ids.length) throw Error('Invalid offline fixture equipment');
  const count=Math.max(gymLevels[gym-1].requiredTemplates,...ids.map(id=>byId.get(id)!.requiredTemplates));
  state.collection=Object.fromEntries(nbaTemplates.slice(0,count).map(t=>[t.id,{firstAt:start,highestRating:0,highestValue:'0'}]));
  for(const id of ids) if(equipmentOffer(state,id).price===null) throw Error(`Locked offline fixture equipment ${id} at G${gym}`);
  state.ownedEquipment=[...ids];state.equippedEquipment=[...ids];state.player=null;
  state.purchasePrices=Object.fromEntries(ids.map(id=>[id,byId.get(id)!.price]));
  state.collectedEquipment=Object.fromEntries(ids.map(id=>[id,{firstAt:start}]));
  const result=dispatchGym(state,state.revision,{type:'recruit'},start);
  if(result.error)throw Error(result.error);state=result.state;
  state.player!.autoEnabled=true;state.player!.nextShotAt=start;state.player!.stamina=staminaMax(state);
  if(!validGym(state)) throw Error('Invalid offline experiment fixture');
  return state;
}
let actualShots=0;
const cases=[];
for(const gym of gyms) for(const maximum of [false,true]) for(const withOffline of [false,true]) {
  const core=['capacity','recovery','course','experience','automation'].flatMap(family=>{const item=best(gym,family);return item?[item.id]:[];});
  const offline=best(gym,'offline');
  if(withOffline&&!offline) continue;
  const ids=withOffline?[...core,offline!.id]:core;
  const runs=Array.from({length:sampleSize},(_,i)=>{
    const state=make(gym,maximum,ids,i+1);
    const settled=settleOfflineGym(state,start+240*60_000);
    if(!validGym(settled.state)) throw Error('Invalid offline settled state');
    const p=settled.state.player!;actualShots+=settled.report?.totalShots??0;
    return {seed:i+1,projects:state.projects,capMinutes:offlineLimitMs(state)/60_000,
      creditedMinutes:(settled.report?.creditedMs??0)/60_000,shots:settled.report?.totalShots??0,xp:settled.report?.totalExperience??0,
      level:p.level,stoppedAtMinutes:p.level===99?(p.nextShotAt-automaticIntervalMs(state)-start)/60_000:null};
  });
  const mean=(values:number[])=>values.reduce((sum,value)=>sum+value,0)/values.length;
  const stop=runs.flatMap(r=>r.stoppedAtMinutes===null?[]:[r.stoppedAtMinutes]);
  cases.push({gym,profile:maximum?'maximum':'typical',withOffline,ids,runs,
    summary:{meanShots:mean(runs.map(r=>r.shots)),meanXp:mean(runs.map(r=>r.xp)),meanLevel:mean(runs.map(r=>r.level)),
      reached99:stop.length,meanStoppedAtMinutes:stop.length?mean(stop):null,minStoppedAtMinutes:stop.length?Math.min(...stop):null,maxStoppedAtMinutes:stop.length?Math.max(...stop):null}});
}
const output=process.env.EQUIPMENT_OFFLINE_OUTPUT??`docs/balance/equipment-v3-offline-saturation-economy-v${gymEconomyVersion}.json`;
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify({metadata:{generatedAt:new Date().toISOString(),economyVersion:gymEconomyVersion,sampleSize,cases:cases.length,settlements:cases.length*sampleSize,actualShots,elapsedSeconds:(Date.now()-began)/1000,
  assumptions:['Synthetic legal-stage fixtures, same real recruits and RNG seeds for each paired kit','Capacity/recovery/course/universalXP/autoXP strongest kit actually unlocked at each tested gym; collection is granted and not earned','Equipment project fixed at its local maximum to isolate added time equipment; no drinks or recommendations','Four-hour absence; compare no offline equipment against strongest available time item; report stops at level99']},cases},null,2)+'\n');
console.log(JSON.stringify({output,elapsedSeconds:(Date.now()-began)/1000,actualShots,cases:cases.map(c=>({gym:c.gym,profile:c.profile,withOffline:c.withOffline,projects:c.runs[0].projects,cap:c.runs[0].capMinutes,...c.summary}))},null,2));
