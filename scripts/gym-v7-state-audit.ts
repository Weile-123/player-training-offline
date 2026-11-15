/** Invariant and performance audit. Synthetic access/history fixtures test state
 * integrity and scaling, not natural acquisition or user calendar play time. */
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {mkdir,writeFile} from 'node:fs/promises';
import {
 activePlayers,advanceGym,automaticIntervalMs,cooperationOffers,dispatchGym,equipmentCapacity,equipmentOffer,
 gymUpgrade,newGym,projectCap,projectCost,recommendation,recoverySeconds,requiredExperience,staminaMax,
 type GymAction,type GymAlumnus,type GymPlayer,type GymState,
} from '../src/game/gym/engine';
import {equipmentCatalog,gymEconomyVersion,projects} from '../src/game/gym/catalog';
import {settleOfflineGym,offlineLimitMs} from '../src/game/gym/offline';
import {decodeGym,encodeGym,gymSaveKeys,readGym,validGym,writeGym,type GymStorage} from '../src/game/gym/save';
import {nbaTemplates} from '../src/game/templates';
import {statKeys} from '../src/game/types';
import {createGymStore} from '../src/gymStore';

const start=1800000000000,began=performance.now();
const seeds=Number(process.env.STATE_AUDIT_SEEDS??64),steps=Number(process.env.STATE_AUDIT_STEPS??500);
const output=process.env.STATE_AUDIT_OUTPUT??'docs/balance/v7-state-audit-20261114.json';
assert.ok(Number.isInteger(seeds)&&seeds>=1&&seeds<=256&&Number.isInteger(steps)&&steps>=1&&steps<=5000);
const stats={commands:0,accepted:0,rejected:0,saveRoundTrips:0,offlineCases:0,offlineShots:0,onlineShots:0,concurrencyCases:0};
function rng(seed:number){let value=seed>>>0;return()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};}
function act(s:GymState,a:GymAction,now=s.updatedAt){const r=dispatchGym(s,s.revision,a,now);assert.equal(r.error,undefined,JSON.stringify(a));return r.state;}
function alumni(s:GymState,id:string):GymAlumnus{
 const p=structuredClone(s.player!);p.id=id;p.cooperation=null;p.autoEnabled=false;
 p.level=p.peakLevel=99;p.experience=0;p.shots=7000;p.training={planId:'balanced',shots:0,completedCourses:700};
 for(const k of statKeys)p.stats[k]=99;
 p.templateId=nbaTemplates.find(t=>t.tier==='legend')!.id;p.highestTier='legend';
 return {...p,recommendedAt:s.updatedAt,rewardCredits:33,rewardFame:100,finalValue:'320000000'};
}
function fixture(seed:number,gym=8,players=1){
 let s={...newGym(start,seed),gymLevel:gym,credits:10000,fame:18000};
 s.collection=Object.fromEntries(nbaTemplates.slice(0,25).map(t=>[t.id,{firstAt:start,highestRating:0,highestValue:'0'}]));
 s.alumni=Array.from({length:15},(_,i)=>alumni(s,`historical-${i}`));
 while(activePlayers(s).length<players)s=act(s,{type:'recruit'});
 assert.ok(validGym(s));return s;
}
function check(s:GymState){
 assert.ok(validGym(s),'validGym invariant');assert.ok(s.credits>=0&&Number.isSafeInteger(s.credits));
 const players=activePlayers(s);assert.ok(players.length<=s.gymLevel);
 assert.equal(new Set([...players,...s.alumni].map(p=>p.id)).size,players.length+s.alumni.length);
 for(const p of players){assert.ok(p.stamina>=0&&p.stamina<=staminaMax(s));assert.ok(p.experience>=0);
  if(p.level===99){assert.equal(p.experience,0);assert.equal(p.autoEnabled,false);}else assert.ok(p.experience<requiredExperience(p.level));}
 assert.ok(s.equippedEquipment.length<=equipmentCapacity(s));
 assert.equal(new Set(s.equippedEquipment.map(id=>equipmentCatalog.find(e=>e.id===id)!.family)).size,s.equippedEquipment.length);
}
const fuzz:any[]=[];
for(let seed=1;seed<=seeds;seed++){
 const random=rng(seed+47),pick=<T,>(values:readonly T[])=>values[Math.floor(random()*values.length)];
 let s=fixture(seed,[2,4,6,8][seed%4],1),clock=start;const counts:Record<string,{ok:number;failed:number}>={};
 for(let index=0;index<steps;index++){
  clock+=pick([0,1,200,999,1000,2000,20000]);
  const p=s.player,people=activePlayers(s),item=pick(equipmentCatalog),installed=s.equippedEquipment;
  const same=installed.find(id=>equipmentCatalog.find(e=>e.id===id)!.family===item.family);
  const replace= same??(installed.length>=equipmentCapacity(s)?pick(installed):undefined);
  const warehouse=s.ownedEquipment.filter(id=>!installed.includes(id));
  const id=p?.id??'missing-player';
  const commands:GymAction[]=[{type:'train',id},{type:'auto-step'},
   {type:'set-auto',id:pick(people)?.id??id,enabled:random()>.5},
   {type:'select-player',id:pick(people)?.id??id},{type:'recruit',preference:pick(['any','guard','forward','center'] as const)},
   {type:'recommend',id},{type:'buy-equipment',id:item.id,...(replace&&random()>.2?{replaceId:replace}:{})},
   {type:'unequip',id:pick(installed)??'unknown'},
   {type:'equip',id:pick(warehouse)??item.id,...(replace?{replaceId:replace}:{})},
   {type:'sell-equipment',id:pick(warehouse)??pick(installed)??'unknown'},
   {type:'upgrade-project',id:pick(projects).id},{type:'upgrade-gym',targetLevel:random()>.2?s.gymLevel+1:s.gymLevel},
   {type:'buy-drink'},{type:'use-drink',id},
   {type:'set-training-plan',id:pick(['balanced','shooting','finishing','interior'] as const),playerId:id},
   {type:'accept-cooperation',id:pick(cooperationOffers(s))?.id??'unknown',playerId:id},
   {type:'abandon-cooperation',playerId:id}];
  const action=pick(commands),before=JSON.stringify(s),old=s;
  const expectedRevision=random()<.04?s.revision-1:s.revision,now=random()<.02?s.updatedAt-1:clock;
  const result=dispatchGym(s,expectedRevision,action,now);stats.commands++;
  assert.equal(JSON.stringify(old),before,'dispatch must not mutate the input state');
  const count=counts[action.type]??={ok:0,failed:0};
  if(result.error){stats.rejected++;count.failed++;assert.equal(result.state,old);assert.deepEqual(result.events,[]);}
  else{
   stats.accepted++;count.ok++;s=result.state;check(s);
   let delta=0;
   if(action.type==='recommend')delta=result.events.find(e=>e.type==='recommended')!.credits!;
   if(action.type==='sell-equipment')delta=result.events.find(e=>e.type==='equipment-sold')!.credits!;
   if(action.type==='buy-equipment')delta=-equipmentCatalog.find(e=>e.id===action.id)!.price;
   if(action.type==='buy-drink')delta=-1;
   if(action.type==='upgrade-project')delta=-projectCost(action.id,old.projects[action.id as keyof typeof old.projects]+1);
   if(action.type==='upgrade-gym')delta=-gymUpgrade(old).price;
   assert.equal(s.credits,old.credits+delta,'exact cash ledger');
   for(const prior of activePlayers(old)){const current=activePlayers(s).find(p=>p.id===prior.id);if(current){assert.ok(current.level>=prior.level);for(const k of statKeys)assert.ok(current.stats[k]>=prior.stats[k]);}}
  }
  if(index%13===0){assert.deepEqual(decodeGym(encodeGym(s)),s);stats.saveRoundTrips++;}
 }
 fuzz.push({seed,commands:steps,counts,final:{gym:s.gymLevel,players:activePlayers(s).length,alumni:s.alumni.length,credits:s.credits,shots:activePlayers(s).reduce((a,p)=>a+p.shots,0)}});
}
console.log(`Random command invariants: ${stats.commands} commands checked`);

