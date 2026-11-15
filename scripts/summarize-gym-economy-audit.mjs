/** Summarizes the preserved pre-implementation audit snapshots, not live V6 rules. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const root='docs/balance/';
const read=async name=>JSON.parse(await readFile(root+name+'-20261114.json','utf8'));
const acquisition=await read('acquisition-audit');
const equipment=await read('equipment-value-audit');
const project=await read('project-value-audit');
const candidateEquipment=await read('acquisition-candidate-result');
const candidateCombined=await read('acquisition-candidate-combined');
const milestoneCoop=await read('acquisition-milestone-coop');
const short10=await read('acquisition-short10');
const datasets=[acquisition,candidateEquipment,candidateCombined,milestoneCoop,short10];
for(const d of datasets){
 assert.equal(d.metadata.partial,false,'Only complete results may be summarized');
 assert.equal(d.metadata.catalogFingerprint,equipment.metadata.catalogFingerprint,'Current baseline catalogs must agree');
 for(const r of d.results){assert.equal(r.runs.length,d.metadata.seedCount);for(const run of r.runs){
  assert.equal(run.final.grossEarned+run.final.sales-run.final.spent,run.final.credits,'Cash ledger');
  if(run.reached8&&run.final.afterAllPermanent>=0)assert.equal(run.verifiedCompletionBalance,run.final.afterAllPermanent,'Real completion spending');
 }}
}
const control=acquisition.results.find(r=>r.variant==='control');
const top=equipment.prices.flatMap(f=>f.items.slice(-1));
assert.equal(top.length,14);const allTopPrice=top.reduce((s,e)=>s+e.price,0);assert.equal(allTopPrice,206);
const distribution=values=>{const v=[...values].sort((a,b)=>a-b);return {n:v.length,mean:v.reduce((s,n)=>s+n,0)/v.length,min:v[0],p50:v[Math.ceil(v.length*.5)-1],p90:v[Math.ceil(v.length*.9)-1],max:v.at(-1)};};
const comparison=datasets.flatMap(d=>d.results.map(r=>({variant:r.variant,cooperationPolicy:d.metadata.cooperationPolicy??'basic',trainingPolicy:d.metadata.trainingPolicy??'staged',seeds:d.metadata.seedCount,
 reached8:r.reached8,gym8Hours:r.milestones.find(g=>g.gym===8)?.seconds?{mean:r.milestones.find(g=>g.gym===8).seconds.mean/3600,p50:r.milestones.find(g=>g.gym===8).seconds.p50/3600}:null,
 projectTotal:r.projectPrices.reduce((s,p)=>s+p.prices.reduce((a,b)=>a+b,0),0),equipmentTotal:r.equipment.reduce((s,e)=>s+e.price,0),
 finalCredits:r.final.credits,afterAllPermanent:r.final.afterAllPermanent,
 actionCommands:distribution(r.runs.map(run=>run.final.commands)),
 manualShots:distribution(r.runs.map(run=>run.milestones[2].shots)),
 managementCommands:distribution(r.runs.map(run=>run.final.commands-run.milestones[2].shots)),
 actualShots:r.runs.reduce((s,run)=>s+run.final.shots,0),actualRecommendations:r.runs.reduce((s,run)=>s+run.final.recommendations,0)})));
const acquisitionStage=control.milestones.map(m=>({gym:m.gym,seconds:m.seconds,credits:m.credits,
 canBuyAllTop:m.gym>=6?control.runs.filter(run=>run.milestones[m.gym].credits>=allTopPrice).length:null}));
const single=equipment.growth.filter(g=>['capacity','recovery','course','experience','automation'].includes(g.family)).map(g=>{
 const row=g.summary.find(x=>x.level===25),base=g.control.find(x=>x.level===25);return {id:g.id,name:g.name,family:g.family,price:g.price,
  seconds:row.seconds.mean,baseSeconds:base.seconds.mean,reductionPercent:(1-row.seconds.mean/base.seconds.mean)*100};});
const totalJourneyShots=comparison.reduce((s,r)=>s+r.actualShots,0);
const totalActualShots=equipment.metadata.actualShots+project.execution.offlineShots+project.execution.recruitmentShots+totalJourneyShots;
const result={date:'2026-11-14',productionRulesModified:false,conditions:{
 journey:'Continuous online, exact shot times, instant management, no drinks, balanced plan, staged targets and basic cooperation except named sensitivity runs. Seed pairing is within comparisons. Hours are simulation time, not casual calendar time.',
 stage:'Synthetic stages isolate value, not acquisition. Single-item level25 results use 32 real paired traces at gym6 typical projects; forecast-only project comparisons are labeled separately.',
 projectAdapter:'Explicit candidate schedules use only in-memory base-price adaptation, checked for every charged upgrade. Production code and effects are unchanged.',
 projectAvailability:'First legal project offer is conditional on buying prior levels, not absolute gym gate.'},
 execution:{journeyRuns:comparison.reduce((s,r)=>s+r.seeds,0),journeyShots:totalJourneyShots,equipmentShots:equipment.metadata.actualShots,
 projectOfflineShots:project.execution.offlineShots,projectRecruitmentShots:project.execution.recruitmentShots,totalActualShots,
 equipmentLedgerProbes:equipment.metadata.ledgerProbes,projectLedgerProbes:project.execution.recommendationProbes},
 allTopPrice,acquisitionStage,
 nonBasicItemsAffordableAtUnlock:control.gearSummary.filter(e=>e.grade>1).map(e=>({id:e.id,price:e.price,unlocked:e.unlocked,affordable:e.affordableAtUnlock,wait:e.waitForAffordability})),
 comparison,singleEquipment:single,projectSchedule:project.schedule,
 candidate:await read('acquisition-candidate')};
await writeFile(root+'economy-audit-summary-20261114.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({execution:result.execution,comparison:comparison.map(r=>({variant:r.variant,coop:r.cooperationPolicy,seeds:r.seeds,reached8:r.reached8,hours:r.gym8Hours,
 afterPermanent:r.afterAllPermanent.mean,equipmentTotal:r.equipmentTotal,projectTotal:r.projectTotal})),gym6:acquisitionStage.find(g=>g.gym===6)},null,2));
