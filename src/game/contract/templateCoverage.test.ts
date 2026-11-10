import {describe,it,expect} from 'vitest';
import {aptitude,match,shape,templateRules} from './templates';
import {statKeys,type Stats} from '../types';
import {rules} from './rules';

const uniform=(n:number)=>Object.fromEntries(statKeys.map(k=>[k,n])) as Stats;
const input=(t:typeof templateRules[number],stats:Stats=t.stats)=>({level:t.minLevel,peakLevel:t.minLevel,height:Math.round((t.height[0]+t.height[1])/2),stats,templateId:null,matchSeed:17,lastStyle:shape(t.stats)});
describe('全部模板与后期成长覆盖',()=>{
 it('119 个标准画像均取得自身模板，含两端身高和列表逆序',()=>{
  expect(templateRules).toHaveLength(119);
  expect(new Set(templateRules.map(t=>t.id)).size).toBe(119);
  for(const t of templateRules){
   for(const height of [t.height[0],Math.round((t.height[0]+t.height[1])/2),t.height[1]]){
    const p={...input(t),height};
    expect(match(p).templateId,`${t.id}/${height}`).toBe(t.id);
    expect(match(p,[...templateRules].reverse()).templateId).toBe(t.id);
   }
  }
 });
 it('每个维度从 0 到 99 逐点增长，适配度均不会下降',()=>{
  for(const t of templateRules)for(const key of statKeys){
   let previous=-1;
   for(let n=0;n<=99;n++){
    const score=aptitude({...t.stats,[key]:n},t.stats);
    expect(score,`${t.id}/${key}/${n}`).toBeGreaterThanOrEqual(previous);
    expect(score).toBeLessThanOrEqual(1);previous=score;
   }
  }
 });
 it('取得资格后任意单项或全项成长至封顶，首次获取资格不丢失',()=>{
  for(const t of templateRules){
   const base=Object.fromEntries(statKeys.map(k=>[k,Math.max(Math.ceil(t.stats[k]*t.enter),t.coreMinimums[k]??0,t.statFloor??0,t.ratingFloor??0)])) as Stats;
   // Test each candidate's eligibility independently of the earned-appearance fallback.
   for(let n=0;n<=99;n+=3)for(const key of [...statKeys,'all']){
    const stats=Object.fromEntries(statKeys.map(k=>[k,Math.min(99,base[k]+(key==='all'||key===k?n:0))])) as Stats;
    const r=match({...input(t,stats),level:99,peakLevel:99},[t]).rows.find(r=>r.id===t.id)!;
    expect(r.eligible,`${t.id}/${key}/${n}`).toBe(true);
   }
  }
 });
 it('178–218 每个整数身高、五个档位、封顶风格均有该档可获取模板',()=>{
  for(let height=178;height<=218;height++)for(const tier of rules.tiers){
   for(const lastStyle of [shape(uniform(99)),...statKeys.map(key=>shape({...uniform(0),[key]:99}))]){
    const result=match({level:tier.level,height,stats:uniform(99),templateId:null,matchSeed:7,lastStyle});
    expect(result.tier,`${height}/${tier.id}`).toBe(tier.id);
    expect(result.rows.filter(r=>r.eligible&&r.tier===tier.id).length).toBeGreaterThan(0);
   }
  }
 });
 it('每个已获得模板在严重偏科、全满、全空和受伤降级后保持身份',()=>{
  for(const t of templateRules)for(const stats of [uniform(0),uniform(99),...statKeys.map(key=>({...uniform(0),[key]:99}))]){
   const result=match({...input(t,stats),level:0,templateId:t.id});
   expect(result.templateId,t.id).toBe(t.id);
   expect(result.retained).toBe(true);
  }
 });
 it('新球员仍需满足等级、身高和核心要求，不因覆盖保证直接送模板',()=>{
  for(const t of templateRules){
   expect(match({...input(t),level:0,peakLevel:0}).templateId).toBeNull();
   expect(match(input(t,uniform(0))).templateId).toBeNull();
   const row=match({...input(t),height:t.height[0]-1}).rows.find(r=>r.id===t.id)!;
   expect(row.reasons).toContain('height');
  }
 });
 it('双项封顶的偏科球员在所有可生成身高都有身份，不越级送高档模板',()=>{
  const stats={three:28,mid:55,drive:99,inside:99,handle:36,defense:43};
  for(let height=178;height<=218;height++){
   const result=match({level:33,height,stats,templateId:null,matchSeed:17,lastStyle:shape(stats)});
   expect(result.templateId,`截图属性 / ${height}`).not.toBeNull();
   expect(['rotation','starter','star']).toContain(result.tier);
   expect(result.rows.find(r=>r.id===result.templateId)!.reasons).not.toContain('specialist-entry');
   expect(match({level:33,height,stats,templateId:null,matchSeed:17,lastStyle:shape(stats)},[...templateRules].reverse()).templateId).toBe(result.templateId);
  }
  const early=match({level:1,height:178,stats,templateId:null,matchSeed:17,lastStyle:shape(stats)});
  expect(early.templateId).toBeNull();
 });
});
