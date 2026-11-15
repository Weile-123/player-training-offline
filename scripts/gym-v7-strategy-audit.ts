import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {
  activePlayers, advanceGym, cooperationOffers, dispatchGym, equipmentCapacity,
  equipmentCatalog, equipmentEffects, equipmentOffer, experienceForLevel, gymUpgrade, newGym,
  projectOffer, projectCost, recoverySeconds, staminaMax, trainPlayer,
  type GymAction, type GymEvent, type GymPlayer, type GymState,
} from '../src/game/gym/engine';
import {equipmentCatalogVersion, gymEconomyVersion, projects, gymLevels} from '../src/game/gym/catalog';
import {estimateShotTime} from '../src/game/gym/forecast';
import {validGym} from '../src/game/gym/save';
import {templateById} from '../src/game/templates';

const sampleSize = Number(process.env.STRATEGY_AUDIT_SEEDS ?? 32);
const endgameSeeds = Number(process.env.STRATEGY_AUDIT_ENDGAME_SEEDS ?? 8);
const output = process.env.STRATEGY_AUDIT_OUTPUT ?? 'docs/balance/v7-strategy-audit-20261114.json';
const start = 1_800_000_000_000;
type Policy = 'none' | 'balanced' | 'supply' | 'business';
type Scenario={id:string;policy:Policy;reserve:boolean;cooperation:'basic'|'milestone';training:'staged'|'short10'|'short15';plan?:'shooting'|'finishing'|'interior';seconds:number;continueAfter8:boolean;seeds:number;postCompletionSeconds?:number};
const planSeeds=Number(process.env.STRATEGY_AUDIT_PLAN_SEEDS??16);
const allScenarios:Scenario[]=[
  ...(['none','balanced','supply','business'] as const).map(policy=>({id:policy,policy,reserve:false,cooperation:'basic' as const,training:'staged' as const,seconds:86400,continueAfter8:false,seeds:sampleSize})),
  {id:'reserve-expansion',policy:'balanced',reserve:true,cooperation:'basic',training:'staged',seconds:86400,continueAfter8:false,seeds:sampleSize},
  {id:'target-cooperation',policy:'balanced',reserve:false,cooperation:'milestone',training:'staged',seconds:86400,continueAfter8:false,seeds:sampleSize},
  {id:'short10-two-hours',policy:'balanced',reserve:false,cooperation:'basic',training:'short10',seconds:7200,continueAfter8:false,seeds:sampleSize},
  {id:'short15-two-hours',policy:'balanced',reserve:false,cooperation:'basic',training:'short15',seconds:7200,continueAfter8:false,seeds:sampleSize},
  {id:'endgame-basic-24h',policy:'balanced',reserve:false,cooperation:'basic',training:'staged',seconds:86400,continueAfter8:true,seeds:endgameSeeds},
  {id:'endgame-cooperation-24h',policy:'balanced',reserve:false,cooperation:'milestone',training:'staged',seconds:86400,continueAfter8:true,seeds:endgameSeeds},
  ...(['shooting','finishing','interior'] as const).map(plan=>({id:'plan-'+plan,policy:'balanced' as const,reserve:false,cooperation:'basic' as const,training:'staged' as const,plan,seconds:86400,continueAfter8:false,seeds:planSeeds})),
  {id:'after-completion-basic-24h',policy:'balanced',reserve:false,cooperation:'basic',training:'staged',seconds:172800,continueAfter8:true,seeds:endgameSeeds,postCompletionSeconds:86400},
  {id:'after-completion-cooperation-24h',policy:'balanced',reserve:false,cooperation:'milestone',training:'staged',seconds:172800,continueAfter8:true,seeds:endgameSeeds,postCompletionSeconds:86400},
];
const selected=(process.env.STRATEGY_AUDIT_SCENARIOS??allScenarios.filter(s=>!s.postCompletionSeconds).map(s=>s.id).join(',')).split(',');
const scenarios=allScenarios.filter(s=>selected.includes(s.id));
if(![sampleSize,endgameSeeds,planSeeds].every(n=>Number.isInteger(n)&&n>=1&&n<=128)||scenarios.length!==selected.length)throw Error('Invalid strategy settings');
type Target = {shots: number; level: number; tier: number};
const targetFor = (gym: number): Target => gym === 1 ? {shots: 30, level: 0, tier: 0}
  : gym === 2 ? {shots: 0, level: 10, tier: 2} : gym === 3 ? {shots: 0, level: 15, tier: 3}
    : gym === 4 ? {shots: 0, level: 20, tier: 4} : {shots: 0, level: 25, tier: 5};
