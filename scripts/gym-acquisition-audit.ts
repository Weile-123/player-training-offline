/** From-zero acquisition audit. Candidate prices exist only in this process;
 * no source catalog, save, reward, effect, or live browser is changed. */
import {mkdir,writeFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {
 activePlayers,advanceGym,cooperationOffers,dispatchGym,equipmentCapacity,equipmentEffects,equipmentOffer,
 experienceForLevel,gymUpgrade,newGym,projectOffer,projectCost,recoverySeconds,staminaMax,trainPlayer,
 type GymAction,type GymEvent,type GymPlayer,type GymState,
} from '../src/game/gym/engine';
import {equipmentCatalog,projects,gymLevels,trainingCreditMilestones,gymEconomyVersion,type ProjectId} from '../src/game/gym/catalog';
import {estimateShotTime} from '../src/game/gym/forecast';
import {validGym} from '../src/game/gym/save';
import {templateById} from '../src/game/templates';

const seedCount=Number(process.env.ACQUISITION_SEEDS??32);
const horizonSeconds=Number(process.env.ACQUISITION_SECONDS??86400);
const output=process.env.ACQUISITION_OUTPUT??`docs/balance/acquisition-v${gymEconomyVersion}-20261114.json`;
const requested=(process.env.ACQUISITION_VARIANTS??'control,equipment-double,projects-double').split(',');
const cooperationPolicy=process.env.ACQUISITION_COOP??'basic';
const trainingPolicy=process.env.ACQUISITION_TRAINING??'staged';
const completeAfterGym8=process.env.ACQUISITION_COMPLETE_AFTER_GYM8==='1';
const freeConstructionBaseline=process.env.ACQUISITION_CONSTRUCTION_PROFILE==='free';
const start=1800000000000,wallStart=Date.now();
const originals=equipmentCatalog.map(e=>({...e}));
const originalProjects=projects.map(p=>({...p}));
const originalMilestones=trainingCreditMilestones.map(row=>({...row}));
const originalGymLevels=gymLevels.map(row=>({...row}));
const variants=['control','equipment-double','projects-double','targeted-equipment','targeted'] as const;
type CandidatePlan={equipment?:Record<string,number>;projectBase?:Record<string,number>;projectPrices?:Record<string,number[]>;gates?:Record<string,number>;trainingCredits?:number[];gymUpgradeCosts?:number[]};
const candidate=JSON.parse(process.env.ACQUISITION_CANDIDATE_FILE?readFileSync(process.env.ACQUISITION_CANDIDATE_FILE,'utf8'):(process.env.ACQUISITION_CANDIDATE??'{}')) as CandidatePlan;
let customProjectPrices:Record<string,number[]>={};
let constructionCosts:number[]=[];
type Variant=typeof variants[number];
if(!Number.isInteger(seedCount)||seedCount<1||seedCount>128||horizonSeconds<60||horizonSeconds>86400
 ||requested.some(v=>!variants.includes(v as Variant)))throw Error('Invalid audit parameters');
const summary=(v:number[])=>{const s=[...v].sort((a,b)=>a-b);return s.length?{n:s.length,mean:s.reduce((a,b)=>a+b,0)/s.length,
 p50:s[Math.ceil(s.length*.5)-1],p90:s[Math.ceil(s.length*.9)-1],min:s[0],max:s.at(-1)}:null;};
const tier=(p:GymPlayer)=>[null,'rotation','starter','star','superstar','legend'].indexOf(templateById(p.templateId)?.tier??null);
const targetFor=(gym:number)=>gym===1?{shots:30,level:0,tier:0}:trainingPolicy==='short10'?{shots:0,level:10,tier:2}:gym===2?{shots:0,level:10,tier:2}
 :gym===3?{shots:0,level:15,tier:3}:gym===4?{shots:0,level:20,tier:4}:{shots:0,level:25,tier:5};
function applyVariant(variant:Variant){
 customProjectPrices={};
 constructionCosts=[];
 for(let i=0;i<equipmentCatalog.length;i++)Object.assign(equipmentCatalog[i],originals[i]);
 for(let i=0;i<projects.length;i++)Object.assign(projects[i],originalProjects[i]);
 for(let i=0;i<trainingCreditMilestones.length;i++)Object.assign(trainingCreditMilestones[i],originalMilestones[i]);
 for(let i=0;i<gymLevels.length;i++)Object.assign(gymLevels[i],originalGymLevels[i]);
 if(freeConstructionBaseline)for(const level of gymLevels)Object.assign(level,{upgradePrice:0});
 if(variant==='equipment-double')for(const e of equipmentCatalog)e.price*=2;
 if(variant==='projects-double')for(const p of projects){if(p.prices)p.prices=p.prices.map(price=>price*2);else p.basePrice*=2;}
 // Targeted candidate is configured after isolated marginal audits. Explicit
 // JSON inputs allow a fresh paired run without patching production source.
 if(variant.startsWith('targeted')){
  for(const e of equipmentCatalog){if(candidate.equipment?.[e.id]!==undefined)e.price=candidate.equipment[e.id];if(candidate.gates?.[e.id]!==undefined)e.unlockLevel=candidate.gates[e.id];}
  if(variant==='targeted'){
   if(candidate.gymUpgradeCosts){
    if(candidate.gymUpgradeCosts.length!==8||candidate.gymUpgradeCosts.some(value=>!Number.isInteger(value)||value<0))throw Error('Invalid gym construction costs');
    constructionCosts=[...candidate.gymUpgradeCosts];
    for(let index=0;index<gymLevels.length;index++)Object.assign(gymLevels[index],{upgradePrice:constructionCosts[index]});
   }
   for(const p of projects)if(candidate.projectBase?.[p.id]!==undefined)p.basePrice=candidate.projectBase[p.id];
   customProjectPrices=candidate.projectPrices??{};
   for(const p of projects)if(customProjectPrices[p.id])p.prices=[...customProjectPrices[p.id]];
   if(candidate.trainingCredits){
    if(candidate.trainingCredits.length!==trainingCreditMilestones.length||candidate.trainingCredits.some((value,index)=>!Number.isInteger(value)||value<0||index>0&&value<candidate.trainingCredits![index-1]))throw Error('Invalid candidate training rewards');
    for(let index=0;index<trainingCreditMilestones.length;index++)Object.assign(trainingCreditMilestones[index],{credits:candidate.trainingCredits[index]});
   }
  }
 }
}
const priceFor=(id:string,level:number)=>customProjectPrices[id]?.[level-1]??projectCost(id,level);
const constructionCost=(nextLevel:number)=>(gymLevels[nextLevel-1]?.upgradePrice??0);
function prepareProjectPrices(state:GymState){
 // Explicit schedules are now supported by production configuration. Keep the
 // candidate charge assertion, without adapting exponential base prices.
 for(const p of projects){const level=state.projects[p.id]+1,price=customProjectPrices[p.id]?.[level-1];if(price===undefined)continue;
  if(!Number.isInteger(price)||price<1)throw Error('Invalid explicit project price');
  if(projectCost(p.id,level)!==price)throw Error('Project price adapter mismatch');
 }
}
function utility(state:GymState){
 const e=equipmentEffects(state),automatic=state.gymLevel>=2;
 const xp=11.6+e.experience+(automatic?state.projects.automation+e.automationExperience:0),target=targetFor(state.gymLevel);
 const shots=target.shots||Math.ceil(experienceForLevel(target.level)/xp);
 const proxy={...state.player!,stamina:staminaMax(state),recoveryMs:0,nextShotAt:state.updatedAt,autoEnabled:automatic,
  training:{planId:'balanced' as const,shots:0,completedCourses:0}};
 const seconds=Math.max(1,estimateShotTime(state,proxy,shots)/1000);
 const base=target.level===0?2:target.level===10?6:target.level===15?11:target.level===20?17:24;
 return (1+e.cooperationBonus/base)**.3*((160+Math.min(50,e.valuePercent))/160)**.25
  *(target.shots?(xp/11.6)**.5:1)*(1+state.projects.recruitment*.025)/seconds;
}
type Availability={firstLegalSeconds:number;gym:number;creditsAtUnlock:number;price:number;
 affordableAtUnlock:boolean;firstAffordableSeconds:number|null;firstBoughtSeconds:number|null;balanceAtPurchase?:number;lastPayoutAtPurchase?:number};
function simulate(seed:number){
 let state=newGym(start,seed),now=start,spent=0,sales=0,shots=0,commands=0,lastPayout=0,lastInvestmentKey='';
 const targets=new Map<string,ReturnType<typeof targetFor>>(),matched=new Set<string>();
 const gear:Record<string,Availability>={},projectAvailability:Record<string,Availability>={},milestones:Record<number,any>={};
 const transactions:any[]=[];
 const act=(a:GymAction)=>{prepareProjectPrices(state);const before=state.credits,fee=a.type==='upgrade-gym'?constructionCost(state.gymLevel+1):0,expected=a.type==='upgrade-project'?priceFor(a.id,state.projects[a.id as ProjectId]+1):null;
  if(fee>before)throw Error('Construction budget insufficient');
  const r=dispatchGym(state,state.revision,a,now);if(r.error)throw Error(`${seed}/${a.type}/${'id'in a?a.id:''}: ${r.error}`);state=r.state;commands++;
  if(fee){if(before-state.credits!==fee)throw Error('Construction charge mismatch');spent+=fee;transactions.push({seconds:(now-start)/1000,gym:state.gymLevel,type:'gym-construction',id:String(state.gymLevel),cost:fee,balanceBefore:before,balanceAfter:state.credits,lastPayout});}
  if(expected!==null&&before-state.credits!==expected)throw Error('Project candidate charge mismatch');
  if(a.type==='train')shots+=r.events.filter(e=>e.type==='trained').length;return r;};
 const track=()=>{
  prepareProjectPrices(state);
  const seconds=(now-start)/1000;
  const row=(map:Record<string,Availability>,key:string,price:number)=>{
   const r=map[key]??=( {firstLegalSeconds:seconds,gym:state.gymLevel,creditsAtUnlock:state.credits,price,
    affordableAtUnlock:state.credits>=price,firstAffordableSeconds:null,firstBoughtSeconds:null} );
   if(r.firstAffordableSeconds===null&&state.credits>=price)r.firstAffordableSeconds=seconds;
  };
  for(const e of equipmentCatalog)if(state.gymLevel>=e.unlockLevel&&Object.keys(state.collection).length>=e.requiredTemplates)row(gear,e.id,e.price);
  for(const p of projects){const o=projectOffer(state,p.id);if(o.price!==null)row(projectAvailability,p.id+':'+(o.level+1),o.price);}
 };
 const snapshot=()=>{
  const remainingEquipment=equipmentCatalog.filter(e=>!state.ownedEquipment.includes(e.id)).reduce((s,e)=>s+e.price,0);
  const remainingProjects=projects.reduce((s,p)=>s+Array.from({length:p.maxLevel-state.projects[p.id]},(_,i)=>priceFor(p.id,state.projects[p.id]+i+1)).reduce((a,b)=>a+b,0),0);
  const remainingConstruction=gymLevels.slice(state.gymLevel).reduce((sum,level)=>sum+level.upgradePrice,0);
  const legalEquipmentRemaining=equipmentCatalog.filter(e=>!state.ownedEquipment.includes(e.id)&&e.unlockLevel<=state.gymLevel&&e.requiredTemplates<=Object.keys(state.collection).length).reduce((s,e)=>s+e.price,0);
  const legalProjectsRemaining=projects.reduce((s,p)=>s+Array.from({length:Math.max(0,Math.min(p.maxLevel,state.gymLevel-p.unlockLevel+1)-state.projects[p.id])},(_,i)=>priceFor(p.id,state.projects[p.id]+i+1)).reduce((a,b)=>a+b,0),0);
  return {seconds:(now-start)/1000,gym:state.gymLevel,credits:state.credits,fame:state.fame,templates:Object.keys(state.collection).length,
   recommendations:state.alumni.length,grossEarned:state.alumni.reduce((s,p)=>s+p.rewardCredits,0),spent,sales,shots,commands,
   projects:{...state.projects},owned:[...state.ownedEquipment],equipped:[...state.equippedEquipment],
   remainingEquipment,remainingProjects,remainingConstruction,legalEquipmentRemaining,legalProjectsRemaining,afterLegalPermanent:state.credits-legalEquipmentRemaining-legalProjectsRemaining,
   afterAllPermanent:state.credits-remainingEquipment-remainingProjects-remainingConstruction};
 };
 const buy=(a:GymAction,type:string,id:string)=>{
  track();const before=state.credits;act(a);const price=before-state.credits;spent+=price;
  transactions.push({seconds:(now-start)/1000,gym:state.gymLevel,type,id,cost:price,balanceBefore:before,balanceAfter:state.credits,lastPayout,
   ...(type==='project'?{level:state.projects[id as ProjectId]}:{})});
  const r=type==='project'?projectAvailability[id+':'+state.projects[id as ProjectId]]:gear[id];
  if(r&&r.firstBoughtSeconds===null){r.firstBoughtSeconds=(now-start)/1000;r.balanceAtPurchase=before;r.lastPayoutAtPurchase=lastPayout;}
  if('replaceId'in a&&a.replaceId){const old=equipmentCatalog.find(e=>e.id===a.replaceId)!,next=equipmentCatalog.find(e=>e.id===id)!;
   if(old.family===next.family&&old.grade<next.grade){const oldBalance=state.credits;act({type:'sell-equipment',id:old.id});sales+=state.credits-oldBalance;}}
 };
 type Candidate={actions:{action:GymAction;id:string;type:string}[];score:number;tie:string};
 const invest=()=>{
  for(let loop=0;loop<100;loop++){
   track();
   if(gymUpgrade(state).canUpgrade&&state.credits>=constructionCost(state.gymLevel+1)){act({type:'upgrade-gym'});track();milestones[state.gymLevel]=snapshot();if(state.gymLevel===8)return;continue;}
   const baseline=utility(state),candidates:Candidate[]=[];
   for(const id of ['recovery','endurance','automation','recruitment'] as const){const o=projectOffer(state,id);if(o.price===null||o.price>state.credits)continue;
    const gain=utility({...state,projects:{...state.projects,[id]:state.projects[id]+1}})/baseline-1;
    if(gain>1e-10)candidates.push({actions:[{action:{type:'upgrade-project',id},id,type:'project'}],score:gain/o.price,tie:id});}
   for(const e of equipmentCatalog){
    if(e.family==='offline'||e.family.startsWith('focus-')||state.equippedEquipment.includes(e.id))continue;
    const owned=state.ownedEquipment.includes(e.id),offer=equipmentOffer(state,e.id);
    if(!owned&&offer.price===null)continue;
    const price=owned?0:e.price;if(price>state.credits)continue;
    const same=state.equippedEquipment.find(id=>equipmentCatalog.find(e=>e.id===id)!.family===e.family);
    if(same&&equipmentCatalog.find(e=>e.id===same)!.grade>=e.grade)continue;
    const capacity=equipmentCapacity(state),replacements=same?[same]:state.equippedEquipment.length<capacity?[undefined]:[...state.equippedEquipment];
    const add=(replaceId?:string,extra=0)=>{
     const probe={...state,ownedEquipment:owned?state.ownedEquipment:[...state.ownedEquipment,e.id],equippedEquipment:[...state.equippedEquipment.filter(id=>id!==replaceId),e.id]};
     const gain=utility(probe)/baseline-1;if(gain<=1e-10)return;
     const actions:Candidate['actions']=extra?[{action:{type:'upgrade-project',id:'equipment'},id:'equipment',type:'project'}]:[];
     actions.push({action:{type:owned?'equip':'buy-equipment',id:e.id,...(replaceId?{replaceId}:{})},id:e.id,type:owned?'install':'equipment'});
     candidates.push({actions,score:gain/Math.max(.01,price+extra),tie:e.id+':'+(replaceId??'')});
    };
    for(const replacement of replacements)add(replacement);
    if(!same&&state.equippedEquipment.length>=capacity){const o=projectOffer(state,'equipment');if(o.price!==null&&o.price+price<=state.credits)add(undefined,o.price);}
   }
   const best=candidates.sort((a,b)=>b.score-a.score||a.tie.localeCompare(b.tie))[0];if(!best)return;
   for(const a of best.actions)buy(a.action,a.type,a.id);
  }throw Error('Investment loop exceeded');
 };
 const manage=()=>{
  for(const p of [...activePlayers(state)]){const t=targets.get(p.id);if(t&&(p.level===99||(t.shots?p.shots>=t.shots:p.level>=t.level&&tier(p)>=t.tier))){
   if(state.player!.id!==p.id)act({type:'select-player',id:p.id});const before=state.credits;act({type:'recommend',id:p.id});lastPayout=state.credits-before;track();}}
  track();const key=[state.credits,state.fame,Object.keys(state.collection).length,state.gymLevel].join(':');
  if(lastInvestmentKey!==key){invest();lastInvestmentKey=[state.credits,state.fame,Object.keys(state.collection).length,state.gymLevel].join(':');}
  if(state.gymLevel===8&&!completeAfterGym8)return;
  while(activePlayers(state).length<state.gymLevel)act({type:'recruit'});
  for(const p of activePlayers(state))if(!targets.has(p.id)){
   targets.set(p.id,targetFor(state.gymLevel));if(state.player!.id!==p.id)act({type:'select-player',id:p.id});
   const offers=cooperationOffers(state,p),target=targets.get(p.id)!;
   const offer=cooperationPolicy==='milestone'&&target.tier>=offers[2].requiredTier?offers[2]:offers[0];
   act({type:'accept-cooperation',id:offer.id,playerId:p.id});}
  if(state.gymLevel>=2)for(const p of activePlayers(state))if(!p.autoEnabled&&p.level<99)act({type:'set-auto',id:p.id,enabled:true});
 };
 milestones[1]=snapshot();manage();const horizon=start+horizonSeconds*1000;
 while(now<horizon&&(state.gymLevel<8||completeAfterGym8&&snapshot().afterAllPermanent<0)){
  const due=Math.min(...activePlayers(state).filter(p=>p.level<99).map(p=>Math.max(now,p.nextShotAt,p.stamina<1?now+recoverySeconds(state)*1000-p.recoveryMs:0)));
  if(!Number.isFinite(due))throw Error('No future shot');now=Math.min(due,horizon);state=advanceGym(state,now);if(due>horizon)break;
  if(state.gymLevel===1)act({type:'train',id:state.player!.id});else{
   const duePlayers=activePlayers(state).filter(p=>p.autoEnabled&&p.level<99&&p.stamina>=1&&p.nextShotAt<=now).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),events:GymEvent[]=[];
   for(const p of duePlayers){trainPlayer(state,p,now,events,matched.has(p.id));matched.add(p.id);}shots+=events.filter(e=>e.type==='trained').length;
  }manage();if(shots>1000000)throw Error('Shot limit');
 }
 if(!validGym(state))throw Error('Invalid save');const final=snapshot();
 if(final.grossEarned+sales-spent!==state.credits)throw Error('Cash ledger mismatch');
 // Exact verification of the completion ledger, with legal, charged commands.
 let verifiedCompletionBalance:number|null=null;
 if(state.gymLevel===8&&final.afterAllPermanent>=0){
  const before=state.credits;
  for(const p of projects)while(state.projects[p.id]<p.maxLevel)act({type:'upgrade-project',id:p.id});
  for(const e of equipmentCatalog)if(!state.ownedEquipment.includes(e.id)){
   const same=state.equippedEquipment.find(id=>equipmentCatalog.find(x=>x.id===id)!.family===e.family);
   const replace=same??(state.equippedEquipment.length>=equipmentCapacity(state)?state.equippedEquipment[0]:undefined);
   act({type:'buy-equipment',id:e.id,...(replace?{replaceId:replace}:{})});
  }
  verifiedCompletionBalance=state.credits;
  if(state.credits!==final.afterAllPermanent||before-state.credits!==final.remainingEquipment+final.remainingProjects||!validGym(state))throw Error('Completion ledger mismatch');
 }
 return {seed,reached8:final.gym===8,milestones,final,gear,projectAvailability,transactions,verifiedCompletionBalance,
  blocked:gymUpgrade(state).requirements.filter(r=>!r.met)};
}

