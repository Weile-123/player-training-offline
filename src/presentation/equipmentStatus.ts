import type {Athlete,Contract} from '../game/contract/engine';
import {itemCatalog,equipmentName} from '../game/contract/catalog';
import {rules} from '../game/contract/rules';
import type {StatusSources} from '../game/contract/statusSources';

export type EquipmentState={id:string;name:string;label:string;value:string;detail:string;tone:'guard'|'charge'|'bonus'|'spent';sources?:string[];scope?:string;rule?:string;displayValue?:string;progress?:{current:number;total:number};legacySource?:boolean};
/** 只读当前领域状态；丢弃器械后已获得的永久积蓄仍显示。概率加权不是百分点。 */
export function equipmentStates(g:Contract,p?:Athlete):EquipmentState[]{
 const rows:EquipmentState[]=[],has=(n:number)=>g.equipment.includes(`relic_${String(n).padStart(3,'0')}`);
 const add=(n:number,label:string,value:string,detail:string,tone:EquipmentState['tone']='bonus')=>rows.push({id:`relic_${String(n).padStart(3,'0')}:${label}`,name:equipmentName(`relic_${String(n).padStart(3,'0')}`),sources:[`relic_${String(n).padStart(3,'0')}`],scope:'当前球员',label,value,detail,tone});
 const aggregate=(id:string,label:string,value:string,detail:string,source:StatusSources|undefined,tone:EquipmentState['tone']='bonus',scope='全队共享')=>rows.push({id,name:source?.ids.length?source.ids.map(sourceName).join(' · '):'历史累计奖励',sources:source?.ids??[],legacySource:!source||source.legacy,label,value,detail,tone,scope});
 const protection=(n:number,label:string,used:boolean,detail:string)=>{if(has(n))add(n,label,used?'已用完':'剩 1 次',detail,used?'spent':'guard');};
 protection(56,'月度保护',g.commerce.monthlyRescueUsed,'本月首次重伤改为轻伤，全队共用一次；下个月恢复。');
 if(p){
  const h=p.history,t=p.traits;
  if(p.armed.includes('item_001'))rows.push({id:'shield',name:'应急护具',sources:['item_001'],scope:'当前球员',label:'本投保护',value:'已就绪',detail:'本次出手若抽中重伤，阻止离队；出手后消耗。',tone:'guard'});
  protection(90,'首次保护',t.cornerUsed,'这名球员首次重伤改为轻伤；换一名未用过的球员可再次保护。');
  if(has(62))add(62,'轻伤护盾',h.spineReady?'已就绪':`${h.spineCount}/2`,h.spineReady?'下次重伤改为轻伤，随后重新积蓄。':'累计两次轻伤后获得一次重伤转轻伤保护。','guard');
  protection(79,'保命机会',t.phoenixUsed,'这名球员可阻止一次重伤离队，触发时估值降低40%。');
  if(has(41)||t.greatLevels)add(41,'大成功积蓄',`+${t.greatLevels}级`,'维持积蓄，最多4级；下次大成功额外升级并清空。','charge');
  if(has(32)||h.successBank)add(32,'成功积蓄',`+${h.successBank}级`,'维持积蓄，最多2级；下次成功额外升级并清空。','charge');
  if(has(47)||h.damageBank)add(47,'轻伤积蓄',`+${h.damageBank}级`,'每次轻伤存1级；下次大成功额外升级并清空。','charge');
  if(has(84))add(84,'免降级',`剩 ${Math.max(0,2-h.minorCount)} 次`,'只免除这名球员前两次轻伤的等级损失，不免除属性受损。',h.minorCount<2?'guard':'spent');
  if(has(36)||t.scars)add(36,'伤痕减伤',`${t.scars}/4层`,'每层使重伤风险降低15%，最多60%；相对于原风险计算。','guard');
  if(has(40)||h.charm)add(40,'胜利减伤',`${h.charm}/6层`,'普通状态成功或大成功积累，每层使重伤风险降低3%，最多18%。','guard');
  if(h.lightning)add(51,'下投减伤','40%','上次普通大成功激活，下次投篮重伤风险降低40%。','guard');
  if(has(15)&&h.previous==='hold')add(15,'下投减伤','20%','上次维持激活，下次投篮重伤风险降低20%。','guard');
  if(has(17))add(17,'连续维持',`${t.holds%2}/2`,'每连续两次维持额外升1级，其他结果打断计数。','charge');
  if(has(11))add(11,'节奏积累',`${(p.normalShots??0)%5}/5`,'每5次未重伤的普通出手额外增加1点手感。','charge');
  if(has(42))add(42,'连续得手',`${h.wins%2}/2`,'连续投出2次成功或大成功，额外升1级；其他结果会打断计数。','charge');
  if(has(27))add(27,'连续得手',`${h.wins%2}/2`,'连续投出2次成功或大成功，永久估值提高10%；其他结果会打断计数。','charge');
  if(has(85))add(85,'成功进度',`${h.successes%2}/2`,'累计每两次成功额外升1级。','charge');
  if(has(18))add(18,'相同结果',`${h.same%2}/2`,'连续2次投出相同结果，额外增加150估值。','charge');
  if(has(81))add(81,'相同结果',`${h.same%2}/2`,'连续2次投出相同结果，再获得一次本次最后触发的器械估值奖励；本次没有奖励则不触发。','charge');
  if(h.successTickets)aggregate('success-weight','成功机会',`权重+${h.successTickets}`,'这名球员投出成功的机会已增加；实际百分比请看投篮概率栏。',h.successSources,'bonus','当前球员');
  else if(has(59))add(59,'成功机会','权重+0','每投出一次成功，这名球员的成功权重永久增加1；实际百分比请看投篮概率栏。');
  if(has(78)||h.greatTickets)add(78,'大成功权重',`+${h.greatTickets}`,'已为这名球员积累的大成功抽签权重，不等于概率百分点。');
  if(has(21)&&(h.previous==='minor'||h.previous==='hold'))add(21,'下投大成功','权重+3','上次轻伤或维持激活，仅作用于下次投篮。');
  if(has(23)&&h.previous==='hold')add(23,'下投成功','权重+4','上次维持激活，仅作用于下次投篮。');
  if(has(49)&&h.previous==='minor')add(49,'反弹奖励','待触发','下次若成功或大成功，额外升2级。');
  if(has(7))add(7,'首次得手',p.shots===0?'待首投':'已结束','仅这名球员第一次出手成功或大成功时额外升2级。',p.shots===0?'bonus':'spent');
  if(has(48))add(48,'开场手感',t.firstNormalUsed?'已使用':'+2点','首次未重伤的普通投篮额外获得2点手感。',t.firstNormalUsed?'spent':'bonus');
  if(has(5))add(5,'升级里程碑',p.peakLevel>=96?'已完成':`下个 ${Math.max(h.milestone+1,1)*4}级`,'每首次跨越4级里程碑，永久估值增加15%。');
  if(p.armed.includes('item_003'))rows.push({id:'chalk',name:'镁粉',sources:['item_003'],scope:'当前球员',label:'下投大成功',value:'权重×2',detail:'本次出手生效，出手后消耗。',tone:'bonus'});
  if(p.armed.includes('item_004'))rows.push({id:'powder',name:'训练补剂',sources:['item_004'],scope:'当前球员',label:'极限训练',value:'已预备',detail:'下次普通投篮：成功或大成功都变为大成功，其余结果都变为重伤；出手后消耗。',tone:'bonus'});
 }
 if(g.progress.pendingLevel||g.progress.pendingHeat||g.progress.pendingSuccess)aggregate('inheritance','新人继承',`+${Math.min(rules.trainingLevelCap,g.progress.pendingLevel)}级`,`下一名上场的未训练0级球员可领取：${Math.min(rules.trainingLevelCap,g.progress.pendingLevel)}级、${g.progress.pendingHeat}点手感，以及${g.progress.pendingSuccess}点成功权重。`,g.progress.inheritanceSources,'charge');
 if(g.progress.greatBank)add(38,'下次大成功',`权重+${g.progress.greatBank}`,'本局积累的大成功权重，触发一次大成功后清空。');
 const labels={severe:'重伤',minor:'轻伤',hold:'维持',success:'成功',great:'大成功'};
 for(const key of Object.keys(labels) as (keyof typeof labels)[])if(g.progress.tickets[key])aggregate(`career-${key}`,`${labels[key]}机会`,`权重+${g.progress.tickets[key]}`,'全队投出该结果的机会已增加，本局一直保留，弃置器械也不消失。实际百分比请看概率栏。',g.progress.ticketSources?.[key]);
 if(has(43))add(43,'免费刷新',g.commerce.shop.freeUsed?'已使用':'剩 1 次','每月可免费刷新一次器材商店。',g.commerce.shop.freeUsed?'spent':'bonus');
 if(has(45))add(45,'签约奖励',g.progress.hookUsed?'已领取':(g.commerce.shop.paidRerolls>0||g.commerce.shop.freeUsed)?'已就绪':'先刷新','每月刷新商店后，首次推荐未训练的0级球员签约，额外获得1张赞助券。',g.progress.hookUsed?'spent':'bonus');
 if(has(77))add(77,'信用保护','剩 1 次','信用耗尽时恢复1点信用，器械随后消失。','guard');
 if(g.commerce.nextSupply)aggregate('reserved-supply','下月增援',`+${g.commerce.nextSupply}人`,`下个月额外加入${g.commerce.nextSupply}名新人，不占每月基础招募名额。`,g.commerce.supplySources,'bonus','下月共享');
 if(has(83))add(83,'达标积累',`${g.commerce.paidMonths}次` ,`目前为球员基础估值增加${20*g.commerce.paidMonths}；随训练等级放大。`);
 if(BigInt(g.commerce.carry)>0)add(89,'下月折抵','已保留','已积蓄超额交付折抵，最多抵扣基础指标30%；顶部指标已计入。');
 for(const row of rows){
  const n=Number(row.sources?.[0]?.slice(6));
  if([43,45,56].includes(n))row.scope='本月共享';
  if([38,77,83].includes(n))row.scope='全队共享';
  if(n===89)row.scope='下月共享';
  const fraction=row.value.match(/^(\d+)\/(\d+)/);
  if(fraction)row.progress={current:Number(fraction[1]),total:Number(fraction[2])};
  if(n===41&&p){row.displayValue=`已存 ${p.traits.greatLevels} 级`;row.progress={current:p.traits.greatLevels,total:4};row.detail=`下次投出「大成功」，额外升 ${p.traits.greatLevels} 级，然后清空积蓄。`;row.rule='每次「维持」存1级，最多存4级。';}
  if(n===32&&p){row.displayValue=`已存 ${p.history.successBank} 级`;row.progress={current:p.history.successBank,total:2};row.detail=`下次投出「成功」，额外升 ${p.history.successBank} 级，然后清空积蓄。`;row.rule='每次「维持」存1级，最多存2级；大成功不会领取这份奖励。';}
  if(n===47&&p){row.displayValue=`已存 ${p.history.damageBank} 级`;row.detail=`下次投出「大成功」，额外升 ${p.history.damageBank} 级，然后清空积蓄。`;row.rule='每次轻伤存1级，积蓄无上限；训练等级仍以99级为上限。';}
  if(n===11&&p){const count=(p.normalShots??0)%5;row.displayValue=`${count} / 5 次`;row.detail=`再完成 ${5-count} 次未重伤的普通投篮，额外获得1点手感。`;row.rule='每累计5次触发一次；火热投篮不计入。';}
  if(n===43){row.detail=g.commerce.shop.freeUsed?'本月的免费刷新已用完，下个月恢复。':'本月还能免费刷新1次器材商店，无需支付经费。';row.rule='每月恢复1次，所有球员共用。';}
  if(n===84&&p){const left=Math.max(0,2-p.history.minorCount);row.displayValue=left?`剩 ${left} 次`:'已用完 · 剩0次';row.detail=left?`这名球员还有 ${left} 次轻伤不降级的机会。`:'这名球员的2次免降级保护已用完。';row.rule='每名球员前2次轻伤不掉等级，属性仍会受损。';}
  if(row.legacySource)row.rule='旧存档未记录全部奖励来源，历史合计仍然有效。';
 }
 return rows.sort((a,b)=>({guard:0,charge:1,bonus:2,spent:3}[a.tone]-{guard:0,charge:1,bonus:2,spent:3}[b.tone]));
}

export const sourceName=(id:string)=>itemCatalog.find(item=>item.id===id)?.name??equipmentName(id);
