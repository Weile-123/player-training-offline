import {it,expect} from 'vitest';
import {careerStatsKey,careerSummary,readCareerStats,recordCareer,writeCareerStats} from './careerStats';
import {newContract} from './engine';
import {createContractStore} from '../../contractStore';
import {writeContract,contractSaveKeys} from './save';
import {newCommerce} from './commerce';
const memory=()=>{const data=new Map<string,string>();return {data,getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}};};
it('没有玩过时没有虚构记录；刷新和重复保存不重复累计',()=>{
 const storage=memory(),store=createContractStore(storage,()=>5);
 expect(careerSummary(store.getState().careers).started).toBe(0);
 store.getState().start();const id=store.getState().state.careerId;
 store.getState().flush();store.getState().flush();
 const reload=createContractStore(storage,()=>5);
 expect(reload.getState().state.careerId).toBe(id);
 expect(careerSummary(reload.getState().careers).started).toBe(1);
});
it('结束后清掉继续游戏但保留统计，同种子新开局也有独立记录',()=>{
 const storage=memory(),store=createContractStore(storage,()=>7);
 store.getState().start();
 const g=structuredClone(store.getState().state);
 Object.assign(g,{month:12,totalShots:326,delivered:'900719925474099300',status:'over',credit:0});
 store.setState({state:g});store.getState().finish();store.getState().finish();store.getState().flush();
 expect(storage.getItem(contractSaveKeys.main)).toBeNull();
 const reload=createContractStore(storage,()=>7),summary=careerSummary(reload.getState().careers);
 expect(summary).toMatchObject({started:1,finished:1,highestMonth:12,shots:326,delivered:'900719925474099300'});
 expect(reload.getState().hasSave).toBe(false);
 reload.getState().start();
 expect(careerSummary(reload.getState().careers)).toMatchObject({started:2,finished:1,shots:326});
 expect(reload.getState().state.careerId).not.toBe(g.careerId);
});
it('放弃旧生涯会保留旧统计，现有旧版存档只导入一次',()=>{
 const storage=memory(),g=newContract(8);g.totalShots=20;g.month=4;g.commerce=newCommerce(4,[],3,g.rng.market);expect(writeContract(storage,g).ok).toBe(true);
 const store=createContractStore(storage,()=>9);
 expect(careerSummary(store.getState().careers)).toMatchObject({started:1,shots:20});
 expect(careerSummary(createContractStore(storage,()=>9).getState().careers).started).toBe(1);
 store.getState().start();
 expect(careerSummary(store.getState().careers)).toMatchObject({started:2,shots:20,abandoned:1});
});
it('回溯用当前有效快照覆盖该局统计；大额累计使用整数，不累计重复快照',()=>{
 const g=newContract(4);g.careerId='example';g.totalShots=10;g.delivered='9007199254740993';
 let ledger=recordCareer({},g);g.totalShots=9;ledger=recordCareer(ledger,g);
 expect(careerSummary(ledger)).toMatchObject({started:1,shots:9,delivered:'9007199254740993'});
});
it('独立校验与备份恢复，统计写入失败不阻止开局且旧生涯已归档',()=>{
 const storage=memory(),g=newContract(1);g.careerId='example';
 const ledger=recordCareer({},g);expect(writeCareerStats(storage,ledger)).toBe(true);
 storage.setItem(careerStatsKey,'corrupt');expect(readCareerStats(storage)).toEqual(ledger);
 const store=createContractStore(storage,()=>10);store.getState().start();const original=store.getState().state;
 const write=storage.setItem;
 storage.setItem=(key:string,value:string)=>{if(key.startsWith(careerStatsKey))throw Error('full');write(key,value);};
 expect(store.getState().start()).toBe(true);
 expect(store.getState().state.careerId).not.toBe(original.careerId);
 expect(JSON.parse(storage.getItem('player-training.contract.previous')!)).toEqual(original);
});