const tierOf = (player: GymPlayer) => [null, 'rotation', 'starter', 'star', 'superstar', 'legend'].indexOf(templateById(player.templateId)?.tier ?? null);
function distribution(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return values.length ? {count: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length,
    p50: sorted[Math.ceil(sorted.length * .5) - 1], p90: sorted[Math.ceil(sorted.length * .9) - 1], min: sorted[0], max: sorted.at(-1)} : null;
}

/** Explicit greedy buying heuristic, not an optimal-play or income guarantee. */
function investmentUtility(state: GymState, policy: Policy, target = targetFor(state.gymLevel)): number {
  const effects = equipmentEffects(state);
  const automatic = state.gymLevel >= 2;
  const meanXP = 11.6 + effects.experience + (automatic ? state.projects.automation + effects.automationExperience : 0);
  const shortTargetShots = target.shots || Math.ceil(experienceForLevel(target.level) / meanXP);
  const shots = policy === 'supply' && state.gymLevel >= 3 ? Math.max(300, shortTargetShots) : shortTargetShots;
  const proxy = {...state.player!, stamina: staminaMax(state), recoveryMs: 0, nextShotAt: state.updatedAt, autoEnabled: automatic,
    training: {planId: 'balanced' as const, shots: 0, completedCourses: 0}};
  const seconds = Math.max(1, estimateShotTime(state, proxy, shots) / 1_000);
  const baseCredits = target.level === 0 ? 2 : target.level === 10 ? 6 : target.level === 15 ? 11 : target.level === 20 ? 17 : 24;
  const cashWeight = policy === 'business' ? .55 : policy === 'supply' ? .1 : .3;
  const brandWeight = policy === 'business' ? .8 : policy === 'supply' ? .05 : .25;
  const brand = Math.min(50, effects.valuePercent);
  return (1 + effects.cooperationBonus / baseCredits) ** cashWeight * ((160 + brand) / 160) ** brandWeight
    * (target.shots ? (meanXP / 11.6) ** .5 : 1)
    * (1 + state.projects.recruitment * .025) / seconds;
}

