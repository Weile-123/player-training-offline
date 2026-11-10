import {useContract,type ContractStore} from '../contractStore';
import {getHupuUser,downloadCloudSave,uploadCloudSave,getCloudRateState} from './hupuAccount';
import {parseCloudArchive} from './cloudArchive';
import type {HupuUser} from './hupuSdk';

export type CloudProgress={month:number|null;shots:number;updatedAt:number|null;uploadedAt:number};
type SyncState={user:HupuUser|null;phase:'loading'|'ready'|'guest'|'error'|'remote-newer';busy:'account'|'read'|'write'|'restore'|null;cloud:CloudProgress|null;cloudKnown:boolean;message:string;preview:string|null;readUntil:number;writeUntil:number};
type StorePort={getState:()=>ContractStore};
type ReviewStorage=Pick<Storage,'getItem'|'setItem'>;
const reviewKey='player-training.cloud-review-required.v1';
function browserReviewStorage():ReviewStorage|undefined{try{return typeof localStorage==='undefined'?undefined:localStorage;}catch{return undefined;}}
type Transport={user:typeof getHupuUser;read:typeof downloadCloudSave;write:typeof uploadCloudSave;rate:typeof getCloudRateState};
const defaultTransport:Transport={user:getHupuUser,read:downloadCloudSave,write:uploadCloudSave,rate:getCloudRateState};
const errorText=(e:unknown)=>e instanceof Error?e.message:'云存档服务暂不可用，本地游玩不受影响';
const content=(raw:string)=>{const {savedAt:_,updatedAt:__,...data}=JSON.parse(raw);return JSON.stringify(data);};
export function cloudProgress(raw:string):CloudProgress{
 const {archive,state}=parseCloudArchive(raw);
 return {month:state?.status==='playing'?state.month:null,shots:state?.totalShots??0,updatedAt:archive.updatedAt??null,uploadedAt:Date.parse(archive.savedAt)};
}
/** One coordinator for the whole game: reads never change local data; writes require an explicit upload action. */
export function createCloudSync(store:StorePort,transport:Transport=defaultTransport,reviewStorage:ReviewStorage|undefined=browserReviewStorage()){
 let snapshot:SyncState={user:null,phase:'loading',busy:null,cloud:null,cloudKnown:false,message:'',preview:null,readUntil:0,writeUntil:0};
 const listeners=new Set<()=>void>();
 let initialized=false,syncGeneration=0;
 const emit=(update:Partial<SyncState>)=>{snapshot={...snapshot,...update,...transport.rate()};for(const listener of listeners)listener();};
 const available=(kind:'read'|'write')=>{
  if(snapshot.busy||snapshot.preview)throw Error('请先完成当前云存档操作');
  if(!snapshot.user)throw Error('请先在虎扑登录，再刷新账号');
  const until=transport.rate()[kind==='read'?'readUntil':'writeUntil'];
  if(Date.now()<until)throw Error(`请 ${Math.ceil((until-Date.now())/1000)} 秒后重试`);
 };
 const localHasProgress=()=>{const s=store.getState();return s.hasSave||Object.keys(s.careers).length>0||Object.keys(s.profile.collection).length>0||s.profile.unlocked.length>0;};
 // Remember an empty device before any asynchronous account/read request. Starting
 // a new career, refreshing Settings or reloading the page must not lift this gate.
 let reviewRequired=!localHasProgress();
 try{reviewRequired ||= reviewStorage?.getItem(reviewKey)==='true';}catch{/* Keep the in-memory gate. */}
 const markReview=(required:boolean)=>{reviewRequired=required;try{reviewStorage?.setItem(reviewKey,String(required));}catch{/* Cloud failures must never block local play. */}};
 const acceptRemote=(raw:string|null)=>{
  const cloud=raw===null?null:cloudProgress(raw),local=store.getState();
  let phase:SyncState['phase']='ready',message='';
  if(raw!==null){
   const same=content(raw)===content(local.exportCloudArchive());
   if(same){markReview(false);}
   else if(reviewRequired||!localHasProgress()||!local.updatedAt||(cloud!.updatedAt??cloud!.uploadedAt)>local.updatedAt){
    markReview(true);phase='remote-newer';message='已有云存档。请同步恢复进度；只有确定要覆盖云端时，才手动上传本地进度。';
   }
  }else markReview(false);
  emit({cloud,cloudKnown:true,phase,message});
 };
 const refresh=async()=>{
  if(snapshot.busy||snapshot.preview)return;
  emit({busy:'account',message:''});
  try{
   const previous=snapshot.user?.puid,user=await transport.user();
   if(!user){emit({user:null,phase:'guest',cloud:null,cloudKnown:false,message:'登录虎扑后可使用云存档，本地游玩不受影响。'});return;}
   const changed=previous!==user.puid;
   if(changed){emit({cloud:null,cloudKnown:false});}
   emit({user});
   if(Date.now()<transport.rate().readUntil){
    if(!snapshot.cloudKnown)throw Error('请稍后刷新账号，读取此账号的云存档');
    return;
   }
   emit({busy:'read'});acceptRemote(await transport.read(user.puid));
  }catch(error){emit({phase:'error',message:errorText(error)});}
  finally{initialized=true;emit({busy:null});}
 };
 const upload=async()=>{
  available('write');
  if(!snapshot.cloudKnown)throw Error('尚未成功读取云存档，请先刷新账号；为保护已有云档，暂不上传');
  const raw=store.getState().exportCloudArchive();
  const progress=cloudProgress(raw); // Reject corrupt local data before starting a request.
  emit({busy:'write',message:''});
  try{
   await transport.write(raw,snapshot.user?.puid);markReview(false);
   emit({cloud:progress,cloudKnown:true,phase:'ready',message:'上传成功'});
  }catch(error){emit({phase:'error',message:errorText(error)});throw error;}
  finally{emit({busy:null});}
 };
 const prepareSync=async()=>{
  available('read');const generation=++syncGeneration;emit({busy:'read',message:''});
  try{
   const raw=await transport.read(snapshot.user?.puid);
   if(raw===null){acceptRemote(null);emit({message:'云端暂无存档，可先上传本地进度。'});return;}
   acceptRemote(raw);emit({preview:generation===syncGeneration?raw:null});
  }catch(error){emit({phase:'error',message:errorText(error)});throw error;}
  finally{emit({busy:null});}
 };
 const cancelSync=()=>{if(snapshot.busy!=='restore'){syncGeneration++;emit({preview:null});}};
 const confirmSync=async()=>{
  if(!snapshot.preview||snapshot.busy)return;
  const raw=snapshot.preview;emit({busy:'restore',message:''});
  try{
   const user=await transport.user();
   if(!user||user.puid!==snapshot.user?.puid)throw Error('虎扑账号已变化，请取消同步并刷新账号');
   store.getState().restoreCloudArchive(raw);
   markReview(false);
   emit({preview:null,phase:'ready',user,message:'同步成功，本地已恢复为云存档进度。'});
  }catch(error){emit({phase:'error',message:errorText(error)});throw error;}
  finally{emit({busy:null});}
 };
 return {
  getSnapshot:()=>snapshot,
  subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
  start:()=>{
   if(reviewRequired)markReview(true);if(!initialized&&!snapshot.busy)void refresh();
   return()=>{};
  },refresh,upload,prepareSync,confirmSync,cancelSync,
 };
}
export const cloudSync=createCloudSync(useContract);
