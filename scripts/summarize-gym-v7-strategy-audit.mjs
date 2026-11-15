import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const paths=['docs/balance/v7-strategy-main-20261114.json','docs/balance/v7-strategy-endgame-20261114.json','docs/balance/v7-strategy-plans-20261114.json','docs/balance/v7-strategy-postcompletion-20261114.json'];
const data=await Promise.all(paths.map(async path=>JSON.parse(await readFile(path,'utf8'))));
for(const d of data){assert.equal(d.partial,false);assert.equal(d.economyVersion,7);}
const results=data.flatMap(d=>d.results);
assert.equal(new Set(results.map(r=>r.scenario.id)).size,15);
let actualShots=0,actualRuns=0;
for(const r of results){
 assert.equal(r.runs.length,r.scenario.seeds);
 for(const run of r.runs){
  actualRuns++;actualShots+=run.final.shots;
  assert.equal(run.final.grossCredits+run.final.saleCredits-run.final.grossSpent,run.final.credits);
  assert.equal(run.final.constructionSpending,run.transactions.filter(t=>t.type==='gym-construction').reduce((s,t)=>s+t.cost,0));
  if(run.reached8)assert.equal(run.final.constructionSpending,510);
  if(run.completion){assert.equal(run.completion.owned.length,35);assert.equal(run.completion.remainingEquipment+run.completion.remainingProjects,0);}
  if(r.scenario.postCompletionSeconds)assert.ok(Math.abs(run.afterCompletion.seconds-r.scenario.postCompletionSeconds)<0.001);
 }
}
// The unchanged balanced-policy scenario must still reproduce the prior V7
// canonical run seed by seed; this detects accidental changes while extending
// the harness rather than treating the copy as an independent validation.
const canonical=JSON.parse(await readFile('docs/balance/acquisition-v7-20261114.json','utf8')).results[0].runs;
const balanced=results.find(r=>r.scenario.id==='balanced').runs;
for(const run of balanced){const old=canonical.find(r=>r.seed===run.seed);for(const [a,b] of [['seconds','seconds'],['credits','credits'],['shots','shots'],['recommendations','recommendations'],['grossCredits','grossEarned']])assert.equal(run.final[a],old.final[b]);}
const summary=results.map(r=>({id:r.scenario.id,seeds:r.scenario.seeds,horizonSeconds:r.scenario.seconds,postCompletionSeconds:r.scenario.postCompletionSeconds??null,
 reached8:r.milestones.find(m=>m.gym===8).attained,
 hoursTo8:r.milestones.find(m=>m.gym===8).seconds?{p50:r.milestones.find(m=>m.gym===8).seconds.p50/3600,p90:r.milestones.find(m=>m.gym===8).seconds.p90/3600}:null,
 endGyms:Object.fromEntries([...new Set(r.runs.map(run=>run.final.gym))].map(g=>[g,r.runs.filter(run=>run.final.gym===g).length])),
 cash:r.final.credits,templates:r.final.templates,managementActions:r.final.managementActions,recommendations:r.final.recommendations,
 fundsOnlyWaitSeconds:r.fundsOnlyWaitSeconds,blockedReasons:r.blockedReasons,completion:r.completion,afterCompletion:r.afterCompletion}));
const report={date:'2026-11-14',economyVersion:7,productionRulesModified:false,partial:false,execution:{actualRuns,actualSimulatedShots:actualShots},
 assumptions:data.at(-1).assumptions,sourceFiles:paths,summary,results};
await writeFile('docs/balance/v7-strategy-audit-20261114.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({execution:report.execution,summary},null,2));
