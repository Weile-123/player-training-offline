import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {MonthSettlement,RepaymentForm,TemplateDossier} from './ComicDialogContent';
import {HeatMeter} from './HeatMeter';
import {monthPreview,newGame,seededRandom} from '../game/engine';
import {templateById} from '../game/templates';

describe('reference dialog contents',()=>{
 it('separates real settlement rows, highlighted totals and the actual credit-loss warning',()=>{
  const game={...newGame(seededRandom(2)),cash:0,recruits:[],lounge:[],selectedId:null};
  const report=monthPreview(game),html=renderToStaticMarkup(createElement(MonthSettlement,{game}));
  expect(html).toContain('settlement-lines');expect(html).toContain('settlement-total cash');expect(html).toContain('settlement-total debt');
  expect(html).toContain('$'+report.debtAfter.toLocaleString('en-US'));
  expect(html).toContain('本月扣除 1 点信用');
  expect(renderToStaticMarkup(createElement(MonthSettlement,{game:{...game,credit:1}}))).toContain('本次结算将导致游戏结束');
 });
 it('makes the matched template primary and keeps its standard stats separate from trainee values',()=>{
  const game=newGame(seededRandom(2)),player={...game.recruits[0],templateId:'curry',name:'受训新人',stats:{three:1,mid:2,drive:3,inside:4,handle:5,defense:6}};
  const html=renderToStaticMarkup(createElement(TemplateDossier,{game,player})),template=templateById('curry')!;
  expect(html.indexOf('斯蒂芬·库里')).toBeLessThan(html.indexOf('受训新人'));
  expect(html).toContain('模板六维标准');expect(html).toContain('受训球员 · 当前进度');
  const grid=html.match(/class="dossier-stats">(.*?)<\/section>/)?.[1];
  for(const stat of Object.values(template.stats))expect(grid).toContain(`<b>${stat}</b>`);
  const unknown=renderToStaticMarkup(createElement(TemplateDossier,{game,player:{...player,templateId:null}}));
  expect(unknown).toContain('等待模板匹配');expect(unknown).not.toContain('斯蒂芬');
 });
 it('formats repayment amount and real cash/debt limit without inventing an available balance',()=>{
  const html=renderToStaticMarkup(createElement(RepaymentForm,{amount:'50000',maximum:10000,onChange:()=>{}}));
  expect(html).toContain('value="50,000"');expect(html).toContain('$1 ～ $10,000');
  expect(html).toMatch(/aria-label="增加还款金额" disabled/);
  expect(renderToStaticMarkup(createElement(RepaymentForm,{amount:'',maximum:0,onChange:()=>{}}))).toContain('当前暂无可上交现金');
 });
 it('keeps total protection ticks fixed, greys spent ticks, then restores six ordinary ticks',()=>{
  for(const hotShots of [2,1,0]){
   const html=renderToStaticMarkup(createElement(HeatMeter,{heat:0,maximum:6,hotShots}));
   expect((html.match(/<i /g)??[]).length).toBe(hotShots>0?2:6);
   expect((html.match(/<i class="filled"/g)??[]).length).toBe(hotShots);
   expect(html).not.toContain('<button');expect(html).not.toContain('点燃');expect(html).not.toContain('积累中');
  }
 });
});