function automatic(seed:number,gym=8,count=4){
 let s=fixture(seed,gym,count);
 for(const project of projects)s.projects[project.id]=projectCap(project.id,gym);
 const ids=['capacity','recovery','course','experience','automation'].flatMap(family=>{
  const e=equipmentCatalog.filter(e=>e.family===family&&equipmentOffer(s,e.id).price!==null).sort((a,b)=>b.grade-a.grade)[0];return e?[e.id]:[];});
 for(const id of ids)s=act(s,{type:'buy-equipment',id});
 for(const [i,p] of activePlayers(s).entries()){
  p.stamina=(seed+i)%staminaMax(s);p.recoveryMs=(seed*179+i*83)%(recoverySeconds(s)*1000);
  p.shots=p.training.shots=(seed+i)%10;
  if(i>0||seed%3!==0)s=act(s,{type:'set-auto',id:p.id,enabled:true});
 }
 check(s);return s;
}
function onlineExact(initial:GymState,until:number){
 let s=initial,iterations=0;
 while(true){const due=Math.min(...activePlayers(s).filter(p=>p.autoEnabled&&p.level<99).map(p=>Math.max(s.updatedAt,p.nextShotAt,p.stamina<1?s.updatedAt+recoverySeconds(s)*1000-p.recoveryMs:0)));
  if(!Number.isFinite(due)||due>until)return advanceGym(s,until);
  const r=dispatchGym(s,s.revision,{type:'auto-step'},due);assert.equal(r.error,undefined);stats.onlineShots+=r.events.filter(e=>e.type==='trained').length;s=r.state;
  assert.ok(++iterations<100000,'online event loop bound');
 }
}
const canonical=(s:GymState)=>({...s,revision:0});
const offlineCases:any[]=[];
for(let seed=1;seed<=32;seed++){
 const gym=[2,4,6,8][seed%4],s=automatic(seed,gym,Math.min(gym,[1,2,4,8][seed%4]));
 const duration=[30000,60123,120000,300001][seed%4],until=start+duration;
 const whole=settleOfflineGym(s,until),online=onlineExact(s,until);stats.offlineCases++;stats.offlineShots+=whole.report?.totalShots??0;
 assert.deepEqual(canonical(whole.state),canonical(online),'offline/online exact event equivalence');
 let split=s;
 for(const part of [.137,.431,.899,1])split=settleOfflineGym(split,start+Math.floor(duration*part)).state;
 assert.deepEqual(canonical(split),canonical(whole.state),'within-cap segmentation invariant');
 const permuted=structuredClone(s);
 if(permuted.bench.length)[permuted.player!,permuted.bench[0]]=[permuted.bench[0],permuted.player!];
 const reordered=settleOfflineGym(permuted,until).state;
 assert.deepEqual(reordered.rng,whole.state.rng);assert.deepEqual(reordered.collection,whole.state.collection);
 const sorted=(state:GymState)=>activePlayers(state).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 assert.deepEqual(sorted(reordered),sorted(whole.state),'selection-independent RNG allocation');
 check(whole.state);assert.deepEqual(decodeGym(encodeGym(whole.state)),whole.state);stats.saveRoundTrips++;
 offlineCases.push({seed,gym,players:activePlayers(s).length,durationMs:duration,shots:whole.report?.totalShots??0});
}
for(let seed=1;seed<=8;seed++){
 const s=automatic(seed,8,8);const p=s.player!;p.level=p.peakLevel=98;p.experience=requiredExperience(98)-1;p.autoEnabled=true;
 const near=settleOfflineGym(s,start+120000);stats.offlineShots+=near.report?.totalShots??0;assert.equal(near.state.player!.level,99);assert.equal(near.state.player!.autoEnabled,false);assert.ok(near.state.bench.some(p=>p.shots>s.bench.find(old=>old.id===p.id)!.shots));
 const cap=offlineLimitMs(s),atCap=settleOfflineGym(s,start+cap),long=settleOfflineGym(s,start+86400000);stats.offlineShots+=(atCap.report?.totalShots??0)+(long.report?.totalShots??0);
 assert.equal(long.report!.creditedMs,cap);assert.equal(long.report!.capped,true);
 for(const after of activePlayers(long.state)){const expected=activePlayers(atCap.state).find(p=>p.id===after.id)!;assert.equal(after.shots,expected.shots);assert.equal(after.level,expected.level);assert.equal(after.experience,expected.experience);}
 assert.equal(settleOfflineGym(long.state,start+86400000).state,long.state);assert.equal(settleOfflineGym(long.state,start-1).state,long.state);
 assert.equal(dispatchGym(long.state,long.state.revision,{type:'auto-step'},start).state,long.state);
 check(long.state);stats.offlineCases+=3;
}
console.log(`Offline invariants: ${stats.offlineCases} cases checked`);

