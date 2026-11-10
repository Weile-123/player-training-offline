import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {PlayerTemplatePanel} from './PlayerTemplatePanel';
import {createTutorial} from '../presentation/tutorial';
import {displayPlayer} from './ContractGame';
import type {ShotFeedback} from '../presentation/feedback';
vi.mock('../platform/usePlayerProfile',()=>({usePlayerProfile:()=>null}));
describe('当前投篮属性颜色',()=>{
 it('新一投只保留本次变化，未变化属性恢复中性色',()=>{
  const player=displayPlayer(createTutorial().game.players[0]);
  const feedback=(changes:ShotFeedback['changes']):ShotFeedback=>({id:1,player,outcome:'success',changes,levelGain:1,heatGain:1,saleIncome:0,message:'',evolution:null});
  const colors=(f:ShotFeedback|null)=>[...renderToStaticMarkup(createElement(PlayerTemplatePanel,{player,feedback:f,disabled:false,reduced:true,onDetails:()=>{}})).matchAll(/class="counting-number (\w+)"/g)].map(m=>m[1]).slice(1);
  expect(colors(feedback({three:3}))).toEqual(['up','neutral','neutral','neutral','neutral','neutral']);
  expect(colors(feedback({mid:2,defense:-1}))).toEqual(['neutral','up','neutral','neutral','neutral','down']);
  expect(colors(feedback({}))).toEqual(Array(6).fill('neutral'));
  expect(colors(null)).toEqual(Array(6).fill('neutral'));
 });
});
