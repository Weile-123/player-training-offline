/** Project-only marginal value audit. Stage fixtures isolate effects and are not
 * acquisition/economy runs. Production rules are imported without modification. */
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {
  advanceGym, automaticIntervalMs, cooperationOffers, dispatchGym, equipmentCapacity,
  equipmentEffects, equipmentOffer, experienceForLevel, newGym, projectCap, projectCost,
  projectOffer, recommendation, recommendationPayout, recoverySeconds, staminaMax, trainPlayer,
  type GymAction, type GymState,
} from '../src/game/gym/engine';
import {equipmentCatalog, gymEconomyVersion, gymLevels, projects, type ProjectId} from '../src/game/gym/catalog';
import {estimateShotTime, forecastTraining} from '../src/game/gym/forecast';
import {offlineLimitMs, settleOfflineGym} from '../src/game/gym/offline';
import {nbaTemplates} from '../src/game/templates';
import {statKeys} from '../src/game/types';
import {validGym} from '../src/game/gym/save';

const started = Date.now(), start = 1_800_000_000_000;
const seeds = Number(process.env.PROJECT_AUDIT_SEEDS ?? 32);
const recruitSeeds = Number(process.env.PROJECT_AUDIT_RECRUIT_SEEDS ?? 128);
const output = process.env.PROJECT_AUDIT_OUTPUT ?? `docs/balance/project-value-audit-v${gymEconomyVersion}-20261115.json`;
if (![seeds, recruitSeeds].every(n => Number.isInteger(n) && n >= 1 && n <= 256)) throw Error('Invalid seed count');
const counts = {offlineSettlements: 0, offlineShots: 0, recruitmentTraces: 0, recruitmentShots: 0, recommendationProbes: 0, forecastComparisons: 0};
const summary = (values: number[]) => {
  const sorted = [...values].sort((a,b) => a-b);
  return {n: values.length, mean: values.reduce((a,b) => a+b, 0)/values.length,
    min: sorted[0], p50: sorted[Math.ceil(sorted.length*.5)-1], p90: sorted[Math.ceil(sorted.length*.9)-1], max: sorted.at(-1)};
};
function command(state: GymState, action: GymAction): GymState {
  const result = dispatchGym(state, state.revision, action, state.updatedAt);
  if (result.error) throw Error(`${action.type}: ${result.error}`);
  return result.state;
}
function bestItems(gym: number) {
  const families = ['capacity','recovery','course','experience','automation'] as const;
  return families.map(family => equipmentCatalog.filter(item => item.family === family && item.unlockLevel <= gym)
    .sort((a,b) => b.grade-a.grade)[0]).filter(Boolean).map(item => item.id);
}
function fixture(gym: number, gear: 'none'|'supply', seed = 1, maximum = false): GymState {
  let state = newGym(start, seed);
  state.gymLevel = gym;
  for (const project of projects) {
    const cap = projectCap(project.id, gym);
    state.projects[project.id] = maximum ? cap : project.id === 'recovery' ? Math.min(cap, Math.max(0,gym-2))
      : project.id === 'equipment' ? Math.min(cap, 1) : project.id === 'offline' ? 0 : Math.min(cap, Math.floor((gym-1)/2));
  }
  const ids = gear === 'none' ? [] : bestItems(gym);
  if (ids.length > equipmentCapacity(state)) throw Error('Fixture exceeds legal slot capacity');
  const collectionCount = Math.max(gymLevels[gym-1].requiredTemplates, ...ids.map(id => equipmentCatalog.find(item => item.id===id)!.requiredTemplates));
  state.collection = Object.fromEntries(nbaTemplates.slice(0,collectionCount).map(t=>[t.id,{firstAt:start, highestRating:0, highestValue:'0'}]));
  for (const id of ids) {
    if (equipmentOffer(state,id).price === null) throw Error('Locked equipment in fixture');
    state.ownedEquipment.push(id); state.equippedEquipment.push(id);
    state.purchasePrices[id] = equipmentCatalog.find(item=>item.id===id)!.price;
    state.collectedEquipment[id] = {firstAt:start};
  }
  // The original initial recruit is removed only from this synthetic fixture.
  // Fresh generation via the real command applies the configured project.
  state.player = null;
  state = command(state,{type:'recruit'});
  state.player!.autoEnabled = true;
  state.player!.nextShotAt = start;
  state = command(state,{type:'accept-cooperation',id:cooperationOffers(state,state.player!)[0].id,playerId:state.player!.id});
  state.credits = 10000;
  if(!validGym(state)) throw Error('Invalid project experiment fixture');
  return state;
}
function metrics(state: GymState) {
  counts.forecastComparisons++;
  const p = state.player!;
  return {capacity: staminaMax(state), currentStamina:p.stamina, recoverySeconds:recoverySeconds(state), autoSeconds:automaticIntervalMs(state)/1000,
    meanXp:11.6+equipmentEffects(state).experience+equipmentEffects(state).automationExperience+state.projects.automation,
    sec30:estimateShotTime(state,p,30)/1000,sec100:estimateShotTime(state,p,100)/1000,sec300:estimateShotTime(state,p,300)/1000,
    level10:forecastTraining(state,p,10),level25:forecastTraining(state,p,25),level99:forecastTraining(state,p,99)};
}
const stageMarginals: unknown[]=[];
for(const gym of [2,4,6,8]) for(const gear of ['none','supply'] as const) for(const id of ['endurance','recovery','automation'] as const) {
  for(let level=1;level<=projectCap(id,gym);level++) {
    const before = fixture(gym,gear);
    before.projects[id] = level-1;
    before.player!.stamina = staminaMax(before);
    const offer = projectOffer(before,id);
    if (offer.price === null) throw Error('Locked project marginal');
    const after = command(before,{type:'upgrade-project',id});
    const currentBefore=metrics(before), currentAfter=metrics(after);
    const nextRecruit = structuredClone(after); nextRecruit.player!.stamina=staminaMax(after);
    const nextMetrics=metrics(nextRecruit);
    if(id==='endurance'&&currentBefore.currentStamina!==currentAfter.currentStamina) throw Error('Upgrade incorrectly refilled capacity');
    stageMarginals.push({gym,gear,id,level,price:offer.price,baselineProjects:before.projects,ids:before.equippedEquipment,
      purchaseNow:{before:currentBefore,after:currentAfter},nextRecruit:nextMetrics,
      level25SecondsSavedNow:(currentBefore.level25!.estimatedMs-currentAfter.level25!.estimatedMs)/1000,
      level25SecondsSavedNextRecruit:(currentBefore.level25!.estimatedMs-nextMetrics.level25!.estimatedMs)/1000,
      sec300SavedNow:currentBefore.sec300-currentAfter.sec300,sec300SavedNextRecruit:currentBefore.sec300-nextMetrics.sec300});
  }
}