const concurrency:any[]=[];
for(let seed=1;seed<=8;seed++){
 const map=new Map<string,string>(),storage:GymStorage={getItem:key=>map.get(key)??null,setItem:(key,value)=>{map.set(key,value);}};
 let s=fixture(seed,2);s.credits=1000;s=act(s,{type:'set-auto',id:s.player!.id,enabled:true});
 const trained=settleOfflineGym(s,start+1800000);stats.offlineShots+=trained.report?.totalShots??0;stats.offlineCases++;
 s=act(trained.state,{type:'set-auto',id:trained.state.player!.id,enabled:false});
 assert.ok(recommendation(s).credits>0,'concurrent recommendation must carry a positive real training payout');
 assert.ok(writeGym(storage,s).ok);
 const first=createGymStore(storage,seed,()=>s.updatedAt),second=createGymStore(storage,seed,()=>s.updatedAt),request={type:'upgrade-gym',targetLevel:3} as const;
 const replies=await Promise.all([first.getState().act(request),second.getState().act(request)]);
 assert.equal(replies.filter(r=>!r.error).length,1);assert.equal(readGym(storage).state!.credits,990);assert.equal(readGym(storage).state!.gymLevel,3);
 const before=readGym(storage).state!;const player=before.player!;
 const recs=await Promise.all([first.getState().act({type:'recommend',id:player.id}),second.getState().act({type:'recommend',id:player.id})]);
 assert.equal(recs.filter(r=>!r.error).length,1);assert.equal(readGym(storage).state!.alumni.length,before.alumni.length+1);
 const replayed=readGym(storage).state!;assert.equal(replayed.credits,before.credits+recommendation(before).credits);
 stats.concurrencyCases+=2;concurrency.push({seed,expansionSuccesses:1,recommendationSuccesses:1,recommendationCredits:recommendation(before).credits});
}

