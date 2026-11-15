/** Equipment-only marginal audit. Synthetic stage effectiveness is deliberately
 * kept separate from the from-zero coupon acquisition experiment. */
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {
  advanceGym, automaticIntervalMs, cooperationOffers, cooperationStatus, dispatchGym,
  equipmentCapacity, equipmentEffects, equipmentOffer, newGym, projectCap, projectCost,
  recommendation, recommendationPayout, recoverySeconds, staminaMax, trainPlayer, trainingShotExperience,
  trainingStatus, type GymAction, type GymState,
} from '../src/game/gym/engine';
import {equipmentCatalog, equipmentCatalogVersion, gymEconomyVersion, gymLevels, type ProjectId} from '../src/game/gym/catalog';
import {estimateShotTime, forecastTraining} from '../src/game/gym/forecast';
import {offlineLimitMs, settleOfflineGym} from '../src/game/gym/offline';
import {validGym} from '../src/game/gym/save';
import {nbaTemplates} from '../src/game/templates';
import {statKeys} from '../src/game/types';
import {type TrainingPlanId} from '../src/game/gym/training';

const seedCount = Number(process.env.EQUIPMENT_VALUE_SEEDS ?? 32);
const output = process.env.EQUIPMENT_VALUE_OUTPUT ?? `docs/balance/equipment-value-audit-v${gymEconomyVersion}-20261115.json`;
if (!Number.isInteger(seedCount) || seedCount < 1 || seedCount > 128) throw Error('Invalid seed count');
const start = 1_800_000_000_000, began = Date.now();
let actualGrowthShots = 0, actualOfflineShots = 0, ledgerProbes = 0;
const catalog = [...equipmentCatalog];
const byId = new Map(catalog.map(item => [item.id, item]));
type Profile = 'zero' | 'typical' | 'maximum';
const mean = (xs: number[]) => xs.reduce((a,b) => a+b,0)/xs.length;
const dist = (xs: number[]) => {
  const ordered=[...xs].sort((a,b)=>a-b);
  return {n:xs.length,mean:mean(xs),min:ordered[0],p50:ordered[Math.ceil(xs.length*.5)-1],p90:ordered[Math.ceil(xs.length*.9)-1],max:ordered.at(-1)};
};
function command(state: GymState, action: GymAction): GymState {
  const result=dispatchGym(state,state.revision,action,state.updatedAt);
  if(result.error) throw Error(action.type+': '+result.error);
  return result.state;
}
function projectLevels(gym:number,profile:Profile):Record<ProjectId,number> {
  const levels:Record<ProjectId,number>={endurance:0,recovery:0,recruitment:0,equipment:0,automation:0,offline:0};
  for(const id of Object.keys(levels) as ProjectId[]) {
    const cap=projectCap(id,gym);
    levels[id]=profile==='zero'?0:profile==='maximum'?cap:
      id==='recovery'?Math.min(cap,Math.max(0,gym-2)):
      id==='equipment'?Math.min(cap,Math.floor((gym-1)/3)):
      id==='offline'?0:Math.min(cap,Math.floor((gym-1)/2));
  }
  return levels;
}
function make(gym:number, profile:Profile, ids:string[], seed=1, plan:TrainingPlanId='balanced', purchaseNow=false) {
  let state=newGym(start,seed);
  state.gymLevel=gym;state.projects=projectLevels(gym,profile);state.player=null;
  // Access is deliberately granted in a stage fixture. Price/slot/purchase logic
  // still runs, but this experiment does not claim to earn these unlocks.
  const count=Math.max(gymLevels[gym-1].requiredTemplates,...ids.map(id=>byId.get(id)!.requiredTemplates));
  state.collection=Object.fromEntries(nbaTemplates.slice(0,count).map(t=>[t.id,{firstAt:start,highestRating:0,highestValue:'0'}]));
  state.credits=1000;
  const recruit=()=>{
    state=command(state,{type:'recruit'});
    if(gym>=2) state=command(state,{type:'set-auto',id:state.player!.id,enabled:true});
    if(plan!=='balanced') state=command(state,{type:'set-training-plan',id:plan,playerId:state.player!.id});
    state=command(state,{type:'accept-cooperation',id:cooperationOffers(state)[0].id,playerId:state.player!.id});
    // All fixture times begin when the first shot is ready; this avoids crediting
    // early opening time to one loadout but not its paired control.
    state.player!.nextShotAt=start;
  };
  if(purchaseNow) recruit();
  for(const id of ids) {
    const replace=state.equippedEquipment.find(other=>byId.get(other)!.family===byId.get(id)!.family);
    state=command(state,{type:'buy-equipment',id,replaceId:replace});
  }
  if(!purchaseNow) recruit();
  if(!validGym(state)) throw Error('Invalid synthetic stage');
  return state;
}
function metrics(state:GymState) {
  const p=state.player!,effects=equipmentEffects(state);
  const meanXp=.3*trainingShotExperience(state,'hold')+.6*trainingShotExperience(state,'success')+.1*trainingShotExperience(state,'great');
  const course=trainingStatus(state,p).nextRecovery;
  return {capacity:staminaMax(state),currentStamina:p.stamina,recoverySeconds:recoverySeconds(state),courseReturn:course,
    autoSeconds:automaticIntervalMs(state)/1000,effects,meanXp,
    sec30:estimateShotTime(state,p,30)/1000,sec100:estimateShotTime(state,p,100)/1000,sec300:estimateShotTime(state,p,300)/1000,
    level10:forecastTraining(state,p,10),level15:forecastTraining(state,p,15),level25:forecastTraining(state,p,25),
    theoreticalUnsaturatedSteadyXpPerMinute:60*meanXp*Math.min(1000/(p.autoEnabled?automaticIntervalMs(state):1000),1/(recoverySeconds(state)*(1-course/10))),
    offlineMinutes:offlineLimitMs(state)/60_000};
}
const families=[...new Set(catalog.map(i=>i.family))];
const prices=families.map(family=>({family,items:catalog.filter(i=>i.family===family).sort((a,b)=>a.grade-b.grade).map((item,index,group)=>{
  const previous=group[index-1];
  const effectAmount=Object.values(item.effects).filter(value=>typeof value==='number'&&value>0)[0] as number;
  const previousEffect=previous?Object.values(previous.effects).filter(value=>typeof value==='number'&&value>0)[0] as number:0;
  return {id:item.id,name:item.name,grade:item.grade,price:item.price,unlockGym:item.unlockLevel,requiredTemplates:item.requiredTemplates,
    effects:item.effects,previous:previous?.id??null,previousRefund:previous?Math.floor(previous.price/2):0,
    netUpgradePrice:item.price-(previous?Math.floor(previous.price/2):0),effectAmount,effectIncrement:effectAmount-previousEffect,
    netUpgradeCostPerEffect:(item.price-(previous?Math.floor(previous.price/2):0))/(effectAmount-previousEffect)};
})}));
const stages=[];
for(const gym of [1,3,5,6,7,8]) for(const profile of ['zero','typical'] as const) {
  const access=make(gym,profile,[]);
  // An access-only collection grants eight templates for late items; catalog
  // thresholds are recorded separately and never presented as earned progress.
  access.collection=Object.fromEntries(nbaTemplates.slice(0,Math.max(8,gymLevels[gym-1].requiredTemplates)).map(t=>[t.id,{firstAt:start,highestRating:0,highestValue:'0'}]));
  const baseline=metrics(access);
  const singles=catalog.filter(i=>equipmentOffer(access,i.id).price!==null).map(item=>{
    const rested=metrics(make(gym,profile,[item.id]));
    const immediate=metrics(make(gym,profile,[item.id],1,'balanced',true));
    const previous=catalog.filter(i=>i.family===item.family&&i.grade<item.grade).sort((a,b)=>b.grade-a.grade)[0];
    const lower=previous?metrics(make(gym,profile,[previous.id])):baseline;
    const netUpgrade=item.price-(previous?Math.floor(previous.price/2):0);
    return {id:item.id,name:item.name,family:item.family,grade:item.grade,price:item.price,
      rested,immediate,
      versusNone:{savedSec100:baseline.sec100-rested.sec100,savedSec300:baseline.sec300-rested.sec300,
        savedSec25:(baseline.level25!.estimatedMs-rested.level25!.estimatedMs)/1000,
        level25PercentSaved:100*(1-rested.level25!.estimatedMs/baseline.level25!.estimatedMs)},
      versusPrevious:{id:previous?.id??null,netUpgrade,savedSec300:lower.sec300-rested.sec300,
        savedSec25:(lower.level25!.estimatedMs-rested.level25!.estimatedMs)/1000,
        extraSteadyXpPerMinute:rested.theoreticalUnsaturatedSteadyXpPerMinute-lower.theoreticalUnsaturatedSteadyXpPerMinute}};
  });
  stages.push({gym,profile,projects:access.projects,baseline,singles});
}
type Point={level:number;shots:number;seconds:number;stats:Record<string,number>;credits:number;rawCredits:number;withheldCredits:number;fame:number;tier:number;growth:number;equipmentCredits:number;brandTotal:number;qualifyingCourses:[number,number]};
function growTrace(gym:number,profile:Profile,ids:string[],seed:number,plan:TrainingPlanId='balanced') {
  let state=make(gym,profile,ids,seed,plan);
  const points:Record<number,Point>={};
  while(state.player!.level<25) {
    const p=state.player!;
    const at=Math.max(state.updatedAt,p.nextShotAt,p.stamina>=1?0:state.updatedAt+recoverySeconds(state)*1000-p.recoveryMs);
    state=advanceGym(state,at);
    trainPlayer(state,state.player!,at,[],state.player!.shots>0);actualGrowthShots++;
    for(const level of [15,25]) if(state.player!.level>=level&&!points[level]) {
      const player=state.player!,reward=recommendation(state),payout=recommendationPayout(state),status=cooperationStatus(state);
      const paid=command(state,{type:'recommend',id:player.id});ledgerProbes++;
      if(paid.credits-state.credits!==payout.credits||paid.fame-state.fame!==reward.fame) throw Error('Reward ledger discrepancy');
      points[level]={level:player.level,shots:player.shots,seconds:(at-start)/1000,stats:{...player.stats},
        credits:payout.credits,rawCredits:reward.credits,withheldCredits:payout.withheldCredits,fame:reward.fame,tier:reward.tier,growth:reward.growth,equipmentCredits:status.equipmentCredits,
        brandTotal:player.equipmentTraining.brandTotal,qualifyingCourses:[...player.equipmentTraining.cooperationCourses]};
    }
  }
  if(!validGym(state)) throw Error('Invalid final growth state');
  return {seed,points};
}
function aggregate(runs:ReturnType<typeof growTrace>[]) {
  return [15,25].map(level=>({level,shots:dist(runs.map(r=>r.points[level].shots)),seconds:dist(runs.map(r=>r.points[level].seconds)),
    credits:dist(runs.map(r=>r.points[level].credits)),rawCredits:dist(runs.map(r=>r.points[level].rawCredits)),withheldCredits:dist(runs.map(r=>r.points[level].withheldCredits)),fame:dist(runs.map(r=>r.points[level].fame)),growth:dist(runs.map(r=>r.points[level].growth)),
    equipmentCredits:dist(runs.map(r=>r.points[level].equipmentCredits)),
    tiers:[0,1,2,3,4,5].map(tier=>runs.filter(r=>r.points[level].tier===tier).length),
    stats:Object.fromEntries(statKeys.map(key=>[key,{mean:mean(runs.map(r=>r.points[level].stats[key])),reached90:runs.filter(r=>r.points[level].stats[key]>=90).length}]))}));
}
const baseRuns=new Map<string,ReturnType<typeof growTrace>[]>();
const base=(gym:number,profile:Profile,plan:TrainingPlanId)=>{
  const key=[gym,profile,plan].join(':');
  let runs=baseRuns.get(key);
  if(!runs){runs=Array.from({length:seedCount},(_,i)=>growTrace(gym,profile,[],i+1,plan));baseRuns.set(key,runs);}
  return runs;
};
const growth=[];
for(const item of catalog.filter(i=>i.family!=='offline')) {
  // Compare each item with a control at the same legitimately unlocked stage.
  // In economy V6, the strongest recovery/XP items first appear at G7 and
  // the strongest course item at G8; they must not be injected into G6.
  const gym=Math.max(6,item.unlockLevel);
  const key=item.effects.focusKey;
  const plan:TrainingPlanId=!key?'balanced':key==='three'||key==='mid'?'shooting':key==='drive'||key==='handle'?'finishing':'interior';
  const control=base(gym,'typical',plan);
  const runs=Array.from({length:seedCount},(_,i)=>growTrace(gym,'typical',[item.id],i+1,plan));
  if(!key) for(const level of [15,25]) for(let i=0;i<runs.length;i++) {
    if(JSON.stringify(runs[i].points[level].stats)!==JSON.stringify(control[i].points[level].stats)) {
      throw Error('A non-focus item unexpectedly changed same-level growth: '+item.id);
    }
  }
  const paired=[15,25].map(level=>({level,seconds:dist(runs.map((r,i)=>r.points[level].seconds-control[i].points[level].seconds)),
    credits:dist(runs.map((r,i)=>r.points[level].credits-control[i].points[level].credits)),
    rawCredits:dist(runs.map((r,i)=>r.points[level].rawCredits-control[i].points[level].rawCredits)),
    fame:dist(runs.map((r,i)=>r.points[level].fame-control[i].points[level].fame)),
    tierWins:runs.filter((r,i)=>r.points[level].tier>control[i].points[level].tier).length,
    tierLosses:runs.filter((r,i)=>r.points[level].tier<control[i].points[level].tier).length}));
  growth.push({gym,profile:'typical',projects:projectLevels(gym,'typical'),id:item.id,name:item.name,family:item.family,price:item.price,plan,
    control:aggregate(control),summary:aggregate(runs),paired,runs});
}
const earlyLateGrowth=[];
for(const gym of [1,3,8]) {
  const ids=catalog.filter(i=>['capacity','recovery','course','experience','automation'].includes(i.family)&&i.unlockLevel<=gym)
    .filter(i=>!catalog.some(other=>other.family===i.family&&other.grade>i.grade&&other.unlockLevel<=gym)).map(i=>i.id);
  const control=base(gym,'typical','balanced');
  for(const id of ids) {
    const runs=Array.from({length:seedCount},(_,i)=>growTrace(gym,'typical',[id],i+1));
    earlyLateGrowth.push({gym,profile:'typical',projects:projectLevels(gym,'typical'),id,name:byId.get(id)!.name,control:aggregate(control),summary:aggregate(runs)});
  }
}
// Full core + time equipment tests use equal legal slot counts in each pair.
const offline=[];
for(const gym of [6,7,8]) for(const profile of ['typical','maximum'] as const) for(const grade of [0,1,2,3]) {
  const core=['capacity','recovery','course','experience','automation'].map(f=>catalog.filter(i=>i.family===f&&i.unlockLevel<=gym).sort((a,b)=>b.grade-a.grade)[0].id);
  const time=catalog.find(i=>i.family==='offline'&&i.grade===grade&&i.unlockLevel<=gym);
  if(grade>0&&!time) continue;
  const runs=Array.from({length:Math.min(seedCount,16)},(_,i)=>{
    let state=make(gym,profile,[],i+1);state.projects.equipment=projectCap('equipment',gym);
    for(const id of [...core,...(time?[time.id]:[])]) state=command(state,{type:'buy-equipment',id});
    // This explicitly models the rested/recruited state, not purchase refilling.
    state.player!.stamina=staminaMax(state);
    if(!validGym(state)||state.equippedEquipment.length>equipmentCapacity(state)) throw Error('Invalid offline fixture');
    const settled=settleOfflineGym(state,start+240*60_000),p=settled.state.player!;
    if(!validGym(settled.state)) throw Error('Invalid settled offline state');
    actualOfflineShots+=settled.report?.totalShots??0;
    return {seed:i+1,capMinutes:offlineLimitMs(state)/60_000,shots:settled.report?.totalShots??0,
      xp:settled.report?.totalExperience??0,level:p.level,
      stoppedAtMinutes:p.level===99?(p.nextShotAt-automaticIntervalMs(state)-start)/60_000:null};
  });
  offline.push({gym,profile,grade,id:time?.id??null,price:time?.price??0,core,projects:{...projectLevels(gym,profile),equipment:projectCap('equipment',gym)},runs,
    summary:{shots:dist(runs.map(r=>r.shots)),xp:dist(runs.map(r=>r.xp)),level:dist(runs.map(r=>r.level)),reached99:runs.filter(r=>r.level===99).length}});
}
// Cost of buying the equivalent number of endurance/recovery project levels.
const alternatives=[...Array(8)].map((_,i)=>i+1).map(gym=>({gym,
  projects:projectLevels(gym,'typical'),
  upgrades:(['endurance','recovery','automation'] as const).map(id=>({id,current:projectLevels(gym,'typical')[id],cap:projectCap(id,gym),
    next:projectLevels(gym,'typical')[id]<projectCap(id,gym)?projectCost(id,projectLevels(gym,'typical')[id]+1):null,
    increments:Array.from({length:projectCap(id,gym)},(_,i)=>({level:i+1,price:projectCost(id,i+1),total:Array.from({length:i+1},(_,j)=>projectCost(id,j+1)).reduce((a,b)=>a+b,0)}))}))}));
