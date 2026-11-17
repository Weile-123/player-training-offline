import {expect,it,vi} from 'vitest';
import {createGymStore} from '../gymStore';
import {newGym,type GymAlumnus,type GymState} from '../game/gym/engine';
import {encodeGym,validGym,writeGym,type GymStorage} from '../game/gym/save';
import {settleOfflineGym} from '../game/gym/offline';
import {templateRules} from '../game/contract/templates';
import {hupuProject} from './hupuProject';
import {createGymLocalFirstStore,gymLocalFirstPrefix} from './gymLocalFirst';
import type {GymAuthoritySnapshot,GymAuthorityTransport} from './gymAuthority';
const at=1_800_000_000_000;
function memory():GymStorage{const values=new Map<string,string>();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);}};}
const snapshot=(state=newGym(at,42)):GymAuthoritySnapshot=>({applicationId:hupuProject.applicationId,epoch:'cloud-epoch',hasSave:true,mode:'timeflow',serverTime:state.updatedAt,revision:state.revision,state,events:[]});
function fixture(request:GymAuthorityTransport['request']=async()=>snapshot(),account:GymAuthorityTransport['account']=async()=>'account-a',storage=memory()){
 let time=at,sequence=0;
 const local=createGymStore(storage,9,()=>time),transport={enabled:()=>true,account:vi.fn(account),request:vi.fn(request)};
 const store=createGymLocalFirstStore(local,storage,transport,{now:()=>time,requestId:()=>`clock-${++sequence}`});
 return{store,local,storage,transport,advance:(ms:number)=>{time+=ms;}};
}
function archived(){
 const state=newGym(at,42),template=templateRules.find(item=>item.tier==='rotation')!;
 state.player!.templateId=template.id;state.player!.highestTier=template.tier;state.player!.height=template.height[0];
 const all:GymAlumnus[]=Array.from({length:235},(_,index)=>({...structuredClone(state.player!),id:`cloud-alumnus-${index}`,recommendedAt:at,rewardCredits:0,rewardFame:0,finalValue:String(320+index)}));
 state.alumni=all.slice(-100);state.alumniArchive={id:'cloud-history',count:135,effectiveCount:0,legendCount:0,bestTier:0};
 expect(validGym(state)).toBe(true);return{state,all};
}

