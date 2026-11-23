import {create,type StoreApi,type UseBoundStore} from 'zustand';
import type {GymDebugOptions,GymStore} from '../gymStore';
import type {GymAction,GymState} from '../game/gym/engine';
import {validGym,validGymAlumnus,type GymStorage} from '../game/gym/save';
import {hupuProject} from './hupuProject';
import {parseGymAuthoritySnapshot,type GymAuthoritySnapshot,type GymAuthorityTransport} from './gymAuthority';
import {gymDebugAvailable} from './gymDebug';

type Hook=UseBoundStore<StoreApi<GymStore>>;
type Expected={hasSave:boolean;createdAt:number;seed:number;revision:number;updatedAt:number};
type Restorable=GymStore&{restorePlatformSnapshot?:(state:GymState,expected:Expected,owner:string)=>Promise<void>};
const oldPrefix=`legend-gym-authority-v1.${hupuProject.applicationId}`;
export const gymLocalFirstPrefix=`legend-gym-local-first-v1.${hupuProject.applicationId}`;
const stamp=(store:GymStore):Expected=>({hasSave:store.hasSave,createdAt:store.state.createdAt,seed:store.state.seed,revision:store.state.revision,updatedAt:store.state.updatedAt});
const same=(a:Expected,b:Expected)=>Object.keys(a).every(key=>a[key as keyof Expected]===b[key as keyof Expected]);
const copy=(store:GymStore)=>({state:store.state,hasSave:store.hasSave,hydrating:store.hydrating,actionError:store.actionError,
 saveMessage:store.saveMessage,isSuspended:store.isSuspended,pendingOfflineReport:store.pendingOfflineReport});
const sameCloud=(a:GymAuthoritySnapshot,b:GymAuthoritySnapshot)=>a.epoch===b.epoch&&a.hasSave===b.hasSave&&a.revision===b.revision
 &&a.state?.createdAt===b.state?.createdAt&&a.state?.seed===b.state?.seed&&a.state?.updatedAt===b.state?.updatedAt;

/** Local transactions own gameplay. Optional platform work never sits in the
 * action queue and no returned server game snapshot is published over a save.
 */
