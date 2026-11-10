import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const root='output/balance-audit-20261022',limit=Number(process.argv[2]??500);
const summary=JSON.parse(fs.readFileSync(root+'/summary-'+limit+'.json'));
const catalog=JSON.parse(fs.readFileSync(root+'/catalog.json'));
const groups={},routes={},signatures={},pairs={},maxExamples=[],checks={duplicateShare:0,invalidShareDelta:0,shareFailures:0,unmatchedAtLevel10:0};
const moneyAdd=(bucket,key,value)=>bucket[key]=String(BigInt(bucket[key]??'0')+value);
let maxLevel=0;
for(const file of fs.readdirSync(root+'/runs-v2').filter(f=>f.endsWith('.json.gz')&&Number(f.split('-').at(-1).split('.')[0])<limit)){
 const data=JSON.parse(gunzipSync(fs.readFileSync(root+'/runs-v2/'+file))),s=data.summary;
 const i=Number(s.key.split('-').at(-1));if(i>=limit)continue;
 const key=s.key.replace(/-\d+$/,''),stage=key.includes('-advanced-')?'advanced':'new';
 const g=groups[key]??={moneyByAction:{},shareCount:0,shareLevelGain:0,shareValueGain:'0',repeatedSnapshotGates:{base:0,branch:0,retainedOrFallback:0},normal:0,hot:0};
 const pair=pairs[s.policy+'-'+stage+'-'+i]??={};pair[s.sharing?'share':'control']={completed:s.completed,shots:s.shots,month:s.month};
 if(i===0)signatures[key]=createHash('sha256').update(JSON.stringify(data.actions)).digest('hex');
 s.acquired={};for(const row of data.rows)for(const event of row.events)if(event.type==='template'&&event.templateId)s.acquired[event.templateId]=(s.acquired[event.templateId]??0)+1;
 const route=routes[s.direction.join('+')]??={runs:0,templateRuns:0,acquisitions:{},selectedPolicyRuns:0,selectedPolicyAcquisitions:{}};
 route.runs++;route.templateRuns+=Number(Object.keys(s.acquired).length>0);route.selectedPolicyRuns+=Number(s.policy==='template');
 for(const [id,n]of Object.entries(s.acquired)){route.acquisitions[id]=(route.acquisitions[id]??0)+n;if(s.policy==='template')route.selectedPolicyAcquisitions[id]=(route.selectedPolicyAcquisitions[id]??0)+n;}
 const claimed=new Set();
 for(const row of data.rows){
  moneyAdd(g.moneyByAction,row.action.type,BigInt(row.cashAfter)-BigInt(row.cashBefore));
  const p=row.playerAfter;
  if(p?.level>maxLevel){maxLevel=p.level;maxExamples.length=0;}
  if(p?.level===maxLevel&&maxExamples.length<10)maxExamples.push({key:s.key,step:row.step,player:p,equipment:row.equipment});
  if(row.action.type==='share-reward'){
   if(claimed.has(row.action.playerId))checks.duplicateShare++;claimed.add(row.action.playerId);
   const delta=(p?.level??0)-row.playerBefore.level;
   if(delta<1||!p?.shareRewardClaimed)checks.invalidShareDelta++;
   if(!row.events.some(e=>e.type==='share-reward'))checks.shareFailures++;
   g.shareCount++;g.shareLevelGain+=delta;
   if(p)moneyAdd(g,'shareValueGain',BigInt(p.value)-BigInt(row.playerBefore.value));
  }
  if(row.action.type==='train')g[row.hot?'hot':'normal']++;
  for(const sample of row.samples){
   if(!sample.selected){if(sample.input.level>=10)checks.unmatchedAtLevel10++;continue;}
   const t=catalog.templates.find(t=>t.id===sample.selected),stats=sample.input.stats;
   const mean=keys=>keys.reduce((n,k)=>n+Math.min(1,stats[k]/t.stats[k]),0)/keys.length;
   const all=['three','mid','drive','inside','handle','defense'];
   const passCore=core=>Object.entries(core).every(([k,v])=>stats[k]>=v);
   const base=passCore(t.coreMinimums)&&mean(all)>=t.enter;
   const branch=t.branches?.some(b=>passCore(b.coreMinimums)&&.7*mean(b.keys)+.3*mean(all.filter(k=>!b.keys.includes(k)))>=b.enter);
   g.repeatedSnapshotGates[base?'base':branch?'branch':'retainedOrFallback']++;
  }
 }
}
const contrasts={};
for(const [key,p]of Object.entries(pairs)){
 if(!p.share||!p.control)throw Error('Missing share/control pair '+key);
 const c=contrasts[key.replace(/-\d+$/,'')]??={n:0,shareOnly:0,controlOnly:0,both:0,neither:0,differences:[],shotDifferences:[]};
 c.n++;c[p.share.completed?p.control.completed?'both':'shareOnly':p.control.completed?'controlOnly':'neither']++;
 c.differences.push(Number(p.share.completed)-Number(p.control.completed));c.shotDifferences.push(p.share.shots-p.control.shots);
}
for(const c of Object.values(contrasts)){
 const mean=c.differences.reduce((a,b)=>a+b,0)/c.n;
 const variance=c.differences.reduce((v,x)=>v+(x-mean)**2,0)/Math.max(1,c.n-1);
 c.clearRateDifference=mean;c.pairedApprox95=c.shareOnly+c.controlOnly<20?null:[Math.max(-1,mean-1.96*Math.sqrt(variance/c.n)),Math.min(1,mean+1.96*Math.sqrt(variance/c.n))];
 c.meanShotDifference=c.shotDifferences.reduce((a,b)=>a+b,0)/c.n;delete c.differences;delete c.shotDifferences;
}
const templates=catalog.templates.map(t=>({id:t.id,name:t.name,tier:t.tier,...summary.templates[t.id]}));
fs.writeFileSync(root+'/diagnostics-'+limit+'.json',JSON.stringify({checks,maxLevel,maxExamples,groups,routes,signatures,contrasts,templates},null,2));
const headers=['id','name','tier','eligible','selected','acquired','observedAcquired','runsWithAcquisition','under30Eligible','under30Acquired','firstLevel'];
fs.writeFileSync(root+'/template-coverage-'+limit+'.csv','\uFEFF'+[headers.join(','),...templates.map(t=>headers.map(h=>t[h]??'').join(','))].join('\n'));
console.log(JSON.stringify({checks,maxLevel,zeroTemplateCount:templates.filter(t=>!t.acquired).length,pairedGroups:Object.keys(contrasts).length},null,2));
