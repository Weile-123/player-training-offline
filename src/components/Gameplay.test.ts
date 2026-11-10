import {assetUrl} from '../presentation/assetUrls';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProbabilityStrip } from './ProbabilityStrip';
import { newGame, seededRandom, trainingProbabilities,train } from '../game/engine';
import { shotFeedback } from '../presentation/feedback';
import { config } from '../game/config';
import { writeCareer } from '../game/careerSave';
import type { Game, Outcome } from '../game/types';

afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();vi.doUnmock('../presentation/usePresentation');});

describe('equal-width probability tiles',()=>{
 const render=(chances:Record<Outcome,number>|null)=>renderToStaticMarkup(createElement(ProbabilityStrip,{chances,onDetails:()=>{}}));
 function values(html:string) {
  return [...html.matchAll(/data-probability="(\w+)"(?: data-probability-value="([\d.]+)")?/g)].map(([,id,value])=>({id,value:value===undefined?null:Number(value)}));
 }
 it('shows all five actual values, including a small injury chance, without sizing tiles from probability',()=>{
  const html=render({severe:.015,minor:.1,hold:.2,success:.605,great:.08});
  expect(values(html)).toEqual([{id:'severe',value:.015},{id:'minor',value:.1},{id:'hold',value:.2},{id:'success',value:.605},{id:'great',value:.08}]);
  expect(html).not.toContain('width:');expect(html).not.toContain('probability-legend');
  for(const label of ['重伤','轻伤','维持','成功','大成功','1.5%','60.5%'])expect(html).toContain(label);
 });
 it('keeps protected outcomes visible and prints their true zero probabilities',()=>{
  const g=newGame(seededRandom(4)),p={...g.recruits[0],hotShots:2,iceShots:1};
  const chances=trainingProbabilities(g,p), html=render(chances),segments=values(html);
  expect(segments.find(s=>s.id==='severe')?.value).toBe(0);
  expect(segments.find(s=>s.id==='minor')?.value).toBe(0);
  expect(segments.reduce((sum,s)=>sum+(s.value??0),0)).toBeCloseTo(1,10);
  expect((html.match(/<b>0%<\/b>/g)??[]).length).toBe(2);
 });
 it('shows no fabricated probabilities when no player is selected',()=>{
  const html=render(null);expect(values(html)).toHaveLength(5);expect(values(html).every(s=>s.value===null)).toBe(true);expect((html.match(/<b>—<\/b>/g)??[]).length).toBe(5);
 });
});

