import {it,expect} from 'vitest';
import {createContractStore} from './contractStore';
import {contractSaveKeys,readContract,writeContract} from './game/contract/save';
import {careerStatsKey} from './game/contract/careerStats';
import {newContract} from './game/contract/engine';
import {parseCloudArchive} from './platform/cloudArchive';

const memory=()=>{const data=new Map<string,string>();return {data,getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}};};
for(const readFails of [false,true])it(`storage unavailable (read=${readFails}): start, train, settle, finish and restart without a dead end`,()=>{
 const storage={getItem:()=>{if(readFails)throw new DOMException('Denied','SecurityError');return null;},setItem:()=>{throw new DOMException('Full','QuotaExceededError');}};
 const store=createContractStore(storage,()=>6);
 expect(store.getState().start()).toBe(true);
 expect(store.getState().act({type:'train',playerId:'p1'}).error).toBeUndefined();
 expect(parseCloudArchive(store.getState().exportCloudArchive()).state?.totalShots).toBe(1);
 for(let i=0;i<3;i++)expect(store.getState().act({type:'settle'}).error).toBeUndefined();
 expect(store.getState().state.status).toBe('over');
 expect(()=>store.getState().finish()).not.toThrow();expect(store.getState().start()).toBe(true);
});
it('failed statistics do not prevent durable first save or reload',()=>{
 const storage=memory(),port={...storage,setItem:(k:string,v:string)=>{if(k.startsWith(careerStatsKey))throw Error('quota');storage.setItem(k,v);}};
 const store=createContractStore(port,()=>6);expect(store.getState().start()).toBe(true);
 store.getState().act({type:'train',playerId:'p1'});store.getState().select('p2');
 const reload=createContractStore(port,()=>9);expect(reload.getState().hasSave).toBe(true);expect(reload.getState().state).toEqual(store.getState().state);expect(reload.getState().selectedId).toBe('p2');
});
it('backup failure still writes a valid main save',()=>{
 const storage=memory(),port={...storage,setItem:(k:string,v:string)=>{if(k===contractSaveKeys.backup)throw Error('quota');storage.setItem(k,v);}};
 const state=newContract(6);expect(writeContract(port,state).ok).toBe(true);expect(readContract(port).state).toEqual(state);
});
it('temporary main-save failure recovers on flush without resetting progress',()=>{
 const storage=memory();let fail=true;
 const port={...storage,setItem:(k:string,v:string)=>{if(fail&&k===contractSaveKeys.main)throw Error('quota');storage.setItem(k,v);}};
 const store=createContractStore(port,()=>6);expect(store.getState().start()).toBe(true);store.getState().act({type:'train',playerId:'p1'});
 fail=false;store.getState().flush();expect(createContractStore(port,()=>9).getState().state).toEqual(store.getState().state);
});
it('silent storage write failure is not reported as saved and does not block play',()=>{
 const storage={getItem:()=>null,setItem:()=>{}};
 expect(writeContract(storage,newContract(6)).ok).toBe(false);
 const store=createContractStore(storage,()=>6);expect(store.getState().start()).toBe(true);
 expect(store.getState().saveMessage).toContain('当前可继续游玩');
 expect(store.getState().act({type:'train',playerId:'p1'}).error).toBeUndefined();
});
it('corrupt save with failed archival remains untouched throughout session',()=>{
 const storage=memory();storage.setItem(contractSaveKeys.main,'broken-main');storage.setItem(contractSaveKeys.backup,'broken-backup');
 const port={...storage,setItem:(k:string,v:string)=>{if(k==='player-training.contract.invalid')throw Error('quota');storage.setItem(k,v);}};
 const store=createContractStore(port,()=>6);expect(store.getState().start()).toBe(true);store.getState().act({type:'train',playerId:'p1'});store.getState().flush();
 expect(storage.getItem(contractSaveKeys.main)).toBe('broken-main');expect(storage.getItem(contractSaveKeys.backup)).toBe('broken-backup');
 expect(parseCloudArchive(store.getState().exportCloudArchive()).state?.totalShots).toBe(1);
});
