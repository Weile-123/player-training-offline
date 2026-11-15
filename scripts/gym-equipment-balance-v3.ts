/** Controlled equipment experiments. Synthetic gym/project/collection fixtures are
 * deliberately separated from the game's from-zero economy simulation. */
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {
  activePlayers, advanceGym, automaticIntervalMs, cooperationOffers, dispatchGym, equipmentCapacity,
  equipmentEffects, equipmentOffer, experienceForLevel, gymLevels, newGym, playerLevelCap, projectCap,
  recommendation, recommendationPayout, recoverySeconds, staminaMax, trainPlayer, trainingShotExperience,
  type GymAction, type GymEvent, type GymState,
} from '../src/game/gym/engine';
import {equipmentCatalog, equipmentCatalogVersion, gymEconomyVersion, type GymEquipment, type ProjectId} from '../src/game/gym/catalog';
import {estimateShotTime} from '../src/game/gym/forecast';
import {offlineLimitMs, settleOfflineGym} from '../src/game/gym/offline';
import {nbaTemplates} from '../src/game/templates';
import {statKeys} from '../src/game/types';
import {validGym} from '../src/game/gym/save';

const start = 1_800_000_000_000;
const startedAt = Date.now();
const seeds = Number(process.env.EQUIPMENT_BALANCE_SEEDS ?? 64);
const phase = process.env.EQUIPMENT_BALANCE_PHASE ?? 'full';
const output = process.env.EQUIPMENT_BALANCE_OUTPUT ?? `docs/balance/equipment-v3-balance-economy-v${gymEconomyVersion}.json`;
const selectedGyms = (process.env.EQUIPMENT_BALANCE_GYMS ?? '1,2,3,5,6,7,8').split(',').map(Number);
if (!Number.isInteger(seeds) || seeds < 1 || seeds > 256 || !['full', 'supply', 'growth'].includes(phase)
  || selectedGyms.some(g => !Number.isInteger(g) || g < 1 || g > 8)) throw Error('Invalid equipment experiment settings');