export function createGymLocalFirstStore(local:Hook,storage:GymStorage,transport:GymAuthorityTransport,
 options:{now?:()=>number;requestId?:()=>string;minClockIntervalMs?:number;debugAvailable?:()=>boolean;debugFactory?:(level:number,options?:GymDebugOptions)=>Hook;
  debugSnapshotFactory?:(state:GymState)=>Hook}={}):Hook{
 const now=options.now??Date.now,requestId=options.requestId??(()=>crypto.randomUUID());
 const clockInterval=Math.max(60_000,options.minClockIntervalMs??60_000);
 let generation=0,hydration:Promise<void>|null=null,background:Promise<void>|null=null,hydrated=false;
 let clockAt=Number.NEGATIVE_INFINITY,backgroundAt=Number.NEGATIVE_INFINITY;
 let debug:Hook|null=null,stopDebug:(()=>void)|null=null;
 const debugAllowed=options.debugAvailable??gymDebugAvailable;
 const read=<T>(key:string):T|null=>{try{const value=storage.getItem(key);return value===null?null:JSON.parse(value) as T;}catch{return null;}};
 const write=(key:string,value:unknown)=>{try{storage.setItem(key,JSON.stringify(value));}catch{/* Optional metadata cannot refuse local gameplay. */}};
 const modeKey=`${gymLocalFirstPrefix}.local-mode`;
 let localModeActive=read<{status?:string}>(modeKey)?.status==='active';
 let legacyRecoveryOwner:string|null=null;
 const criticalWrite=(key:string,value:unknown)=>{const encoded=JSON.stringify(value);storage.setItem(key,encoded);if(storage.getItem(key)!==encoded)throw Error('recovery metadata not persisted');};
 const ownLocalMode=()=>{
  if(localModeActive)return;
  localModeActive=true;
  try{criticalWrite(modeKey,{version:1,status:'active',...stamp(local.getState())});}catch{/* Keep playing locally; do not perform a recovery overwrite in this session. */}
 };
 const hasLocalRun=()=>{try{const value=storage.getItem(`${gymLocalFirstPrefix}.new-run`);return value!==null&&value!=='null';}catch{return true;}};
 const canImport=(expected:Expected,version:number,replace=false)=>!debug&&!hasLocalRun()&&!localModeActive
  &&(!local.getState().hasSave||replace)&&generation===version&&same(stamp(local.getState()),expected);
 const candidate=(owner:string,snapshot:GymAuthoritySnapshot)=>{
  write(`${gymLocalFirstPrefix}.recovery.${encodeURIComponent(owner)}`,{applicationId:hupuProject.applicationId,owner,epoch:snapshot.epoch,
   revision:snapshot.revision,createdAt:snapshot.state?.createdAt,seed:snapshot.state?.seed,updatedAt:snapshot.state?.updatedAt,
   archived:snapshot.state?.alumniArchive?.count??0});
 };
 const store=create<GymStore>(()=>({...local.getState(),authorityMode:'local',authorityMessage:'进度保存在本地',
  authorityCapabilities:{platformRewards:true,legacyAdoption:false},
  hydrate:()=>debug?debug.getState().hydrate():hydrate(),retryAuthority:()=>refresh(),
  loadAlumni:(offset,limit)=>(debug??local).getState().loadAlumni(offset,limit),
  debugSessionActive:false,
  debugSetGymLevel:async (level,debugOptions)=>{
   if(!debugAllowed()||!options.debugFactory)throw Error('仅本地开发环境可切换测试球馆');
   if(!Number.isInteger(level)||level<1||level>8)throw Error('请选择1至8级球馆');
   const version=++generation;
   const next=options.debugFactory(level,debugOptions);
   await next.getState().hydrate();
   if(version!==generation)throw Error('球馆状态已变化，本次测试切换已取消');
   if(!validGym(next.getState().state)||next.getState().state.gymLevel!==level)throw Error('测试球馆初始化失败');
   publishDebug(next);
   return{state:next.getState().state,events:[]};
  },
  debugForkGym:async()=>{
   if(!debugAllowed()||!options.debugSnapshotFactory)throw Error('仅本地开发环境可复制测试球馆');
   if(debug)return;
   const expected=stamp(local.getState()),version=++generation;
   if(!expected.hasSave)throw Error('请先开设球馆');
   const snapshot=await snapshotLocalGym();
   const next=options.debugSnapshotFactory(snapshot);
   await next.getState().hydrate();
   if(version!==generation||!same(stamp(local.getState()),expected))throw Error('球馆状态已变化，请重试');
   if(next.getState().actionError||!validGym(next.getState().state))throw Error('测试球馆初始化失败');
   publishDebug(next);
  },
  debugRestoreGym:async()=>{
   if(!debugAllowed())throw Error('仅本地开发环境可恢复测试球馆');
   generation++;stopDebug?.();stopDebug=null;debug=null;
   store.setState({...copy(local.getState()),debugSessionActive:false,
    authorityCapabilities:{platformRewards:true,legacyAdoption:false},authorityMessage:'进度保存在本地'});
   return{state:local.getState().state,events:[]};
  },
  start:async()=>{
   if(debug)return debug.getState().start();
   generation++;ownLocalMode();
   const result=await local.getState().start();
   if(!result.error)write(`${gymLocalFirstPrefix}.new-run`,{version:1,createdAt:result.state.createdAt,seed:result.state.seed});
   return result;
  },
  act:(action:GymAction)=>{if(debug)return debug.getState().act(action);generation++;ownLocalMode();return local.getState().act(action);},
  tick:()=>{if(debug)return debug.getState().tick();generation++;ownLocalMode();return local.getState().tick();},
  resume:()=>{if(debug)return debug.getState().resume();generation++;ownLocalMode();return local.getState().resume();},
  suspend:()=>{if(debug)return debug.getState().suspend();generation++;ownLocalMode();return local.getState().suspend();},
  flush:()=>{if(debug)return debug.getState().flush();generation++;ownLocalMode();return local.getState().flush();},
  dismissOfflineReport:()=>{if(debug){debug.getState().dismissOfflineReport();return;}generation++;ownLocalMode();local.getState().dismissOfflineReport();},
  restoreCloudArchive:async(...args)=>{
   if(debug)throw Error('请先恢复测试前球馆，再同步云存档');
   generation++;ownLocalMode();
   const restore=local.getState().restoreCloudArchive;
   if(!restore)throw Error('当前无法恢复云存档，原进度已保留');
   await restore(...args);
  },
  restorePlatformSnapshot:async(...args)=>{
   if(debug)throw Error('请先恢复测试前球馆，再恢复平台进度');
   const restore=local.getState().restorePlatformSnapshot;
   if(!restore)throw Error('当前无法恢复平台进度');
   await restore(...args);
  },
  // Official native SDK success is handled by the caller; business rewards are
  // committed by the same local engine transaction as every other game action.
  preparePlatformReward:async()=>undefined,
 }));
 function publishDebug(next:Hook){
  stopDebug?.();debug=next;
  const publish=()=>store.setState({...copy(next.getState()),debugSessionActive:true,
   authorityCapabilities:{platformRewards:false,legacyAdoption:false},authorityMessage:'独立测试球馆'});
  stopDebug=next.subscribe(publish);publish();
 }
 local.subscribe(value=>{if(!debug)store.setState(copy(value));});
 const status=(message:string)=>{if(!debug)store.setState({authorityMode:'local',authorityMessage:message});};
 async function snapshotLocalGym(){
  const before=structuredClone(local.getState().state),all:typeof before.alumni=[];
  const total=before.alumni.length+(before.alumniArchive?.count??0);
  while(all.length<total){
   const limit=Math.min(100,total-all.length),page=await local.getState().loadAlumni(all.length,limit);
   if(page.total!==total||page.players.length!==limit||page.players.some(player=>!validGymAlumnus(player,before)))throw Error('校友档案暂时无法读取');
   all.push(...page.players);
  }
  before.alumni=all.reverse();delete before.alumniArchive;
  if(!validGym(before))throw Error('本地存档校验失败');
  return before;
 }
 async function backupLocal(expected:Expected,version:number){
  if(!expected.hasSave)return;
  const before=await snapshotLocalGym();
  if(generation!==version||!same(stamp(local.getState()),expected))throw Error('local changed before backup');
  criticalWrite(`${gymLocalFirstPrefix}.before-recovery.${expected.createdAt}-${expected.seed}-${expected.revision}`,{version:1,state:before});
 }
 async function importState(state:GymState,expected:Expected,version:number,owner:string,replace=false){
  if(!canImport(expected,version,replace))return false;
  const restore=(local.getState() as Restorable).restorePlatformSnapshot;
  if(!restore)return false;
  // Existing guest progress is retained in full before preferring a known
  // newer last-played authority cache. A quota/metadata failure cancels import.
  await backupLocal(expected,version);
  if(!canImport(expected,version,replace))return false;
  criticalWrite(modeKey,{version:1,status:'recovering',owner,before:expected,target:{createdAt:state.createdAt,seed:state.seed,revision:state.revision,updatedAt:state.updatedAt}});
  await restore(state,expected,owner);
  localModeActive=true;
  try{criticalWrite(modeKey,{version:1,status:'active',owner,...stamp(local.getState())});}catch{/* The recovering marker and target still prevent a rollback after reload. */}
  write(`${gymLocalFirstPrefix}.owner`,{owner,createdAt:state.createdAt,seed:state.seed});
  status('历史进度已恢复到本地');
  return true;
 }
 async function cachedRecovery(){
  const expected=stamp(local.getState()),version=generation;
  const priorMode=read<{status?:string;target?:{createdAt:number;seed:number;revision:number;updatedAt:number}}>(modeKey);
  if(priorMode?.status==='recovering'&&priorMode.target){
   const current=local.getState().state,target=priorMode.target;
   if(current.createdAt===target.createdAt&&current.seed===target.seed&&current.revision>=target.revision&&current.updatedAt>=target.updatedAt){ownLocalMode();return;}
  }
  if(!canImport(expected,version,true))return;
  const prior=read<{account?:unknown}>(`${oldPrefix}.cutover`);
  if(typeof prior?.account!=='string'||!prior.account)return;
  const raw=read<unknown>(`${oldPrefix}.cache.${encodeURIComponent(prior.account)}`);
  if(!raw)return;
  try{
   const snapshot=parseGymAuthoritySnapshot(raw);
   if(!snapshot.hasSave||!snapshot.state)return;
   candidate(prior.account,snapshot);
   if(expected.hasSave&&snapshot.state.updatedAt<=expected.updatedAt)return;
   legacyRecoveryOwner=prior.account;
   // A hot snapshot with cold pointers is not a complete portable save.
   if(snapshot.state.alumniArchive?.count)return;
   await importState(snapshot.state,expected,version,prior.account,expected.hasSave);
  }catch{/* A cache problem never prevents entering the local game. */}
 }
 async function completeHistory(snapshot:GymAuthoritySnapshot,owner:string){
  const state=structuredClone(snapshot.state!),count=state.alumniArchive?.count??0;
  if(!count)return state;
  const hot=state.alumni.length,total=hot+count,cold:typeof state.alumni=[];
  const ids=new Set([...state.alumni,...(state.player?[state.player]:[]),...state.bench].map(player=>player.id));
  while(cold.length<count){
   if(await transport.account()!==owner)throw Error('account changed');
   const limit=Math.min(100,count-cold.length);
   const page=await transport.request('/alumni','POST',{epoch:snapshot.epoch,offset:hot+cold.length,limit}) as {players?:unknown[];total?:number};
   if(!page||page.total!==total||!Array.isArray(page.players)||page.players.length!==limit)throw Error('incomplete cloud history');
   for(const value of page.players){if(!validGymAlumnus(value,state)||ids.has(value.id))throw Error('invalid cloud history');ids.add(value.id);cold.push(value);}
  }
  // Pages are newest-first; local history stores oldest-first followed by its
  // original hot suffix. Preserve every player and all pending reward fields.
  state.alumni=[...cold.reverse(),...state.alumni];delete state.alumniArchive;
  if(!validGym(state))throw Error('invalid complete cloud save');
  const latest=parseGymAuthoritySnapshot(await transport.request('/session','GET'));
  if(!sameCloud(snapshot,latest))throw Error('cloud changed during download');
  return state;
 }
 async function recordClock(owner:string,snapshot:GymAuthoritySnapshot){
  if(debug||!snapshot.hasSave||snapshot.pending||now()-clockAt<clockInterval)return;
  clockAt=now();
  if(debug||await transport.account()!==owner)return;
  const key=`${gymLocalFirstPrefix}.clock-pending.${encodeURIComponent(owner)}`;
  const previous=read<{epoch?:string;requestId?:string}>(key);
  const body={epoch:snapshot.epoch,requestId:previous?.epoch===snapshot.epoch&&typeof previous.requestId==='string'?previous.requestId:requestId()};
  write(key,body);
  const result=parseGymAuthoritySnapshot(await transport.request('/resume','POST',body));
  if(await transport.account()!==owner||result.epoch!==snapshot.epoch)return;
  // A real Timeflow record is useful, but its game state/rewards belong to the
  // old cloud timeline. Local offline rewards have already been settled once.
  write(`${gymLocalFirstPrefix}.clock.${encodeURIComponent(owner)}`,{epoch:result.epoch,serverTime:result.serverTime,pending:!!result.pending});
  if(!result.pending)write(key,null);
 }
 async function refresh(){
  if(debug||!hydrated||!transport.enabled())return;
  if(background)return background;
  backgroundAt=now();
  const expected=stamp(local.getState()),version=generation;
  background=(async()=>{
   try{
    const owner=await transport.account();
    if(!owner)return;
    const snapshot=parseGymAuthoritySnapshot(await transport.request('/session','GET'));
    if(await transport.account()!==owner)return;
    if(snapshot.hasSave&&snapshot.state){
     candidate(owner,snapshot);
     const replace=expected.hasSave&&legacyRecoveryOwner===owner&&snapshot.state.updatedAt>expected.updatedAt;
     if(canImport(expected,version,replace)&&!snapshot.pending){
      const complete=await completeHistory(snapshot,owner);
      if(await transport.account()===owner)await importState(complete,expected,version,owner,replace);
     }
     await recordClock(owner,snapshot);
    }
   }catch{status('进度保存在本地，稍后再连接平台');}
  })().finally(()=>{background=null;});
  return background;
 }
 async function hydrate(){
  if(hydration)return hydration;
  if(hydrated)return;
  hydration=(async()=>{
   await local.getState().hydrate();
   await cachedRecovery();
   hydrated=true;
   // Do not await identity, cloud history or Timeflow before entering the game.
   void refresh();
  })().finally(()=>{hydration=null;});
  return hydration;
 }
 if(typeof document!=='undefined'){
  const foreground=()=>{if(document.visibilityState==='visible'&&now()-backgroundAt>=clockInterval)void refresh();};
  document.addEventListener('visibilitychange',foreground);
  if(typeof window!=='undefined')window.addEventListener('focus',foreground);
 }
 return store;
}
