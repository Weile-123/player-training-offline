import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {aptitude,match,shape,templateRules} from '../src/game/contract/templates';
import {replayTemplateWitness,type TemplateWitness} from '../src/game/contract/templateWitness';
import {rules} from '../src/game/contract/rules';
import {statKeys,type Stats} from '../src/game/types';

/** Fails closed: missing or stale paths must never be reported as full coverage. */
export function auditTemplates(out:string,witnessPath='src/game/contract/fixtures/template-paths.json',beforeLevel?:number){
 if(beforeLevel!==undefined&&(!Number.isSafeInteger(beforeLevel)||beforeLevel<2||beforeLevel>100))throw new Error('无效等级上界');
 mkdirSync(out,{recursive:true});
 const witnesses=JSON.parse(readFileSync(witnessPath,'utf8')) as Record<string,TemplateWitness>;
 const failures:string[]=[],full=Object.fromEntries(statKeys.map(k=>[k,99])) as Stats;
 const rows=templateRules.map(t=>{
  const tier=rules.tiers.find(v=>v.id===t.tier)!;
  const problems:string[]=[];
  if(!tier||t.minLevel!==tier.level||t.height[0]<178||t.height[1]>218||t.height[0]>t.height[1]||t.enter<0||t.enter>1)problems.push('invalid-rule');
  if(statKeys.some(k=>!Number.isInteger(t.stats[k])||t.stats[k]<0||t.stats[k]>99))problems.push('invalid-stats');
  if(Object.entries(t.coreMinimums).some(([k,v])=>!Number.isInteger(v)||v<0||v>t.stats[k as keyof Stats]))problems.push('invalid-core');
  for(const height of [t.height[0],Math.round((t.height[0]+t.height[1])/2),t.height[1]]){
   const p={level:t.minLevel,height,stats:t.stats,templateId:null,matchSeed:1,lastStyle:shape(t.stats)};
   if(match(p).templateId!==t.id||match(p,[...templateRules].reverse()).templateId!==t.id)problems.push(`self-match-${height}`);
  }
  let replay:ReturnType<typeof replayTemplateWitness>|null=null;
  try{if(!witnesses[t.id])throw new Error('missing-path');replay=replayTemplateWitness(t.id,witnesses[t.id]);}catch(e){problems.push(String(e));}
  if(replay&&beforeLevel!==undefined&&replay.acquisition.peakLevel>=beforeLevel)problems.push(`acquired-at-${replay.acquisition.peakLevel}-not-before-${beforeLevel}`);
  for(const key of statKeys){let previous=-1;for(let n=0;n<=99;n++){
   const score=aptitude({...t.stats,[key]:n},t.stats);if(score<previous)problems.push(`non-monotone-${key}-${n}`);previous=score;
  }}
  if(problems.length)failures.push(`${t.id}: ${problems.join(',')}`);
  return {id:t.id,name:t.name,tier:t.tier,minLevel:t.minLevel,height:t.height,position:t.position,stats:t.stats,coreMinimums:t.coreMinimums,aptitudeThreshold:t.enter,problems,replay};
 });
 let heightTierCases=0;
 for(let height=178;height<=218;height++)for(const tier of rules.tiers){
  const r=match({level:tier.level,height,stats:full,templateId:null,matchSeed:1,lastStyle:shape(full)});
  heightTierCases++;if(r.tier!==tier.id)failures.push(`height-tier-gap:${height}/${tier.id}`);
 }
 if(new Set(templateRules.map(t=>t.id)).size!==templateRules.length||rows.length!==119)failures.push('catalog-size');
 const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
 const levelCoverage={beforeLevel:beforeLevel??30,verified:rows.filter(r=>r.replay&&r.replay.acquisition.peakLevel<(beforeLevel??30)).length,total:rows.length,
  laterWitnesses:rows.filter(r=>r.replay&&r.replay.acquisition.peakLevel>=(beforeLevel??30)).map(r=>({id:r.id,name:r.name,peakLevel:r.replay!.acquisition.peakLevel})),
  note:'统计可重放见证的历史最高等级，不是最早可达等级；未找到早期路径不能证明不可达。'};
 const report={levelCoverage,ruleVersion:'specialist-branches-v2',rulesSha256:digest({rules,templateRules}),pathsSha256:digest(witnesses),templates:rows.length,replayed:rows.filter(r=>r.replay).length,heightTierCases,monotoneCases:rows.length*6*100,complete:failures.length===0,failures,scope:['119 个模板逐项配置、自画像、身高边界与正式动作培养路径。','路径从无装备新局开始；物品、器械和资金仅通过正式动作获得，默认成长和概率，无测试注入。','属性逐项增长不降低适配度；受伤仍降低实际战力，已经获得的模板身份保留。','覆盖不取消等级、身高、核心属性或适配度要求，也不代表每局必定取得全部模板。','部分路径由离线分支前瞻搜索找到；确定性见证证明可达，不用于估算自然收藏概率或宣称数值平衡已完结。'],rows};
 writeFileSync(resolve(out,'template-audit.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({complete:report.complete,levelCoverage,templates:rows.length,replayed:report.replayed,heightTierCases,failures,report:resolve(out,'template-audit.json')},null,2));
 if(failures.length)process.exitCode=1;
 return report;
}
