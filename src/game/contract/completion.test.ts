import {describe,it,expect} from 'vitest';
import {createContractStore} from '../../contractStore';
import {dispatch,newContract} from './engine';
import {newCommerce} from './commerce';
import {decodeContract,encodeContract,validContract} from './save';
const memory=()=>{const data=new Map<string,string>();return {getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value)},removeItem:(key:string)=>{data.delete(key)}}};
function beforeClear(){const g=newContract(99,['relic_041']);g.month=21;g.scrap='999999';g.totalShots=123;g.commerce=newCommerce(21,g.equipment,g.credit,g.rng.market);g.players[0].templateId='curry';return g;}
describe('21月通关结算',()=>{
 it('21月结束冻结真实数据，保存重载后仍待选择；20月和失败结束不弹通关',()=>{
  const g=beforeClear(),r=dispatch(g,g.revision,{type:'settle'});expect(r.error).toBeUndefined();const c=r.state.completion!;
  expect(c.month).toBe(21);expect(c.delivered).toBe('999999');expect(c.totalShots).toBe(123);expect(c.equipment).toEqual(['relic_041']);expect(c.bestPlayer?.templateId).toBe('curry');expect(c.acknowledged).toBe(false);expect(r.state.month).toBe(22);
  expect(decodeContract(encodeContract(r.state))?.completion).toEqual(c);
  const early={...g,month:20};expect(dispatch(early,0,{type:'settle'}).state.completion).toBeUndefined();
  const failed={...g,credit:1,scrap:'0'};expect(dispatch(failed,0,{type:'settle'}).state.status).toBe('over');expect(dispatch(failed,0,{type:'settle'}).state.completion).toBeUndefined();
 });
 it('返回首页/刷新保留选择，开启无尽不重复结算或增加新人，只确认一次',()=>{
  const storage=memory(),s=createContractStore(storage,()=>1);s.getState().start();s.setState({state:beforeClear()});s.getState().act({type:'settle'});s.getState().flush();
  const resumed=createContractStore(storage,()=>2),before=structuredClone(resumed.getState().state);
  expect(resumed.getState().act({type:'settle'}).error).toBe('completion-pending');expect(resumed.getState().act({type:'train',playerId:'p1'}).error).toBe('completion-pending');
  const r=resumed.getState().act({type:'continue-endless'});expect(r.error).toBeUndefined();expect(r.state.month).toBe(22);expect(r.state.players).toEqual(before.players);expect(r.state.cash).toBe(before.cash);
  expect(resumed.getState().act({type:'continue-endless'}).error).toBe('no-pending-completion');expect(createContractStore(storage,()=>3).getState().state.completion?.acknowledged).toBe(true);
  const snapshot=structuredClone(r.state.completion);resumed.getState().act({type:'settle'});expect(resumed.getState().state.completion).toEqual(snapshot);
 });
 it('损坏的结算快照拒绝读取，旧的已通关存档继续兼容',()=>{
  const g=dispatch(beforeClear(),0,{type:'settle'}).state;
  expect(validContract({...g,completion:{...g.completion,acknowledged:'yes'}})).toBe(false);
  expect(validContract({...g,completion:{...g.completion,equipment:['not-an-item']}})).toBe(false);
  delete g.completion;expect(decodeContract(encodeContract(g))?.completed).toBe(true);
 });
});
