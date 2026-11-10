import {afterEach,describe,expect,it,vi} from 'vitest';
import {createContractStore,debugSettingsKey} from './contractStore';
import {newContract,previewShot,dispatch} from './game/contract/engine';
import {itemIds,rollShop,shopCatalog,shopEntry} from './game/contract/commerce';
import {stream} from './game/contract/random';
import {probabilities,outcomeAt} from './game/contract/probability';
import {readContract,validContract} from './game/contract/save';

const memory=()=>{const data=new Map<string,string>();return {getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};};
afterEach(()=>vi.unstubAllEnvs());
describe('本地测试控制台',()=>{
 it('四个开关跨刷新和新生涯保留，正式构建忽略保存的调试设置',()=>{
  const storage=memory(),s=createContractStore(storage,()=>2);
  for(const a of ['collection','no-severe','legendary-shop','mock-poster-share'] as const)s.getState().debugAct(a);
  const loaded=createContractStore(storage,()=>3);expect(loaded.getState().debug).toEqual({fullCollection:true,noSevere:true,legendaryShop:true,mockPosterShare:true,mockLeaderboard:false,mockRewardedAds:false});
  loaded.getState().start();expect(loaded.getState().debug.legendaryShop).toBe(true);
  vi.stubEnv('DEV',false);expect(createContractStore(storage,()=>4).getState().debug).toEqual({fullCollection:false,noSevere:false,legendaryShop:false,mockPosterShare:false,mockLeaderboard:false,mockRewardedAds:false});
  vi.stubEnv('DEV',true);storage.setItem(debugSettingsKey,'broken');expect(createContractStore(storage,()=>5).getState().debug.noSevere).toBe(false);
 });
 it('跳至20月保留球员与资源，更新商店和月份并持久化',()=>{
  const storage=memory(),s=createContractStore(storage,()=>12);s.getState().start();s.getState().debugAct('cash');s.getState().debugAct('items');
  const before=structuredClone(s.getState().state);s.getState().debugAct('month-20');const g=s.getState().state;
  expect(g.month).toBe(20);expect(g.players).toEqual(before.players);expect(g.cash).toBe(before.cash);expect(g.commerce.inventory).toEqual(before.commerce.inventory);
  expect(g.commerce.shop.month).toBe(20);expect(g.commerce.merchant.month).toBe(20);expect(g.commerce.shop.giftAvailable).toBe(false);expect(g.undo).toBeNull();expect(validContract(g)).toBe(true);
  expect(createContractStore(storage,()=>8).getState().state).toEqual(g);
 });
 it('传说概率开关仅改变后续刷新；关闭恢复当月权重',()=>{
  const s=createContractStore(memory(),()=>15);s.getState().start();s.getState().debugAct('month-20');s.getState().debugAct('cash');
  const before=structuredClone(s.getState().state);s.getState().debugAct('legendary-shop');expect(s.getState().state).toEqual(before);
  const expected=rollShop(20,before.equipment,before.commerce.unlocked,{...before.rng.market},undefined,[20,30,50]);
  // 20月刷新较贵，测试提供经费但保留随机流与商品池。
  s.setState({state:{...before,cash:'999999999'}});expect(s.getState().act({type:'reroll'}).state.commerce.shop.offers).toEqual(expected);
  const next=structuredClone(s.getState().state);s.getState().debugAct('legendary-shop');
  expect(s.getState().act({type:'reroll'}).state.commerce.shop.offers).toEqual(rollShop(20,next.equipment,next.commerce.unlocked,{...next.rng.market}));
 });
 it('20/30/50抽样分布正确，不绕过解锁；首月赠礼不受影响',()=>{
  const unlocked=shopCatalog.filter(e=>e.locked).map(e=>e.id),rng=stream(42,'weights'),counts={common:0,rare:0,legendary:0};
  for(let i=0;i<3000;i++)for(const id of rollShop(20,[],unlocked,rng,undefined,[20,30,50]))counts[shopEntry(id)!.rarity]++;
  for(const [rarity,p] of [['common',.2],['rare',.3],['legendary',.5]] as const)expect(Math.abs(counts[rarity]/9000-p)).toBeLessThan(.025);
  const r=stream(1,'gift');expect(rollShop(1,[],[],{...r},undefined,[20,30,50])).toEqual(rollShop(1,[],[],{...r}));
  for(const id of rollShop(20,[],[],rng,undefined,[20,30,50]))expect(shopEntry(id)!.locked).toBe(false);
 });
 it('资源按指定数值叠加、保存重载，并清除旧回溯快照',()=>{
  const storage=memory(),s=createContractStore(storage,()=>12);s.getState().start();
  s.getState().debugAct('items');s.getState().act({type:'train',playerId:'p1'});
  expect(s.getState().state.undo).not.toBeNull();
  const before=structuredClone(s.getState().state);
  for(let n=0;n<2;n++)for(const action of ['cash','credits','items'] as const)s.getState().debugAct(action);
  const g=s.getState().state;
  expect(g.cash).toBe(String(BigInt(before.cash)+19998n));expect(g.credits).toBe(before.credits+20);
  for(const id of itemIds)expect(g.commerce.inventory[id]).toBe(before.commerce.inventory[id]+6);
  expect(g.undo).toBeNull();expect(validContract(g)).toBe(true);
  expect(readContract(storage).state).toEqual(g);
 });
 it('开关独立持久化，取消不覆盖真实收藏',()=>{
  const storage=memory(),s=createContractStore(storage,()=>1);s.getState().start();
  const original=s.getState().profile;
  s.getState().debugAct('collection');s.getState().debugAct('no-severe');
  expect(s.getState().debug).toEqual({fullCollection:true,noSevere:true,legendaryShop:false,mockPosterShare:false,mockLeaderboard:false,mockRewardedAds:false});
  expect(s.getState().profile).toBe(original);
  const profile={...original,collection:{...original.collection,caruso:{firstMonth:1,highestRating:50,highestValue:'500'}}};
  s.setState({profile});s.getState().debugAct('collection');s.getState().flush();
  expect(s.getState().profile.collection.caruso).toBeDefined();
  const loaded=createContractStore(storage,()=>2);
  expect(loaded.getState().debug).toEqual({fullCollection:false,noSevere:true,legendaryShop:false,mockPosterShare:false,mockLeaderboard:false,mockRewardedAds:false});
  expect(loaded.getState().profile.collection.caruso).toBeDefined();
 });
 it('普通、补剂与火热的归零概率均覆盖 1000 签，关闭后恢复原概率',()=>{
  for(const [hot,powder] of [[false,false],[false,true],[true,false]]){
   const normal=probabilities(30,[],hot,powder);
   const safe=probabilities(30,[],hot,powder,true);
   expect(safe.tickets.severe).toBe(0);
   expect(Object.values(safe.tickets).reduce((a,b)=>a+b)).toBe(1000);
   for(let ticket=0;ticket<1000;ticket++)expect(outcomeAt(safe.tickets,ticket)).not.toBe('severe');
   expect(probabilities(30,[],hot,powder,false)).toEqual(normal);
   if(powder)expect(safe.tickets.great).toBe(1000);
  }
 });
 it('概率预览与 store 实际出手一致，关闭开关恢复重伤',()=>{
  let seed=1;
  for(;seed<1000;seed++){
   const g=newContract(seed);
   g.players[0].level=10;g.players[0].peakLevel=10;
   if(dispatch(g,g.revision,{type:'train',playerId:'p1'}).events.some(e=>e.type==='departed'))break;
  }
  expect(seed).toBeLessThan(1000);
  const s=createContractStore(memory(),()=>seed);s.getState().start();
  const before=structuredClone(s.getState().state);
  before.players[0].level=10;before.players[0].peakLevel=10;s.setState({state:before});
  s.getState().debugAct('no-severe');
  expect(previewShot(before,before.players[0],s.getState().debug).tickets.severe).toBe(0);
  expect(s.getState().act({type:'train',playerId:'p1'}).events.some(e=>e.type==='departed')).toBe(false);
  s.setState({state:before});s.getState().debugAct('no-severe');
  expect(s.getState().act({type:'train',playerId:'p1'}).events.some(e=>e.type==='departed')).toBe(true);
 });
 it('正式构建禁用调试操作，已结束生涯不增加资源',()=>{
  const s=createContractStore(memory(),()=>1);s.getState().start();
  const before=s.getState().state;vi.stubEnv('DEV',false);
  for(const action of ['cash','credits','items','collection','no-severe'] as const)s.getState().debugAct(action);
  expect(s.getState().state).toBe(before);expect(s.getState().debug).toEqual({fullCollection:false,noSevere:false,legendaryShop:false,mockPosterShare:false,mockLeaderboard:false,mockRewardedAds:false});
  vi.stubEnv('DEV',true);s.setState({state:{...before,status:'over'}});
  s.getState().debugAct('cash');expect(s.getState().state.cash).toBe(before.cash);
 });
});
