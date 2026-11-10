import {it,expect,vi} from 'vitest';
import {createContractStore,archiveKey} from './contractStore';
import {newGame} from './game/engine';
import {writeCareer,careerKey} from './game/careerSave';
import {writeCollection} from './game/collectionSave';
import {writeProfile,profileKey} from './game/contract/profile';
import {contractSaveKeys,readContract} from './game/contract/save';
import {writeContract} from './game/contract/save';
import {newContract,dispatch} from './game/contract/engine';
import {newCommerce} from './game/contract/commerce';
const memory=()=>{const data=new Map<string,string>();return {data,getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}};};
function severeFixture(){
 for(let seed=1;seed<1000;seed++){
  const g=newContract(seed,['relic_001','relic_020']);
  g.players[0].level=10;g.players[0].peakLevel=10;g.commerce.inventory.item_002=1;
  if(dispatch(g,g.revision,{type:'train',playerId:'p1'}).events.some(e=>e.type==='departed'))return g;
 }
 throw Error('No deterministic severe fixture');
}
it('重伤回溯恢复球员并自动上场，撤销赔偿且只消耗一个秒表，重载仍在场',()=>{
 const storage=memory(),store=createContractStore(storage,()=>7),g=severeFixture(),player=structuredClone(g.players[0]);
 store.setState({state:g,selectedId:'p1',restingIds:['p2']});
 const shot=store.getState().act({type:'train',playerId:'p1'});
 expect(shot.events.some(e=>e.type==='departed')).toBe(true);expect(store.getState().selectedId).toBeNull();
 expect(store.getState().state.players.some(p=>p.id==='p1')).toBe(false);
 const result=store.getState().act({type:'rewind'});
 expect(result.error).toBeUndefined();expect(store.getState().selectedId).toBe('p1');
 expect(result.state.players.find(p=>p.id==='p1')).toEqual(player);
 expect(result.state.cash).toBe(g.cash);expect(result.state.scrap).toBe(g.scrap);
 expect(result.state.commerce.inventory.item_002).toBe(0);expect(store.getState().restingIds).toEqual(['p2']);
 const loaded=createContractStore(storage,()=>9);
 expect(loaded.getState().selectedId).toBe('p1');expect(loaded.getState().restingIds).toEqual(['p2']);
 expect(store.getState().act({type:'rewind'}).error).toBe('no-rewind');
});
it('重伤后切换球员再回溯，恢复原球员上场并把替补移至休息室',()=>{
 const store=createContractStore(memory(),()=>7);store.setState({state:severeFixture(),selectedId:'p1',restingIds:[]});
 store.getState().act({type:'train',playerId:'p1'});store.getState().select('p2');
 store.getState().act({type:'rewind'});
 expect(store.getState().selectedId).toBe('p1');expect(store.getState().restingIds).toEqual(['p2']);
 expect(store.getState().state.players).toHaveLength(3);
});
it('球探首次提醒按生涯持久化，刷新不重复，新局重置',()=>{
 const storage=memory(),store=createContractStore(storage,()=>7);store.getState().start();
 store.getState().act({type:'settle'});store.getState().act({type:'settle'});
 expect(store.getState().state.month).toBe(3);expect(store.getState().scoutNoticeSeen).toBe(false);
 store.getState().markScoutNoticeSeen();
 const loaded=createContractStore(storage,()=>8);expect(loaded.getState().scoutNoticeSeen).toBe(true);
 expect(JSON.parse(loaded.getState().exportArchive()).roster.scoutNoticeSeen).toBe(true);
 loaded.getState().start();expect(loaded.getState().scoutNoticeSeen).toBe(false);
 expect(createContractStore(storage,()=>9).getState().scoutNoticeSeen).toBe(false);
});
it('已超过首次来访月份的旧存档不补弹；损坏提示元数据不影响游戏存档',()=>{
 const storage=memory(),g=newContract(4);g.month=6;g.commerce=newCommerce(6,g.equipment,g.credit,g.rng.market);writeContract(storage,g);
 storage.setItem('player-training.contract.scout-notice','broken');
 const loaded=createContractStore(storage,()=>7);expect(loaded.getState().state.month).toBe(6);expect(loaded.getState().scoutNoticeSeen).toBe(true);
});
it('坏档可导出，开启新局之前归档原始内容',()=>{
 const storage=memory();storage.setItem(contractSaveKeys.main,'broken-main');storage.setItem(contractSaveKeys.backup,'broken-backup');
 const store=createContractStore(storage,()=>7);expect(store.getState().saveMessage).toContain('校验失败');expect(JSON.parse(store.getState().exportArchive()).rawSaves[contractSaveKeys.main]).toBe('broken-main');
 expect(store.getState().start()).toBe(true);expect(JSON.parse(storage.getItem('player-training.contract.invalid')!)[contractSaveKeys.backup]).toBe('broken-backup');
});
it('新版开局保留旧档原文与旧图鉴，不换算旧债务/经费',()=>{
 const storage=memory(),legacy=newGame();legacy.cash=999999;writeCareer(storage,legacy);
 writeCollection(storage,{curry:{firstMonth:1,bestRating:99,bestValue:2000000,bestSale:2000000}});
 const original=storage.getItem(careerKey),store=createContractStore(storage,()=>7);
 expect(store.getState().hasSave).toBe(false);expect(store.getState().legacyCollection.curry.bestValue).toBe(2000000);
 expect(store.getState().start()).toBe(true);expect(storage.getItem(careerKey)).toBe(original);expect(JSON.parse(storage.getItem(archiveKey)!).sources[careerKey]).toBe(original);
 expect(store.getState().state.cash).toBe('0');expect(store.getState().state.collection.curry).toBeUndefined();expect(readContract(storage).state?.version).toBe('contract-v3');
});
it('领取赠礼、选择、训练、交付和重载都通过新版公共事务',()=>{
 const storage=memory(),store=createContractStore(storage,()=>4);store.getState().start();
 const initial=store.getState().state;const id=initial.commerce.shop.offers[0];store.getState().act({type:'buy-equipment',id});
 store.getState().act({type:'queue',playerId:'p1',queued:true});expect(store.getState().selectedId).toBeNull();
 store.getState().act({type:'settle'});expect(store.getState().state.cash).not.toBe('0');
 const loaded=createContractStore(storage,()=>20);expect(loaded.getState().state).toEqual(store.getState().state);
});
it('永久图鉴和器材解锁跨生涯；损坏主档与profile恢复备份',()=>{
 const storage=memory();writeProfile(storage,{collection:{curry:{firstMonth:9,highestRating:90,highestValue:'12345678901234567890'}},unlocked:['relic_075']});
 const store=createContractStore(storage,()=>1);store.getState().start();store.getState().start();
 expect(store.getState().state.commerce.unlocked).toContain('relic_075');expect(store.getState().profile.collection.curry.highestValue).toBe('12345678901234567890');
 storage.setItem(contractSaveKeys.main,'broken');storage.setItem(profileKey,'broken');const restored=createContractStore(storage,()=>2);
 expect(restored.getState().hasSave).toBe(true);expect(restored.getState().profile.unlocked).toContain('relic_075');
});
it('旧档归档写入失败仍可游玩，新局不覆盖旧存档',()=>{
 const storage=memory();writeCareer(storage,newGame());let fail=false;
 const port={getItem:storage.getItem,setItem:(k:string,v:string)=>{if(fail)throw Error('quota');storage.setItem(k,v);}};
 const original=new Map(storage.data),store=createContractStore(port,()=>1);fail=true;expect(store.getState().start()).toBe(true);expect(store.getState().hasSave).toBe(true);
 fail=false;store.getState().act({type:'queue',playerId:'p1',queued:true});expect(store.getState().saveMessage).toContain('当前可继续游玩');
 for(const [key,value] of original)expect(storage.getItem(key)).toBe(value);
});
it('休息与切换上场球员写入独立名单，刷新和跨月保留培养状态',()=>{
 const storage=memory(),store=createContractStore(storage,()=>7);store.getState().start();
 const before=structuredClone(store.getState().state.players[0]);store.getState().select(null);
 expect(store.getState().restingIds).toEqual(['p1']);expect(store.getState().selectedId).toBeNull();
 const loaded=createContractStore(storage,()=>9);expect(loaded.getState().selectedId).toBeNull();expect(loaded.getState().restingIds).toEqual(['p1']);
 loaded.getState().act({type:'settle'});expect(loaded.getState().state.players.find(p=>p.id==='p1')).toEqual(before);expect(loaded.getState().restingIds).toEqual(['p1']);
 loaded.getState().select('p1');expect(loaded.getState().restingIds).toEqual([]);
 loaded.getState().select('p2');expect(loaded.getState().restingIds).toEqual(['p1']);expect(loaded.getState().selectedId).toBe('p2');
});
it('休息球员离营或开始新局后清理名单；拒绝待交付球员上场',()=>{
 const store=createContractStore(memory(),()=>7);store.getState().start();store.getState().select(null);
 store.getState().act({type:'exchange',playerId:'p1'});expect(store.getState().restingIds).toEqual([]);
 store.getState().act({type:'queue',playerId:'p2',queued:true});store.getState().select('p2');expect(store.getState().selectedId).toBeNull();
 store.getState().select('p3');store.getState().select(null);store.getState().start();expect(store.getState().restingIds).toEqual([]);expect(store.getState().selectedId).toBe('p1');
});
it('当前错误可以独立清除，历史事件仍保留在记录内',()=>{
 const store=createContractStore(memory(),()=>7);store.getState().start();store.getState().act({type:'settle'});
 expect(store.getState().logs.join()).toContain('第1月');expect(store.getState().actionError).toBe('');
 store.getState().act({type:'reroll'});expect(store.getState().actionError).toContain('不足');store.getState().clearNotice();expect(store.getState().actionError).toBe('');expect(store.getState().logs.join()).toContain('第1月');
});
it('损坏休息室元数据不损坏生涯，显式空上场状态仍可恢复',()=>{
 const storage=memory(),store=createContractStore(storage,()=>7);store.getState().start();store.getState().select(null);storage.setItem('player-training.contract.resting','broken');
 const loaded=createContractStore(storage,()=>10);expect(loaded.getState().state.seed).toBe(7);expect(loaded.getState().restingIds).toEqual([]);expect(loaded.getState().selectedId).toBeNull();
});
it('结束生涯返回首页清除主档、备份和上场信息，卸载保存不能复活旧档，解锁仍保留',()=>{
 const storage=memory(),store=createContractStore(storage,()=>7);store.getState().start();
 const profile={collection:{curry:{firstMonth:1,highestRating:88,highestValue:'12345'}},unlocked:['relic_075']};
 store.setState({profile});
 store.getState().act({type:'settle'});store.getState().act({type:'settle'});store.getState().act({type:'settle'});
 expect(store.getState().state.status).toBe('over');
 expect(readContract(storage).state?.status).toBe('over');
 store.getState().finish();store.getState().flush();
 expect(store.getState().hasSave).toBe(false);
 for(const key of [...Object.values(contractSaveKeys),'player-training.contract.selection','player-training.contract.resting','player-training.contract.scout-notice'])expect(storage.getItem(key)).toBeNull();
 const loaded=createContractStore(storage,()=>8);
 expect(loaded.getState().hasSave).toBe(false);expect(loaded.getState().profile).toEqual(profile);
 expect(loaded.getState().start()).toBe(true);expect(loaded.getState().state.month).toBe(1);
 expect(loaded.getState().state.collection).toEqual(profile.collection);expect(loaded.getState().state.commerce.unlocked).toEqual(profile.unlocked);
});
it('进行中的生涯不会被结束清理误删，返回后仍可恢复相同球员和月份',()=>{
 const storage=memory(),store=createContractStore(storage,()=>7);store.getState().start();store.getState().act({type:'settle'});store.getState().select('p2');
 const before=structuredClone(store.getState().state);store.getState().finish();store.getState().flush();
 const loaded=createContractStore(storage,()=>8);
 expect(loaded.getState().hasSave).toBe(true);expect(loaded.getState().state).toEqual(before);expect(loaded.getState().selectedId).toBe('p2');
});
it('兼容旧版本结束存档：即使备份还在进行中，也不提供继续游戏',()=>{
 const storage=memory(),g=newContract(7);g.collection.curry={firstMonth:1,highestRating:88,highestValue:'12345'};
 delete g.adRewards;writeContract(storage,g);g.status='over';g.credit=0;writeContract(storage,g);
 expect(JSON.parse(storage.getItem(contractSaveKeys.backup)!).payload).toContain('"status":"playing"');
 const loaded=createContractStore(storage,()=>8);expect(loaded.getState().hasSave).toBe(false);expect(loaded.getState().profile.collection).toEqual(g.collection);
 expect(storage.getItem(contractSaveKeys.main)).toBeNull();expect(storage.getItem(contractSaveKeys.backup)).toBeNull();
 expect(createContractStore(storage,()=>9).getState().hasSave).toBe(false);
});
it('清理存储失败时保留结束主档阻止恢复旧备份，且不丢失图鉴',()=>{
 const storage=memory(),g=newContract(7);g.collection.curry={firstMonth:1,highestRating:88,highestValue:'12345'};writeContract(storage,g);
 delete g.adRewards;g.status='over';g.credit=0;writeContract(storage,g);
 const blocked={...storage,removeItem:()=>{throw Error('blocked');}};
 const store=createContractStore(blocked,()=>8);
  expect(store.getState().hasSave).toBe(false);expect(store.getState().saveMessage).toContain('可继续开启新生涯');
 store.getState().finish();store.getState().flush();
 expect(readContract(storage).state?.status).toBe('over');expect(createContractStore(blocked,()=>9).getState().hasSave).toBe(false);
 expect(createContractStore(storage,()=>10).getState().profile.collection).toEqual(g.collection);
});