function simulate(scenario:Scenario, seed: number) {
  const {policy}=scenario;
  const targetAt=(gym:number)=>gym===1?targetFor(1):scenario.training==='short10'?{shots:0,level:10,tier:2}
    :scenario.training==='short15'?{shots:0,level:15,tier:3}:targetFor(gym);
  let state = newGym(start, seed);
  let now = start;
  let grossSpent = 0;
  let saleCredits = 0;
  let totalShots = 0;
  let manualClicks = 0;
  let autoSteps = 0;
  let managementActions = 0;
  let lastInvestmentKey = '';
  let completion:ReturnType<typeof snapshot>|null=null;
  let constructionSpending=0;
  let fundsBlockedSince:number|null=null;
  let fundsBlockedMs=0;
  const counts: Record<string, number> = {};
  const targets = new Map<string, Target>();
  const matched = new Set<string>();
  const milestones: Record<number, ReturnType<typeof snapshot>> = {};
  const transactions: {seconds: number; type: string; id: string; cost: number; replaceId?: string}[] = [];
  const command = (action: GymAction) => {
    const beforeCredits = state.credits;
    const result = dispatchGym(state, state.revision, action, now);
    if (result.error) throw new Error(`${policy}/seed${seed}/${action.type}: ${result.error}`);
    state = result.state;
    if (action.type === 'upgrade-gym') {
      const cost = beforeCredits - state.credits;
      grossSpent += cost;
      constructionSpending += cost;
      transactions.push({seconds: (now - start) / 1_000, id: String(state.gymLevel), type: 'gym-construction', cost});
    }
    counts[action.type] = (counts[action.type] ?? 0) + 1;
    if (action.type === 'train') {manualClicks++; totalShots += result.events.filter(e => e.type === 'trained').length;}
    else managementActions++;
  };
  function snapshot() {
    const remainingEquipment=equipmentCatalog.filter(item=>!state.ownedEquipment.includes(item.id)).reduce((sum,item)=>sum+item.price,0);
    const remainingProjects=projects.reduce((sum,p)=>sum+Array.from({length:p.maxLevel-state.projects[p.id]},(_,i)=>projectCost(p.id,state.projects[p.id]+i+1)).reduce((a,b)=>a+b,0),0);
    return {seconds: (now - start) / 1_000, gym: state.gymLevel, fame: state.fame,
      templates: Object.keys(state.collection).length, recommendations: state.alumni.length,
      templateIds:Object.keys(state.collection),
      legends: state.alumni.filter(p => tierOf(p) === 5).length,
      recruits: state.nextPlayer - 1, recruitActions: counts.recruit ?? 0,
      shots: totalShots, manualClicks, autoSteps, managementActions,
      grossCredits: state.alumni.reduce((sum, p) => sum + p.rewardCredits, 0),
      grossSpent, saleCredits, netSpent: grossSpent - saleCredits, credits: state.credits,constructionSpending,
      remainingEquipment,remainingProjects,completionBudget:state.credits-remainingEquipment-remainingProjects,
      equipmentPurchaseCount: counts['buy-equipment'] ?? 0, projectUpgrades: counts['upgrade-project'] ?? 0,
      projects: {...state.projects}, equipment: [...state.equippedEquipment],
      owned: [...state.ownedEquipment], active: activePlayers(state).map(p => ({id: p.id, level: p.level,
        tier: tierOf(p), shots: p.shots, target: targets.get(p.id)}))};
  }
  const buy = (action: GymAction, id: string, type: string) => {
    const before = state.credits;
    command(action);
    const cost = before - state.credits;
    grossSpent += cost;
    transactions.push({seconds: (now - start) / 1_000, id, type, cost,
      ...('replaceId' in action && action.replaceId ? {replaceId: action.replaceId} : {})});
    if ('replaceId' in action && action.replaceId) {
      const previous = equipmentCatalog.find(e => e.id === action.replaceId)!;
      const next = equipmentCatalog.find(e => e.id === id)!;
      if (previous.family === next.family && previous.grade < next.grade) {
        const saleBefore = state.credits;
        command({type: 'sell-equipment', id: previous.id});
        const income = state.credits - saleBefore;
        saleCredits += income;
        transactions.push({seconds: (now - start) / 1_000, id: previous.id, type: 'sale', cost: -income});
      }
    }
  };
  type Candidate = {actions: {action: GymAction; id: string; type: string}[]; score: number; tie: string};
  const completePurchases=()=>{
    if(completion||state.gymLevel!==8||snapshot().completionBudget<0)return;
    const before=state.credits,expected=snapshot().remainingEquipment+snapshot().remainingProjects;
    for(const p of projects)while(state.projects[p.id]<p.maxLevel)buy({type:'upgrade-project',id:p.id},p.id,'completion-project');
    for(const item of equipmentCatalog)if(!state.ownedEquipment.includes(item.id)){
      const same=state.equippedEquipment.find(id=>equipmentCatalog.find(other=>other.id===id)!.family===item.family);
      const replace=same??(state.equippedEquipment.length>=equipmentCapacity(state)?state.equippedEquipment[0]:undefined);
      // No sale during completion: all35 must be held, not merely collected.
      const old=state.credits;command({type:'buy-equipment',id:item.id,...(replace?{replaceId:replace}:{})});
      grossSpent+=old-state.credits;transactions.push({seconds:(now-start)/1000,id:item.id,type:'completion-equipment',cost:old-state.credits});
    }
    if(before-state.credits!==expected||state.ownedEquipment.length!==35||!validGym(state))throw Error('Invalid actual completion');
    const desired=['capacity','recovery','course','experience','automation','brand','cooperation','offline']
      .map(family=>equipmentCatalog.filter(item=>item.family===family).sort((a,b)=>b.grade-a.grade)[0].id);
    for(const id of [...state.equippedEquipment])if(!desired.includes(id))command({type:'unequip',id});
    for(const id of desired)if(!state.equippedEquipment.includes(id))command({type:'equip',id});
    completion=snapshot();
  };
  const invest = () => {
    for (let loop = 0; loop < 100; loop++) {
      if (gymUpgrade(state).canUpgrade) {
        command({type: 'upgrade-gym'});
        milestones[state.gymLevel] = snapshot();
        if (state.gymLevel === 8) return;
        continue;
      }
      const beforeValue = investmentUtility(state, policy,targetAt(state.gymLevel));
      const reserve=scenario.reserve&&state.gymLevel>=2?(gymLevels[state.gymLevel]?.upgradePrice??0):0;
      const budget=Math.max(0,state.credits-reserve);
      const candidates: Candidate[] = [];
      for (const id of ['recovery', 'endurance', 'automation', 'recruitment'] as const) {
        const offer = projectOffer(state, id);
        if (offer.price === null || offer.price > budget) continue;
        const probe = {...state, projects: {...state.projects, [id]: state.projects[id] + 1}};
        const gain = investmentUtility(probe, policy,targetAt(state.gymLevel)) / beforeValue - 1;
        if (gain > 1e-10) candidates.push({actions: [{action: {type: 'upgrade-project', id}, id, type: 'project'}],
          score: gain / offer.price, tie: id});
      }
      if (policy !== 'none') for (const item of equipmentCatalog) {
        // Continuous online scenario: offline time and unmodelled focus are not
        // given invented monetary utility. Their separate balance audit applies.
        if (item.family === 'offline' || item.family.startsWith('focus-')) continue;
        const owned = state.ownedEquipment.includes(item.id);
        if (state.equippedEquipment.includes(item.id)) continue;
        const offer = equipmentOffer(state, item.id);
        if (!owned && offer.price === null) continue;
        const price = owned ? 0 : item.price;
        if (price > budget) continue;
        const sameFamily = state.equippedEquipment.find(id => equipmentCatalog.find(e => e.id === id)!.family === item.family);
        if (sameFamily && equipmentCatalog.find(e => e.id === sameFamily)!.grade >= item.grade) continue;
        const slots = equipmentCapacity(state);
        const replacements: (string | undefined)[] = sameFamily ? [sameFamily]
          : state.equippedEquipment.length < slots ? [undefined] : [...state.equippedEquipment];
        const addCandidate = (replaceId?: string, extraSlotCost = 0) => {
          const probe = {...state, ownedEquipment: owned ? state.ownedEquipment : [...state.ownedEquipment, item.id],
            equippedEquipment: [...state.equippedEquipment.filter(id => id !== replaceId), item.id]};
          const gain = investmentUtility(probe, policy,targetAt(state.gymLevel)) / beforeValue - 1;
          if (gain <= 1e-10) return;
          const actions: Candidate['actions'] = extraSlotCost ? [{action: {type: 'upgrade-project', id: 'equipment'}, id: 'equipment', type: 'project'}] : [];
          actions.push({action: {type: owned ? 'equip' : 'buy-equipment', id: item.id, ...(replaceId ? {replaceId} : {})}, id: item.id, type: owned ? 'install' : 'equipment'});
          candidates.push({actions, score: gain / Math.max(.01, price + extraSlotCost), tie: item.id + ':' + (replaceId ?? '')});
        };
        for (const replacement of replacements) addCandidate(replacement);
        if (!sameFamily && state.equippedEquipment.length >= slots) {
          const capacity = projectOffer(state, 'equipment');
          if (capacity.price !== null && capacity.price + price <= budget) addCandidate(undefined, capacity.price);
        }
      }
      const selected = candidates.sort((a, b) => b.score - a.score || a.tie.localeCompare(b.tie))[0];
      if (!selected) return;
      for (const entry of selected.actions) buy(entry.action, entry.id, entry.type);
    }
    throw new Error('Investment loop did not converge');
  };
  const ready = (p: GymPlayer) => {
    const target = targets.get(p.id)!;
    return p.level === 99 || (target.shots ? p.shots >= target.shots : p.level >= target.level && tierOf(p) >= target.tier);
  };
  const manage = () => {
    for (const p of [...activePlayers(state)]) if (targets.has(p.id) && ready(p)) {
      if (state.player!.id !== p.id) command({type: 'select-player', id: p.id});
      command({type: 'recommend', id: p.id});
    }
    const updateFundsWait=()=>{
      const offer=state.gymLevel<8?gymUpgrade(state):null;
      const fundsOnly=!!offer?.level&&offer.requirements.filter(r=>r.label!=='扩建赞助券').every(r=>r.met)&&state.credits<offer.price;
      if(fundsOnly&&fundsBlockedSince===null)fundsBlockedSince=now;
      if(!fundsOnly&&fundsBlockedSince!==null){fundsBlockedMs+=now-fundsBlockedSince;fundsBlockedSince=null;}
    };
    const investmentKey = [state.credits, state.fame, Object.keys(state.collection).length, state.gymLevel].join(':');
    if (lastInvestmentKey !== investmentKey) {
      updateFundsWait();
      invest();
      updateFundsWait();
      lastInvestmentKey = [state.credits, state.fame, Object.keys(state.collection).length, state.gymLevel].join(':');
    }
    if (state.gymLevel === 8) {
      if(!scenario.continueAfter8)return;
      completePurchases();
    }
    while (activePlayers(state).length < state.gymLevel) command({type: 'recruit'});
    for (const p of activePlayers(state)) if (!targets.has(p.id)) {
      targets.set(p.id, targetAt(state.gymLevel));
      if (state.player!.id !== p.id) command({type: 'select-player', id: p.id});
      if(scenario.plan)command({type:'set-training-plan',id:scenario.plan,playerId:p.id});
      const offers=cooperationOffers(state,p),target=targets.get(p.id)!;
      const offer=scenario.cooperation==='milestone'&&target.tier>=offers[2].requiredTier?offers[2]:offers[0];
      command({type: 'accept-cooperation', id: offer.id, playerId: p.id});
    }
    if (state.gymLevel >= 2) for (const p of activePlayers(state)) if (!p.autoEnabled && p.level < 99) command({type: 'set-auto', id: p.id, enabled: true});
  };
  manage();
  let horizon = start + scenario.seconds * 1_000;
  while (now < horizon && (state.gymLevel < 8||scenario.continueAfter8)) {
    const due = Math.min(...activePlayers(state).filter(p => p.level < 99).map(p => Math.max(now, p.nextShotAt,
      p.stamina < 1 ? now + recoverySeconds(state) * 1_000 - p.recoveryMs : 0)));
    if (!Number.isFinite(due)) throw new Error('No trainable athlete and no recommendation');
    now = Math.min(due, horizon);
    state = advanceGym(state, now);
    if (due > horizon) break;
    if (state.gymLevel === 1) command({type: 'train', id: state.player!.id});
    else {
      const duePlayers = activePlayers(state).filter(p => p.autoEnabled && p.level < 99 && p.stamina >= 1 && p.nextShotAt <= now)
        .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      const events: GymEvent[] = [];
      for (const p of duePlayers) {trainPlayer(state, p, now, events, matched.has(p.id)); matched.add(p.id);}
      totalShots += events.filter(e => e.type === 'trained').length;
      autoSteps++;
    }
    manage();
    if(completion&&scenario.postCompletionSeconds)horizon=Math.min(horizon,start+(completion.seconds+scenario.postCompletionSeconds)*1000);
    if (totalShots > 1_000_000) throw new Error('Journey shot safety limit exceeded');
  }
  if (!validGym(state)) throw new Error('Invalid final save: ' + policy + '/' + seed);
  if(scenario.postCompletionSeconds&&(!completion||Math.abs((now-start)/1000-completion.seconds-scenario.postCompletionSeconds)>0.001))throw new Error('Exact post-completion horizon was not reached');
  const final = snapshot();
  if (final.grossCredits + saleCredits - grossSpent !== state.credits
    || state.alumni.reduce((sum, p) => sum + p.rewardFame, 0) !== state.fame) throw new Error('Journey ledger mismatch');
  if(fundsBlockedSince!==null)fundsBlockedMs+=now-fundsBlockedSince;
  return {seed, reached8: state.gymLevel === 8, milestones, final, completion,
    afterGym8:milestones[8]?{seconds:final.seconds-milestones[8].seconds,netCredits:final.credits-milestones[8].credits,
      grossCredits:final.grossCredits-milestones[8].grossCredits,recommendations:final.recommendations-milestones[8].recommendations,
      managementActions:final.managementActions-milestones[8].managementActions}:null,
    afterCompletion:completion?{seconds:final.seconds-completion.seconds,netCredits:final.credits-completion.credits,
      grossCredits:final.grossCredits-completion.grossCredits,recommendations:final.recommendations-completion.recommendations}:null,
    fundsOnlyWaitSeconds:fundsBlockedMs/1000,actionCounts: counts, transactions,
    blocked: gymUpgrade(state).requirements.filter(r => !r.met)};
}