const offline: any[]=[];
for(const gym of [2,4,6,8]) for(const gear of ['none','supply'] as const) for(const maximum of [false,true]) for(const extension of [false,true]) {
  if(extension && (gear!=='supply'||gym<6)) continue;
  const prepare=(seed:number)=>{
    let state=fixture(gym,gear,seed,maximum);
    if(extension) {
      if(equipmentCapacity(state)<6) state=command(state,{type:'upgrade-project',id:'equipment'});
      state=command(state,{type:'buy-equipment',id:'relic_077'});
    }
    return state;
  };
  const rows:any[]=[];
  for(let level=0;level<=projectCap('offline',gym);level++) {
    const runs=[];
    for(let seed=1;seed<=seeds;seed++) {
      const state=prepare(seed); state.projects.offline=level;
      const result=settleOfflineGym(state,start+4*60*60*1000);
      counts.offlineSettlements++;counts.offlineShots+=result.report?.totalShots??0;
      runs.push({seed,shots:result.report?.totalShots??0,xp:result.report?.totalExperience??0,level:result.state.player!.level,
        template:result.state.player!.templateId,capMinutes:offlineLimitMs(state)/60000,
        maxed:result.state.player!.level===99});
    }
    rows.push({level,price:level?projectCost('offline',level):0,capMinutes:runs[0].capMinutes,shots:summary(runs.map(r=>r.shots)),
      xp:summary(runs.map(r=>r.xp)),finalLevel:summary(runs.map(r=>r.level)),maxedCount:runs.filter(r=>r.maxed).length,runs});
  }
  offline.push({gym,gear,extensionEquipment:extension,maximumOtherProjects:maximum,projects:prepare(1).projects,ids:prepare(1).equippedEquipment,rows});
  console.log(JSON.stringify({phase:'offline',gym,gear,maximum,extension,elapsedSeconds:(Date.now()-started)/1000}));
}