const results:any[]=[];
for(const name of requested){const variant=name as Variant;applyVariant(variant);const runs=[];
 console.log(`Acquisition ${variant}: ${seedCount} paired seeds`);
 for(let seed=1;seed<=seedCount;seed++){const run=simulate(seed);runs.push(run);console.log(`${variant}/${seed}: G${run.final.gym} ${Math.round(run.final.seconds)}s, balance ${run.final.credits}, after permanent ${run.final.afterAllPermanent}`);}
 const gearSummary=equipmentCatalog.map(e=>{const rows=runs.flatMap(r=>r.gear[e.id]?[r.gear[e.id]]:[]);return {id:e.id,name:e.name,family:e.family,grade:e.grade,price:e.price,unlockLevel:e.unlockLevel,unlocked:rows.length,
  affordableAtUnlock:rows.filter(r=>r.affordableAtUnlock).length,firstLegalSeconds:summary(rows.map(r=>r.firstLegalSeconds)),
  waitForAffordability:summary(rows.flatMap(r=>r.firstAffordableSeconds===null?[]:[r.firstAffordableSeconds-r.firstLegalSeconds])),
  actualBuySeconds:summary(rows.flatMap(r=>r.firstBoughtSeconds===null?[]:[r.firstBoughtSeconds]))};});
 const result={variant,gymConstructionCosts:gymLevels.map(level=>level.upgradePrice),trainingCredits:trainingCreditMilestones.map(row=>({...row})),equipment:equipmentCatalog.map(e=>({id:e.id,price:e.price,unlockLevel:e.unlockLevel})),projectPrices:projects.map(p=>({id:p.id,prices:Array.from({length:p.maxLevel},(_,i)=>priceFor(p.id,i+1))})),
  reached8:runs.filter(r=>r.reached8).length,milestones:[2,3,4,5,6,7,8].map(gym=>({gym,attained:runs.filter(r=>r.milestones[gym]).length,
   seconds:summary(runs.flatMap(r=>r.milestones[gym]?[r.milestones[gym].seconds]:[])),credits:summary(runs.flatMap(r=>r.milestones[gym]?[r.milestones[gym].credits]:[])),
   recommendations:summary(runs.flatMap(r=>r.milestones[gym]?[r.milestones[gym].recommendations]:[]))})),
  final:Object.fromEntries(['seconds','credits','grossEarned','spent','recommendations','afterAllPermanent'].map(key=>[key,summary(runs.map(r=>r.final[key as keyof typeof r.final] as number))])),gearSummary,runs};
 results.push(result);await mkdir('docs/balance',{recursive:true});
 await writeFile(output,JSON.stringify({metadata:{date:'2026-11-14',economyVersion:gymEconomyVersion,constructionProfile:freeConstructionBaseline?'free-baseline':'production',partial:results.length!==requested.length,seedCount,horizonSeconds,cooperationPolicy,trainingPolicy,completeAfterGym8,variants:requested,elapsedSeconds:(Date.now()-wallStart)/1000,
  catalogFingerprint:createHash('sha256').update(JSON.stringify(originals)).digest('hex'),
  candidate,
  assumptions:['actual-engine-from-zero-no-currency-or-collection-injection','same-seeds-within-this-comparison','continuous-online-instant-management-no-human-delay',
   'explicit-cooperation-and-training-policy-balanced-plan-natural-recruits-no-drinks','original-balanced-greedy-heuristic-not-optimal','offline-and-focus-not-assigned-online-purchase-utility',
   'unlock-affordability-is-observed-cash-under-this-policy-not-a-reserve-optimization','all-permanent-means-hold-all-35-including-rebuy-sold-gear-and-max-all-six-projects',
   'completion-balance-verified-with-real-charged-commands-when-affordable','candidate-modifies-only-in-memory-catalog-price-or-gates-not-production-files']},results},null,2)+'\n');
}
console.log(JSON.stringify(results.map(({variant,reached8,milestones,final})=>({variant,reached8,milestones,final})),null,2));