const result={metadata:{generatedAt:new Date().toISOString(),catalogVersion:equipmentCatalogVersion,economyVersion:gymEconomyVersion,seedCount,
  catalogFingerprint:createHash('sha256').update(JSON.stringify(catalog)).digest('hex'),elapsedSeconds:(Date.now()-began)/1000,
  actualGrowthShots,actualOfflineShots,actualShots:actualGrowthShots+actualOfflineShots,ledgerProbes,
  assumptions:['Synthetic stages; all projects and access collections explicitly granted. No from-zero acquisition-time claims.',
    'credits is actual wallet payout; rawCredits is uncapped theoretical value for marginal effect comparisons; withheldCredits is the difference.',
    'Purchases and recommendation probes use real dispatchGym; new recruit is generated after project configuration with same seed across pairs.',
    'Typical profiles match existing V3 equipment study; maximum profiles are legal local caps.',
    'Rested metrics start after recruitment/equipment; immediate metrics purchase equipment for an existing athlete and never refill stamina.',
    'Forecast times use exact integer-XP stopping expectation plus deterministic shot-time estimate, not exact random elapsed-time expectation.',
    'Real traces call trainPlayer/advanceGym with same original matching and RNG; stop at level25 with checkpoints15/25; basic cooperation worn continuously.',
    'Each single-item trace uses gym max(6,item.unlockLevel) and a control at that identical stage; compare rows only within their recorded gym/project profile.',
    'Focus equipment is compared with the corresponding free training plan, never only with an unrelated balanced plan.',
    'Offline uses a four-hour absence, actual cap, up to 16 paired seeds; each gym uses its strongest legally unlocked core and equal slot counts across controls/treatments.',
    'Theoretical steady XP is pre99 sustainable rate excluding burst capacity/finite course phase; it is not unlimited earning.',
    'Template hit counts are finite-seed observations, not guaranteed rates. No changes to production prices/effects.']},
  prices,stages,growth,earlyLateGrowth,offline,projectAlternatives:alternatives};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({output,metadata:result.metadata,summary:growth.filter(g=>!g.family.startsWith('focus')).map(g=>({gym:g.gym,id:g.id,family:g.family,
  lv25Seconds:g.summary[1].seconds.mean,lv25SecondsDelta:g.paired[1].seconds.mean,lv25CreditsDelta:g.paired[1].credits.mean,lv25RawCreditsDelta:g.paired[1].rawCredits.mean,lv25FameDelta:g.paired[1].fame.mean})),
  focus:growth.filter(g=>g.family.startsWith('focus')).map(g=>({id:g.id,key:g.family,lv15Attribute90:g.summary[0].stats[g.family.slice(6)].reached90,control90:g.control[0].stats[g.family.slice(6)].reached90,
    legend25:g.summary[1].tiers[5],controlLegend25:g.control[1].tiers[5]}))},null,2));
