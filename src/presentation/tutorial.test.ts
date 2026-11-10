import {describe,it,expect} from 'vitest';
import {createTutorial,advanceTutorial,tutorialSteps,skipTutorial} from './tutorial';
import {createContractStore} from '../contractStore';
import {previewSettlement,playerValue} from '../game/contract/engine';
import {readContract} from '../game/contract/save';
import {statKeys} from '../game/types';
import {match} from '../game/contract/templates';
import {careerSummary} from '../game/contract/careerStats';

const memory=()=>{const data=new Map<string,string>();return {data,getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}};};
describe('独立新手教程与首月赠礼',()=>{
 it('任一阶段跳过不执行剩余训练和结算',()=>{
  let t=createTutorial();for(const step of tutorialSteps){const skipped=skipTutorial(t);expect(skipped.step).toBe('complete');expect(skipped.game).toBe(t.game);expect(skipped.beforeTraining).toBe(t.beforeTraining);if(step!=='complete')t=advanceTutorial(t,step);}
 });
 it('按说明、训练、观察成长、交付和结算完整体验真实规则',()=>{
  let t=createTutorial();expect(t.step).toBe('intro');expect(match(t.game.players[0]).templateId).toBeNull();
  expect(advanceTutorial(t,'train')).toBe(t);expect(advanceTutorial(t,'deliver')).toBe(t);
  t=advanceTutorial(t,'intro');expect(t.step).toBe('train');
  const before=structuredClone(t.game.players[0]);t=advanceTutorial(t,'train');
  expect(t.step).toBe('flight');expect(t.game.totalShots).toBe(1);
  expect(advanceTutorial(t,'deliver')).toBe(t);
  expect(t.game.players[0].level).toBe(5);expect(playerValue(t.game,t.game.players[0])).toBe('2430');
  expect(t.game.players[0].templateId).toBe('tucker');expect(t.game.collection.tucker).toBeDefined();
  expect(statKeys.reduce((sum,k)=>sum+t.game.players[0].stats[k]-before.stats[k],0)).toBe(10);
  expect(t.beforeTraining).toEqual(before);expect(t.beforeValue).toBe('1620');
  for(const step of ['flight','growth','goal'] as const)t=advanceTutorial(t,step);
  t=advanceTutorial(t,'deliver');expect(t.step).toBe('queued');expect(previewSettlement(t.game).met).toBe(true);
  t=advanceTutorial(t,'queued');t=advanceTutorial(t,'month');expect(t.game.month).toBe(1);expect(t.step).toBe('confirm');
  t=advanceTutorial(t,'confirm');expect(t.step).toBe('settled');expect(t.game.month).toBe(2);expect(t.game.cash).toBe('2430');
  expect(t.game.players.map(p=>p.id)).toEqual(['p2','p3','p4','p5','p6']);expect(t.game.credit).toBe(3);
  t=advanceTutorial(t,'settled');expect(t.step).toBe('complete');
  expect(advanceTutorial(t,'settled')).toBe(t);
 });
 it('练习不改变现有存档、统计、图鉴或随机流，正式新局仍为第 1 月',()=>{
  const storage=memory(),s=createContractStore(storage,()=>18);s.getState().start();
  const before=JSON.stringify(s.getState().state),saved=JSON.stringify([...storage.data]),ledger=JSON.stringify(s.getState().careers),profile=JSON.stringify(s.getState().profile);
  let t=createTutorial();for(const step of tutorialSteps.filter(step=>step!=='complete'))t=advanceTutorial(t,step);
  expect(JSON.stringify(s.getState().state)).toBe(before);expect(JSON.stringify([...storage.data])).toBe(saved);
  expect(JSON.stringify(s.getState().careers)).toBe(ledger);expect(JSON.stringify(s.getState().profile)).toBe(profile);
  s.getState().start();const g=s.getState().state;
  expect(g.month).toBe(1);expect(g.totalShots).toBe(0);expect(g.cash).toBe('0');expect(g.delivered).toBe('0');
  expect(g.players).toHaveLength(3);expect(g.players.every(p=>p.level===0&&p.shots===0)).toBe(true);
  expect(g.commerce.shop.giftAvailable).toBe(true);expect(g.commerce.shop.offers).toHaveLength(3);
  expect(careerSummary(s.getState().careers).shots).toBe(0);
 });
 it('赠礼未选刷新后仍保留三选一，选后只获得一件并保存',()=>{
  const storage=memory(),s=createContractStore(storage,()=>6);s.getState().start();
  const saved=createContractStore(storage,()=>20),gift=saved.getState().state.commerce.shop.offers[0];
  expect(saved.getState().state.commerce.shop.giftAvailable).toBe(true);
  expect(saved.getState().act({type:'buy-equipment',id:gift}).error).toBeUndefined();
  const g=readContract(storage).state!;
  expect(g.equipment).toEqual([gift]);expect(g.commerce.shop.giftAvailable).toBe(false);
  expect(g.month).toBe(1);expect(g.totalShots).toBe(0);expect(g.credits).toBe(0);
  expect(saved.getState().act({type:'buy-equipment',id:gift}).error).toBeDefined();
  expect(saved.getState().state.equipment).toEqual([gift]);
 });
});