const levels = [10, 15, 20, 25] as const;
const tierGates = {10: 2, 15: 3, 20: 4, 25: 5};
type Fixture = {gym: number; projects: 'zero' | 'typical' | 'maximum'; collection: 'minimum' | 'typical' | 'all'; empty: boolean};
type Item = GymEquipment & {family?: string; grade?: number};
const catalog: readonly Item[] = equipmentCatalog;
const execution={forecastEvaluations:0,offlineSettlements:0,offlineShots:0,growthTraces:0,growthShots:0,swapShots:0,recommendationProbes:0,supplyCases:0,candidateEvaluations:0};
function offlineSettlement(state:GymState,until:number) {
  const result=settleOfflineGym(state,until);execution.offlineSettlements++;execution.offlineShots+=result.report?.totalShots??0;return result;
}
function fixedShotTime(state:GymState,shots:number) {execution.forecastEvaluations++;return estimateShotTime(state,state.player!,shots);}
const byId = new Map(catalog.map(item => [item.id, item]));
const family = (item: Item) => item.family ?? item.id;
const summary = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b) => a-b);
  return {n: values.length, mean: values.reduce((a,b)=>a+b,0)/values.length,
    p10: sorted[Math.max(0, Math.ceil(sorted.length*.1)-1)], p50: sorted[Math.ceil(sorted.length*.5)-1],
    p90: sorted[Math.ceil(sorted.length*.9)-1], min: sorted[0], max: sorted.at(-1)!};
};
function command(state: GymState, action: GymAction): GymState {
  const result = dispatchGym(state, state.revision, action, state.updatedAt);
  if (result.error) throw Error(action.type + ': ' + result.error);
  return result.state;
}
function templateCount(f: Fixture) {
  const minimum = gymLevels[f.gym-1]?.requiredTemplates ?? 0;
  return f.collection === 'all' ? nbaTemplates.length : f.collection === 'minimum' ? minimum : Math.max(minimum, (f.gym-1)*3);
}
function make(f: Fixture, ids: readonly string[] = [], seed = 1, players = 1, plan = 'balanced'): GymState {
  let state = newGym(start, seed);
  state.gymLevel = f.gym;
  for (const id of Object.keys(state.projects) as ProjectId[]) {
    const cap = projectCap(id, f.gym);
    state.projects[id] = f.projects === 'zero' ? 0 : f.projects === 'maximum' ? cap
      : id === 'recovery' ? Math.min(cap, Math.max(0,f.gym-2))
      : id === 'equipment' ? Math.min(cap, Math.floor((f.gym-1)/3))
      : id === 'offline' ? 0 : Math.min(cap, Math.floor((f.gym-1)/2));
  }
  state.collection = Object.fromEntries(nbaTemplates.slice(0,templateCount(f)).map(t=>[t.id,{firstAt:start,highestRating:0,highestValue:'0'}]));
  for(const id of ids) {
    if(!byId.has(id)) throw Error('Unknown fixture equipment '+id);
    const offer=equipmentOffer(state,id);
    if(offer.price===null) throw Error(`Locked fixture equipment ${id} at G${f.gym}: ${offer.reason}`);
  }
  if (ids.length > equipmentCapacity(state) || new Set(ids.map(id => family(byId.get(id)!))).size !== ids.length) throw Error('Invalid fixture equipment slots/families');
  state.ownedEquipment = [...ids]; state.equippedEquipment = [...ids];
  state.purchasePrices = Object.fromEntries(ids.map(id=>[id,byId.get(id)!.price]));
  state.collectedEquipment = Object.fromEntries(ids.map(id=>[id,{firstAt:start}]));
  // Use the real recruiter after project setup, rather than retrofitting entry stats.
  state.player = null;
  for(let i=0;i<players;i++) state=command(state,{type:'recruit'});
  for(const playerId of activePlayers(state).map(p=>p.id)) {
    if(state.player!.id!==playerId) state=command(state,{type:'select-player',id:playerId});
    const p=state.player!;
    p.autoEnabled = f.gym>=2; p.nextShotAt = start;
    p.stamina = f.empty ? 0 : staminaMax(state); p.recoveryMs=0;
    p.training.planId=plan as typeof p.training.planId;
    state=command(state,{type:'accept-cooperation',id:cooperationOffers(state,p)[0].id,playerId:p.id});
  }
  if(!validGym(state)) throw Error('Invalid equipment experiment fixture');
  return state;
}
const cost = (ids: readonly string[]) => ids.reduce((total,id)=>total+byId.get(id)!.price,0);
const optimizationScores = new Map<string,number>();
const shotEstimates = new Map<string,number>();
const timeEstimates = new Map<string,number>();
function supplyKey(state:GymState) {
  const p=state.player!;
  return [p.stamina,p.recoveryMs,p.training.shots,p.nextShotAt-state.updatedAt,staminaMax(state),recoverySeconds(state),
    equipmentEffects(state).courseRecovery,p.autoEnabled?automaticIntervalMs(state):1000].join(':');
}
function estimatedTime(state:GymState,shots:number) {
  const key=supplyKey(state)+':'+shots;
  let value=timeEstimates.get(key);
  if(value===undefined) {value=fixedShotTime(state,shots);timeEstimates.set(key,value);}
  return value;
}
function available(f: Fixture) {
  const state=make(f);
  return catalog.filter(item=>equipmentOffer(state,item.id).price!==null);
}
const averageXp = (state: GymState, offline = false) => {
  const xp = trainingShotExperience as unknown as (s:GymState,o:'hold'|'success'|'great',p:GymState['player'],offline:boolean)=>number;
  return .3*xp(state,'hold',state.player,offline)+.6*xp(state,'success',state.player,offline)+.1*xp(state,'great',state.player,offline);
};
function estimatedShots(state: GymState, seconds: number) {
  const key=supplyKey(state)+':'+seconds;
  const cached=shotEstimates.get(key); if(cached!==undefined)return cached;
  let low=0, high=Math.floor(seconds*1000/(state.player!.autoEnabled?automaticIntervalMs(state):1000))+1;
  while(low<high) {const mid=Math.ceil((low+high)/2); if(fixedShotTime(state,mid)<=seconds*1000) low=mid; else high=mid-1;}
  shotEstimates.set(key,low); return low;
}
function supply(f: Fixture, ids: readonly string[], real = true) {
  execution.supplyCases++;
  const state=make(f,ids,7);
  const report=real&&f.gym>=2?offlineSettlement(state,start+1_800_000).report:undefined;
  const testLongAbsence=ids.length===0||ids.some(id=>Number((byId.get(id)!.effects as any).offlineMinutes??0)>0);
  const longAbsences=real&&f.gym>=2&&testLongAbsence?[45,90,240].map(minutes=>{
    const result=offlineSettlement(state,start+minutes*60_000);
    return {minutes,creditedMinutes:(result.report?.creditedMs??0)/60_000,shots:result.report?.totalShots??0,
      xp:result.report?.totalExperience??0,level:result.state.player!.level,stamina:result.state.player!.stamina};
  }):undefined;
  return {ids:[...ids],cost:cost(ids),slots:ids.length,capacity:staminaMax(state),recoverySeconds:recoverySeconds(state),
    autoSeconds:automaticIntervalMs(state)/1000,effects:equipmentEffects(state),meanOnlineXp:averageXp(state),meanOfflineXp:averageXp(state,true),
    sec100:fixedShotTime(state,100)/1000,sec300:fixedShotTime(state,300)/1000,
    shots30:report?.totalShots??null,xp30:report?.totalExperience??null,
    estimatedOnlineShots30:estimatedShots(state,1800),offlineCapSeconds:offlineLimitMs(state)/1000,longAbsences};
}
function optimize(f: Fixture, budget: number, goal: 'burst'|'online'|'offline') {
  // Focus/business items cannot improve the isolated fixed-level supply goal.
  // Enumerate every feasible supply-family combination, not a heuristic beam.
  const candidates=available(f).filter(item=>{
    const e=item.effects as unknown as Record<string,unknown>;
    return ['stamina','recovery','courseRecovery','experience','automationExperience',...(goal==='offline'?['offlineMinutes']:[])].some(key=>typeof e[key]==='number'&&Number(e[key])>0);
  });
  const groups=[...new Set(candidates.map(family))].map(key=>candidates.filter(item=>family(item)===key));
  const base=make(f); const slots=equipmentCapacity(base);
  let best:{ids:string[];cost:number;score:number}|null=null, evaluated=0;
  const score=(ids:string[])=>{
    const cacheKey=JSON.stringify([f,goal,ids]);
    const cached=optimizationScores.get(cacheKey); if(cached!==undefined)return cached;
    // Scoring does not need recruitment/clone work for each combination.
    base.ownedEquipment=ids; base.equippedEquipment=ids;
    base.player!.stamina=f.empty?0:staminaMax(base);
    const xp=averageXp(base,goal==='offline');
    const seconds=goal==='offline'?Math.min(14_400,offlineLimitMs(base)/1000):1800;
    const result=goal==='burst'?-estimatedTime(base,100)/xp:Math.min(experienceForLevel(playerLevelCap),estimatedShots(base,seconds)*xp);
    optimizationScores.set(cacheKey,result); return result;
  };
  const visit=(index:number,ids:string[],spent:number)=>{
    if(index===groups.length) {evaluated++;execution.candidateEvaluations++; const value=score(ids);
      if(!best||value>best.score+1e-9||Math.abs(value-best.score)<1e-9&&(spent<best.cost||spent===best.cost&&ids.length<best.ids.length)) best={ids:[...ids],cost:spent,score:value};
      return;
    }
    visit(index+1,ids,spent);
    if(ids.length<slots) for(const item of groups[index]) if(spent+item.price<=budget) {ids.push(item.id);visit(index+1,ids,spent+item.price);ids.pop();}
  };
  visit(0,[],0);
  return {...best!,evaluated};
}
function businessLoadout(f:Fixture) {
  const items=available(f);
  const choices=['brand','cooperation'].flatMap(key=>{
    const selected=items.filter(item=>family(item)===key).sort((a,b)=>(b.grade??0)-(a.grade??0)||b.price-a.price)[0];
    return selected?[selected.id]:[];
  });
  if(choices.length) return choices;
  // Backward-compatible V2 baseline, only used before the rewrite is complete.
  return items.filter(i=>i.effects.valuePercent||i.effects.cooperationBonus).sort((a,b)=>b.effects.cooperationBonus-a.effects.cooperationBonus||b.effects.valuePercent-a.effects.valuePercent).slice(0,2).map(i=>i.id);
}
type Checkpoint = {level:number;shots:number;seconds:number;template:string|null;tier:number;credits:number;rawCredits:number;withheldCredits:number;fame:number;growth:number;trainingCredits:number;cooperationCredits:number;manualActions:number;managementActions:number;wastedGrowth:number;stats:Record<string,number>};
function checkpoint(state:GymState,managementActions:number):Checkpoint {
  execution.recommendationProbes++;
  const p=state.player!; const reward=recommendation(state,p), payout=recommendationPayout(state,p);
  const paid=command(state,{type:'recommend',id:p.id});
  if(paid.credits-state.credits!==payout.credits||paid.fame-state.fame!==reward.fame) throw Error('Recommendation ledger mismatch');
  return {level:p.level,shots:p.shots,seconds:(state.updatedAt-start)/1000,template:p.templateId,tier:reward.tier,
    credits:payout.credits,rawCredits:reward.credits,withheldCredits:payout.withheldCredits,fame:reward.fame,growth:reward.growth,trainingCredits:reward.trainingCredits,cooperationCredits:reward.cooperationCredits,
    manualActions:p.autoEnabled?0:p.shots,managementActions,wastedGrowth:Math.max(0,p.level*10-reward.growth),stats:{...p.stats}};
}
function growthTrace(f:Fixture,ids:readonly string[],seed:number,offline:boolean,plan='balanced') {
  execution.growthTraces++;
  let state=make(f,ids,seed,1,plan);
  const creditedUntil=offline?start+offlineLimitMs(state):Infinity;
  const milestones:Record<number,Checkpoint>={}, qualified:Record<number,Checkpoint>={};
  const train=trainPlayer as unknown as (s:GymState,p:NonNullable<GymState['player']>,at:number,e:GymEvent[],reuse:boolean,offline?:boolean)=>void;
  let shots=0;
  while(state.player!.level<30&&shots<2000) {
    const p=state.player!;
    const at=Math.max(state.updatedAt,p.nextShotAt,p.stamina<1?state.updatedAt+recoverySeconds(state)*1000-p.recoveryMs:0);
    if(at>creditedUntil) {state=advanceGym(state,creditedUntil);break;}
    state=advanceGym(state,at);
    // Matching is reused only when the previous shot had no matching-input change,
    // exactly as offline replay; the first shot is always matched.
    train(state,state.player!,at,[],shots>0,offline);
    shots++;execution.growthShots++;
    const level=state.player!.level;
    for(const target of levels) {
      if(level>=target&&!milestones[target]) milestones[target]=checkpoint(state,3+Number(f.gym>=2)+Number(plan!=='balanced'));
      if(level>=target&&!qualified[target]&&recommendation(state,state.player).tier>=tierGates[target]) qualified[target]=checkpoint(state,3+Number(f.gym>=2)+Number(plan!=='balanced'));
    }
  }
  return {seed,offline,plan,offlineCapSeconds:offlineLimitMs(state)/1000,milestones,qualified,final:checkpoint(state,3+Number(f.gym>=2)+Number(plan!=='balanced'))};
}
function aggregateTraces(runs:ReturnType<typeof growthTrace>[]) {
  return levels.map(level=>({level,runs:runs.length,qualified:runs.filter(r=>r.qualified[level]).length,
    levelReached:runs.filter(r=>r.milestones[level]).length,
    tiers:[0,1,2,3,4,5].map(tier=>runs.filter(r=>r.milestones[level]?.tier===tier).length),
    stats:Object.fromEntries(statKeys.map(key=>[key,summary(runs.flatMap(r=>r.milestones[level]?[r.milestones[level].stats[key]]:[]))])),
    ...Object.fromEntries(['shots','seconds','credits','rawCredits','withheldCredits','fame','growth','trainingCredits','cooperationCredits','manualActions','managementActions','wastedGrowth'].map(key=>[key,summary(runs.flatMap(r=>r.milestones[level]?[r.milestones[level][key as keyof Checkpoint] as number]:[]))])),
    qualifiedShots:summary(runs.flatMap(r=>r.qualified[level]?[r.qualified[level].shots]:[])),
    qualifiedSeconds:summary(runs.flatMap(r=>r.qualified[level]?[r.qualified[level].seconds]:[]))}));
}
function assertCatalog() {
  const ids=new Set<string>(), signatures=new Set<string>(), problems:string[]=[];
  for(const item of catalog) {
    if(ids.has(item.id)) problems.push('Duplicate ID '+item.id); ids.add(item.id);
    const signature=JSON.stringify(Object.entries(item.effects).sort(([a],[b])=>a.localeCompare(b)));
    if(signatures.has(signature)) problems.push('Duplicate effects '+item.id); signatures.add(signature);
    if(!Number.isInteger(item.price)||item.price<1||item.unlockLevel<1||item.unlockLevel>8) problems.push('Invalid price/unlock '+item.id);
  }
  const families=[...new Set(catalog.map(family))].map(key=>({family:key,items:catalog.filter(item=>family(item)===key).map(i=>({id:i.id,grade:i.grade,price:i.price,gym:i.unlockLevel,templates:i.requiredTemplates}))}));
  const coverage=Object.fromEntries(['stamina','recovery','courseRecovery','experience','automationExperience','offlineMinutes','valuePercent','cooperationBonus']
    .map(key=>[key,catalog.filter(item=>Number((item.effects as any)[key]??0)>0).length]));
  const focusCoverage=Object.fromEntries(statKeys.map(key=>[key,catalog.filter(item=>item.effects.focusKey===key).length]));
  for(const group of families) {
    const graded=group.items.filter(item=>item.grade!==undefined).sort((a,b)=>a.grade!-b.grade!);
    if(new Set(graded.map(i=>i.grade)).size!==graded.length) problems.push('Duplicate family grade '+group.family);
    for(let i=1;i<graded.length;i++) if(graded[i].price<=graded[i-1].price||graded[i].gym<graded[i-1].gym) problems.push('Reversed price/unlock progression '+group.family);
  }
  if(problems.length) throw Error(problems.join('\n'));
  return {count:catalog.length,families,totalCost:catalog.reduce((s,i)=>s+i.price,0),coverage,focusCoverage,problems};
}

