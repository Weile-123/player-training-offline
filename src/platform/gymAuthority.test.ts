import {describe,expect,it,vi} from 'vitest';
import {createGymStore} from '../gymStore';
import {newGym} from '../game/gym/engine';
import {gymSaveKeys,writeGym,type GymStorage} from '../game/gym/save';
import {hupuProject} from './hupuProject';
import {createGymAuthorityStore,parseGymAuthoritySnapshot,type GymAuthoritySnapshot,type GymAuthorityTransport} from './gymAuthority';
const at=1_800_000_000_000;
function memory():GymStorage {const data=new Map<string,string>();return{getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,value);}};}
const snapshot=(revision=0):GymAuthoritySnapshot=>({applicationId:hupuProject.applicationId,epoch:'epoch-one',hasSave:true,mode:'timeflow',serverTime:at,revision,state:{...newGym(at,42),revision},events:[],capabilities:{platformRewards:false,legacyAdoption:true}});
function fixture(handler:(route:string,method:'GET'|'POST',body?:Record<string,unknown>)=>unknown|Promise<unknown> = ()=>snapshot()){
 const storage=memory(),local=createGymStore(storage,9,()=>at),requests:Parameters<GymAuthorityTransport['request']>[]=[];
 let owner:string|null='account-a',id=0,clock=at;
 const transport:GymAuthorityTransport={enabled:()=>true,account:async()=>owner,request:async(...args)=>{requests.push(args);return handler(...args);}};
 const remote=createGymAuthorityStore(local,storage,transport,{requestId:()=>`request-${++id}`,now:()=>clock,heartbeatMs:2_000});
 return{storage,local,remote,requests,owner:(value:string|null)=>{owner=value;},advance:(value:number)=>{clock+=value;}};
}
describe('authoritative gym client',()=>{
 it('keeps the old local store when no authority endpoint is configured',()=>{
  const storage=memory(),local=createGymStore(storage,9,()=>at);
  expect(createGymAuthorityStore(local,storage,{enabled:()=>false,account:async()=>null,request:vi.fn()})).toBe(local);
 });
 it('connects a guest after an explicit account refresh and adopts the complete local gym once',async()=>{
  const f=fixture(route=>route==='/session'?{...snapshot(),hasSave:false,state:undefined}:snapshot());
  f.owner(null);await f.remote.getState().hydrate();
  expect(f.remote.getState().authorityMode).toBe('local');expect(f.requests).toEqual([]);
  await f.remote.getState().start();expect(f.remote.getState().state.seed).toBe(9);
  f.owner('account-a');await f.remote.getState().retryAuthority!();
  expect(f.remote.getState().authorityMode).toBe('timeflow');expect(f.remote.getState().state.seed).toBe(42);
  expect(f.requests.map(([path])=>path)).toEqual(['/session','/adopt']);
  expect(f.local.getState().state.seed).toBe(9);expect(f.requests[1][2]?.archive).toEqual(expect.any(String));
 });
 it('clears a canonical display when account refresh observes logout, then loads only the switched account',async()=>{
  let next=snapshot();const f=fixture(()=>next);
  await f.remote.getState().hydrate();expect(f.remote.getState().state.seed).toBe(42);
  f.owner(null);await f.remote.getState().retryAuthority!();
  expect(f.remote.getState().hasSave).toBe(false);expect(f.remote.getState().state.player).toBeNull();
  expect(f.remote.getState().authorityMode).toBe('error');expect(f.remote.getState().pendingOfflineReport).toBeNull();
  next={...snapshot(),epoch:'epoch-two',state:newGym(at,84)};
  f.owner('account-b');await f.remote.getState().retryAuthority!();
  expect(f.remote.getState().authorityMode).toBe('timeflow');expect(f.remote.getState().state.seed).toBe(84);
  expect(f.requests.map(([path])=>path)).toEqual(['/session','/session']);
  expect(f.local.getState().hasSave).toBe(false);
 });
 it('publishes a validated server snapshot in its own namespace without overwriting guest saves',async()=>{
  const f=fixture();await f.remote.getState().hydrate();
  expect(f.remote.getState().authorityMode).toBe('timeflow');expect(f.remote.getState().state.seed).toBe(42);
  expect(f.storage.getItem(gymSaveKeys.main)).toBeNull();expect(f.local.getState().hasSave).toBe(false);
  expect(f.requests).toEqual([['/session','GET']]);
 });
 it('routes actions and server revisions without client time, identity, score, seed or scope',async()=>{
  const f=fixture((route)=>snapshot(route==='/actions'?1:0));await f.remote.getState().hydrate();
  const id=f.remote.getState().state.player!.id;await f.remote.getState().act({type:'train',id});
  const body=f.requests.at(-1)![2]!;
  expect(body).toEqual({requestId:'request-1',epoch:'epoch-one',expectedRevision:0,action:{type:'train',id}});
  expect(f.remote.getState().state.revision).toBe(1);
 });
 it('persists the same command after unknown network outcome and never locally rewards',async()=>{
  let lose=true;
  const f=fixture(route=>{if(route==='/actions'&&lose)throw Error('network lost');return snapshot(route==='/actions'?1:0);});
  await f.remote.getState().hydrate();const before=f.remote.getState().state;
  const failed=await f.remote.getState().act({type:'train',id:before.player!.id});
  expect(failed.error).toContain('平台同步暂时中断');expect(f.remote.getState().state).toBe(before);expect(f.local.getState().hasSave).toBe(false);
  await f.remote.getState().tick();expect(f.requests.filter(([path])=>path==='/actions')).toHaveLength(1);
  lose=false;await f.remote.getState().retryAuthority!();
  const writes=f.requests.filter(([path])=>path==='/actions');expect(writes).toHaveLength(2);expect(writes[1][2]).toEqual(writes[0][2]);
  expect(f.remote.getState().state.revision).toBe(1);
 });
 it('bounds automatic polling and requires explicit reconnection after repeated pending responses',async()=>{
  const f=fixture(route=>route==='/resume'?{...snapshot(),pending:{pollAfterMs:2_000,retryable:true}}:snapshot());
  await f.remote.getState().hydrate();await f.remote.getState().resume();
  for(let i=0;i<12;i++)await f.remote.getState().tick();expect(f.requests.filter(([p])=>p==='/resume')).toHaveLength(1);
  f.advance(2_000);await f.remote.getState().tick();f.advance(2_000);await f.remote.getState().tick();
  f.advance(2_000);await f.remote.getState().tick();expect(f.requests.filter(([p])=>p==='/resume')).toHaveLength(3);
 });
 it('clears displayed data on account switch before accepting a late response',async()=>{
  let release:(value:unknown)=>void=()=>{};const f=fixture(route=>route==='/actions'?new Promise(resolve=>{release=resolve;}):snapshot());
  await f.remote.getState().hydrate();const task=f.remote.getState().act({type:'train',id:f.remote.getState().state.player!.id});
  await vi.waitFor(()=>expect(f.requests).toHaveLength(2));f.owner('account-b');release(snapshot(1));await task;
  expect(f.remote.getState().hasSave).toBe(false);expect(f.remote.getState().state.player).toBeNull();expect(f.remote.getState().authorityMode).toBe('error');
 });
 it('does not automatically retry a permanent or unspecified pending receipt',async()=>{
  const f=fixture(route=>route==='/resume'?{...snapshot(),pending:{pollAfterMs:1}}:snapshot());
  await f.remote.getState().hydrate();await f.remote.getState().resume();
  for(let i=0;i<10;i++){f.advance(3_000);await f.remote.getState().tick();}
  expect(f.requests.filter(([p])=>p==='/resume')).toHaveLength(1);
 });
 it('does not replay animations or a dismissed report when the same committed receipt is confirmed again',async()=>{
  let ack=false;
  const r={from:at-10_000,to:at,elapsedMs:10_000,creditedMs:10_000,capMs:30*60_000,capped:false,totalShots:1,totalExperience:12,players:[]};
  const f=fixture(route=>route==='/resume'?{...snapshot(1),events:[{type:'trained',playerId:'gym-p1'}],offlineReport:r,...(!ack?{pending:{pollAfterMs:1,retryable:false,stage:'ack'}}:{})}:snapshot());
  await f.remote.getState().hydrate();const first=await f.remote.getState().resume();expect(first.events).toHaveLength(1);
  f.remote.getState().dismissOfflineReport();ack=true;await f.remote.getState().retryAuthority!();
  expect(f.remote.getState().pendingOfflineReport).toBeNull();expect(f.remote.getState().state.revision).toBe(1);
 });
 it('rejects a server snapshot that rolls an established epoch backwards',async()=>{
  const f=fixture(route=>snapshot(route==='/resume'?0:2));await f.remote.getState().hydrate();
  await f.remote.getState().resume();expect(f.remote.getState().state.revision).toBe(2);expect(f.remote.getState().actionError).toContain('过期');
 });
 it('exports one complete legacy backup for one-time server adoption and never imports the server archive into local IDB',async()=>{
  const f=fixture(route=>route==='/session'?{...snapshot(),hasSave:false,state:undefined}:snapshot());
  const guest=newGym(at,81);writeGym(f.storage,guest);
  expect(f.local.getState().hasSave).toBe(false);
  await f.remote.getState().hydrate();
  const adopt=f.requests.find(([p])=>p==='/adopt');expect(adopt?.[2]?.archive).toEqual(expect.any(String));
  expect(adopt?.[2]?.epoch).toBe('epoch-one');expect(f.remote.getState().state.seed).toBe(42);
  expect(f.local.getState().state.seed).toBe(81);
 });
 it('does not replace a canonical gym from the manual cloud slot',async()=>{
  const f=fixture();await f.remote.getState().hydrate();
  await expect(f.remote.getState().restoreCloudArchive!('bad',{createdAt:0,seed:0,revision:0,updatedAt:0},null)).rejects.toThrow('不能用旧云档覆盖');
 });
 it('rejects an invalid project, state, revision or offline report',()=>{
  expect(()=>parseGymAuthoritySnapshot({...snapshot(),applicationId:'other'})).toThrow();
  expect(()=>parseGymAuthoritySnapshot({...snapshot(),revision:100})).toThrow();
  expect(()=>parseGymAuthoritySnapshot({...snapshot(),offlineReport:{}})).toThrow();
 });
 it('does not expose provider credential or scope errors through the gameplay error channel',async()=>{
  const f=fixture(()=>{throw Error('SHAPER_TOKEN=not-a-real-secret scope=123 https://private.invalid');});
  await f.remote.getState().hydrate();
  expect(f.remote.getState().actionError).toContain('平台同步暂时中断');
  expect(f.remote.getState().actionError).not.toMatch(/secret|123|private|TOKEN/);
 });
});
