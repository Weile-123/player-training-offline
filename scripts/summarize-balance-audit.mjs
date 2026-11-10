import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
const root='output/balance-audit-20261022',expected=Number(process.argv[2]??50),source=root+'/runs-v2';
const tierById=Object.fromEntries(JSON.parse(fs.readFileSync(root+'/catalog.json')).templates.map(t=>[t.id,t.tier]));
const groups={},templates={},index=[],equipment={},anomalies=[],shotModes={normal:{n:0,delta:0,departures:0},hot:{n:0,delta:0,departures:0},share:{n:0,delta:0,departures:0}};
const percentile=(a,p)=>a.length?[...a].sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor((a.length-1)*p))]:null;
const wilson=(wins,n)=>{if(!n)return [0,1];const z=1.96,p=wins/n,den=1+z*z/n,mid=(p+z*z/(2*n))/den,half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;return [Math.max(0,mid-half),Math.min(1,mid+half)];};
const sumCounters=(into,from)=>{for(const [k,v]of Object.entries(from))into[k]=(into[k]??0)+v;};
let totalOps=0,totalShots=0,maxLevel=0;
for(const file of fs.readdirSync(source).filter(f=>f.endsWith('.json.gz')&&Number(f.split('-').at(-1).split('.')[0])<expected)){
 const data=JSON.parse(gunzipSync(fs.readFileSync(source+'/'+file))),s=data.summary;
 // Template events also include monthly recruits. Use these for acquisitions;
 // candidate eligibility still describes the explicitly recorded snapshots.
 const eventAcquired={},eventFirstTier={};let shotsSoFar=0;
 for(const row of data.rows)for(const event of row.events){
  if(event.type==='shot'||event.type==='shot-blocked')shotsSoFar++;
  if(event.type==='template'&&event.templateId){eventAcquired[event.templateId]=(eventAcquired[event.templateId]??0)+1;eventFirstTier[tierById[event.templateId]]??=shotsSoFar;}
 }
 s.acquired=eventAcquired;s.firstTier=eventFirstTier;
 for(const [id,c]of Object.entries(s.coverage)){c.observedAcquired=c.acquired;c.acquired=eventAcquired[id]??0;}
 const suffix=Number(s.key.split('-').at(-1));if(suffix>=expected)continue;
 const group=s.key.replace(/-\d+$/,''),g=groups[group]??={runs:0,completed:0,ended:0,censored:0,errors:0,endingMonths:[],actions:0,shots:0,counters:{},firstTiers:{},endingMonthDistribution:{},months:{},templates:new Set(),shareLevels:0};
 g.runs++;g.completed+=Number(s.completed);g.ended+=Number(s.status==='ended');g.censored+=Number(['month-limit','action-limit'].includes(s.status));g.errors+=Number(s.status==='error');
 if(s.status==='ended')g.endingMonths.push(s.month);
 g.endingMonthDistribution[s.month]=(g.endingMonthDistribution[s.month]??0)+1;
 g.actions+=s.operations;g.shots+=s.shots;sumCounters(g.counters,s.counters);
 for(const id of Object.keys(s.acquired))g.templates.add(id);
 for(const [tier,shot]of Object.entries(s.firstTier))(g.firstTiers[tier]??=[]).push(shot);
 for(const m of s.months){const a=g.months[m.month]??={n:0,met:0,cash:[],delivered:[],credit:[]};a.n++;a.met+=Number(m.met);a.cash.push(m.cash);a.delivered.push(m.delivered);a.credit.push(m.credit);}
 for(const [id,c]of Object.entries(s.coverage)){
  const t=templates[id]??={eligible:0,selected:0,acquired:0,observedAcquired:0,under30Eligible:0,under30Acquired:0,lost:0,runsWithAcquisition:0,reasons:{},firstLevel:null};
  for(const k of ['eligible','selected','acquired','observedAcquired','under30Eligible','under30Acquired','lost'])t[k]+=c[k];
  t.runsWithAcquisition+=Number(c.acquired>0);sumCounters(t.reasons,c.reasons);
  if(c.firstLevel!==null)t.firstLevel=Math.min(t.firstLevel??Infinity,c.firstLevel);
 }
 for(const [id,n]of Object.entries(s.equipment)){const e=equipment[id]??={runs:0,purchases:0,completed:0};e.runs++;e.purchases+=n;e.completed+=Number(s.completed);}
 for(const row of data.rows){
  if(row.playerAfter)maxLevel=Math.max(maxLevel,row.playerAfter.level);
  if(['train','share-reward'].includes(row.action.type)){
   const kind=row.action.type==='share-reward'?'share':row.hot?'hot':'normal',bucket=shotModes[kind];bucket.n++;
   const delta=row.playerAfter?row.playerAfter.level-row.playerBefore.level:0;bucket.delta+=delta;bucket.departures+=Number(!row.playerAfter);
   if(kind==='share')g.shareLevels+=delta;
  }
 }
 totalOps+=s.operations;totalShots+=s.shots;
 index.push({key:s.key,seed:s.seed,policy:s.policy,sharing:s.sharing,status:s.status,completed:s.completed,month:s.month,shots:s.shots,operations:s.operations,profileHash:s.profileHash,finalHash:s.finalHash});
 if(s.error)anomalies.push({key:s.key,error:s.error});
}
const moneyMedian=values=>values.length?[...values].sort((a,b)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0)[Math.floor(values.length/2)]:null;
for(const g of Object.values(groups)){
 g.clearRate=g.completed/g.runs;g.clear95=wilson(g.completed,g.runs);
 g.endingMonthMedian=percentile(g.endingMonths,.5);g.endingMonthP90=percentile(g.endingMonths,.9);delete g.endingMonths;
 g.templateCount=g.templates.size;g.templates=[...g.templates];
 for(const [tier,v]of Object.entries(g.firstTiers))g.firstTiers[tier]={n:v.length,median:percentile(v,.5),p90:percentile(v,.9)};
 for(const a of Object.values(g.months)){a.cashMedian=moneyMedian(a.cash);a.deliveredMedian=moneyMedian(a.delivered);a.creditMedian=percentile(a.credit,.5);delete a.cash;delete a.delivered;delete a.credit;}
}
const underrepresented=Object.entries(templates).filter(([_,t])=>!t.acquired).map(([id,t])=>({id,eligible:t.eligible,selected:t.selected,reasons:t.reasons}));
const gate={expectedPerGroup:expected,groupCount:Object.keys(groups).length,complete:Object.keys(groups).length===24&&Object.values(groups).every(g=>g.runs===expected),noErrors:anomalies.length===0,noCensored:Object.values(groups).every(g=>g.censored===0),shareBranches:Object.entries(groups).every(([id,g])=>id.includes('no-share')?!g.counters['share-reward']:g.counters['share-reward']>0)};
const report={version:'natural-v2',date:new Date().toISOString(),gate,totalRuns:index.length,totalOps,totalShots,maxLevel,groups,templates,underrepresented,equipment,shotModes,anomalies,
 limitations:['No selectable stat-training action: route means selection of visibly suitable players.','Conditional first-tier times exclude runs that never acquired the tier; n is reported.','Equipment win correlations are confounded by progress and purchases, not causal effects.','No actual mobile or human-play session is represented.','Snapshot diagnostics retain an earned appearance; eligible counts are not acquisition probabilities.']};
