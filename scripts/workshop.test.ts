import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {newGame,seededRandom} from '../src/game/engine';
import {config} from '../src/game/config';
import type {Game} from '../src/game/types';
afterEach(()=>{vi.unstubAllGlobals();vi.doUnmock('../src/store');});
async function render(game:Game,section:'assets'|'equipment'|'supplies'){
 vi.resetModules();
 vi.doMock('../src/store',()=>({useGame:()=>({game})}));
 const {Workshop}=await import('../src/components/Workshop');
 return renderToStaticMarkup(createElement(Workshop,{initialSection:section}));
}
describe('live comic workshop',()=>{
 it('shows all five real upgrade paths, cash and income without using concept benefits',async()=>{
  const game={...newGame(seededRandom(2)),cash:123456};game.assetLevels.rental=2;
  const html=await render(game,'assets');
  expect(html).toContain('$123,456');expect(html).toContain('$24,000');
  for(const asset of config.assets.catalog){expect(html).toContain(asset.name);expect(html).toContain(asset.description);}
  expect(html).not.toContain('加快球员伤病恢复');expect(html).not.toContain('提高发掘潜力新人的概率');
 });
 it('uses the actual equipment catalogue and distinguishes owned/equipped/purchasable items',async()=>{
  const game={...newGame(seededRandom(2)),cash:200000,ownedEquipment:['shoes','brace'],equippedEquipment:['shoes']};
  const html=await render(game,'equipment');
  for(const item of config.equipment.catalog){expect(html).toContain(item.name);expect(html).toContain(item.description);}
  expect(html).toContain('已装备 · 卸下');expect(html).toContain('装配');expect(html).toContain('购买');
  expect(html).not.toContain('提升移动速度');
 });
 it('shows real consumable stock, unit prices, quantity choices, and static artwork',async()=>{
  const game=newGame(seededRandom(2));game.consumables={drink:7,ice:4};
  const html=await render(game,'supplies');
  for(const text of ['库存 7/99','库存 4/99','$2,500','$3,500','×10'])expect(html).toContain(text);
 });
 it('reuses inline icons without loading retired workshop images',async()=>{
  const html=await render(newGame(seededRandom(2)),'assets');
  expect(html).toContain('<svg');expect(html).not.toContain('art/workshop/');
 });
});