function timed<T>(work:()=>T,count=5){const times:number[]=[];let value:T;for(let i=0;i<count;i++){const began=performance.now();value=work();times.push(performance.now()-began);}const sorted=[...times].sort((a,b)=>a-b);return{value:value!,timing:{n:count,meanMs:times.reduce((a,b)=>a+b,0)/count,p50Ms:sorted[Math.ceil(count*.5)-1],maxMs:sorted.at(-1)}};}
const performanceRows:any[]=[];
for(const count of [0,100,1000,5000]){
 let s=automatic(17,8,8);s.alumni=Array.from({length:count},(_,i)=>alumni(s,`large-history-${i}`));check(s);
 const encoded=timed(()=>encodeGym(s)),raw=encoded.value;
 const decoded=timed(()=>decodeGym(raw));assert.ok(decoded.value);assert.equal(decoded.value!.alumni.length,count);
 const command=timed(()=>dispatchGym(s,s.revision,{type:'buy-drink'},s.updatedAt));assert.equal(command.value.error,undefined);
 const offline=timed(()=>settleOfflineGym(s,start+30*60000),3);stats.offlineShots+=3*(offline.value.report?.totalShots??0);check(offline.value.state);
 const data=new Map<string,string>(),memory:GymStorage={getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,value);}};
 const save=timed(()=>writeGym(memory,s));assert.ok(save.value.ok);
 const quota=5*1024*1024,quotaMap=new Map<string,string>();
 const quotaStorage:GymStorage={getItem:key=>quotaMap.get(key)??null,setItem:(key,value)=>{const copy=new Map(quotaMap);copy.set(key,value);const utf16Bytes=[...copy].reduce((sum,[key,value])=>sum+2*(key.length+value.length),0);if(utf16Bytes>quota)throw Error('simulated-quota');quotaMap.set(key,value);}};
 const quotaResult=writeGym(quotaStorage,s);
  const quotaMain=readGym(quotaStorage);
  let quotaNextWrite:ReturnType<typeof writeGym>|null=null;
  let quotaNextReadable=false;
  if(quotaResult.ok){
   assert.ok(quotaMain.state,'successful simulated-quota main write must remain readable');
   const next=act(quotaMain.state!,{type:'buy-drink'});
   quotaNextWrite=writeGym(quotaStorage,next);
   assert.ok(quotaNextWrite.ok,'failure to fit the backup must not block a same-size main replacement');
   const reread=readGym(quotaStorage);
   assert.deepEqual(reread.state,next);quotaNextReadable=true;
  }
 performanceRows.push({alumni:count,activePlayers:8,envelopeCharacters:raw.length,utf8Bytes:Buffer.byteLength(raw),estimatedUtf16MainAndBackupBytes:4*raw.length,
  encode:encoded.timing,decode:decoded.timing,dispatch:command.timing,save:save.timing,offline30Minutes:offline.timing,
  offlineShotsPerRun:offline.value.report?.totalShots??0,simulatedFiveMiBQuota:quotaResult,
  simulatedQuotaMainReadable:quotaMain.state!==null,simulatedQuotaNextWrite:quotaNextWrite,simulatedQuotaNextReadable:quotaNextReadable});
 console.log(`History ${count}: ${raw.length} characters; dispatch ${command.timing.p50Ms.toFixed(1)}ms; save ${save.timing.p50Ms.toFixed(1)}ms`);
}
// A valid history may fit the schema's 100k-record bound while exceeding the
// decoder's envelope limit. The writer must not claim success and replace both
// recovery copies with something its own decoder refuses.
const oversized=fixture(17,8,1);oversized.alumni=Array.from({length:20000},(_,i)=>alumni(oversized,`oversized-${i}`));check(oversized);
let oversizedCharacters:number|null=null,oversizedEncodingError:string|null=null;
try{oversizedCharacters=encodeGym(oversized).length;}catch(error){oversizedEncodingError=error instanceof Error?error.message:String(error);}
const oversizedMap=new Map<string,string>();
const oversizedStorage:GymStorage={getItem:key=>oversizedMap.get(key)??null,setItem:(key,value)=>{oversizedMap.set(key,value);}};
const safe=fixture(17,8,1);assert.ok(writeGym(oversizedStorage,safe).ok);const priorRaw=oversizedStorage.getItem(gymSaveKeys.main);
const oversizedWrite=writeGym(oversizedStorage,oversized),oversizedRead=readGym(oversizedStorage);
const oversizedBoundary={alumni:20000,characters:oversizedCharacters,encodingError:oversizedEncodingError,validShape:validGym(oversized),
 write:oversizedWrite,readError:oversizedRead.error??null,oldMainPreserved:oversizedStorage.getItem(gymSaveKeys.main)===priorRaw,
 writeSuccessButUnreadable:oversizedWrite.ok&&oversizedRead.state===null};
