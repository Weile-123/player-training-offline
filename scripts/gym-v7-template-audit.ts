/** Actual Gym appearance witnesses. Synthetic mature stage access is explicit;
 * template IDs, birth stats, growth, RNG and outcomes are never injected. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {equipmentCatalog,gymEconomyVersion,projects} from '../src/game/gym/catalog';
import {
 advanceGym,dispatchGym,equipmentCapacity,equipmentOffer,newGym,projectCap,recoverySeconds,trainPlayer,
 type GymAction,type GymState,type HeightPreference,
} from '../src/game/gym/engine';
import {decodeGym,encodeGym,validGym} from '../src/game/gym/save';
import {trainingPlans,type TrainingPlanId} from '../src/game/gym/training';
import {nbaTemplates} from '../src/game/templates';
import {statKeys} from '../src/game/types';

const start=1800000000000,wallStart=Date.now();
const seedCount=Number(process.env.TEMPLATE_AUDIT_SEEDS??256);
const targetLevel=Number(process.env.TEMPLATE_AUDIT_LEVEL??40);
const output=process.env.TEMPLATE_AUDIT_OUTPUT??'docs/balance/v7-template-audit-20261114.json';
const targeted=process.env.TEMPLATE_AUDIT_TARGET==='hakeem';
const mergeBase=process.env.TEMPLATE_AUDIT_MERGE_BASE;
if(mergeBase&&resolve(mergeBase)===resolve(output))throw Error('Supplement output must differ from merge base');
if(!Number.isInteger(seedCount)||seedCount<1||seedCount>1024||![25,40,99].includes(targetLevel))throw Error('Invalid template audit parameters');
const core=['capacity','recovery','course','experience','automation'].map(family=>equipmentCatalog.filter(item=>item.family===family).sort((a,b)=>b.grade-a.grade)[0].id);
const standardPatterns=[...trainingPlans.map(plan=>({id:plan.id,plan:plan.id,focus:null as string|null,extraFocus:[] as string[]})),
 ...statKeys.map(key=>({id:'focus-'+key,plan:(key==='three'||key==='mid'?'shooting':key==='drive'||key==='handle'?'finishing':'interior') as TrainingPlanId,
 focus:equipmentCatalog.find(item=>item.family==='focus-'+key&&item.grade===3)!.id,extraFocus:[] as string[]}))];
const master=(key:string)=>equipmentCatalog.find(item=>item.family==='focus-'+key&&item.grade===3)!.id;
const patterns=targeted?[{id:'target-hakeem',plan:'finishing' as TrainingPlanId,focus:master('mid'),extraFocus:[master('inside'),master('defense')]}]:standardPatterns;
const preferences:HeightPreference[]=['guard','forward','center'];
const collectionIds=nbaTemplates.slice(0,8).map(template=>template.id);
const witnesses:Record<string,unknown>={},runs:any[]=[];
const counts={traces:0,shots:0,matchingChanges:0,newCollectionEvents:0,saveRoundTrips:0,recommendationProbes:0};
function command(state:GymState,action:GymAction){
 const result=dispatchGym(state,state.revision,action,state.updatedAt);
 if(result.error)throw Error(action.type+': '+result.error);
 return result.state;
}
function point(state:GymState){const p=state.player!;return {level:p.level,shots:p.shots,seconds:(state.updatedAt-start)/1000,
 stats:{...p.stats},templateId:p.templateId,highestTier:p.highestTier,experience:p.experience};}
function trace(seed:number,pattern:typeof patterns[number]){
 let state=newGym(start,seed);
 state.gymLevel=8;state.credits=10000;
 for(const project of projects)state.projects[project.id]=projectCap(project.id,8);
 state.collection=Object.fromEntries(collectionIds.map(id=>[id,{firstAt:start,highestRating:0,highestValue:'0'}]));
 const fixtureProjects={...state.projects};
 const equipmentIds=[...core,...(pattern.focus?[pattern.focus]:[]),...pattern.extraFocus];
 if(equipmentIds.length>equipmentCapacity(state))throw Error('Illegal fixture slots');
 for(const id of equipmentIds){if(equipmentOffer(state,id).price===null)throw Error('Illegal fixture item '+id);state=command(state,{type:'buy-equipment',id});}
 // Remove the initial untrained player with a real zero-reward recommendation.
 state=command(state,{type:'recommend',id:state.player!.id});
 const preference=targeted?'center':preferences[(seed-1)%preferences.length];
 state=command(state,{type:'recruit',preference});
 if(pattern.plan!=='balanced')state=command(state,{type:'set-training-plan',id:pattern.plan,playerId:state.player!.id});
 state=command(state,{type:'set-auto',id:state.player!.id,enabled:true});
 if(!validGym(state))throw Error('Invalid initial witness fixture');
 const birth={id:state.player!.id,height:state.player!.height,stats:{...state.player!.stats},bias:{...state.player!.bias},matchSeed:state.player!.matchSeed};
 if(state.player!.level!==0||state.player!.templateId!==null||state.player!.shots!==0)throw Error('Injected developed player');
 const trajectory:any[]=[point(state)],transitions:any[]=[];
 let saved=false;
 while(state.player!.level<targetLevel){
  const p=state.player!,levelBefore=p.level,previousStats={...p.stats};
  const at=Math.max(state.updatedAt,p.nextShotAt,p.stamina<1?state.updatedAt+recoverySeconds(state)*1000-p.recoveryMs:0);
  state=advanceGym(state,at);const events:any[]=[];
  trainPlayer(state,state.player!,at,events,state.player!.shots>0);counts.shots++;
  if(statKeys.some(key=>state.player!.stats[key]<previousStats[key]||state.player!.stats[key]>99))throw Error('Invalid actual growth');
  if(state.player!.level!==levelBefore)trajectory.push(point(state));
  for(const event of events){
   if(event.type==='template-unlocked')counts.newCollectionEvents++;
   if(event.type!=='template-changed'||!event.templateId)continue;
   counts.matchingChanges++;
   const template=nbaTemplates.find(t=>t.id===event.templateId)!;
   const record={...point(state),id:template.id,name:template.name,tier:template.tier,
    actualNewCollection:events.some(row=>row.type==='template-unlocked'&&row.templateId===template.id)};
   transitions.push(record);
   if(!witnesses[template.id]){
    const acquisitionSave=encodeGym(state);
    if(!decodeGym(acquisitionSave))throw Error('Invalid acquisition save');
    witnesses[template.id]={seed,pattern:pattern.id,plan:pattern.plan,preference,focus:pattern.focus,extraFocus:pattern.extraFocus,
     syntheticStage:{gymLevel:8,projects:fixtureProjects,testCredits:10000,accessCollectionIds:collectionIds},equipmentIds,birth,
     acquisition:record,trajectory:structuredClone(trajectory),acquisitionSave,event:'template-changed'};
   }
  }
  if(!saved&&state.player!.level>=Math.min(20,targetLevel)){
   const before=encodeGym(state);state=decodeGym(before)!;
   if(!state||encodeGym(state)!==before)throw Error('Witness save roundtrip mismatch');
   counts.saveRoundTrips++;saved=true;
  }
  if(state.player!.shots>15000)throw Error('Witness shot limit');
 }
 if(!validGym(state))throw Error('Invalid final witness');
 const previousCredits=state.credits,previousFame=state.fame;
 const paid=dispatchGym(state,state.revision,{type:'recommend',id:state.player!.id},state.updatedAt);
 if(paid.error||paid.state.credits<previousCredits||paid.state.fame<previousFame)throw Error('Final recommendation failed');
 counts.recommendationProbes++;
 counts.traces++;
 return {seed,pattern:pattern.id,preference,birth,transitions,final:point(state),creditsFromRecommendation:paid.state.credits-previousCredits};
}
function result(partial:boolean){
 const missing=nbaTemplates.filter(template=>!witnesses[template.id]);
 return {metadata:{date:'2026-11-14',economyVersion:gymEconomyVersion,partial,seedCount,targetLevel,
  patterns,elapsedSeconds:(Date.now()-wallStart)/1000,counts,targeted,
  rulesHash:createHash('sha256').update(JSON.stringify({equipmentCatalog,projects})).digest('hex'),
  assumptions:['Synthetic gym8, maximum projects, 10000 test credits and eight preexisting access collection IDs; not a from-zero progression experiment',
   'Every owned item purchased through real dispatch with legal stage/collection/slot gates',
   'Initial untrained rookie recommended through real dispatch, then actual recruit generation at configured projects and chosen free height group',
   targeted?'Targeted supplement uses the free center height group; no birth rerolls or injected player attributes, identities, outcomes or RNG state':'Height preference rotates guard/forward/center by seed; no birth rerolls or injected player attributes, identities, outcomes or RNG state',
   targeted?'Targeted supplement uses finishing plan and legal mid/inside/defense focus equipment, fixed throughout each trace':'Four free plans and six corresponding single-focus equipment plans; fixed equipment throughout each trace',
   'Actual trainPlayer and advanceGym event times; reuse matching only while its inputs are unchanged, as formal offline replay does',
   'Witnesses capture actual per-athlete template-changed events, including templates already synthetically present among eight access collection IDs',
   'Every first appearance witness preserves its valid importable acquisition save and every level/stat change up to acquisition; unchanged intervening shots are identified by cumulative shot counts',
   'A real mid-run save roundtrip and final actual recommendation are verified',
   'Unobserved templates are not proven unreachable; these are finite samples using fixed training plans']},
  covered:nbaTemplates.length-missing.length,total:nbaTemplates.length,byTier:Object.fromEntries(['rotation','starter','star','superstar','legend'].map(tier=>[tier,
   {covered:nbaTemplates.filter(t=>t.tier===tier&&witnesses[t.id]).length,total:nbaTemplates.filter(t=>t.tier===tier).length}])),
  missing:missing.map(({id,name,tier,height})=>({id,name,tier,height})),witnesses,runs};
}
function verifyReport(data:any){
 if(Object.keys(data.witnesses).length!==data.covered||data.runs.length!==data.metadata.counts.traces)throw Error('Report count mismatch');
 if(data.runs.reduce((sum:number,run:any)=>sum+run.final.shots,0)!==data.metadata.counts.shots)throw Error('Shot total mismatch');
 for(const [id,value] of Object.entries(data.witnesses)){
  const witness=value as any,restored=decodeGym(witness.acquisitionSave),athlete=restored?.player;
  if(!athlete||athlete.templateId!==id||athlete.level!==witness.acquisition.level||athlete.shots!==witness.acquisition.shots)throw Error('Witness save mismatch '+id);
  if(statKeys.some(key=>athlete.stats[key]!==witness.acquisition.stats[key]))throw Error('Witness acquisition stats mismatch '+id);
  const path=witness.trajectory;
  if(path[0].level!==0||path[0].templateId!==null||statKeys.some(key=>path[0].stats[key]!==witness.birth.stats[key]))throw Error('Witness birth mismatch '+id);
  for(let i=1;i<path.length;i++)if(path[i].level<=path[i-1].level||path[i].shots<=path[i-1].shots||statKeys.some(key=>path[i].stats[key]<path[i-1].stats[key]||path[i].stats[key]>99))throw Error('Witness path mismatch '+id);
  if(path.at(-1).templateId!==id||path.at(-1).shots!==athlete.shots)throw Error('Witness final path mismatch '+id);
 }
 return {validAcquisitionSaves:data.covered,monotoneLevelPaths:data.covered,exactAggregateShotTotal:true};
}
await mkdir(dirname(output),{recursive:true});
for(let seed=1;seed<=seedCount;seed++){
 for(const pattern of patterns)runs.push(trace(seed,pattern));
 if(seed%16===0||seed===seedCount){const data=result(seed!==seedCount);await writeFile(output,JSON.stringify(data,null,2)+'\n');
  console.log(JSON.stringify({seed,covered:data.covered,byTier:data.byTier,counts,elapsedSeconds:data.metadata.elapsedSeconds}));}
}
if(mergeBase){
 const supplement=result(false),base=JSON.parse(await readFile(mergeBase,'utf8'));
 if(base.metadata.economyVersion!==gymEconomyVersion||base.metadata.rulesHash!==supplement.metadata.rulesHash||base.metadata.targetLevel!==targetLevel)throw Error('Incompatible template audit base');
 const combinedWitnesses={...supplement.witnesses,...base.witnesses};
 const combinedCounts=Object.fromEntries(Object.keys(counts).map(key=>[key,base.metadata.counts[key]+counts[key as keyof typeof counts]]));
 const combinedMissing=nbaTemplates.filter(t=>!combinedWitnesses[t.id]);
 const combined={...base,metadata:{...base.metadata,
  counts:combinedCounts,elapsedSeconds:base.metadata.elapsedSeconds+supplement.metadata.elapsedSeconds,
  patterns:[...base.metadata.patterns,...supplement.metadata.patterns],
  assumptions:[...base.metadata.assumptions,'Explicit targeted supplements are included below; see each supplement for its own preference, equipment, counts and limitations']},
  baselineAudit:base.baselineAudit??{covered:base.covered,counts:base.metadata.counts,patterns:base.metadata.patterns},
  supplementalAudits:[...(base.supplementalAudits??[]),{...supplement.metadata,covered:supplement.covered}],
  covered:nbaTemplates.length-combinedMissing.length,missing:combinedMissing.map(({id,name,tier,height})=>({id,name,tier,height})),
  byTier:Object.fromEntries(['rotation','starter','star','superstar','legend'].map(tier=>[tier,
   {covered:nbaTemplates.filter(t=>t.tier===tier&&combinedWitnesses[t.id]).length,total:nbaTemplates.filter(t=>t.tier===tier).length}])),
  witnesses:combinedWitnesses,runs:[...base.runs,...supplement.runs]};
 Object.assign(combined.metadata,{reportVerification:verifyReport(combined)});
 await writeFile(mergeBase,JSON.stringify(combined,null,2)+'\n');
 console.log(JSON.stringify({mergedOutput:mergeBase,covered:combined.covered,total:nbaTemplates.length,counts:combinedCounts}));
}
console.log(JSON.stringify({output,covered:result(false).covered,total:nbaTemplates.length,missing:result(false).missing,counts},null,2));
