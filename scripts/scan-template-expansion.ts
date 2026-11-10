import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {templateRules,match,shape,type TemplateRule} from '../src/game/contract/templates';
import {dispatch,newContract,type Action} from '../src/game/contract/engine';
import {statKeys,type Stats} from '../src/game/types';
import baseline from './fixtures/pre-expansion-catalog.json';
const out='output/contract/template-expansion';mkdirSync(out,{recursive:true});
const write=(name:string,data:unknown)=>writeFileSync(`${out}/${name}.json`,JSON.stringify(data,null,2)+'\n');
const catalogs={baseline:baseline as TemplateRule[],expanded:templateRules};
const scan:Record<string,unknown>={};
for(const [stage,catalog]of Object.entries(catalogs)){
 const groups:Record<string,{cases:number;standard:number;fallback:number;unmatched:number;weak:number}>={};
 const extremeMissing:unknown[]=[];
 for(let mask=1;mask<63;mask++){
  const count=statKeys.filter((_,i)=>mask&(1<<i)).length;if(count>3)continue;
  const group=groups[count]??={cases:0,standard:0,fallback:0,unmatched:0,weak:0};
  for(const high of [80,90,99])for(const low of [25,35,45])for(const level of [10,18,29])for(let height=178;height<=218;height++){
   const stats=Object.fromEntries(statKeys.map((k,i)=>[k,mask&(1<<i)?high:low])) as Stats;
   const r=match({stats,height,level,templateId:null,matchSeed:17,lastStyle:shape(stats)},catalog),row=r.rows.find(x=>x.id===r.templateId);
   group.cases++;if(!row)group.unmatched++;else if(row.reasons.includes('specialist-entry'))group.fallback++;else group.standard++;
   if(row&&r.similarity<.6)group.weak++;
   if(count===2&&high===99&&low===25&&level===29&&!row)extremeMissing.push({height,keys:statKeys.filter((_,i)=>mask&(1<<i))});
  }
 }
 scan[stage]={groups,extremeMissing};console.log(`${stage}: grid complete`);
}
write('grid-scan',scan);
const runs=1000,seed=70261022,simulations:Record<string,unknown>={};
let referenceDigest='';
for(const [stage,catalog]of Object.entries(catalogs)){
 const counts=Object.fromEntries(catalog.map(t=>[t.id,0])),minimumPeak:Record<string,number>={};
 const hash=createHash('sha256');let shots=0,departed=0;
 for(let n=0;n<runs;n++){
  for(const main of ['p1','p2','p3']){
   let state=newContract(seed+n);const gift:Action={type:'buy-equipment',id:state.commerce.shop.offers[0]};
   const first=dispatch(state,state.revision,gift,{catalog});if(first.error)throw Error(first.error);state=first.state;
   for(let step=0;step<160;step++){
    const p=state.players.find(p=>p.id===main);if(!p||p.peakLevel>=29)break;
    const r=dispatch(state,state.revision,{type:'train',playerId:main},{catalog});if(r.error)throw Error(r.error);state=r.state;shots++;
    for(const e of r.events)if(e.type==='unlock'&&e.templateId){counts[e.templateId]++;const peak=state.players.find(p=>p.id===e.playerId)!.peakLevel;minimumPeak[e.templateId]=Math.min(minimumPeak[e.templateId]??Infinity,peak);}
   }
   if(!state.players.some(p=>p.id===main))departed++;
   hash.update(JSON.stringify({rng:state.rng,shots:state.totalShots,players:state.players.map(p=>({id:p.id,stats:p.stats,level:p.level,peak:p.peakLevel}))}));
  }
  if((n+1)%250===0)console.log(`${stage}: ${n+1}/${runs} seeds`);
 }
 const digest=hash.digest('hex');if(referenceDigest&&digest!==referenceDigest)throw Error('Growth/RNG differed between catalogs');referenceDigest=digest;
 simulations[stage]={runs,seed,careers:runs*3,shots,departed,counts,minimumPeak,growthDigest:digest};
}
write('fixed-policy-simulation',{scope:'Fixed policy without lookahead; first free gift, train each initial recruit in a separate career until departure or peak29. Not a global acquisition probability estimate.',...simulations});
console.log('Grid and fixed-policy comparison saved.');