describe('fusion gameplay state rendering',()=>{
 async function render(game:Game,unlocks:string[]=[]) {
  vi.resetModules();
  const data=new Map<string,string>();
  const storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};
  writeCareer(storage,game);
  vi.stubGlobal('window',{localStorage:storage});vi.stubGlobal('localStorage',storage);
  const {default:Gameplay}=await import('./Gameplay');
  const {useGame}=await import('../store');useGame.getInitialState().newUnlocks.push(...unlocks);
  return renderToStaticMarkup(createElement(Gameplay));
 }
 it('renders current finances, month, hearts, roster and stock rather than concept values',async()=>{
  const game={...newGame(seededRandom(9)),month:17,cash:234567,debt:8765432,credit:1,consumables:{drink:7,ice:9}};
  const html=await render(game);
  for(const value of ['$234,567','$8,765,432','第 17 月','信用 1 点','库存 7','库存 9'])expect(html).toContain(value);
  expect(html).not.toContain(game.recruits[0].name);
  expect((html.match(/class="heart filled"/g)??[]).length).toBe(1);
  expect((html.match(/class="heart"/g)??[]).length).toBe(2);
  expect(html).not.toContain('$128,500');expect(html).not.toContain('38.3');
  expect(html).toContain('新人');expect(html).toContain('休息室');expect(html).toContain('资产');
  expect(html).not.toContain('stage-tools');expect(html).toContain('打开生涯设置');
 });
 it('renders changed six stats, rating and heat from the current player',async()=>{
  const game=newGame(seededRandom(11));
  const p=game.recruits[0];p.stats={three:91,mid:86,drive:78,inside:83,handle:94,defense:72};p.heat=config.feel.maximum;
  const html=await render(game);
  expect(html).toContain('火热保护剩余 2 次');expect(html).toContain('84.0');
  for(const value of Object.values(p.stats))expect(html).toContain(`>${value}</b>`);
  expect(html).not.toContain('开启手感火热');expect(html).not.toContain('积累中');
 });
 it('keeps an empty roster and a closed career usable without selecting a player',async()=>{
  const game={...newGame(seededRandom(3)),recruits:[],lounge:[],selectedId:null};
  const empty=await render(game);expect(empty).toContain('当前你没有球员了');expect(empty).not.toContain('class="court-message"');
  const over=await render({...game,credit:0,status:'over'});
  expect(over).toContain('信用归零，训练营关闭');expect(over).toContain('开启新生涯');
  expect(over).toMatch(/aria-label="投篮训练" disabled/);
 });
 it('keeps newly collected templates recorded without rendering an unlock interruption',async()=>{
  const html=await render(newGame(seededRandom(12)),['curry']);
  expect(html).not.toContain('unlock-backdrop');expect(html).not.toContain('收进图鉴，继续训练');
 });
 it('does not report no players when the only remaining player is currently on court',async()=>{
  const game=newGame(seededRandom(5)),player=game.recruits[0];
  const html=await render({...game,recruits:[],lounge:[],activePlayer:player,activeSource:'recruits',selectedId:player.id});
  expect(html).not.toContain('当前你没有球员了');expect(html).not.toContain('dock-month needs-attention');
  expect(html).not.toMatch(/aria-label="投篮训练" disabled/);
 });
 it('prompts month end only when cash is insufficient and both rosters are empty',async()=>{
  const game={...newGame(seededRandom(3)),cash:0,recruits:[],lounge:[],selectedId:null};
  const empty=await render(game);
  expect(empty).toContain('dock-month needs-attention');
  expect(empty).toContain('点击结算迎接新人');
  expect(await render({...game,cash:1000000})).not.toContain('dock-month needs-attention');
  expect(await render({...game,status:'over',credit:0})).not.toContain('dock-month needs-attention');
  const player=newGame(seededRandom(8)).recruits[0];
  for(const occupied of [{recruits:[player]},{lounge:[player]}]){
   expect(await render({...game,...occupied})).not.toContain('dock-month needs-attention');
  }
 });
 it('keeps the shooting button enabled while its previous animation is running',async()=>{
  vi.doMock('../presentation/usePresentation',()=>({usePresentation:()=>({
   busy:true,feedback:null,reduced:false,preferences:{sound:false,reducedMotion:false},
   finish:vi.fn(),train:vi.fn(),clear:vi.fn(),play:vi.fn(),toggle:vi.fn(),
  })}));
  const html=await render(newGame(seededRandom(12)));
  const shoot=html.match(/<button[^>]*aria-label="投篮训练"[^>]*>/)?.[0];
  expect(shoot).toBeDefined();expect(shoot).not.toContain('disabled');
  expect(html).toContain(assetUrl('art/game/dock-controls.png'));
  expect(html).toContain('class="dock-quantity">×1');
 });
 it('shows the severe injury animation before showing the actual forced-sale income',async()=>{
  const before=newGame(seededRandom(123)),after=train(before,()=>0),feedback=shotFeedback(before,after);
  const presentation={busy:true,feedback,reduced:false,preferences:{sound:false,reducedMotion:false},
   finish:vi.fn(),train:vi.fn(),clear:vi.fn(),play:vi.fn(),toggle:vi.fn()};
  vi.doMock('../presentation/usePresentation',()=>({usePresentation:()=>presentation}));
  const during=await render(after);
  expect(during).toContain('front-shot-canvas');expect(during).not.toContain('court-shooter');
  expect(during).not.toContain('class="stage-result"');
  presentation.busy=false;
  const completed=await render(after);
  expect(completed).toContain('class="stage-result"');expect(completed).toContain('已按最低价强制出售');
  expect(completed).toContain('+$5,000');
 });
});