function duplicateFixture(){
 for(let seed=1;seed<3000;seed++){
  const g=newContract(seed,['relic_093']);g.commerce.inventory.item_002=1;
  if(dispatch(g,g.revision,{type:'train',playerId:'p1'}).events.some(e=>e.type==='duplicate'))return g;
 }
 throw Error('No duplicate fixture');
}
it('复制提示进入独立队列，后续操作不覆盖，确认后不重复展示',()=>{
 const storage=memory(),store=createContractStore(storage,()=>7);store.setState({state:duplicateFixture(),selectedId:'p1'});
 const r=store.getState().act({type:'train',playerId:'p1'}),copy=r.events.find(e=>e.type==='duplicate')!;
 expect(copy).toBeDefined();expect(store.getState().equipmentNotices).toEqual([copy]);
 expect(store.getState().restingIds).toContain(copy.playerId);expect(store.getState().selectedId).toBe('p1');
 expect(createContractStore(storage,()=>9).getState().restingIds).toContain(copy.playerId);
 store.getState().act({type:'queue',playerId:'p2',queued:true});
 expect(store.getState().equipmentNotices).toEqual([copy]);
 store.getState().dismissEquipmentNotice();expect(store.getState().equipmentNotices).toEqual([]);
 store.getState().act({type:'queue',playerId:'p2',queued:false});expect(store.getState().equipmentNotices).toEqual([]);
});
it('回溯撤销复制球员，也移除对应未读提示',()=>{
 const store=createContractStore(memory(),()=>7);store.setState({state:duplicateFixture(),selectedId:'p1'});
 store.getState().act({type:'train',playerId:'p1'});expect(store.getState().equipmentNotices).toHaveLength(1);
 const cloneId=store.getState().equipmentNotices[0].playerId;
 expect(store.getState().act({type:'rewind'}).error).toBeUndefined();expect(store.getState().equipmentNotices).toHaveLength(0);expect(store.getState().restingIds).not.toContain(cloneId);
});
it('信用保障真实消耗后排队提示，新生涯清空旧提示',()=>{
 const store=createContractStore(memory(),()=>7),g=newContract(7,['relic_077']);g.credit=1;
 store.setState({state:g,selectedId:'p1'});store.getState().act({type:'settle'});
 expect(store.getState().state.credit).toBe(1);expect(store.getState().state.status).toBe('playing');expect(store.getState().state.equipment).not.toContain('relic_077');
 expect(store.getState().equipmentNotices).toEqual([{type:'credit-rescue',itemId:'relic_077'}]);
 store.getState().start();expect(store.getState().equipmentNotices).toHaveLength(0);
});

it('mock poster reward switch persists only in development and cannot be enabled in production',()=>{
 const storage=memory();
 try{
  vi.stubEnv('DEV',true);
  const store=createContractStore(storage,()=>7);
  expect(store.getState().debug.mockPosterShare).toBe(false);
  store.getState().debugAct('mock-poster-share');
  expect(createContractStore(storage,()=>7).getState().debug.mockPosterShare).toBe(true);
  vi.stubEnv('DEV',false);
  const production=createContractStore(storage,()=>7);
  expect(production.getState().debug.mockPosterShare).toBe(false);
  production.getState().debugAct('mock-poster-share');
  expect(production.getState().debug.mockPosterShare).toBe(false);
 }finally{vi.unstubAllEnvs();}
});
