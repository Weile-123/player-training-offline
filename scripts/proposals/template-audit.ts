import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {match,shape,similarity,templateRules,type TemplateRule} from '../../src/game/contract/templates';
import {dispatch,newContract,type Action} from '../../src/game/contract/engine';
import {statKeys,type Stats} from '../../src/game/types';
import {rules} from '../../src/game/contract/rules';
import paths from '../../src/game/contract/fixtures/template-paths.json';
import previousAudit from '../../output/contract/template-level-30/template-audit.json';
import {proposalCatalog,proposedNewIds} from './template-catalog';

const out='output/contract/template-proposal-audit';mkdirSync(out,{recursive:true});
const catalogs={current:templateRules,adjusted:proposalCatalog(templateRules,false),expanded:proposalCatalog(templateRules,true)};
const names=Object.fromEntries(catalogs.expanded.map(t=>[t.id,t.name]));
const save=(name:string,value:unknown)=>writeFileSync(`${out}/${name}.json`,JSON.stringify(value,null,2)+'\n');
const ranks=rules.tiers.map(t=>t.id);
const reports:Record<string,any>={};
const outcomes:Record<string,(string|null)[]>={};
const statObject=(values:number[])=>Object.fromEntries(statKeys.map((k,i)=>[k,values[i]])) as Stats;
const input=(stats:Stats,height:number,level:number)=>({stats,height,level,templateId:null,matchSeed:1,lastStyle:shape(stats)});
const pair=(a:TemplateRule,b:TemplateRule)=>({a:a.id,b:b.id,names:[a.name,b.name],similarity:similarity(shape(a.stats),b.stats),height:[Math.max(a.height[0],b.height[0]),Math.min(a.height[1],b.height[1])]});
for(const [stage,catalog]of Object.entries(catalogs)){
 const report:any={templates:catalog.length,counts:Object.fromEntries(ranks.map(tier=>[tier,catalog.filter(t=>t.tier===tier).length])),grid:{cases:0,standard:0,fallback:0,unmatched:0,weakStyle:0,groups:{}},pair90:[],self:{cases:0,failures:[]},nearPairs:[],exactDuplicates:[],replay:{success:0,failures:[],rows:[]}};
 outcomes[stage]=[];
 for(let mask=1;mask<63;mask++){
  const strong=statKeys.filter((_,i)=>mask&(1<<i));if(strong.length>3)continue;
  for(const high of [80,90,99])for(const low of [25,35,45])for(const level of [10,18,29]){
   const stats=statObject(statKeys.map((_,i)=>mask&(1<<i)?high:low));
   const group=report.grid.groups[strong.length]??={cases:0,standard:0,fallback:0,unmatched:0,weakStyle:0};
   const detail={strong,missingStandardHeights:[]as number[],unmatchedHeights:[]as number[],weakStyleHeights:[]as number[],examples:[]as unknown[]};
   for(let height=178;height<=218;height++){
    const m=match(input(stats,height,level),catalog),selected=m.rows.find(r=>r.id===m.templateId);
    const kind=!selected?'unmatched':selected.reasons.includes('specialist-entry')?'fallback':'standard';
    for(const tally of [report.grid,group]){tally.cases++;tally[kind]++;if(selected&&m.similarity<.6)tally.weakStyle++;}
    outcomes[stage].push(m.templateId);
    if(strong.length===2&&high===90&&low===35&&level===29){
     if(kind!=='standard')detail.missingStandardHeights.push(height);
     if(kind==='unmatched')detail.unmatchedHeights.push(height);
     if(selected&&m.similarity<.6)detail.weakStyleHeights.push(height);
     if((kind!=='standard'||m.similarity<.6)&&detail.examples.length<3)detail.examples.push({height,kind,selected:m.templateId,name:selected?.name,similarity:m.similarity});
    }
   }
   if(strong.length===2&&high===90&&low===35&&level===29)report.pair90.push(detail);
  }
 }
 console.log(`${stage}: grid ${report.grid.cases}, standard ${report.grid.standard}, fallback ${report.grid.fallback}, unmatched ${report.grid.unmatched}`);
 for(const t of catalog)for(let height=t.height[0];height<=t.height[1];height++){
  const m=match(input(t.stats,height,t.minLevel),catalog);report.self.cases++;
  if(m.templateId!==t.id)report.self.failures.push({id:t.id,name:t.name,height,winner:m.templateId});
 }
 for(let i=0;i<catalog.length;i++)for(let j=i+1;j<catalog.length;j++){
  const a=catalog[i],b=catalog[j],p=pair(a,b);if(p.height[0]>p.height[1])continue;
  if(statKeys.every(k=>a.stats[k]===b.stats[k]))report.exactDuplicates.push(p);
  if(a.tier===b.tier&&p.similarity>=.9)report.nearPairs.push(p);
 }
 report.nearPairs.sort((a:any,b:any)=>b.similarity-a.similarity);
 for(const [id,witness]of Object.entries(paths)){
  let state=newContract(witness.seed);let error:string|undefined;
  const unlocks:unknown[]=[];let peak:number|null=null;
  for(let step=0;step<witness.actions.length;step++){
   const r=dispatch(state,state.revision,witness.actions[step] as Action,{catalog});if(r.error){error=r.error;break;}state=r.state;
   for(const e of r.events)if(e.type==='unlock'){
    const p=state.players.find(p=>p.id===e.playerId)!;
    unlocks.push({id:e.templateId,name:names[e.templateId!],playerId:p.id,peak:p.peakLevel,step});
    if(e.templateId===id)peak=p.peakLevel;
   }
  }
  const targetPlayer=previousAudit.rows.find(r=>r.id===id)?.replay?.acquisition.playerId;
  const row={id,name:names[id],success:peak!==null&&!error,peak,error,finalTemplate:state.players.find(p=>p.id===targetPlayer)?.templateId,unlocks};
  report.replay.rows.push(row);if(row.success)report.replay.success++;else report.replay.failures.push(row);
 }
 reports[stage]=report;save(stage,report);
 console.log(`${stage}: self failures ${report.self.failures.length}, existing replay ${report.replay.success}/100`);
}
const pairs=(a:string,b:string)=>{
 const counts:Record<string,number>={};let changed=0,newWinner=0;
 outcomes[a].forEach((id,i)=>{const next=outcomes[b][i];if(id!==next){changed++;const key=`${id??'unmatched'} -> ${next??'unmatched'}`;counts[key]=(counts[key]??0)+1;if(next&&proposedNewIds.includes(next))newWinner++;}});
 return {cases:outcomes[a].length,changed,newWinner,topTransitions:Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([transition,count])=>({transition,count})),lostPaths:reports[a].replay.rows.filter((r:any)=>r.success&&!reports[b].replay.rows.find((x:any)=>x.id===r.id).success).map((r:any)=>({id:r.id,name:r.name,after:reports[b].replay.rows.find((x:any)=>x.id===r.id)}))};
};
save('comparison',{currentToAdjusted:pairs('current','adjusted'),adjustedToExpanded:pairs('adjusted','expanded')});
save('spot-checks',[
 {height:190,stats:statObject([25,99,25,99,25,25])},
 {height:215,stats:statObject([35,35,90,90,35,35])},
 {height:205,stats:statObject([35,35,90,35,90,35])},
].map(c=>{const m=match(input(c.stats,c.height,29),catalogs.expanded);return {...c,level:29,templateId:m.templateId,name:names[m.templateId!],similarity:m.similarity,reason:m.rows.find(r=>r.id===m.templateId)?.reasons};}));

