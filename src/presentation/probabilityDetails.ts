import {shotProbabilityInputs,type Contract,type Athlete} from '../game/contract/engine';
import {probabilities,outcomes,type ProbabilityEffect} from '../game/contract/probability';
import {equipmentName} from '../game/contract/catalog';
import {rules} from '../game/contract/rules';
const labels={severe:'重伤',minor:'轻伤',hold:'维持',success:'成功',great:'大成功'};
const fmt=(n:number)=>Number(n.toFixed(3)).toString();
export function probabilityDetails(g:Contract,athlete:Athlete,noSevere=false){
 const input=shotProbabilityInputs(g,athlete),p=input.player;
 const result=probabilities(p.level,input.effects,input.hot,input.powder,noSevere);
 const rows:{source:string;category:string;effect:string}[]=[],riskRows:typeof rows=[];
 // Preserve exactly the engine's operation and ID ordering.
 const operations=['replace','add','transfer','multiply','risk'];
 const sorted=[...input.effects].sort((a,b)=>operations.indexOf(a.op)-operations.indexOf(b.op)||a.id.localeCompare(b.id,'en'));
 const historyNames:string[]=[];
 for(const o of Object.keys(g.progress.tickets) as (keyof typeof labels)[])if(g.progress.tickets[o]){
  const sources=g.progress.ticketSources?.[o];
  historyNames.push(sources?.ids.length?sources.ids.map(equipmentName).join('、')+(sources.legacy?' / 历史积累':''):'历史全营积累');
 }
 if(g.progress.greatBank+p.history.greatTickets)historyNames.push([g.progress.greatBank?equipmentName('relic_038'):'',p.history.greatTickets?equipmentName('relic_078'):''].filter(Boolean).join('、'));
 if(p.history.successTickets){const sources=p.history.successSources;historyNames.push(sources?.ids.length?sources.ids.map(equipmentName).join('、')+(sources.legacy?' / 历史积累':''):'历史成功权重积累');}
 if(g.equipment.includes('relic_021')&&['minor','hold'].includes(p.history.previous??''))historyNames.push(equipmentName('relic_021'));
 if(g.equipment.includes('relic_023')&&p.history.previous==='hold')historyNames.push(equipmentName('relic_023'));
 const describe=(e:ProbabilityEffect)=>{
  switch(e.op){
   case 'add':return `${labels[e.outcome]}权重 ${e.value>=0?'+':''}${fmt(e.value)}`;
   case 'multiply':return `${labels[e.outcome]}权重 ×${fmt(e.value)}`;
   case 'risk':return `重伤概率 ×${fmt(e.value)}，其余按比例分配`;
   case 'transfer':return `最多 ${fmt(e.value)} 点${labels[e.from]}权重转为${labels[e.to]}`;
   case 'replace':return `基础权重替换为 ${outcomes.map(o=>e.weights[o]).join(' / ')}`;
  }
 };
 for(const e of sorted){
  const known:Record<string,string>={chalk:'镁粉',scars:equipmentName('relic_036'),thread:equipmentName('relic_015'),lightning:equipmentName('relic_051'),charm:equipmentName('relic_040')};
  const history=e.id.startsWith('history-');
  (e.op==='risk'?riskRows:rows).push({category:e.id==='chalk'?'一次性用品':history?'历史与传承':'器械',source:history?historyNames[Number(e.id.split('-').slice(-1)[0])]??'历史积累':known[e.id]??equipmentName(`relic_${e.id.padStart(3,'0')}`),effect:describe(e)});
 }
 const b=rules.reference.forging_odds.base_tickets;
 const base={severe:b.break,minor:b.damage,hold:b.hold,success:b.success,great:b.great};
 const w=result.trace[result.trace.length-1]?.weights??base;
 const curve=rules.reference.forging_odds.break_chance_percent_by_level_0_to_30;
 const risk=curve[Math.min(p.level,curve.length-1)]/100;
 rows.push({category:'等级',source:`训练 ${p.level} 级`,effect:`重伤权重 ${fmt(w.severe)} → ${fmt(w.severe*(b.damage+b.hold+b.success+b.great)*risk/(b.break*(1-risk)))}`});
 rows.push(...riskRows);
 if(input.hot)rows.push({category:'火热',source:'火热投篮',effect:'重伤概率为 0%，其他结果按比例分配'});
 if(input.powder)rows.push({category:'一次性用品',source:'训练补剂',effect:'成功与大成功合并为大成功，其余合并为重伤'});
 if(noSevere)rows.push({category:'测试设置',source:'重伤概率变 0',effect:'重伤为 0%，其余按比例分配'});
 const guard=(source:string,effect:string)=>rows.push({category:'结果保护',source,effect});
 // List ready protections in engine priority order; only the first is consumed.
 if(p.armed.includes('item_001'))guard('应急护具','抽中重伤时阻止离营；本投后消耗');
 if((g.adRewards?.shields[p.id]??0)>0)guard('回溯保护','抽中重伤时阻止离营；消耗 1 次保护');
 if(g.equipment.includes('relic_056')&&!g.commerce.monthlyRescueUsed)guard(equipmentName('relic_056'),'本月首次重伤改为轻伤');
 if(g.equipment.includes('relic_090')&&!p.traits.cornerUsed)guard(equipmentName('relic_090'),'该球员下次重伤改为轻伤');
 if(g.equipment.includes('relic_062')&&p.history.spineReady)guard(equipmentName('relic_062'),'已积蓄保护，下次重伤改为轻伤');
 if(g.equipment.includes('relic_079')&&!p.traits.phoenixUsed)guard(equipmentName('relic_079'),'阻止重伤离营，估值降低 40%');
 return {tickets:result.tickets,base,rows,level:p.level,hot:input.hot};
}
