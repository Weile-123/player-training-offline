import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createContractStore} from '../contractStore';
import {createCloudSync,cloudProgress} from './cloudSync';
import type {HupuUser} from './hupuSdk';

const memory=()=>{const data=new Map<string,string>();return {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}};};
function fixture(active=true,storage=memory(),reviewStorage=memory()){
 const store=createContractStore(storage,()=>6);if(active)store.getState().start();
 let remote:string|null=null,readUntil=0,writeUntil=0;
 const user=vi.fn<()=>Promise<HupuUser|null>>().mockResolvedValue({islogin:1,puid:'user-a',nickname:'教练',avatar:'https://example.com/avatar.png'});
 const read=vi.fn(async()=>{readUntil=Date.now()+3000;return remote;});
 const write=vi.fn(async(value:string)=>{writeUntil=Date.now()+3000;remote=value;});
 const sync=createCloudSync(store,{user,read,write,rate:()=>({readUntil,writeUntil})},reviewStorage);
 return {store,storage,reviewStorage,sync,user,read,write,setRemote:(value:string|null)=>{remote=value;}};
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-22T08:00:00Z'));});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();});

it('never uploads automatically even after local progress changes and long idle time',async()=>{
 const f=fixture(),restore=vi.spyOn(f.store.getState(),'restoreCloudArchive'),stop=f.sync.start();
 await vi.advanceTimersByTimeAsync(3000);
 f.store.getState().select('p2');f.store.getState().act({type:'train',playerId:'p2'});
 await vi.advanceTimersByTimeAsync(60000);
 expect(f.write).not.toHaveBeenCalled();expect(restore).not.toHaveBeenCalled();
 expect(f.read).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);stop();
});

it('opening or closing settings never creates an upload timer or duplicate initial reads',async()=>{
 const f=fixture(),game=f.sync.start(),settings=f.sync.start();settings();settings();
 await vi.advanceTimersByTimeAsync(3000);expect(f.write).not.toHaveBeenCalled();expect(f.user).toHaveBeenCalledTimes(1);
 game();f.store.getState().select('p2');f.sync.start();await vi.advanceTimersByTimeAsync(9000);
 expect(f.write).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
});

it('retains the manual upload cooldown without queuing a write after it expires',async()=>{
 const f=fixture();await f.sync.refresh();await f.sync.upload();
 expect(f.sync.getSnapshot().writeUntil).toBe(Date.now()+3000);
 await expect(f.sync.upload()).rejects.toThrow('3 秒');f.store.getState().select('p2');
 await vi.advanceTimersByTimeAsync(3000);expect(f.write).toHaveBeenCalledTimes(1);
 await f.sync.upload();expect(f.write).toHaveBeenCalledTimes(2);
 expect(JSON.parse(f.write.mock.calls[1][0]).roster.selectedId).toBe('p2');
});

it('holds newer cloud progress for an explicit decision, including on an empty device',async()=>{
 const source=fixture();vi.setSystemTime(Date.now()+1000);source.store.getState().select('p2');const raw=source.store.getState().exportCloudArchive();
 for(const active of [false,true]){
  const f=fixture(active);if(active)f.store.setState({updatedAt:JSON.parse(raw).updatedAt-2000});f.setRemote(raw);const stop=f.sync.start();
  await vi.advanceTimersByTimeAsync(9000);expect(f.sync.getSnapshot().phase).toBe('remote-newer');expect(f.write).not.toHaveBeenCalled();
  await f.sync.upload();expect(f.write).toHaveBeenCalledTimes(1);expect(f.sync.getSnapshot().phase).toBe('ready');stop();
 }
});
it('reading and canceling a sync never changes local data; only confirmation restores it',async()=>{
 const f=fixture();f.sync.start();await vi.advanceTimersByTimeAsync(3000);
 const remote=fixture();remote.store.getState().select('p2');const raw=remote.store.getState().exportCloudArchive();f.setRemote(raw);
 const before=f.store.getState().state;await f.sync.prepareSync();
 expect(f.store.getState().state).toBe(before);expect(f.sync.getSnapshot().readUntil).toBe(Date.now()+3000);
 const writes=f.write.mock.calls.length;await vi.advanceTimersByTimeAsync(6000);expect(f.write).toHaveBeenCalledTimes(writes);
 f.sync.cancelSync();expect(f.store.getState().state).toBe(before);expect(f.sync.getSnapshot().preview).toBeNull();
 await f.sync.prepareSync();await f.sync.confirmSync();expect(f.store.getState().selectedId).toBe('p2');
 expect(f.sync.getSnapshot().preview).toBeNull();expect(f.sync.getSnapshot().phase).toBe('ready');
 await vi.advanceTimersByTimeAsync(3000);expect(f.write).toHaveBeenCalledTimes(writes);
});
it('closing settings while a cloud read is pending does not leave an invisible confirmation',async()=>{
 const f=fixture();await f.sync.refresh();await vi.advanceTimersByTimeAsync(3000);
 let done!:(v:string|null)=>void;f.read.mockImplementationOnce(()=>new Promise(resolve=>{done=resolve;}));
 const pending=f.sync.prepareSync();f.sync.cancelSync();done(f.store.getState().exportCloudArchive());await pending;
 expect(f.sync.getSnapshot().preview).toBeNull();expect(f.sync.getSnapshot().busy).toBeNull();
});
it('serializes slow uploads and only sends subsequent changes after another click',async()=>{
 const f=fixture();let done!:()=>void;f.write.mockImplementationOnce(()=>new Promise<void>(resolve=>{done=resolve;}));
 await f.sync.refresh();const pending=f.sync.upload();f.store.getState().select('p2');
 await expect(f.sync.upload()).rejects.toThrow('当前云存档操作');
 await vi.advanceTimersByTimeAsync(6000);expect(f.write).toHaveBeenCalledTimes(1);done();await pending;
 await vi.advanceTimersByTimeAsync(3000);expect(f.write).toHaveBeenCalledTimes(1);
 await f.sync.upload();expect(JSON.parse(f.write.mock.calls[1][0]).roster.selectedId).toBe('p2');
});