// Fixed, non-lookahead policy: first free gift; train one initial recruit until
// departure, peak >=29 or 160 shots. Identical seeds/actions across catalogs.
const runs=Number(process.env.PROPOSAL_RUNS??1000),seed=70261022;
if(!Number.isSafeInteger(runs)||runs<1||runs>10000)throw Error('Invalid run count');
const simulations:Record<string,any>={};
for(const [stage,catalog]of Object.entries(catalogs)){
 const result:any={seed,runs,careers:runs*3,shots:0,departed:0,at29:0,stepLimited:0,counts:Object.fromEntries(catalog.map(t=>[t.id,0])),before30:Object.fromEntries(catalog.map(t=>[t.id,0])),minimumPeak:{},newWitnesses:{}};
 const fingerprints:string[]=[];
 for(let n=0;n<runs;n++)for(const main of ['p1','p2','p3']){
  let state=newContract(seed+n);const actions:Action[]=[{type:'buy-equipment',id:state.commerce.shop.offers[0]}];
  const first=dispatch(state,state.revision,actions[0],{catalog});if(first.error)throw Error(first.error);state=first.state;
  let steps=0;
  for(;steps<160;steps++){
   const p=state.players.find(p=>p.id===main);if(!p||p.peakLevel>=29)break;
   const action:Action={type:'train',playerId:main},r=dispatch(state,state.revision,action,{catalog});if(r.error)throw Error(r.error);state=r.state;actions.push(action);result.shots++;
   for(const e of r.events)if(e.type==='unlock'){
    const p=state.players.find(p=>p.id===e.playerId)!;result.counts[e.templateId!]++;
    if(p.peakLevel<30)result.before30[e.templateId!]++;
    result.minimumPeak[e.templateId!]=Math.min(result.minimumPeak[e.templateId!]??Infinity,p.peakLevel);
    if(proposedNewIds.includes(e.templateId!)&&!result.newWitnesses[e.templateId!])result.newWitnesses[e.templateId!]={seed:seed+n,actions:[...actions],peak:p.peakLevel};
   }
  }
  const p=state.players.find(p=>p.id===main);
  if(!p)result.departed++;else if(p.peakLevel>=29)result.at29++;else result.stepLimited++;
  fingerprints.push(JSON.stringify({shots:state.totalShots,rng:state.rng,players:state.players.map(p=>({id:p.id,level:p.level,stats:p.stats,height:p.height}))}));
  if(main==='p3'&&(n+1)%250===0)console.log(`${stage}: fixed-policy ${n+1}/${runs}`);
 }
 result.growthDigest=createHash('sha256').update(fingerprints.join('\n')).digest('hex');
 result.unseen=catalog.filter(t=>!result.counts[t.id]).map(t=>({id:t.id,name:t.name}));
 simulations[stage]=result;save(`simulation-${stage}`,result);
}
if(new Set(Object.values(simulations).map(r=>r.growthDigest)).size!==1)throw Error('Scenarios changed underlying growth/outcome traces; comparison invalid.');
const witnessChecks=[];
for(const[id,w]of Object.entries(simulations.expanded.newWitnesses) as [string,{seed:number;actions:Action[];peak:number}][]){
 let state=newContract(w.seed),peak:number|null=null;
 for(const action of w.actions){const r=dispatch(state,state.revision,action,{catalog:catalogs.expanded});if(r.error)throw Error(r.error);state=r.state;
  for(const e of r.events)if(e.type==='unlock'&&e.templateId===id)peak=state.players.find(p=>p.id===e.playerId)!.peakLevel;
 }
 if(peak===null||peak>=30||!state.collection[id])throw Error(`Invalid new witness ${id}`);
 witnessChecks.push({id,name:names[id],peak,seed:w.seed,actions:w.actions.length});
}
save('new-witness-checks',witnessChecks);
save('scope',{
 created:'2026-10-22',catalogDigest:createHash('sha256').update(JSON.stringify(catalogs)).digest('hex'),
 scenarios:{current:'当前正式100人',adjusted:'六人改档、明确核心、六名原有专长与三名全能传奇改门槛，不增加球员',expanded:'adjusted方案加8名新球员，共108人'},
 static:'1/2/3项80、90或99，其他项25、35或45；178–218cm；10/18/29级；无已获身份。无既有身份的候选切换不等于玩家已得身份会被替换。',
 weakStyle:'风格相似度<0.6仅作为本次诊断警戒线，不是新增准入门槛。近似模板是同档、身高重叠、风格相似度>=0.9。',
 replay:'重放旧100条正式动作记录；失败证明旧路线受影响，不证明该模板所有路线都不可达。',
 simulation:`固定策略，${runs}个种子，每种子分别培养3名初始球员，共${runs*3}条生涯/组；不看未来，不修改成长和结果；原始成长/结果摘要在三组一致。只反映本策略样本，不是全局获取概率，未出现不等于不可达。`,
 guarantee:'本次不保证108个模板均在30级前可达；需逐模板取得并重放新方案见证。',
 runtime:'构建时在.tmp内给正式匹配函数加入方案适配度与下限规则，实际dispatch采用方案catalog；不改写正式src匹配器或正式名单。',
});
console.log(JSON.stringify({done:true,report:out,simulationCareers:runs*3,newWitnesses:Object.keys(simulations.expanded.newWitnesses)},null,2));
