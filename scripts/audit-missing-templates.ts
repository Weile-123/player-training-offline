import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {templateRules,match} from '../src/game/contract/templates';
import {replayTemplateWitness,type TemplateWitness} from '../src/game/contract/templateWitness';
import paths from '../src/game/contract/fixtures/template-paths.json';
const old='output/balance-audit-20261022',out='output/balance-audit-20261023';fs.mkdirSync(out,{recursive:true});
const summary=JSON.parse(fs.readFileSync(old+'/summary-500.json','utf8'));
const missing=summary.underrepresented.map((r:any)=>{
 const t=templateRules.find(t=>t.id===r.id)!;
 const witness=replayTemplateWitness(t.id,(paths as unknown as Record<string,TemplateWitness>)[t.id]);
 return {id:t.id,name:t.name,tier:t.tier,minLevel:t.minLevel,height:t.height,coreMinimums:t.coreMinimums,branches:t.branches,ratingFloor:t.ratingFloor,statFloor:t.statFloor,old:summary.templates[t.id],witness};
});
const irving:any[]=[];let scanned=0;
for(const file of fs.readdirSync(old+'/runs-v2').filter(f=>f.endsWith('.json.gz'))){
 const data=JSON.parse(gunzipSync(fs.readFileSync(old+'/runs-v2/'+file)).toString());scanned++;
 if(!data.summary.coverage.irving.eligible)continue;
 for(const row of data.rows)for(const sample of row.samples){
  if(!sample.candidates.some((r:any)=>r.id==='irving'))continue;
  const actual=match(sample.input),anonymous=match({...sample.input,templateId:null});
  irving.push({file,step:row.step,input:sample.input,actual:actual.templateId,retained:actual.retained,withoutEarnedAppearance:anonymous.templateId,candidates:actual.rows.filter(r=>r.eligible),evidenceType:'counterfactual diagnosis only, not natural acquisition'});
 }
 if(irving.length>=9)break;
}
fs.writeFileSync(out+'/missing-33-review.json',JSON.stringify({missing,irving,scanned,limitations:['Selected seed/action witnesses prove reachability, not prevalence; no rules changed.','Old reasons are repeated snapshot counts, not mutually exclusive probabilities.']},null,2));
console.log(JSON.stringify({witnesses:missing.length,irvingStates:irving.length,scanned}));
