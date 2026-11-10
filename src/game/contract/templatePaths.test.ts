import {describe,it,expect} from 'vitest';
import paths from './fixtures/template-paths.json';
import {templateRules} from './templates';
import {replayTemplateWitness,type TemplateWitness} from './templateWitness';

// Every production template has a replayed pre-30 witness, including all-round legends.

describe('119 个模板的真实新局培养路径',()=>{
 it('正式模板逐项有路径，不允许用静态画像或注入装备替代',()=>{
  expect(Object.keys(paths).sort()).toEqual(templateRules.map(t=>t.id).sort());
 });
 for(const t of templateRules)it(`${t.name}：默认规则、实际交易、中途存读档与解锁事件`,()=>{
  const witness=(paths as unknown as Record<string,TemplateWitness>)[t.id];
  expect(witness,`缺失 ${t.id} 培养路径`).toBeDefined();
  const result=replayTemplateWitness(t.id,witness);
  expect(result.acquisition.peakLevel).toBeGreaterThanOrEqual(t.minLevel);
  expect(result.acquisition.peakLevel,'已验证的30级前路径不得回退').toBeLessThan(30);
  expect(result.acquisition.height).toBeGreaterThanOrEqual(t.height[0]);
  expect(result.acquisition.height).toBeLessThanOrEqual(t.height[1]);
 });
});
