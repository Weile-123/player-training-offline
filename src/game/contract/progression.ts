import type { Athlete, Contract, Event } from './engine';
import type { Outcome } from '../types';
import { statKeys } from '../types';
import type { ProbabilityEffect } from './probability';
import { add, fraction, levelFactor, multiply, type Fraction } from './money';
import { random } from './random';
import {rules} from './rules';
import {addStatusSource,type StatusSources} from './statusSources';

export const freshHistory = () => ({ previous: null as Outcome|null, same:0, wins:0, successes:0, minorCount:0, spineCount:0, spineReady:false, successBank:0, damageBank:0, successTickets:0, greatTickets:0, charm:0, lightning:false, milestone:0 });
export const freshProgress = () => ({ broken:0, frenzies:0, overtime:0, hookUsed:false, extraSupply:0, pendingLevel:0, pendingHeat:0, pendingSuccess:0, greatBank:0, tickets:{severe:0,minor:0,hold:0,success:0,great:0} });
export type History=ReturnType<typeof freshHistory>&{successSources?:StatusSources};
export type Progress=ReturnType<typeof freshProgress>&{inheritanceSources?:StatusSources;ticketSources?:Partial<Record<Outcome,StatusSources>>};
const has=(s:Contract,n:number)=>s.equipment.includes(`relic_${String(n).padStart(3,'0')}`);
export function inherit(s:Contract,p:Athlete,consume:boolean) {
 if(p.shots!==0||p.level!==0)return;
 p.level=Math.min(rules.trainingLevelCap,p.level+s.progress.pendingLevel); p.heat=Math.min(10,p.heat+s.progress.pendingHeat);
 if(s.progress.pendingSuccess)p.history.successSources=addStatusSource(p.history.successSources,'relic_028',p.history.successTickets);
 p.history.successTickets+=s.progress.pendingSuccess;
 if(consume){s.progress.pendingLevel=0;s.progress.pendingHeat=0;s.progress.pendingSuccess=0;delete s.progress.inheritanceSources;}
}
export function historyOdds(s:Contract,p:Athlete):ProbabilityEffect[] {
 const h=p.history, list:ProbabilityEffect[]=[];
 const weight=(key:Outcome,value:number)=>{if(value)list.push({id:`history-${key}-${list.length}`,op:'add',outcome:key,value});};
 for(const key of Object.keys(s.progress.tickets) as Outcome[])weight(key,s.progress.tickets[key]);
 weight('great',s.progress.greatBank+h.greatTickets);weight('success',h.successTickets);
 if(has(s,21)&&(h.previous==='minor'||h.previous==='hold'))weight('great',3);
 if(has(s,23)&&h.previous==='hold')weight('success',4);
 if(has(s,15)&&h.previous==='hold')list.push({id:'thread',op:'risk',value:.8});
 if(h.lightning)list.push({id:'lightning',op:'risk',value:.6});
 if(h.charm)list.push({id:'charm',op:'risk',value:1-h.charm*.03});
 return list;
}
export function onBreak(s:Contract,p:Athlete) {
 s.progress.broken++;
 const previousInheritance=s.progress.pendingLevel+s.progress.pendingHeat+s.progress.pendingSuccess;
 for(const n of [28,34,76])if(has(s,n)&&(n===28?p.level>=4:p.level>0))s.progress.inheritanceSources=addStatusSource(s.progress.inheritanceSources,`relic_${String(n).padStart(3,'0')}`,previousInheritance);
 if(has(s,28)&&p.level>=4)s.progress.pendingSuccess+=4;
 const percent=(has(s,34)?30:0)+(has(s,76)?40:0);
 if(percent&&p.level>0){s.progress.pendingLevel+=Math.floor(p.level*percent/100);s.progress.pendingHeat=Math.min(10,s.progress.pendingHeat+(has(s,34)?3:0)+(has(s,76)?4:0));}
 if(has(s,38))s.progress.greatBank+=p.level;
 if(has(s,65)&&p.level>=7&&p.history.previous){const key=p.history.previous;s.progress.ticketSources??={};s.progress.ticketSources[key]=addStatusSource(s.progress.ticketSources[key],'relic_065',s.progress.tickets[key]);s.progress.tickets[key]++;}
 if(has(s,94)&&p.level>=7&&s.progress.extraSupply<2){s.progress.extraSupply++;s.commerce.supplySources=addStatusSource(s.commerce.supplySources,'relic_094',s.commerce.nextSupply);s.commerce.nextSupply++;}
}
/** 固定编号顺序派发价值奖励；复刻只重复最后一个本次奖励，不递归触发。组合顺序为明示适配。 */
export function survivingEffects(s:Contract,p:Athlete,outcome:Outcome,hot:boolean,before:number,base:Fraction,blocked:boolean,spineUsed:boolean) {
 const h=p.history, previous=h.previous, win=outcome==='success'||outcome==='great';
 h.lightning=false;
 if(blocked){h.previous='severe';h.same=0;h.wins=0;return;}
 h.same=previous===outcome?h.same+1:1;h.wins=win?h.wins+1:0;
 if(win){
  if(has(s,7)&&p.shots===1)p.level+=2;
  if(has(s,42)&&h.wins%2===0)p.level++;
  if(has(s,49)&&previous==='minor')p.level+=2;
  if(has(s,61)&&random(s.rng.economy)<.25)p.level++;
  if(has(s,40)&&!hot)h.charm=Math.min(6,h.charm+1);
 }
 if(outcome==='success'){
  p.level+=h.successBank;h.successBank=0;h.successes++;
  if(has(s,85)&&h.successes%2===0)p.level++;
  if(has(s,59)){h.successSources=addStatusSource(h.successSources,'relic_059',h.successTickets);h.successTickets++;}
 }
 if(outcome==='great'){
  p.level+=h.damageBank;h.damageBank=0;s.progress.greatBank=0;
  if(has(s,52)&&!hot)p.level++;
  if(has(s,51)&&!hot)h.lightning=true;
 }
 if(outcome==='hold'){
  if(has(s,32))h.successBank=Math.min(2,h.successBank+1);
  if(has(s,78))h.greatTickets++;
  if(has(s,53)&&random(s.rng.economy)<.7)p.level++;
  if(has(s,22)&&!hot&&random(s.rng.economy)<.5)p.heat=Math.min(10,p.heat+1);
 }
 if(outcome==='minor'){
  h.minorCount++;
  if(has(s,84)&&h.minorCount<=2&&before>0)p.level++;
  if(has(s,55)&&random(s.rng.economy)<.7)p.level++;
  if(has(s,47))h.damageBank++;
  if(has(s,62)&&!spineUsed&&!h.spineReady){h.spineCount++;if(h.spineCount>=2){h.spineReady=true;h.spineCount=0;}}
 }
 p.level=Math.min(rules.trainingLevelCap,p.level);
 const rewards:{id:number;run:()=>void}[]=[];
 const flat=(id:number,v:Fraction)=>{if(has(s,id))rewards.push({id,run:()=>{p.book.flat=add(p.book.flat,v);}});};
 const growBase=(id:number,n:number)=>{if(has(s,id))rewards.push({id,run:()=>{p.book.base=add(p.book.base,fraction(n));}});};
 const mult=(id:number,n:number,d:number)=>{if(has(s,id))rewards.push({id,run:()=>{p.book.permanent=multiply(p.book.permanent,fraction(n,d));}});};
 if(has(s,5)&&p.level>=4){const milestone=Math.floor(p.level/4);for(let n=h.milestone;n<milestone;n++)mult(5,115,100);h.milestone=Math.max(h.milestone,milestone);}
 if(outcome==='hold'){flat(8,fraction(180));mult(24,106,100);growBase(86,40);}
 if(win)flat(9,fraction(100));
 if(outcome==='minor'){
  flat(13,fraction(140));flat(29,multiply(multiply(base,levelFactor(before)),fraction(5,100)));
  // 等级保护阻止损失时不发损失补偿；反弹加级不能抹掉此前实际发生的损失。
  if(before>0&&!(has(s,84)&&h.minorCount<=2))flat(35,multiply(multiply(base,add(levelFactor(before),multiply(levelFactor(before-1),fraction(-1)))),fraction(1,2)));
 }
 if(h.same%2===0)flat(18,fraction(150));
 if(win&&h.wins%2===0)mult(27,110,100);
 if(outcome==='great')mult(46,120,100);
 if(previous&&previous!==outcome)growBase(54,20);
 if(outcome==='success')growBase(64,30);
 if(hot)mult(69,105,100);
 if(win&&before>=7)mult(92,115,100);
 rewards.sort((a,b)=>a.id-b.id);for(const reward of rewards)reward.run();
 if(has(s,81)&&h.same%2===0)rewards[rewards.length-1]?.run();
 h.previous=outcome;
}

