import {createElement} from 'react';
import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {MatchingRequirements} from './CollectionAlbum';
import {templateRules} from '../game/contract/templates';

describe('collection matching routes',()=>{
 it('shows the normal and specialist routes as alternatives, with one instruction and no removed footer',()=>{
  const template=templateRules.find(t=>t.id==='caruso')!;
  const html=renderToStaticMarkup(createElement(MatchingRequirements,{template}));
  expect(html).toContain('两条路线，满足任意一条即可。');
  expect(html).toContain('常规路线');expect(html).toContain('专长路线');expect(html).toContain('<span>或</span>');
  expect(html).not.toContain('等级与身高要求不变');expect(html).not.toContain('重点两项');expect(html).not.toContain('强项突出');
  expect(html.match(/class="album-route-intro"/g)).toHaveLength(1);
 });
 it('supports every template without inventing a specialist route or hiding extra routes',()=>{
  for(const template of templateRules){
   const html=renderToStaticMarkup(createElement(MatchingRequirements,{template}));
   expect(html.match(/class="album-thresholds"/g)?.length).toBe(1+(template.branches?.length??0));
   if(!template.branches?.length){expect(html).not.toContain('专长路线');expect(html).toContain('满足以下条件，即可参与匹配。');}
   for(const route of [template,...(template.branches??[])]){
    expect(html).toContain(`${Math.round(route.enter*100)}<em>%</em>`);
    for(const minimum of Object.values(route.coreMinimums))expect(html).toContain(`</i>${minimum}</strong>`);
   }
   if(template.ratingFloor!==undefined){expect(html).toContain(`综合评分 ≥ ${template.ratingFloor}`);expect(html).toContain(`每项属性 ≥ ${template.statFloor}`);}
  }
 });
});
