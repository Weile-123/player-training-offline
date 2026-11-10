import {it,expect} from 'vitest';
import {collectedEquipment,readCareerStats} from './careerStats';
import {createContractStore} from '../../contractStore';
import {newContract} from './engine';
import {writeContract} from './save';
const memory=()=>{const data=new Map<string,string>();return {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}};};
it('商店上架、特殊成就解锁、失败购买不点亮器械收藏',()=>{
 const store=createContractStore(memory(),()=>6);store.getState().start();
 const state=structuredClone(store.getState().state);state.commerce.unlocked=['relic_075'];
 store.setState({state,profile:{collection:{},unlocked:['relic_075']}});store.getState().flush();
 expect(state.commerce.shop.offers.length).toBeGreaterThan(0);
 expect(collectedEquipment(store.getState().careers)).toEqual([]);
 expect(store.getState().act({type:'buy-equipment',id:'relic_075'}).error).toBeDefined();
 expect(collectedEquipment(store.getState().careers)).toEqual([]);
});
it('实际获得后收藏，弃置、结束、刷新与新生涯不抹掉收集记录',()=>{
 const storage=memory(),store=createContractStore(storage,()=>8);store.getState().start();
 const id=store.getState().state.commerce.shop.offers[0];
 expect(store.getState().act({type:'buy-equipment',id}).error).toBeUndefined();
 expect(collectedEquipment(store.getState().careers)).toEqual([id]);
 expect(store.getState().act({type:'discard-equipment',id}).error).toBeUndefined();
 expect(store.getState().state.equipment).toEqual([]);
 expect(collectedEquipment(readCareerStats(storage))).toEqual([id]);
 store.setState({state:{...store.getState().state,status:'over',credit:0}});store.getState().finish();
 const reload=createContractStore(storage,()=>9);
 expect(collectedEquipment(reload.getState().careers)).toEqual([id]);
 reload.getState().start();
 expect(collectedEquipment(reload.getState().careers)).toEqual([id]);
});
it('旧存档导入当前实际器械；不从旧成就解锁推测持有历史',()=>{
 const storage=memory(),state=newContract(9,['relic_002']);
 state.commerce.unlocked=['relic_075'];writeContract(storage,state);
 const store=createContractStore(storage,()=>10);
 expect(collectedEquipment(store.getState().careers)).toEqual(['relic_002']);
 expect(collectedEquipment({},['relic_002','relic_002','item_001'])).toEqual(['relic_002']);
});