/** 篮球替代剑系：达到20级且满足风格门槛；不改变NBA模板或经济倍率。 */
export const masteryRules = [
 {id:'relic_090',label:'防守专家',test:(p:Athlete)=>p.stats.defense>=85},
 {id:'relic_076',label:'全能导师',test:(p:Athlete)=>statKeys.every(k=>p.stats[k]>=75)},
 {id:'relic_085',label:'突破专家',test:(p:Athlete)=>p.stats.drive>=85},
 {id:'relic_092',label:'篮下专家',test:(p:Athlete)=>p.stats.inside>=85},
 {id:'relic_087',label:'远投专家',test:(p:Athlete)=>p.stats.three>=85},
 {id:'relic_093',label:'双能导师',test:(p:Athlete)=>p.stats.three>=80&&p.stats.drive>=80},
 {id:'relic_086',label:'组织专家',test:(p:Athlete)=>p.stats.handle>=85},
 {id:'relic_084',label:'中投专家',test:(p:Athlete)=>p.stats.mid>=85},
 {id:'relic_094',label:'防守组织者',test:(p:Athlete)=>p.stats.defense>=80&&p.stats.handle>=80},
];
export const unlockDescriptions:Record<string,string>={
 relic_075:'本局重伤离营10人',relic_080:'完成第21月合同',relic_095:'本局进入火热5次',relic_089:'单月交付达到实际指标3倍',relic_077:'仅剩1信用时达标',relic_082:'一次球探来访买空全部库存',relic_098:'完成合同后再达标3次',
 ...Object.fromEntries(masteryRules.map((r,i)=>[r.id,`训练达到+20；${['防守≥85','六维全部≥75','突破≥85','篮下≥85','三分≥85','三分与突破均≥80','控球≥85','中投≥85','防守与控球均≥80'][i]}（篮球适配）`])),
};
export function unlock(s:Contract,id:string,events:Event[]) {if(!s.commerce.unlocked.includes(id)){s.commerce.unlocked.push(id);events.push({type:'equipment-unlock',itemId:id});}}
export function checkProgress(s:Contract,events:Event[]) {
 if(s.progress.broken>=10)unlock(s,'relic_075',events);
 if(s.progress.frenzies>=5)unlock(s,'relic_095',events);
 if(s.completed)unlock(s,'relic_080',events);
 if(s.progress.overtime>=3)unlock(s,'relic_098',events);
 for(const p of s.players)if(p.level>=20)for(const rule of masteryRules)if(rule.test(p))unlock(s,rule.id,events);
}
