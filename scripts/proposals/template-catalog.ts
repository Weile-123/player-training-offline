/** Offline draft only. No application entry point imports this module. */
import type {TemplateRule} from '../../src/game/contract/templates';
import type {TemplateTier,Position} from '../../src/game/templates';
import {statKeys,type Stats,type StatKey} from '../../src/game/types';
import {rules} from '../../src/game/contract/rules';
export type DraftRule=TemplateRule&{specialistKeys?:StatKey[];ratingFloor?:number;statFloor?:number};
const stats=(values:number[])=>Object.fromEntries(statKeys.map((k,i)=>[k,values[i]])) as Stats;
const newRows:[string,string,TemplateTier,Position,[number,number],StatKey[],number[]][]=[
 ['shannon-brown','香农·布朗','rotation','SG',[178,201],['drive','inside'],[65,50,88,86,55,45]],
 ['corey-maggette','科里·马盖蒂','starter','SF',[185,210],['drive','inside'],[55,75,94,92,68,52]],
 ['monta-ellis','蒙塔·埃利斯','starter','SG',[178,201],['mid','drive'],[62,88,96,70,88,48]],
 ['al-jefferson','艾尔·杰弗森','star','C',[198,218],['mid','inside'],[10,92,42,97,44,68]],
 ['andre-miller','安德烈·米勒','starter','PG',[178,201],['mid','handle'],[25,86,68,65,96,64]],
 ['steve-francis','史蒂夫·弗朗西斯','star','PG',[178,201],['drive','handle'],[60,70,97,83,96,58]],
 ['boris-diaw','鲍里斯·迪奥','starter','PF',[193,213],['inside','handle'],[55,65,58,86,92,72]],
 ['greg-monroe','格雷格·门罗','starter','C',[203,218],['inside','handle'],[12,65,52,92,82,58]],
];
export const proposedNewIds=newRows.map(r=>r[0]);
const changes:Record<string,TemplateTier>={'ray-allen':'superstar','reggie-miller':'superstar',pippen:'superstar',bryant:'legend',durant:'legend','pau-gasol':'star'};
const cores:Record<string,StatKey[]>={
 'ray-allen':['three','mid'],'reggie-miller':['three','mid'],pippen:['defense','handle','drive'],bryant:['mid','drive','handle'],durant:['mid','three','drive'],'pau-gasol':['inside','mid'],
 gordon:['drive','inside'],derozan:['mid','drive'],aldridge:['mid','inside'],livingston:['mid','handle'],'derrick-rose':['drive','handle'],jokic:['inside','handle'],
};
export function proposalCatalog(base:readonly TemplateRule[],includeNew:boolean):DraftRule[]{
 const rows:DraftRule[]=structuredClone([...base]);
 if(includeNew)for(const [id,name,tier,position,height,keys,values]of newRows)rows.push({id,name,englishName:id,tier,position,height,stats:stats(values),style:keys.join('+'),minLevel:0,coreMinimums:{},enter:.7,evidence:'basketball_design',reviewed:false,reviewScope:'mechanics',balanceReviewed:false,specialistKeys:keys});
 for(const t of rows){
  t.tier=changes[t.id]??t.tier;
  const tier=rules.tiers.find(r=>r.id===t.tier)!;
  const keys=cores[t.id]??t.specialistKeys;
  t.minLevel=tier.level;
  if(keys){t.coreMinimums=Object.fromEntries(keys.map(k=>[k,Math.ceil(t.stats[k]*tier.coreRatio)]));if(keys.length===2){t.specialistKeys=keys;t.enter=.7;}}
  if(t.id==='jordan'){t.coreMinimums={mid:90,drive:90,defense:90};t.ratingFloor=80;t.statFloor=60;}
  if(t.id==='lebron'){t.coreMinimums={drive:90,inside:90,handle:88};t.ratingFloor=80;t.statFloor=65;}
  if(t.id==='bird'){t.coreMinimums={three:90,mid:90,handle:86};t.ratingFloor=80;t.statFloor=60;}
 }
 return rows;
}
export function draftAptitude(actual:Stats,t:DraftRule,fallback:number){
 if(!t.specialistKeys)return fallback;
 const keys=t.specialistKeys,other=statKeys.filter(k=>!keys.includes(k));
 const score=(list:StatKey[])=>list.reduce((sum,k)=>sum+(t.stats[k]<=0?1:Math.min(1,actual[k]/t.stats[k])),0)/list.length;
 return .7*score(keys)+.3*score(other);
}
export function draftReasons(actual:Stats,t:DraftRule){
 const reasons:string[]=[];
 if(t.ratingFloor!==undefined&&statKeys.reduce((s,k)=>s+actual[k],0)/6<t.ratingFloor)reasons.push('rating-floor');
 if(t.statFloor!==undefined&&statKeys.some(k=>actual[k]<t.statFloor!))reasons.push('stat-floor');
 return reasons;
}