it('hydrates and shoots without waiting for unresolved account/network promises; local operations never send requests',async()=>{
 const f=fixture(async()=>new Promise(()=>{}),async()=>new Promise(()=>{}));
 await f.store.getState().hydrate();
 expect(f.store.getState().hydrating).toBe(false);expect(f.store.getState().authorityMode).toBe('local');
 await f.store.getState().start();f.advance(1000);
 const trained=await f.store.getState().act({type:'train',id:f.store.getState().state.player!.id});
 expect(trained.error).toBeUndefined();expect(trained.state.player!.shots).toBe(1);
 await f.store.getState().tick();await f.store.getState().resume();await f.store.getState().suspend();await f.store.getState().flush();
 expect(await f.store.getState().preparePlatformReward!({type:'share-player-levels',playerId:trained.state.player!.id})).toBeUndefined();
 expect(f.transport.request).not.toHaveBeenCalled();expect(f.storage.getItem(`${gymLocalFirstPrefix}.new-run`)).not.toBeNull();
});
it('never overwrites a new local run or a completed shot with a late cloud session or clock snapshot',async()=>{
 let release!:(value:unknown)=>void;
 const f=fixture(route=>route==='/session'?new Promise(resolve=>{release=resolve;}):Promise.resolve(snapshot()));
 await f.store.getState().hydrate();await vi.waitFor(()=>expect(f.transport.request).toHaveBeenCalledOnce());
 await f.store.getState().start();f.advance(1000);await f.store.getState().act({type:'train',id:f.store.getState().state.player!.id});
 const before=structuredClone(f.store.getState().state);
 release(snapshot());await f.store.getState().retryAuthority!();
 expect(f.store.getState().state).toEqual(before);expect(f.store.getState().state.seed).toBe(9);
 expect(f.transport.request.mock.calls.map(([route])=>route)).toEqual(['/session','/resume']);
});
it('restores a complete cached hot cloud save before network resolution, retaining pending offline rewards',async()=>{
 const storage=memory(),old=`legend-gym-authority-v1.${hupuProject.applicationId}`;
 let cloud=newGym(at,42);cloud.gymLevel=2;cloud.player!.autoEnabled=true;
 cloud=settleOfflineGym(cloud,at+10_000).state;
 storage.setItem(`${old}.cutover`,JSON.stringify({account:'account-a'}));storage.setItem(`${old}.cache.account-a`,JSON.stringify(snapshot(cloud)));
 const f=fixture(async()=>new Promise(()=>{}),async()=>new Promise(()=>{}),storage);
 await f.store.getState().hydrate();
 expect(f.store.getState().state.seed).toBe(42);expect(f.store.getState().state.offlineReward).toEqual(cloud.offlineReward);
 expect(f.store.getState().pendingOfflineReport).toEqual(cloud.offlineReward!.report);expect(f.transport.request).not.toHaveBeenCalled();
});
it('prefers the newer known last-played cache over the pre-authority guest slot, first backing up every guest alumnus',async()=>{
 const storage=memory(),old=`legend-gym-authority-v1.${hupuProject.applicationId}`,guest=newGym(at-20_000,91);
 guest.alumni=Array.from({length:113},(_,index)=>({...structuredClone(guest.player!),id:`guest-${index}`,recommendedAt:guest.updatedAt,rewardCredits:0,rewardFame:0,finalValue:'320'}));
 writeGym(storage,guest);
 storage.setItem(`${old}.cutover`,JSON.stringify({account:'account-a'}));storage.setItem(`${old}.cache.account-a`,JSON.stringify(snapshot()));
 const f=fixture(async()=>new Promise(()=>{}),async()=>new Promise(()=>{}),storage);
 await f.store.getState().hydrate();
 expect(f.store.getState().state.seed).toBe(42);
 const raw=storage.getItem(`${gymLocalFirstPrefix}.before-recovery.${guest.createdAt}-${guest.seed}-${guest.revision}`)!;
 const backup=JSON.parse(raw).state as GymState;
 expect(backup.seed).toBe(91);expect(backup.alumni).toEqual(guest.alumni);expect(backup.alumniArchive).toBeUndefined();
 expect(JSON.parse(storage.getItem(`${gymLocalFirstPrefix}.local-mode`)!).status).toBe('active');
});
it('does not reimport an authority cache on reload after local takeover and a shot, even if a newer cloud cache appears',async()=>{
 const storage=memory(),old=`legend-gym-authority-v1.${hupuProject.applicationId}`;
 storage.setItem(`${old}.cutover`,JSON.stringify({account:'account-a'}));storage.setItem(`${old}.cache.account-a`,JSON.stringify(snapshot()));
 const f=fixture(async()=>new Promise(()=>{}),async()=>new Promise(()=>{}),storage);
 await f.store.getState().hydrate();f.advance(1000);await f.store.getState().act({type:'train',id:f.store.getState().state.player!.id});
 const before=structuredClone(f.store.getState().state),different=newGym(at+60_000,123);
 storage.setItem(`${old}.cache.account-a`,JSON.stringify(snapshot(different)));
 const reload=fixture(async()=>new Promise(()=>{}),async()=>new Promise(()=>{}),storage);
 await reload.store.getState().hydrate();expect(reload.store.getState().state).toEqual(before);
});
it.each(['backup','metadata'])('keeps the old local save when mandatory %s persistence fails during takeover',async failure=>{
 const backing=memory(),old=`legend-gym-authority-v1.${hupuProject.applicationId}`,guest=newGym(at-20_000,91);
 writeGym(backing,guest);backing.setItem(`${old}.cutover`,JSON.stringify({account:'account-a'}));backing.setItem(`${old}.cache.account-a`,JSON.stringify(snapshot()));
 const storage:GymStorage={getItem:key=>backing.getItem(key),setItem:(key,value)=>{
  if(failure==='backup'&&key.includes('.before-recovery.')||failure==='metadata'&&key.endsWith('.local-mode'))throw Error('quota exceeded');backing.setItem(key,value);
 }};
 const f=fixture(async()=>new Promise(()=>{}),async()=>new Promise(()=>{}),storage);
 await f.store.getState().hydrate();expect(f.store.getState().state.seed).toBe(91);expect(f.store.getState().actionError).toBe('');
});
it('downloads every cold alumnus in the background, validates order/count and commits a complete local history',async()=>{
 const {state,all}=archived(),requests:{offset:number;limit:number}[]=[];
 const f=fixture(async(route,_method,body)=>{
  if(route==='/alumni'){requests.push({offset:body!.offset as number,limit:body!.limit as number});return{players:[...all].reverse().slice(body!.offset as number,(body!.offset as number)+(body!.limit as number)),total:all.length};}
  return snapshot(state);
 });
 await f.store.getState().hydrate();await f.store.getState().retryAuthority!();
 expect(f.store.getState().state.seed).toBe(42);expect(requests).toEqual([{offset:100,limit:100},{offset:200,limit:35}]);
 const page=await f.store.getState().loadAlumni(0,100);expect(page.total).toBe(235);expect(page.players).toEqual([...all].reverse().slice(0,100));
 const last=await f.store.getState().loadAlumni(200,100);expect(last.players).toEqual([...all].reverse().slice(200));
 expect(f.store.getState().state.alumniArchive?.count).toBe(135);
});
it('protects an older local slot when a shot occurs while the newer cached cold cloud history is still downloading',async()=>{
 const storage=memory(),old=`legend-gym-authority-v1.${hupuProject.applicationId}`,{state}=archived();
 writeGym(storage,newGym(at-20_000,91));storage.setItem(`${old}.cutover`,JSON.stringify({account:'account-a'}));storage.setItem(`${old}.cache.account-a`,JSON.stringify(snapshot(state)));
 let release!:(value:unknown)=>void;
 const f=fixture(route=>route==='/session'?new Promise(resolve=>{release=resolve;}):Promise.resolve(snapshot(state)),undefined,storage);
 await f.store.getState().hydrate();await vi.waitFor(()=>expect(f.transport.request).toHaveBeenCalledOnce());
 expect(f.store.getState().state.seed).toBe(91);
 f.advance(1000);await f.store.getState().act({type:'train',id:f.store.getState().state.player!.id});const before=structuredClone(f.store.getState().state);
 release(snapshot(state));await f.store.getState().retryAuthority!();
 expect(f.store.getState().state).toEqual(before);expect(f.transport.request.mock.calls.some(([route])=>route==='/alumni')).toBe(false);
});
it('keeps an existing local save and leaves cloud recovery as an account-scoped candidate',async()=>{
 const storage=memory();writeGym(storage,newGym(at,91));
 const f=fixture(undefined,undefined,storage);await f.store.getState().hydrate();await f.store.getState().retryAuthority!();
 expect(f.store.getState().state.seed).toBe(91);expect(f.storage.getItem(`${gymLocalFirstPrefix}.recovery.account-a`)).not.toBeNull();
 expect(f.store.getState().actionError).toBe('');
});
it('rejects incomplete cold pages without partially importing a hot-only snapshot or blocking play',async()=>{
 const {state}=archived(),f=fixture(async route=>route==='/alumni'?{players:[],total:235}:snapshot(state));
 await f.store.getState().hydrate();await f.store.getState().retryAuthority!();
 expect(f.store.getState().hasSave).toBe(false);expect(f.store.getState().actionError).toBe('');
 await f.store.getState().start();expect(f.store.getState().state.seed).toBe(9);
});
it('drops a cold recovery if its cloud revision changes while downloading',async()=>{
 const {state,all}=archived();let sessions=0;
 const f=fixture(async(route,_method,body)=>{
  if(route==='/alumni')return{players:[...all].reverse().slice(body!.offset as number,(body!.offset as number)+(body!.limit as number)),total:all.length};
  sessions++;return snapshot(sessions===1?state:{...state,revision:state.revision+1});
 });
 await f.store.getState().hydrate();await f.store.getState().retryAuthority!();
 expect(f.store.getState().hasSave).toBe(false);expect(f.store.getState().actionError).toBe('');
});
it('never imports another account’s response after an account change',async()=>{
 let owner='account-a',sessions=0,release!:(value:unknown)=>void;
 const accountB=snapshot(newGym(at,84));
 const f=fixture(async route=>route==='/session'&&sessions++===0?new Promise(resolve=>{release=resolve;}):accountB,async()=>owner);
 await f.store.getState().hydrate();await vi.waitFor(()=>expect(f.transport.request).toHaveBeenCalledOnce());
 // Join the in-flight A request before changing identity; do not accidentally
 // start a separate, legitimate B recovery after the initial task has ended.
 const pending=f.store.getState().retryAuthority!();owner='account-b';release(snapshot());await pending;
 expect(f.store.getState().hasSave).toBe(false);expect(f.store.getState().actionError).toBe('');
 await f.store.getState().hydrate();await f.store.getState().hydrate();
 expect(f.transport.request).toHaveBeenCalledOnce();
 // An explicit later account refresh may recover B's own cloud save.
 await f.store.getState().retryAuthority!();expect(f.store.getState().state.seed).toBe(84);
});
it('preserves an explicit cloud restore into an empty slot against late authority recovery and reload',async()=>{
 const storage=memory(),old=`legend-gym-authority-v1.${hupuProject.applicationId}`,{state,all}=archived();
 storage.setItem(`${old}.cutover`,JSON.stringify({account:'account-a'}));storage.setItem(`${old}.cache.account-a`,JSON.stringify(snapshot(state)));
 let release!:(value:unknown)=>void;
 const f=fixture(route=>route==='/session'?new Promise(resolve=>{release=resolve;}):Promise.resolve(snapshot(state)),undefined,storage);
 await f.store.getState().hydrate();await vi.waitFor(()=>expect(f.transport.request).toHaveBeenCalledOnce());
 const pending=f.store.getState().retryAuthority!(),before=f.store.getState().state,chosen=newGym(at-20_000,91);
 const raw=JSON.stringify({format:'legend-gym-cloud-v1',applicationId:hupuProject.applicationId,uploadedAt:at,gym:encodeGym(chosen)});
 await f.store.getState().restoreCloudArchive!(raw,{createdAt:before.createdAt,seed:before.seed,revision:before.revision,updatedAt:before.updatedAt},null);
 release(snapshot(state));await pending;
 expect(f.store.getState().state).toEqual(chosen);expect(f.transport.request.mock.calls.some(([route])=>route==='/alumni')).toBe(false);
 const reload=fixture(async(route,_method,body)=>route==='/alumni'?{players:[...all].reverse().slice(body!.offset as number,(body!.offset as number)+(body!.limit as number)),total:all.length}:snapshot(state),undefined,storage);
 await reload.store.getState().hydrate();await reload.store.getState().retryAuthority!();
 expect(reload.store.getState().state).toEqual(chosen);expect(reload.transport.request.mock.calls.some(([route])=>route==='/alumni')).toBe(false);
});