if(oversizedEncodingError){assert.equal(oversizedWrite.ok,false);assert.equal(oversizedStorage.getItem(gymSaveKeys.main),priorRaw);assert.deepEqual(oversizedRead.state,safe);}
console.log(JSON.stringify({oversizedBoundary}));
const result={date:'2026-11-14',economyVersion:gymEconomyVersion,productionCodeModified:false,
 method:{fuzzSeeds:seeds,stepsPerSeed:steps,fixtures:'Synthetic legal gym access, 10,000 test coupons, 25 template entries and synthetic historical legend records for achievements. Not evidence of acquisition difficulty.',
  invariants:'Input immutability, refused-operation atomicity, exact cash deltas, valid saves, capacity/family/XP limits, same-player nonnegative growth, serialization round trips.',
  offline:'Exact event dispatch versus real offline replay; arbitrary segmentation is tested only within one cap. Selection order must not alter individual RNG allocation.',
  concurrency:'Two stores share one memory-backed storage object, exercising the existing shared writer queue. Existing browser Web Locks/IndexedDB tests remain separate.',
  performance:'Node24 single-process wall timings on this host, 5 runs except 3 offline runs; not mobile/browser latency. Histories are structurally valid synthetic records. Main and backup are full envelopes.',
  quota:'Explicit simulated 5MiB UTF16 key/value budget; this is a stress fixture, not a claim about the user browser quota.'},
 execution:{...stats,elapsedSeconds:(performance.now()-began)/1000},fuzz,offlineCases,concurrency,performance:performanceRows,oversizedBoundary};
await mkdir('docs/balance',{recursive:true});await writeFile(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({output,execution:result.execution,performance:performanceRows},null,2));