fs.writeFileSync(root+'/summary-'+expected+'.json',JSON.stringify(report,null,2));
fs.writeFileSync(root+'/run-index.json',JSON.stringify(index));
let md='# 自然培养与经济平衡试跑结果（'+expected+' 局/组）\n\n'+
 '代码策略：natural-v2。共 '+index.length+' 局，'+totalOps+' 次公共动作，最高观察训练等级 '+maxLevel+'。\n\n'+
 '| 策略/账号/分享 | 局数 | 通关 | 通关率95%区间 | 结束月中位数 | 模板数 | 分享次数 |\n| --- | ---: | ---: | --- | ---: | ---: | ---: |\n';
for(const [id,g]of Object.entries(groups))md+='| '+id+' | '+g.runs+' | '+g.completed+' | '+g.clear95.map(x=>(100*x).toFixed(1)+'%').join('–')+' | '+g.endingMonthMedian+' | '+g.templateCount+' | '+(g.counters['share-reward']??0)+' |\n';
md+='\n门禁：'+JSON.stringify(gate)+'\n\n未获得模板 '+underrepresented.length+' 个。零出现不等于不可达，候选诊断见 JSON。\n';
fs.writeFileSync(root+'/summary-'+expected+'.md',md);
console.log(JSON.stringify({gate,totalRuns:index.length,totalOps,maxLevel,zeroTemplates:underrepresented.length,completed:index.filter(s=>s.completed).length},null,2));
