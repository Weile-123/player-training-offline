import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {match,shape,templateRules,similarity} from '../src/game/contract/templates';
import {replayTemplateWitness,type TemplateWitness} from '../src/game/contract/templateWitness';
import {dispatch,newContract} from '../src/game/contract/engine';
import {statKeys,type Stats} from '../src/game/types';
import oldPaths from './fixtures/pre-expansion-paths.json';
import oldCatalog from './fixtures/pre-expansion-catalog.json';
const out='output/contract/template-expansion';mkdirSync(out,{recursive:true});
const write=(name:string,data:unknown)=>writeFileSync(`${out}/${name}.json`,JSON.stringify(data,null,2)+'\n');
const base=templateRules.filter(t=>oldCatalog.some(b=>b.id===t.id));
const input=(stats:Stats,height:number,level=29)=>({stats,height,level,templateId:null,matchSeed:17,lastStyle:shape(stats)});
const coverage:any={cases:0,standard:0,fallback:0,missing:[],pairs:[],selfFailures:[],exactDuplicates:[],nearPairs:[]};
for(let a=0;a<6;a++)for(let b=a+1;b<6;b++){
 const row:any={keys:[statKeys[a],statKeys[b]],missing:[],fallback:[],weak:[]};
 for(let height=178;height<=218;height++){
  const stats=Object.fromEntries(statKeys.map((k,i)=>[k,i===a||i===b?90:35])) as Stats;
  const r=match(input(stats,height)),selected=r.rows.find(v=>v.id===r.templateId);
  coverage.cases++;
  if(!selected){coverage.missing.push({height,keys:row.keys});row.missing.push(height);}
  else if(selected.reasons.includes('specialist-entry')){coverage.fallback++;row.fallback.push(height);}
  else coverage.standard++;
  if(r.similarity<.6)row.weak.push({height,id:r.templateId,score:r.similarity});
 }
 coverage.pairs.push(row);
}
for(const t of templateRules)for(let height=t.height[0];height<=t.height[1];height++){
 const r=match(input(t.stats,height,t.minLevel));if(r.templateId!==t.id)coverage.selfFailures.push({id:t.id,height,winner:r.templateId});
}
for(let i=0;i<templateRules.length;i++)for(let j=i+1;j<templateRules.length;j++){
 const a=templateRules[i],b=templateRules[j];if(a.height[0]>b.height[1]||b.height[0]>a.height[1])continue;
 if(statKeys.every(k=>a.stats[k]===b.stats[k]))coverage.exactDuplicates.push([a.id,b.id]);
 const score=similarity(shape(a.stats),b.stats);if(a.tier===b.tier&&score>=.9)coverage.nearPairs.push({a:a.id,b:b.id,score});
}
const replays:any={adjusted:{passed:[],failed:[]},expanded:{passed:[],failed:[]}};
for(const [stage,catalog] of [['adjusted',base],['expanded',templateRules]] as const){
 for(const [id,w] of Object.entries(oldPaths)){
  let s=newContract(w.seed),peak:number|null=null;const unlocks:string[]=[];
  for(const a of w.actions){const r=dispatch(s,s.revision,a as TemplateWitness['actions'][number],{catalog});if(r.error)throw Error(r.error);s=r.state;for(const e of r.events)if(e.type==='unlock'){unlocks.push(e.templateId!);if(e.templateId===id)peak=s.players.find(p=>p.id===e.playerId)!.peakLevel;}}
  replays[stage][peak===null?'failed':'passed'].push({id,peak,unlocks});
 }
}
replays.newCompetition=replays.adjusted.passed.filter((p:any)=>replays.expanded.failed.some((f:any)=>f.id===p.id));
const paths:Record<string,TemplateWitness>=JSON.parse(readFileSync(process.argv[2]??'src/game/contract/fixtures/template-paths.json','utf8'));
const valid:Record<string,TemplateWitness>={},checks:any[]=[];
for(const [id,w]of Object.entries(paths))try{const r=replayTemplateWitness(id,w);if(r.acquisition.peakLevel<30){valid[id]=w;checks.push({id,peak:r.acquisition.peakLevel});}}catch{}
write('coverage',coverage);write('old-route-comparison',replays);write('verified-paths',valid);write('path-checks',checks);
console.log(JSON.stringify({total:templateRules.length,standard:coverage.standard,fallback:coverage.fallback,missing:coverage.missing,selfFailures:coverage.selfFailures,oldAdjusted:replays.adjusted.passed.length,oldExpanded:replays.expanded.passed.length,newCompetition:replays.newCompetition.map((x:any)=>x.id),validBefore30:Object.keys(valid).length,missingPaths:templateRules.filter(t=>!valid[t.id]).map(t=>t.id),gaps:coverage.pairs.filter((p:any)=>p.fallback.length||p.missing.length).map((p:any)=>({keys:p.keys,fallback:p.fallback,missing:p.missing}))},null,2));
