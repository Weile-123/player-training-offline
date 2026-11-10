import {expect,it,vi} from 'vitest';
import {createContractStore} from '../contractStore';
import {parseCloudArchive} from './cloudArchive';
import {contractSaveKeys} from '../game/contract/save';
const memory=()=>{const data=new Map<string,string>();return {data,getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};};
it('restores career, collection, history and roster and survives a fresh store load',()=>{
 const first=createContractStore(memory(),()=>6);first.getState().start();first.getState().select('p2');first.getState().act({type:'train',playerId:'p2'});
 const raw=first.getState().exportCloudArchive(),storage=memory(),second=createContractStore(storage,()=>9);second.getState().start();
 storage.setItem('unrelated','keep');second.getState().restoreCloudArchive(raw);
 const reloaded=createContractStore(storage,()=>10).getState();
 expect(reloaded.state).toEqual(second.getState().state);expect(reloaded.state.seed).toBe(first.getState().state.seed);
 expect(reloaded.profile).toEqual(first.getState().profile);expect(reloaded.careers).toEqual(first.getState().careers);
 expect(reloaded.selectedId).toBe('p2');expect(reloaded.restingIds).toContain('p1');expect(storage.getItem('unrelated')).toBe('keep');
 expect(storage.getItem('player-training.cloud-restore.backup')).not.toBeNull();
});
it('invalid or corrupted snapshots never alter local progress or storage',()=>{
 const storage=memory(),store=createContractStore(storage,()=>6);store.getState().start();const original=new Map(storage.data),state=store.getState().state;
 const snapshot=JSON.parse(store.getState().exportCloudArchive());
 for(const raw of ['garbage',JSON.stringify({...snapshot,format:'unknown'}),JSON.stringify({...snapshot,profile:'{}'}),JSON.stringify({...snapshot,contract:snapshot.contract.replace('checksum','broken')}),JSON.stringify({...snapshot,roster:{selectedId:'missing',restingIds:[],scoutNoticeSeen:false}})]){
  expect(()=>store.getState().restoreCloudArchive(raw)).toThrow('校验失败');expect(storage.data).toEqual(original);expect(store.getState().state).toBe(state);
 }
});
it('restoring an archive with no active career clears old main and backup saves',()=>{
 const empty=createContractStore(memory(),()=>1).getState().exportCloudArchive(),storage=memory(),store=createContractStore(storage,()=>2);store.getState().start();
 store.getState().restoreCloudArchive(empty);expect(store.getState().hasSave).toBe(false);expect(storage.getItem(contractSaveKeys.backup)).toBeNull();expect(createContractStore(storage,()=>3).getState().hasSave).toBe(false);
});
it('storage failure rolls back writes and keeps the live store unchanged',()=>{
 const storage=memory(),store=createContractStore(storage,()=>6);store.getState().start();const before=new Map(storage.data),state=store.getState().state;
 const other=createContractStore(memory(),()=>9);other.getState().start();const original=storage.setItem;let writes=0;
 storage.setItem=(key,value)=>{if(++writes===4)throw Error('quota');original(key,value);};
 expect(()=>store.getState().restoreCloudArchive(other.getState().exportCloudArchive())).toThrow('恢复未完成');
 expect(store.getState().state).toBe(state);for(const [key,value] of before)expect(storage.getItem(key)).toBe(value);
});
it('cloud format excludes raw browser storage, debug switches, identity and credentials',()=>{
 const storage=memory();storage.setItem('token','secret');storage.setItem('player-training.debug-settings.v1','debug');const store=createContractStore(storage,()=>6);store.getState().start();
 const raw=store.getState().exportCloudArchive();expect(raw).not.toMatch(/secret|token|debug-settings|puid/);expect(parseCloudArchive(raw).state).not.toBeNull();
});
it('keeps local progress timestamps across reloads and restores while upload time is independent',()=>{
 vi.useFakeTimers();try{
  vi.setSystemTime(new Date('2026-10-22T08:00:00Z'));const storage=memory(),store=createContractStore(storage,()=>6);store.getState().start();
  const updatedAt=Date.now();expect(store.getState().updatedAt).toBe(updatedAt);
  vi.setSystemTime(updatedAt+10000);const raw=store.getState().exportCloudArchive(),archive=parseCloudArchive(raw).archive;
  expect(archive.updatedAt).toBe(updatedAt);expect(Date.parse(archive.savedAt)).toBe(updatedAt+10000);
  expect(createContractStore(storage,()=>6).getState().updatedAt).toBe(updatedAt);
  const target=createContractStore(memory(),()=>9);target.getState().restoreCloudArchive(raw);expect(target.getState().updatedAt).toBe(updatedAt);
  target.getState().select('p2');expect(target.getState().updatedAt).toBe(updatedAt+10000);
 }finally{vi.useRealTimers();}
});
it('accepts older cloud archives without update timestamps and rejects malformed timestamps',()=>{
 const source=createContractStore(memory(),()=>6);source.getState().start();const archive=JSON.parse(source.getState().exportCloudArchive());delete archive.updatedAt;
 const target=createContractStore(memory(),()=>9);target.getState().restoreCloudArchive(JSON.stringify(archive));expect(target.getState().updatedAt).toBe(Date.parse(archive.savedAt));
 for(const updatedAt of [-1,0,'today',1.5])expect(()=>parseCloudArchive(JSON.stringify({...archive,updatedAt}))).toThrow('校验失败');
});
