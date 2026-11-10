import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeCollections, observeCollection, updateCollection } from './collection';
import { decodeCollection, loadCollection, writeCollection } from './collectionSave';
import { config } from './config';
import { newGame, train, sell, rest, nextMonth, seededRandom, selectedPlayer } from './engine';
import { gameSaleValue } from './economy';
import { refreshTemplate } from './matching';
import { decodeSave, type StorageLike } from './save';
import { statKeys, type Game, type Stats } from './types';
const uniform=(n:number)=>Object.fromEntries(statKeys.map(k=>[k,n])) as Stats;
function fixture():Game {
 const g=newGame(seededRandom(4)); g.recruits=[refreshTemplate({...g.recruits[0],height:203,stats:uniform(90),level:20})];
 g.selectedId=g.recruits[0].id; return g;
}
const memory=()=>{const data=new Map<string,string>();const storage:StorageLike={getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);}};return {storage,data};};
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('永久图鉴纯逻辑',()=>{
 it('立即记录现存模板、最高评分与报价，不伪造实际成交',()=>{
  const g=fixture(),c=observeCollection({},g),r=c.lebron;
  expect(Object.keys(c)).toEqual(['lebron']); expect(r.firstMonth).toBe(1); expect(r.bestRating).toBe(90);
  expect(r.bestValue).toBe(gameSaleValue(g,g.recruits[0])); expect(r.bestSale).toBe(0);
 });
 it('未知模板和身高不符的模板不解锁',()=>{
  const g=fixture(); for(const patch of [{templateId:'missing'},{height:178}]) expect(observeCollection({}, {...g,recruits:[{...g.recruits[0],...patch}]})).toEqual({});
 });
 it('训练升档立即解锁，重复发现不新增，之后受伤不撤销',()=>{
  const g=fixture(); g.recruits[0]={...g.recruits[0],height:190,stats:uniform(44),level:0,templateId:null};
  const trained=train(g,()=>.99), c=updateCollection({},g,trained,'train'),id=trained.recruits[0].templateId!;
  expect(c[id]).toBeDefined(); expect(Object.keys(observeCollection(c,trained))).toHaveLength(1);
  const injured=train(trained,()=>0), after=updateCollection(c,trained,injured,'train');
  expect(injured.recruits).toHaveLength(0); expect(after[id].bestSale).toBe(5000); expect(after[id].bestValue).toBe(c[id].bestValue);
 });
 it('轻伤、降档和跨路线演化保留此前解锁和纪录',()=>{
  const g=fixture(), c=observeCollection({},g), after={...g,recruits:[refreshTemplate({...g.recruits[0],stats:uniform(55),templateId:null})]};
  const result=updateCollection(c,g,after,'train'); expect(result.lebron).toEqual(c.lebron);
  expect(Object.keys(result)).toHaveLength(2);
 });
 it('历史值只增不减，首解月份不会被新生涯覆盖，输入不修改',()=>{
  const first={lebron:{firstMonth:8,bestRating:91,bestValue:100000,bestSale:50000}};
  const result=mergeCollections(first,{lebron:{firstMonth:1,bestRating:90,bestValue:90000,bestSale:80000}});
  expect(result.lebron).toEqual({...first.lebron,bestSale:80000}); expect(first.lebron.bestSale).toBe(50000);
 });
 it('手动出售和月底出售记录真实收益，休息室不算出售',()=>{
  const g=fixture(),p=g.recruits[0],quote=gameSaleValue(g,p);
  expect(updateCollection({},g,sell(g,p.id),'sell').lebron.bestSale).toBe(quote);
  expect(updateCollection({},g,nextMonth(g,seededRandom(9)),'month').lebron.bestSale).toBe(quote);
  const rested=rest(g,p.id), records=updateCollection({},g,rested,'observe'); expect(records.lebron.bestSale).toBe(0);
  expect(updateCollection(records,rested,nextMonth({...rested,cash:100000},seededRandom(9)),'month').lebron.bestSale).toBe(0);
 });
 it('失败后和重新开局保留图鉴，不把重开丢弃的球员算为成交',()=>{
  const g=fixture(),c=observeCollection({},g),failed=nextMonth({...g,recruits:[],selectedId:null,credit:1});
  expect(failed.status).toBe('over'); expect(updateCollection(c,g,failed,'observe')).toEqual(c);
  const fresh=newGame(seededRandom(8)); expect(updateCollection(c,g,fresh,'restart').lebron).toEqual(c.lebron);
 });
 it('旧经营存档只补录当前球员，保留原模板与属性',()=>{
  const g=fixture(),restored=decodeSave(JSON.stringify(g))!;
  expect(restored).toEqual(g); expect(observeCollection({},restored).lebron.bestSale).toBe(0);
 });
});
describe('图鉴独立主备存档',()=>{
 it('最新纪录在两份存档完整保存，主存档损坏可恢复最新解锁',()=>{
  const {storage,data}=memory(),c=observeCollection({},fixture()); expect(writeCollection(storage,c)).toBe(true);
  expect(data.get(config.collectionBackupKey)).toBe(data.get(config.collectionKey));
  data.set(config.collectionKey,'broken'); expect(loadCollection(storage).collection).toEqual(c); expect(loadCollection(storage).message).toContain('备份');
 });
 it('写入较旧记录也不覆盖永久解锁，主备读取合并历史最高值',()=>{
  const {storage,data}=memory(),c=observeCollection({},fixture()); writeCollection(storage,c); writeCollection(storage,{});
  expect(loadCollection(storage).collection).toEqual(c);
  data.set(config.collectionKey,JSON.stringify({version:1,entries:{}})); expect(loadCollection(storage).collection).toEqual(c);
 });
 it('无存档、损坏和存储拒绝均安全返回，写失败返回 false',()=>{
  const {storage,data}=memory(); expect(loadCollection(storage).collection).toEqual({});
  data.set(config.collectionKey,'corrupt'); data.set(config.collectionBackupKey,'corrupt'); expect(loadCollection(storage).message).toContain('损坏');
  const denied={getItem:()=>{throw Error('denied');},setItem:()=>{throw Error('full');}};
  expect(loadCollection(denied).collection).toEqual({}); expect(writeCollection(denied,{})).toBe(false);
 });
 it('非法模板、版本、字段和超范围纪录不会进入图鉴',()=>{
  const c=observeCollection({},fixture()), record=c.lebron;
  expect(decodeCollection(JSON.stringify({version:1,entries:c}))).toEqual(c);
  for(const patch of [{firstMonth:0},{bestRating:100},{bestRating:'90'},{bestValue:-1},{bestSale:record.bestValue+1},{bestSale:.5}]) expect(decodeCollection(JSON.stringify({version:1,entries:{lebron:{...record,...patch}}}))).toBeNull();
  for(const value of ['{',JSON.stringify({version:2,entries:c}),JSON.stringify({version:1,entries:[]}),JSON.stringify({version:1,entries:{unknown:record}})]) expect(decodeCollection(value)).toBeNull();
 });
});
describe('Zustand 行为与自动存档集成',()=>{
 it('训练自动写图鉴、首次通知一次、重伤和重开及刷新保留纪录',async()=>{
  vi.resetModules(); const {storage,data}=memory(); vi.stubGlobal('window',{localStorage:storage});
  const {useGame}=await import('../store');
  const g=fixture(); g.recruits[0]={...g.recruits[0],height:190,stats:uniform(44),level:0,templateId:null};
  useGame.setState({game:g,collection:{},newUnlocks:[]});
  vi.spyOn(Math,'random').mockReturnValue(.99); useGame.getState().train();
  const id=selectedPlayer(useGame.getState().game)!.templateId!;
  expect(useGame.getState().newUnlocks).toEqual([id]); expect(loadCollection(storage).collection[id]).toBeDefined();
  useGame.getState().dismissUnlock(); useGame.getState().train(); expect(useGame.getState().newUnlocks).toEqual([]);
  vi.mocked(Math.random).mockReturnValue(0); useGame.getState().train(); expect(useGame.getState().collection[id].bestSale).toBe(5000);
  vi.mocked(Math.random).mockReturnValue(.5); useGame.getState().restart(); expect(useGame.getState().collection[id]).toBeDefined(); expect(useGame.getState().newUnlocks).toEqual([]);
  data.set(config.saveKey,'corrupt'); data.set(config.backupKey,'corrupt');
  vi.resetModules(); const restored=await import('../store'); expect(restored.useGame.getState().collection[id]).toEqual(useGame.getState().collection[id]);
 });
 it('图鉴写失败保留会话记录并提示，经营结束后仍可读取图鉴',async()=>{
  vi.resetModules(); const {storage}=memory(); const full={getItem:storage.getItem,setItem:(k:string,v:string)=>{if(k===config.collectionKey||k===config.collectionBackupKey)throw Error('full');storage.setItem(k,v);}};
  vi.stubGlobal('window',{localStorage:full}); const {useGame}=await import('../store');
  const g=fixture(); useGame.setState({game:{...g,credit:1,cash:0,recruits:[],selectedId:null},collection:observeCollection({},g)});
  useGame.getState().nextMonth(); expect(useGame.getState().game.status).toBe('over'); expect(useGame.getState().collection.lebron).toBeDefined(); expect(useGame.getState().saveMessage).toContain('写入失败');
 });
});
