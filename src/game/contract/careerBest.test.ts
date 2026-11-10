import {expect,it} from 'vitest';
import {captureBestPlayer,dispatch,newContract,playerValue} from './engine';
import {decodeContract,encodeContract,validContract} from './save';
import {createContractStore} from '../../contractStore';

function fixture(seed=7){
 const s=newContract(seed),p=s.players[0];
 p.templateId='curry';p.level=20;p.peakLevel=20;
 p.stats={three:94,mid:88,drive:83,inside:76,handle:95,defense:72};
 return s;
}
it('最高价值记录保存同一时刻的模板、等级和六维，后续降级和换模板不会污染快照',()=>{
 const s=fixture();captureBestPlayer(s);const expected=structuredClone(s.bestPlayer);
 expect(expected).toEqual({playerId:'p1',templateId:'curry',value:playerValue(s,s.players[0]),level:20,stats:s.players[0].stats});
 s.players[0].level=1;s.players[0].templateId='caruso';s.players[0].stats.three=10;captureBestPlayer(s);
 expect(s.bestPlayer).toEqual(expected);
 s.players[1].level=30;s.players[1].peakLevel=30;s.players[1].templateId='lebron';captureBestPlayer(s);
 expect(s.bestPlayer?.playerId).toBe('p2');expect(s.bestPlayer?.templateId).toBe('lebron');
});
it('交付、签约和重伤离营后仍保留最高模板球员，输入合同不被修改',()=>{
 for(const type of ['settle','exchange','severe'] as const){
  let s=fixture(),result;
  if(type==='settle'){s.players[0].queued=true;result=dispatch(s,s.revision,{type:'settle'});}
  else if(type==='exchange')result=dispatch(s,s.revision,{type:'exchange',playerId:'p1'});
  else{
   for(let seed=1;seed<1000;seed++){
    s=fixture(seed);result=dispatch(s,s.revision,{type:'train',playerId:'p1'});
    if(result.events.some(e=>e.type==='departed'))break;
   }
  }
  expect(result?.error).toBeUndefined();expect(result?.state.players.some(p=>p.id==='p1')).toBe(false);
  expect(result?.state.bestPlayer).toEqual({playerId:'p1',templateId:'curry',value:playerValue(s,s.players[0]),level:20,stats:s.players[0].stats});
  expect(s.bestPlayer).toBeNull();
 }
});
it('回溯撤销该次投篮产生的巅峰快照，恢复回溯前的历史记录',()=>{
 const before=fixture();captureBestPlayer(before);
 const current=structuredClone(before);current.players[0].level=25;current.players[0].peakLevel=25;captureBestPlayer(current);
 current.undo={playerId:'p1',before};current.revision++;current.commerce.inventory.item_002=1;
 const result=dispatch(current,current.revision,{type:'rewind'});
 expect(result.error).toBeUndefined();expect(result.state.bestPlayer).toEqual(before.bestPlayer);
});
it('存档往返保留离营球员快照，旧存档从仍在营球员补记，拒绝坏值与越界六维',()=>{
 const s=fixture();captureBestPlayer(s);const expected=structuredClone(s.bestPlayer);s.players=[];
 expect(decodeContract(encodeContract(s))?.bestPlayer).toEqual(expected);
 const old=fixture();delete old.bestPlayer;
 expect(decodeContract(encodeContract(old))?.bestPlayer?.templateId).toBe('curry');
 for(const value of ['-1','NaN','1.5']){const bad=structuredClone(s);bad.bestPlayer!.value=value;expect(validContract(bad)).toBe(false);}
 const bad=structuredClone(s);bad.bestPlayer!.stats.three=100;expect(validContract(bad)).toBe(false);
 const noTemplate=newContract(1);captureBestPlayer(noTemplate);expect(noTemplate.bestPlayer).toBeNull();
});
it('最高球员随本局保存，刷新与结束保留，但开启新合同不继承上一局快照',()=>{
 const data=new Map<string,string>(),storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}};
 const store=createContractStore(storage,()=>7);store.getState().start();store.setState({state:fixture()});
 store.getState().act({type:'exchange',playerId:'p1'});
 const peak=structuredClone(store.getState().state.bestPlayer),reloaded=createContractStore(storage,()=>8);
 expect(reloaded.getState().state.bestPlayer).toEqual(peak);
 for(let i=0;i<3;i++)reloaded.getState().act({type:'settle'});
 expect(reloaded.getState().state.status).toBe('over');expect(reloaded.getState().state.bestPlayer).toEqual(peak);
 reloaded.getState().finish();reloaded.getState().start();expect(reloaded.getState().state.bestPlayer).toBeNull();
});
