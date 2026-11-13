import {mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {automaticIntervalMs,dispatchGym,newGym,projectCap,staminaMax,type GymState} from '../src/game/gym/engine';
import {equipmentCatalog,type ProjectId} from '../src/game/gym/catalog';
import {offlineLimitMs,settleOfflineGym} from '../src/game/gym/offline';

const start=1_800_000_000_000;
const sampleSize=16;
const began=Date.now();
const core=['capacity','recovery','course','experience','automation'].map(family=>equipmentCatalog.filter(item=>item.family===family).sort((a,b)=>b.grade-a.grade)[0].id);
const offline=equipmentCatalog.filter(item=>item.family==='offline').sort((a,b)=>b.grade-a.grade)[0].id;
function make(gym:number,maximum:boolean,ids:string[],seed:number) {
  let state=newGym(start,seed);state.gymLevel=gym;
  for(const id of Object.keys(state.projects) as ProjectId[]) {
    const cap=projectCap(id,gym);
    state.projects[id]=maximum?cap:id==='recovery'?Math.min(cap,gym-2):id==='offline'?0:Math.min(cap,Math.floor((gym-1)/2));
  }
  // Isolate extra time by granting equal slot capacity in both compared kits.
  state.projects.equipment=projectCap('equipment',gym);
  state.ownedEquipment=[...ids];state.equippedEquipment=[...ids];state.player=null;
  const result=dispatchGym(state,state.revision,{type:'recruit'},start);
  if(result.error)throw Error(result.error);state=result.state;
  state.player!.autoEnabled=true;state.player!.nextShotAt=start;state.player!.stamina=staminaMax(state);
  return state;
}
let actualShots=0;
const cases=[];
for(const gym of [6,8]) for(const maximum of [false,true]) for(const withOffline of [false,true]) {
  const ids=withOffline?[...core,offline]:core;
  const runs=Array.from({length:sampleSize},(_,i)=>{
    const state=make(gym,maximum,ids,i+1);
    const settled=settleOfflineGym(state,start+240*60_000);
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
const output='docs/balance/equipment-v3-offline-saturation.json';
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify({metadata:{generatedAt:new Date().toISOString(),sampleSize,cases:cases.length,settlements:cases.length*sampleSize,actualShots,elapsedSeconds:(Date.now()-began)/1000,
  assumptions:['Synthetic G6/G8 stages, same real recruits and RNG seeds for each paired kit','Capacity/recovery/course/universalXP/autoXP highest-grade kit','Equipment project fixed at its local maximum to isolate an added sixth item; no drinks or recommendations','Four-hour absence; compare no offline equipment against highest +60-minute item; report stops at level99']},cases},null,2)+'\n');
console.log(JSON.stringify({output,elapsedSeconds:(Date.now()-began)/1000,actualShots,cases:cases.map(c=>({gym:c.gym,profile:c.profile,withOffline:c.withOffline,projects:c.runs[0].projects,cap:c.runs[0].capMinutes,...c.summary}))},null,2));