await mkdir(dirname(output),{recursive:true});
const results:any[] = [];
for (const scenario of scenarios) {
  const runs: ReturnType<typeof simulate>[] = [];
  console.log('Strategy ' + scenario.id + ': ' + scenario.seeds + ' seeds');
  for (let seed = 1; seed <= scenario.seeds; seed++) {
    const run = simulate(scenario, seed);
    runs.push(run);
    console.log(`${scenario.id} seed ${seed}: G${run.final.gym} at ${Math.round(run.final.seconds)}s; ${run.final.recommendations} recommendations, ${run.final.templates} templates; cash ${run.final.credits}`);
  }
  results.push({scenario, milestones: [2, 3,4, 5, 6,7, 8].map(gym => ({gym,
    attained: runs.filter(r => r.milestones[gym]).length, rate: runs.filter(r => r.milestones[gym]).length / scenario.seeds,
    seconds: distribution(runs.flatMap(r => r.milestones[gym] ? [r.milestones[gym].seconds] : [])),
    recommendations: distribution(runs.flatMap(r => r.milestones[gym] ? [r.milestones[gym].recommendations] : [])),
    manualClicks: distribution(runs.flatMap(r => r.milestones[gym] ? [r.milestones[gym].manualClicks] : [])),
    managementActions: distribution(runs.flatMap(r => r.milestones[gym] ? [r.milestones[gym].managementActions] : []))})),
    final: Object.fromEntries(['seconds', 'gym', 'fame', 'templates', 'recommendations', 'recruits', 'shots', 'grossCredits', 'grossSpent', 'saleCredits', 'netSpent', 'credits', 'manualClicks', 'managementActions'].map(key =>
      [key, distribution(runs.map(r => r.final[key as keyof typeof r.final] as number))])),
    completion:{attained:runs.filter(r=>r.completion).length,seconds:distribution(runs.flatMap(r=>r.completion?[r.completion.seconds]:[])),credits:distribution(runs.flatMap(r=>r.completion?[r.completion.credits]:[]))},
    fundsOnlyWaitSeconds:distribution(runs.map(r=>r.fundsOnlyWaitSeconds)),
    afterCompletion:Object.fromEntries(['seconds','netCredits','grossCredits','recommendations'].map(key=>[key,distribution(runs.flatMap(r=>r.afterCompletion?[r.afterCompletion[key as keyof typeof r.afterCompletion]]:[]))])),
    blockedReasons: [...new Set(runs.flatMap(r=>r.blocked.map(b=>b.label)))],runs});
  // Preserve each completed policy during long batches; these are explicitly
  // partial results until the final report below is written.
  await mkdir(join(process.cwd(), '.tmp'), {recursive: true});
  await writeFile(output,
    JSON.stringify({partial:results.length!==scenarios.length,date:'2026-11-14',economyVersion:gymEconomyVersion,source:'actual-engine-strategy-audit',sampleSize,endgameSeeds,planSeeds,
      assumptions:['32 paired seeds per main strategy, separately declared endgame sample size','Exact event time, real RNG/engine/matching/charged transactions, no currency or template injection',
      'Continuous online, instant management, no UI navigation/human delay; not casual calendar time','Fixed milestone targets assigned on recruitment; no drinks or birth rerolls','Greedy utility is an explicit heuristic, not optimum',
      'No focus/offline item utility before full completion; endgame buys all35 and maxes six projects using real cash before enabling eight-family max kit',
      'Reserve policy holds next gym expansion fee from optional purchases; matching-cooperation accepts third offer only if the assigned target already requires its tier',
      'Short10/15 scenarios are fixed 2-hour horizon; level/tier gym gates remain, failure to reach8 is not called a cash deadlock','endgame-24h scenarios mean from-zero total24h; after-completion-24h scenarios mean an exact24h after real all-permanent purchase; no automated recommendation in the product'],
      actualSimulatedShots:results.reduce((s,r)=>s+r.runs.reduce((n,x)=>n+x.final.shots,0),0),results}, null, 2) + '\n');
}
console.log(JSON.stringify(results.map(({scenario,milestones,final,completion,afterCompletion,fundsOnlyWaitSeconds,blockedReasons})=>({scenario,milestones,final,completion,afterCompletion,fundsOnlyWaitSeconds,blockedReasons})),null,2));
