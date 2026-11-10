import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {dispatch,newContract,playerValue,previewSettlement,previewShot,type Contract,type Action,type Athlete} from '../src/game/contract/engine';
import {shopEntry,purchasePrice,rerollPrice} from '../src/game/contract/commerce';
import {encodeContract,decodeContract,validContract} from '../src/game/contract/save';
import {mergeProfile,type Profile} from '../src/game/contract/profile';
import {match,templateRules} from '../src/game/contract/templates';
import {hotCounts} from '../src/game/contract/heat';
import {equipmentName,equipmentDescription} from '../src/game/contract/catalog';
import {rules} from '../src/game/contract/rules';
import {statKeys,type StatKey} from '../src/game/types';

const out='output/balance-audit-20261022';
mkdirSync(out+'/runs-v2',{recursive:true});mkdirSync(out+'/prelude',{recursive:true});
writeFileSync(out+'/catalog.json',JSON.stringify({templates:templateRules,equipment:Object.fromEntries(Array.from({length:98},(_,i)=>{const id='relic_'+String(i+1).padStart(3,'0');return [id,{name:equipmentName(id),description:equipmentDescription(id)}];}))},null,2));
const arg=(name:string,fallback:string)=>{const i=process.argv.indexOf('--'+name);return i<0?fallback:process.argv[i+1];};
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const version='natural-v2';
const relic=(n:number)=>'relic_'+String(n).padStart(3,'0');
const policies=[
 {id:'conservative',name:'保守保值',min:3,max:12,risk:120,rerolls:0,reserve:4,preference:[3,36,56,20,62,90,79,66,6,9,2]},
 {id:'quota',name:'目标达标',min:3,max:18,risk:220,rerolls:1,reserve:4,preference:[9,6,17,3,48,66,68,43,63]},
 {id:'focus',name:'集中培养',min:8,max:99,risk:400,rerolls:1,reserve:3,preference:[36,17,41,52,60,48,56,57,63,92]},
 {id:'heat',name:'火热成长',min:6,max:30,risk:350,rerolls:2,reserve:3,preference:[11,60,48,57,58,63,95,88,69,70,3]},
 {id:'template',name:'模板定向',min:8,max:30,risk:350,rerolls:1,reserve:3,preference:[17,36,41,52,56,48,60,63,90]},
 {id:'mixed',name:'普通混合',min:4,max:16,risk:250,rerolls:1,reserve:5,preference:[2,9,17,3,6,41,20,43]}
];
const routes:StatKey[][]=[...statKeys.map(k=>[k]),['three','defense'],['handle','drive'],['mid','inside'],['inside','defense'],[...statKeys]];
type Policy=typeof policies[number];
type Coverage=Record<string,{eligible:number;selected:number;acquired:number;under30Eligible:number;under30Acquired:number;lost:number;reasons:Record<string,number>;firstLevel:number|null}>;
const newCoverage=():Coverage=>Object.fromEntries(templateRules.map(t=>[t.id,{eligible:0,selected:0,acquired:0,under30Eligible:0,under30Acquired:0,lost:0,reasons:{},firstLevel:null}]));
function simulate(seed:number,policy:Policy,profile:Profile,sharing:boolean,key:string,maxMonth=21,initial?:Contract){
 let state=initial?structuredClone(initial):newContract(seed,[],profile.collection);
 if(!initial){state.commerce.unlocked=[...profile.unlocked];state.careerId='audit-'+key;}
 const actionLimit=maxMonth>21?30000:10000;
 const initialHash=hash(state),rows:any[]=[],months:any[]=[],coverage=newCoverage(),actions:Action[]=[];
 const counters:Record<string,number>={},acquired:Record<string,number>={},equipment:Record<string,number>={},firstTier:Record<string,number>={};
 const direction=routes[seed%routes.length],rank=(id:string)=>{const n=policy.preference.map(relic).indexOf(id);return n<0?100:n;};
 const observe=(p:Athlete,previous?:Athlete)=>{
  const result=match(p);
  for(const r of result.rows){const v=coverage[r.id];if(r.eligible){v.eligible++;if(p.level<30)v.under30Eligible++;if(result.templateId!==r.id)v.lost++;}
   if(result.templateId===r.id)v.selected++;
   for(const why of r.reasons)v.reasons[why]=(v.reasons[why]??0)+1;
  }
  if(p.templateId&&p.templateId!==previous?.templateId){const v=coverage[p.templateId];v.acquired++;v.firstLevel=Math.min(v.firstLevel??Infinity,p.level);if(p.level<30)v.under30Acquired++;
   acquired[p.templateId]=(acquired[p.templateId]??0)+1;
   const tier=templateRules.find(t=>t.id===p.templateId)!.tier;firstTier[tier]??=state.totalShots;
  }
  return {input:{id:p.id,level:p.level,peakLevel:p.peakLevel,height:p.height,stats:p.stats,templateId:p.templateId,matchSeed:p.matchSeed,lastStyle:p.lastStyle},
   selected:result.templateId,retained:result.retained,candidates:result.rows.filter(r=>r.eligible).map(r=>({id:r.id,score:r.score,styleScore:r.styleScore,reasons:r.reasons}))};
 };
 const act=(action:Action)=>{
  if(actions.length>=actionLimit)throw Error('action-limit');
  const before=state,pid='playerId' in action?action.playerId:undefined,p=before.players.find(p=>p.id===pid),forecast=action.type==='settle'?previewSettlement(before):undefined;
  const odds=p&&['train','share-reward'].includes(action.type)?previewShot(before,p).tickets:undefined;
  const result=dispatch(before,before.revision,action);
  if(result.error)throw Error(action.type+':'+result.error);
  state=result.state;actions.push(action);
  let expectedCash=BigInt(before.cash),expectedCredits=before.credits;
  for(const event of result.events){
   counters[event.type]=(counters[event.type]??0)+1;
   if(event.type==='settlement'||event.type==='departed')expectedCash+=BigInt(event.value??'0');
   if(event.type==='merchant-purchase'||event.type==='reroll')expectedCash-=BigInt(event.value??'0');
  }
  if(action.type==='buy-equipment'){expectedCredits-=before.month===1?0:shopEntry(action.id)!.price;equipment[action.id]=(equipment[action.id]??0)+1;}
  if(action.type==='exchange')expectedCredits+=before.equipment.includes('relic_045')&&!before.progress.hookUsed&&(before.commerce.shop.paidRerolls>0||before.commerce.shop.freeUsed)&&p?.level===0&&p.shots===0?2:1;
  if(action.type==='settle'&&forecast!.met&&before.equipment.includes('relic_068'))expectedCredits++;
  if(state.cash!==String(expectedCash)||state.credits!==expectedCredits)throw Error('ledger-mismatch');
  if(state.revision!==before.revision+1||state.credit<0||state.credits<0||BigInt(state.cash)<0n||state.players.some(p=>p.level>99||statKeys.some(k=>p.stats[k]<0||p.stats[k]>99)))throw Error('invalid-transition');
  const after=state.players.find(a=>a.id===pid);
  const samples=action.type==='train'||action.type==='share-reward'?(after?[observe(after,p)]:[]):action.type==='buy-merchant'?state.players.filter(a=>!before.players.some(b=>b.id===a.id)).map(a=>observe(a)):[];
  rows.push({step:actions.length,month:before.month,action,odds,hot:p?hotCounts(before,p).remaining>0||p.heat>=10:false,
   playerBefore:p?{id:p.id,level:p.level,stats:p.stats,value:playerValue(before,p),shots:p.shots,heat:p.heat,hot:p.hotShotsRemaining}:null,
   playerAfter:after?{id:after.id,level:after.level,stats:after.stats,value:playerValue(state,after),shots:after.shots,heat:after.heat,hot:after.hotShotsRemaining,shareRewardClaimed:after.shareRewardClaimed}:null,
   cashBefore:before.cash,cashAfter:state.cash,creditsBefore:before.credits,creditsAfter:state.credits,credit:state.credit,equipment:state.equipment,events:result.events,samples});
  if(action.type==='settle')months.push({month:before.month,required:forecast!.required,delivered:forecast!.value,met:forecast!.met,cash:state.cash,credit:state.credit,shots:state.totalShots,roster:state.players.length});
  if(actions.length%100===0){
   const restored=decodeContract(encodeContract(state));if(!restored||hash(restored)!==hash(state))throw Error('save-roundtrip-mismatch');state=restored;
  }
 };
 let prepared=0,exchanged=0,status='ended',error:string|null=null;
 try{
  while(state.status==='playing'&&(!state.completed||maxMonth>21)&&state.month<=maxMonth&&actions.length<actionLimit){
   if(state.completion&&!state.completion.acknowledged){act({type:'continue-endless'});continue;}
   if(prepared!==state.month){
    prepared=state.month;
    const buyBest=()=>{
     const offers=[...state.commerce.shop.offers].sort((a,b)=>rank(a)-rank(b));
     const id=offers[0];if(!id)return;
     const worst=[...state.equipment].sort((a,b)=>rank(b)-rank(a))[0];
     if(state.equipment.length>=8&&rank(id)>=rank(worst))return;
     const cost=state.month===1?0:shopEntry(id)!.price;
     if(state.credits<cost&&exchanged!==state.month&&state.players.filter(p=>!p.queued).length>=3){
      const rookie=state.players.filter(p=>!p.queued&&p.level===0&&p.shots===0).sort((a,b)=>statKeys.reduce((v,k)=>v+a.stats[k]-b.stats[k],0))[0];
      if(rookie){act({type:'exchange',playerId:rookie.id});exchanged=state.month;}
     }
     if(state.credits>=cost)act({type:'buy-equipment',id,...(state.equipment.length>=8?{replaceId:worst}:{})});
    };
    buyBest();
    if(state.month>1)for(let i=0;i<policy.rerolls;i++){
     const free=state.equipment.includes('relic_043')&&!state.commerce.shop.freeUsed;
     if(!state.credits||(!free&&BigInt(state.cash)<BigInt(rerollPrice(state.month,state.commerce.shop.paidRerolls))*BigInt(policy.reserve)))break;
     act({type:'reroll'});buyBest();
    }
    for(const id of ['item_006','basic','special','item_007','item_005','item_003','item_001']){
     const offer=state.commerce.merchant.offers.find(o=>o.id===id);
     if(!offer||offer.purchased>=offer.stock||(id==='item_006'&&(state.credit>=3||state.commerce.incenseUsed)))continue;
     if(BigInt(state.cash)>=BigInt(purchasePrice(offer))*BigInt(policy.reserve))act({type:'buy-merchant',id});
    }
   }
   const settlement=previewSettlement(state);
   if(settlement.met){act({type:'settle'});continue;}
   const active=state.players.filter(p=>!p.queued);
   if(!active.length){act({type:'settle'});continue;}
   if(policy.id==='focus')active.sort((a,b)=>b.level-a.level||statKeys.reduce((v,k)=>v+b.stats[k]-a.stats[k],0));
   if(policy.id==='template')active.sort((a,b)=>direction.reduce((v,k)=>v+b.stats[k]-a.stats[k],0));
   if(policy.id==='mixed'&&state.totalShots%3===0)active.reverse();
   const p=active[0],value=BigInt(playerValue(state,p)),remaining=BigInt(settlement.required)-BigInt(settlement.value);
   const goal=policy.id==='focus'?remaining:(remaining+BigInt(active.length)-1n)/BigInt(active.length);
   const hot=hotCounts(state,p).remaining>0||p.heat>=10,odds=previewShot(state,p).tickets;
   if(sharing&&p.level<99&&!p.shareRewardClaimed){act({type:'share-reward',playerId:p.id,careerId:state.careerId!});continue;}
   const preserveHot=policy.id==='heat'&&hot&&p.level<policy.max;
   if(p.level>=99||p.shots>=160||(!preserveHot&&((p.level>=policy.min&&value>=goal)||p.level>=policy.max||(p.level>=policy.min&&odds.severe>=policy.risk)))){
    act({type:'queue',playerId:p.id,queued:true});continue;
   }
   if(!hot&&p.heat>=7&&state.commerce.inventory.item_005>0&&!p.armed.some(id=>id==='item_001'||id==='item_004'))act({type:'use-item',id:'item_005',playerId:p.id});
   const current=state.players.find(a=>a.id===p.id)!,nowHot=hotCounts(state,current).remaining>0||current.heat>=10;
   if(nowHot&&state.commerce.inventory.item_003>0&&!current.armed.includes('item_003'))act({type:'use-item',id:'item_003',playerId:p.id});
   if(!nowHot&&p.level>=6&&state.commerce.inventory.item_001>0&&!current.armed.includes('item_001'))act({type:'use-item',id:'item_001',playerId:p.id});
   act({type:'train',playerId:p.id});
  }
  status=state.status==='over'?'ended':state.completed&&maxMonth===21?'completed':state.month>maxMonth?'month-limit':'action-limit';
  if(!validContract(state))throw Error('invalid-final-save');
 }catch(e){if(e instanceof Error&&e.message==='action-limit')status='action-limit';else{status='error';error=String(e);}}
 return {state,rows,actions,summary:{key,version,seed,policy:policy.id,sharing,profileHash:hash(profile),direction,initialHash,finalHash:hash(state),status,error,month:state.month,completed:state.completed,firstCompletion:state.completion?.month??null,shots:state.totalShots,operations:actions.length,cash:state.cash,credits:state.credits,credit:state.credit,counters,acquired,equipment,firstTier,months,coverage}};
}
function persistRun(run:ReturnType<typeof simulate>,dir:string,profile:Profile){
 writeFileSync(dir+'.json.gz',gzipSync(JSON.stringify({profile,summary:run.summary,rows:run.rows,actions:run.actions,finalState:run.state})));
}
const profileFile=out+'/advanced-profile.json';
let advanced:Profile={collection:{},unlocked:[]};
if(existsSync(profileFile))advanced=JSON.parse(readFileSync(profileFile,'utf8')).profile;
else{
 const histories:any[]=[];
 for(let i=0;i<24;i++){
  const before=structuredClone(advanced),run=simulate(20260000+i,policies[i%policies.length],before,false,'prelude-'+i);
  if(run.summary.error)throw Error('prelude '+run.summary.error);
  persistRun(run,out+'/prelude/'+i,before);advanced=mergeProfile(advanced,{collection:run.state.collection,unlocked:run.state.commerce.unlocked});
  histories.push({seed:20260000+i,policy:policies[i%policies.length].id,actions:run.actions.length,finalHash:run.summary.finalHash});
 }
 writeFileSync(profileFile,JSON.stringify({profile:advanced,histories,hash:hash(advanced)},null,2));
}
writeFileSync(out+'/configuration.json',JSON.stringify({version,rules:rules.version,policies,routes,advancedUnlocks:advanced.unlocked,seedBase:20261022,actionLimit:10000,trainingCost:'No currency charge for training in current engine',limitations:['No selectable attribute-training action exists: targeting selects visible player stats only.','Strategies are heuristics, not optimal play; do not read bias or future RNG.','Profile derived from 24 logged legal prelude careers; not all-unlocked.','Share action models editor-open success, not real Hupu posting.']},null,2));
if(process.argv.includes('--endless')){
 mkdirSync(out+'/endless',{recursive:true});
 const index=JSON.parse(readFileSync(out+'/run-index.json','utf8')).filter((r:any)=>r.completed);
 const groups=new Map<string,any[]>();for(const row of index){const group=row.key.replace(/-\d+$/,'');groups.set(group,[...(groups.get(group)??[]),row]);}
 const selected:any[]=[];while(selected.length<100&&[...groups.values()].some(rows=>rows.length))for(const rows of groups.values()){if(rows.length&&selected.length<100)selected.push(rows.shift());}
 let continued=0;
 for(const row of selected.filter(row=>arg('policy','all')==='all'||row.policy===arg('policy','all'))){
  const data=JSON.parse(gunzipSync(readFileSync(out+'/runs-v2/'+row.key+'.json.gz')).toString());
  const run=simulate(data.summary.seed,policies.find(p=>p.id===data.summary.policy)!,data.profile,data.summary.sharing,row.key+'-endless',60,data.finalState);
  persistRun(run,out+'/endless/'+row.key,data.profile);if(run.summary.error)throw Error(run.summary.error);
  continued++;if(continued%10===0)console.log('endless '+continued+'; latest '+row.key);
 }
 console.log('endless complete '+continued+' of '+selected.length+' selected');process.exit(0);
}
const runs=Number(arg('runs','50')),from=Number(arg('from','0'));
let finished=0;
for(const policy of policies.filter(p=>arg('policy','all')==='all'||p.id===arg('policy','all')))
 for(const stage of ['new','advanced'].filter(s=>arg('stage','all')==='all'||s===arg('stage','all')))
 for(const sharing of [false,true].filter(s=>arg('sharing','all')==='all'||(s?'yes':'no')===arg('sharing','all')))
 for(let i=from;i<runs;i++){
 const key=[policy.id,stage,sharing?'share':'no-share',i].join('-'),file=out+'/runs-v2/'+key;
 if(existsSync(file+'.json.gz'))continue;
 const profile=stage==='new'?{collection:{},unlocked:[]}:advanced;
 const run=simulate(20261022+i,policy,profile,sharing,key);persistRun(run,file,profile);
 if(run.summary.error)throw Error(key+': '+run.summary.error);
 if(++finished%50===0)console.log('completed '+finished+' new runs; latest '+key);
}
console.log('batch complete');