console.log('Equipment V3 experiment: '+seeds+' seeds, gyms '+selectedGyms.join(',')+', phase '+phase);
const catalogAudit=assertCatalog();
const supplyResults:any[]=[], searches:any[]=[], growth:any[]=[], rosters:any[]=[], specialization:any[]=[], swaps:any[]=[];
const budgets:Record<number,number[]>={1:[2,5,10],2:[5,10,20],3:[10,20,35],4:[15,30,50],5:[20,40,70],6:[30,60,100],7:[40,80,130],8:[50,100,160]};
for(const gym of selectedGyms) {
  const primary:Fixture={gym,projects:'typical',collection:'typical',empty:false};
  if(phase!=='growth') {
    for(const project of ['zero','typical','maximum'] as const) for(const empty of [false,true]) {
      const f:Fixture={gym,projects:project,collection:'all',empty};
      const availableIds=available(f).map(item=>item.id);
      supplyResults.push({fixture:f,baseline:supply(f,[]),single:availableIds.map(id=>supply(f,[id]))});
    }
    for(const collection of ['minimum','typical','all'] as const) {
      const f:Fixture={...primary,collection};
      for(const budget of budgets[gym]) for(const goal of ['burst','online','offline'] as const) {
        if(gym===1&&goal==='offline') continue;
        const result=optimize(f,budget,goal);
        searches.push({fixture:f,budget,goal,...result,result:supply(f,result.ids)});
      }
    }
  }
  const optimal=optimize(primary,budgets[gym][1],gym===1?'burst':'online').ids;
  const offlineOptimal=optimize(primary,budgets[gym][1],gym===1?'burst':'offline').ids;
  const business=businessLoadout(primary);
  if(phase!=='supply') {
    const configs=[{label:'baseline',ids:[] as string[],offline:false},{label:'online-budget',ids:optimal,offline:false},
      ...(gym>=2?[{label:'offline-budget',ids:offlineOptimal,offline:true}]:[]),{label:'business',ids:business,offline:false}];
    for(const config of configs) {
      console.log('Growth G'+gym+' '+config.label+' '+config.ids.join('+'));
      const runs=Array.from({length:seeds},(_,i)=>growthTrace(primary,config.ids,i+1,config.offline));
      growth.push({fixture:primary,...config,paid:cost(config.ids),summary:aggregateTraces(runs),runs});
    }
    if(gym>=2) {
      const ids=offlineOptimal;
      const runs=Array.from({length:Math.min(seeds,8)},(_,i)=>{
        const state=make(primary,ids,i+1,gym);
        const report=offlineSettlement(state,start+1_800_000).report!;
        return {seed:i+1,players:gym,shots:report.totalShots,xp:report.totalExperience,
          levels:report.players.map(p=>p.levelAfter),courses:report.players.map(p=>p.courses)};
      });
      rosters.push({fixture:primary,ids,paid:cost(ids),runs,shots:summary(runs.map(r=>r.shots)),xp:summary(runs.map(r=>r.xp))});
    }
    // Actual recommendation before/after installing business equipment, with no
    // added shot, detects reward snapshots without pretending to earn coupons twice.
    const f={...primary,collection:'all' as const};
    let state=make(f,[],7);
    for(let i=0;i<40;i++) {const p=state.player!;const at=Math.max(state.updatedAt,p.nextShotAt,p.stamina<1?state.updatedAt+recoverySeconds(state)*1000-p.recoveryMs:0);
      state=advanceGym(state,at); (trainPlayer as any)(state,state.player!,at,[],i>0,false);execution.swapShots++;}
    const before=recommendation(state); const shotsBefore=state.player!.shots;
    const late=businessLoadout(f); state.ownedEquipment=late;state.equippedEquipment=late;
    let earned=make(f,late,7);
    for(let i=0;i<40;i++) {const p=earned.player!;const at=Math.max(earned.updatedAt,p.nextShotAt,p.stamina<1?earned.updatedAt+recoverySeconds(earned)*1000-p.recoveryMs:0);
      earned=advanceGym(earned,at);(trainPlayer as any)(earned,earned.player!,at,[],i>0,false);execution.swapShots++;}
    const earnedBefore=recommendation(earned);earned.equippedEquipment=[];
    swaps.push({gym,before,after:recommendation(state),shotsBefore,shotsAfter:state.player!.shots,lateIds:late,
      earnedBeforeUnequip:earnedBefore,earnedAfterUnequip:recommendation(earned)});
  }
}
if(phase!=='supply'&&selectedGyms.includes(6)) {
  const f:Fixture={gym:6,projects:'typical',collection:'all',empty:false};
  for(const item of catalog.filter(item=>item.effects.focusKey&&item.unlockLevel<=f.gym&&item.requiredTemplates<=templateCount(f))) {
    const key=item.effects.focusKey!;
    const plan=key==='three'||key==='mid'?'shooting':key==='drive'||key==='handle'?'finishing':'interior';
    const sampleSize=seeds;
    const runs=Array.from({length:sampleSize},(_,i)=>growthTrace(f,[item.id],i+1,false,plan));
    const baseline=Array.from({length:sampleSize},(_,i)=>growthTrace(f,[],i+1,false,plan));
    const targetAttribute=levels.map(level=>({level,key,
      meanWith:summary(runs.flatMap(r=>r.milestones[level]?[r.milestones[level].stats[key]]:[])),
      meanWithout:summary(baseline.flatMap(r=>r.milestones[level]?[r.milestones[level].stats[key]]:[])),
      reached90With:runs.filter(r=>r.milestones[level]?.stats[key]>=90).length,
      reached90Without:baseline.filter(r=>r.milestones[level]?.stats[key]>=90).length}));
    specialization.push({fixture:f,id:item.id,plan,summary:aggregateTraces(runs),baseline:aggregateTraces(baseline),targetAttribute,runs});
  }
}
const result={metadata:{generatedAt:new Date().toISOString(),elapsedSeconds:(Date.now()-startedAt)/1000,seedCount:seeds,phase,gyms:selectedGyms,catalogVersion:equipmentCatalogVersion,economyVersion:gymEconomyVersion,
  catalogFingerprint:createHash('sha256').update(JSON.stringify(catalog.map(({id,family,grade,price,unlockLevel,requiredTemplates,effects})=>({id,family,grade,price,unlockLevel,requiredTemplates,effects})))).digest('hex'),
  fingerprintFields:['id','family','grade','price','unlockLevel','requiredTemplates','effects'],execution:{...execution,actualSimulatedShots:execution.offlineShots+execution.growthShots+execution.swapShots},
  assumptions:['Synthetic stage fixtures; not a from-zero purchase progression','credits is actual wallet payout; rawCredits is uncapped theoretical value for effect comparisons; withheldCredits is the difference','Project levels, collection counts, and initial recruit explicitly fixed per fixture','No drinks, no mid-trace equipment changes, same RNG seeds across loadouts',
    'Fixed-ball times use estimateShotTime; 30-minute shots/XP use real settleOfflineGym','Growth uses exported trainPlayer/advanceGym and original template matching; reward probes use real recommend dispatch',
    'Cooperation equipment eligibility requires ten equipped shots per qualifying course; every growth kit is worn continuously from shot zero',
    'Level checkpoints do not guarantee required template; qualified rows check both and stop searching after level 30','Management actions count recruit/cooperation/auto/plan/recommend, excluding synthetic initial purchases and UI navigation',
    'Offline growth stops at its actual configured cap; online growth stops at level 30','Online optimizer horizon is 30 minutes; offline optimizer is a 4-hour absence, credited only to the configured cap, with XP capped at the level-99 requirement',
    'Burst optimization ranks fixed-100-shot elapsed time divided by mean XP; it is a supply proxy, not an exact target-template stopping-time optimum',
    'Optimizer exactly enumerates available supply-family combinations under a coupon and slot budget; it does not optimize fame or target-template probabilities']},
  catalogAudit,catalogSnapshot:catalog,supply:supplyResults,searches,growth,rosters,specialization,swaps};