type Checkpoint={level:number;shots:number;seconds:number;tier:number;template:string|null;credits:number;rawCredits:number;withheldCredits:number;fame:number;growth:number;statsTotal:number;wastedGrowth:number};
const recruitment:any[]=[];
for(let level=0;level<=6;level++) {
  const runs=[];
  for(let seed=1;seed<=recruitSeeds;seed++) {
    // Restart from a fixed pre-generation RNG; consume the identical recruit
    // random stream at every project level rather than generating twice.
    let state = newGym(start,seed); state.gymLevel=8;
    state.projects={endurance:3,recovery:6,recruitment:level,equipment:0,automation:3,offline:0};
    state.player=null; state=command(state,{type:'recruit'});
    state.player!.autoEnabled=true;state.player!.nextShotAt=start;
    state=command(state,{type:'accept-cooperation',id:cooperationOffers(state,state.player!)[0].id,playerId:state.player!.id});
    const checkpoints:Record<number,Checkpoint>={};
    const entryTotal=statKeys.reduce((sum,key)=>sum+state.player!.entryStats[key],0);
    let shots=0;
    while(state.player!.level<40) {
      const p=state.player!;
      const at=Math.max(state.updatedAt,p.nextShotAt,p.stamina<1?state.updatedAt+recoverySeconds(state)*1000-p.recoveryMs:0);
      state=advanceGym(state,at);
      trainPlayer(state,state.player!,at,[],shots>0);shots++;counts.recruitmentShots++;
      for(const target of [10,15,20,25,40]) if(state.player!.level>=target&&!checkpoints[target]) {
        const reward=recommendation(state,state.player), payout=recommendationPayout(state,state.player), paid=command(state,{type:'recommend',id:state.player!.id});
        counts.recommendationProbes++;
        if(paid.credits-state.credits!==payout.credits||paid.fame-state.fame!==reward.fame) throw Error('Recommendation ledger mismatch');
        checkpoints[target]={level:state.player!.level,shots,seconds:(at-start)/1000,tier:reward.tier,template:state.player!.templateId,
          credits:payout.credits,rawCredits:reward.credits,withheldCredits:payout.withheldCredits,fame:reward.fame,growth:reward.growth,statsTotal:statKeys.reduce((sum,key)=>sum+state.player!.stats[key],0),
          wastedGrowth:state.player!.level*10-reward.growth};
      }
    }
    counts.recruitmentTraces++;runs.push({seed,entryTotal,checkpoints});
  }
  const checkpoints=[10,15,20,25,40].map(target=>{
    const values=runs.map(r=>r.checkpoints[target]);
    const previous=level?recruitment[level-1].runs.map((r:any)=>r.checkpoints[target]):null;
    const pairs=previous?values.map((r,i)=>({tier:r.tier-previous[i].tier,credits:r.credits-previous[i].credits,rawCredits:r.rawCredits-previous[i].rawCredits,fame:r.fame-previous[i].fame,
      stats:r.statsTotal-previous[i].statsTotal,seconds:r.seconds-previous[i].seconds})):null;
    return {target,tiers:[0,1,2,3,4,5].map(tier=>values.filter(r=>r.tier===tier).length),
      qualifiedForTrainingBonus:values.filter(r=>r.tier>=({10:2,15:3,20:4,25:5,40:5} as Record<number,number>)[target]).length,
      ...Object.fromEntries(['shots','seconds','credits','rawCredits','withheldCredits','fame','growth','statsTotal','wastedGrowth'].map(key=>[key,summary(values.map(r=>r[key as keyof Checkpoint] as number))])),
      incrementalVersusPrevious:pairs?{tierImproved:pairs.filter(r=>r.tier>0).length,tierUnchanged:pairs.filter(r=>r.tier===0).length,
        tierWorse:pairs.filter(r=>r.tier<0).length,creditDelta:summary(pairs.map(r=>r.credits)),rawCreditDelta:summary(pairs.map(r=>r.rawCredits)),fameDelta:summary(pairs.map(r=>r.fame)),
        statsDelta:summary(pairs.map(r=>r.stats)),secondsDelta:summary(pairs.map(r=>r.seconds))}:null};
  });
  recruitment.push({level,price:level?projectCost('recruitment',level):0,entryTotal:summary(runs.map(r=>r.entryTotal)),checkpoints,runs});
  console.log(JSON.stringify({phase:'recruitment',level,elapsedSeconds:(Date.now()-started)/1000}));
}