it('never retries failed uploads automatically and leaves local play available',async()=>{
 const f=fixture();f.write.mockRejectedValueOnce(Error('服务暂不可用'));await f.sync.refresh();
 await expect(f.sync.upload()).rejects.toThrow('服务暂不可用');
 expect(f.sync.getSnapshot().phase).toBe('error');f.store.getState().select('p2');
 expect(f.store.getState().act({type:'train',playerId:'p2'}).error).toBeUndefined();
 await vi.advanceTimersByTimeAsync(15000);expect(f.write).toHaveBeenCalledTimes(1);
 await f.sync.upload();expect(f.sync.getSnapshot().phase).toBe('ready');expect(f.sync.getSnapshot().cloud?.shots).toBe(1);
});

it('does not upload a new empty device or a guest session',async()=>{
 const empty=fixture(false),guest=fixture();guest.user.mockResolvedValue(null);empty.sync.start();guest.sync.start();
 await vi.advanceTimersByTimeAsync(12000);expect(empty.write).not.toHaveBeenCalled();expect(guest.write).not.toHaveBeenCalled();expect(guest.read).not.toHaveBeenCalled();
 expect(guest.sync.getSnapshot().phase).toBe('guest');
});
it('rejects a changed account before confirmed restoration',async()=>{
 const f=fixture();f.setRemote(f.store.getState().exportCloudArchive());await f.sync.refresh();await vi.advanceTimersByTimeAsync(3000);await f.sync.prepareSync();
 const original=f.store.getState().state;f.user.mockResolvedValue({islogin:1,puid:'user-b'});
 await expect(f.sync.confirmSync()).rejects.toThrow('账号已变化');expect(f.store.getState().state).toBe(original);
});
it('does not display a successful upload when a request rejects or the archive is invalid',async()=>{
 const f=fixture();await f.sync.refresh();f.write.mockRejectedValueOnce(Error('网络失败'));
 await expect(f.sync.upload()).rejects.toThrow('网络失败');expect(f.sync.getSnapshot().cloud).toBeNull();
 await vi.advanceTimersByTimeAsync(3000);f.setRemote('broken');await expect(f.sync.prepareSync()).rejects.toThrow('校验失败');expect(f.sync.getSnapshot().preview).toBeNull();
 expect(()=>cloudProgress('broken')).toThrow('校验失败');
});
it('protects existing cloud progress when a fresh device starts playing during a slow first read',async()=>{
 const source=fixture(),raw=source.store.getState().exportCloudArchive(),f=fixture(false);
 let complete!:(value:string|null)=>void;f.read.mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
 f.sync.start();await vi.advanceTimersByTimeAsync(6000);f.store.getState().start();
 expect(f.write).not.toHaveBeenCalled();complete(raw);await vi.advanceTimersByTimeAsync(9000);
 expect(f.sync.getSnapshot().phase).toBe('remote-newer');expect(f.write).not.toHaveBeenCalled();
 f.setRemote(raw);await f.sync.refresh();await vi.advanceTimersByTimeAsync(9000);
 expect(f.sync.getSnapshot().phase).toBe('remote-newer');expect(f.write).not.toHaveBeenCalled();
});
it('keeps the fresh-device gate after a failed first read, local play and a page reload',async()=>{
 const source=fixture(),raw=source.store.getState().exportCloudArchive(),f=fixture(false);
 f.read.mockRejectedValueOnce(Error('offline'));const stop=f.sync.start();await vi.advanceTimersByTimeAsync(3000);
 f.store.getState().start();await expect(f.sync.upload()).rejects.toThrow('尚未成功读取');stop();
 const reload=fixture(false,f.storage,f.reviewStorage);reload.setRemote(raw);reload.sync.start();
 await vi.advanceTimersByTimeAsync(12000);expect(reload.sync.getSnapshot().phase).toBe('remote-newer');expect(reload.write).not.toHaveBeenCalled();
 await reload.sync.prepareSync();await reload.sync.confirmSync();
 reload.store.getState().select('p2');await vi.advanceTimersByTimeAsync(3000);expect(reload.write).not.toHaveBeenCalled();
 await reload.sync.upload();expect(reload.write).toHaveBeenCalledTimes(1);
});
it('requires a click even when a fresh device has confirmed an empty cloud slot',async()=>{
 const f=fixture(false);f.sync.start();await vi.advanceTimersByTimeAsync(3000);
 f.store.getState().start();await vi.advanceTimersByTimeAsync(3000);expect(f.write).not.toHaveBeenCalled();
 await f.sync.upload();expect(f.write).toHaveBeenCalledTimes(1);
});
it('does not overwrite a second device after the first device has already initialized',async()=>{
 const a=fixture(),b=fixture();await a.sync.refresh();await a.sync.upload();
 b.store.getState().act({type:'train',playerId:'p1'});const newer=b.store.getState().exportCloudArchive();a.setRemote(newer);
 a.store.getState().select('p2');await vi.advanceTimersByTimeAsync(60000);
 expect(a.write).toHaveBeenCalledTimes(1);
 await a.sync.prepareSync();expect(a.sync.getSnapshot().preview).toBe(newer);
 expect(a.store.getState().state.totalShots).toBe(0);
 await a.sync.confirmSync();expect(a.store.getState().state.totalShots).toBe(1);
});