await mkdir(dirname(output),{recursive:true}); await writeFile(output,JSON.stringify(result,null,2)+'\n');
const csvCell=(value:unknown)=>'"'+String(value??'').replaceAll('"','""')+'"';
const csvRows=[['gym','projects','collection','label','paid','ids','level','seeds','reached','qualifiedBy30','shotsMean','secondsMean','actualCreditsMean','rawCreditsMean','withheldCreditsMean','fameMean','qualifiedShotsMean','qualifiedSecondsMean'],
  ...growth.flatMap(g=>g.summary.map((s:any)=>[g.fixture.gym,g.fixture.projects,g.fixture.collection,g.label,g.paid,g.ids.join('+'),s.level,s.runs,s.levelReached,s.qualified,
    s.shots?.mean,s.seconds?.mean,s.credits?.mean,s.rawCredits?.mean,s.withheldCredits?.mean,s.fame?.mean,s.qualifiedShots?.mean,s.qualifiedSeconds?.mean]))];
await writeFile(output.replace(/\.json$/, '-summary.csv'),'\uFEFF'+csvRows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n');
console.log(JSON.stringify({output,elapsedSeconds:result.metadata.elapsedSeconds,catalog:catalogAudit.count,totalCost:catalogAudit.totalCost,
  singleComparisons:supplyResults.reduce((n,p)=>n+p.single.length,0),searches:searches.length,enumeratedLoadouts:searches.reduce((n,p)=>n+p.evaluated,0),
  growthTraces:growth.reduce((n,p)=>n+p.runs.length,0),rosterRuns:rosters.reduce((n,p)=>n+p.runs.length,0),specializationTraces:specialization.reduce((n,p)=>n+p.runs.length*2,0)},null,2));