const slots:any[]=[];
for(const gym of [2,4,6,8]) {
  const base=fixture(gym,'none',1);
  // Real available categories: five supply + brand/cooperation/offline.
  // Directional items require a target-template objective and are not assigned
  // imaginary fixed-level speed or cash value here.
  const families=['capacity','recovery','course','experience','automation','brand','cooperation','offline'];
  const pool=families.map(family=>equipmentCatalog.filter(item=>item.family===family&&item.unlockLevel<=gym)
    .sort((a,b)=>b.grade-a.grade)[0]).filter(Boolean);
  const collectionCount=Math.max(gymLevels[gym-1].requiredTemplates,...pool.map(item=>item.requiredTemplates));
  base.collection=Object.fromEntries(nbaTemplates.slice(0,collectionCount).map(t=>[t.id,{firstAt:start,highestRating:0,highestValue:'0'}]));
  const candidates:any[]=[];
  for(let mask=0;mask<(1<<pool.length);mask++) {
    const selected=pool.filter((_,i)=>mask&(1<<i));
    const state=structuredClone(base);
    state.ownedEquipment=selected.map(item=>item.id);state.equippedEquipment=[...state.ownedEquipment];
    state.player!.stamina=staminaMax(state);
    candidates.push({ids:state.equippedEquipment,slots:selected.length,cost:selected.reduce((sum,item)=>sum+item.price,0),
      sec25:forecastTraining(state,state.player,25)!.estimatedMs/1000,brand:equipmentEffects(state).valuePercent,
      cooperation:equipmentEffects(state).cooperationBonus,offlineMinutes:offlineLimitMs(state)/60000});
  }
  const rows=[];
  for(let level=0;level<=projectCap('equipment',gym);level++) {
    const capacity=4+level;
    const legal=candidates.filter(c=>c.slots<=capacity);
    const sorted=[...legal].sort((a,b)=>a.sec25-b.sec25||a.cost-b.cost||a.slots-b.slots);
    const fastest=sorted[0], tied=legal.filter(c=>c.sec25<=fastest.sec25+1e-9);
    const combined=[...tied].sort((a,b)=>b.brand-a.brand||b.cooperation-a.cooperation||b.offlineMinutes-a.offlineMinutes||a.cost-b.cost)[0];
    rows.push({level,capacity,price:level?projectCost('equipment',level):0,fastest,fastestWithBusinessThenOffline:combined,combinations:legal.length});
  }
  slots.push({gym,projects:base.projects,syntheticCollectionCount:collectionCount,pool:pool.map(item=>({id:item.id,family:item.family,price:item.price})),rows});
}

const schedule=projects.map(project=>({id:project.id,name:project.name,
  totalPrice:Array.from({length:project.maxLevel},(_,i)=>projectCost(project.id,i+1)).reduce((a,b)=>a+b,0),
  levels:Array.from({length:project.maxLevel},(_,i)=>({level:i+1,price:projectCost(project.id,i+1),minimumGym:project.unlockLevel+i}))}));
const data={date:'2026-11-15',kind:'project-value-audit',economyVersion:gymEconomyVersion,productionRulesModified:false,
  rulesHash:createHash('sha256').update(JSON.stringify({projects,equipmentCatalog})).digest('hex'),
  method:{stageFixtures:'Synthetic gym and project levels, free injected test credits, collection minimum needed for the equipped items; not evidence of from-zero acquisition.',
    creditFields:'credits is actual wallet payout; rawCredits is uncapped theoretical value for project effect comparisons; withheldCredits is the difference.',
    prices:'Every marginal upgrade is dispatched through the real command, and level/gym gates are checked.',
    forecast:'Exact stopping expectation for random XP; deterministic supply timing estimate. No target-template guarantee.',
    endurance:'Purchase-now retains existing stamina; next-recruit scenario starts at the new capacity.',
    offline:'One real athlete, 4-hour absence, no auto recommendation/recruitment; projects varying from 0 to the legal stage cap. Supply uses the strongest core item actually unlocked at each gym. Gym 6/8 supply profiles additionally test a real purchase of the +60-minute item, including any necessary slot upgrade.',
    recruitment:'128 default paired seeds, same recruitment/economy/attribute streams, balanced training, genuine matching and recommendation ledger probes at fixed levels; no equipment or birth rerolls.',
    equipmentSlots:'Enumerated subsets of the strongest legally unlocked eight non-focus families. Fastest fixed-level forecast first, then business/offline diversity, not global strategy optimum.',
    scope:'Single-athlete marginal effects shared by all trainees; cash payback and from-zero affordability require the separate journey audit.',seeds,recruitSeeds},
  schedule,stageMarginals,offline,recruitment,slots,execution:{...counts,elapsedSeconds:(Date.now()-started)/1000}};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(data,null,2)+'\n');
console.log(JSON.stringify({output,...data.execution}));
