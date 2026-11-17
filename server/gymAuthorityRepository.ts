import {createHash, randomUUID} from 'node:crypto';
import {mkdir,open,readFile,readdir,rename,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {recommendation, type GymAlumnus, type GymState} from '../src/game/gym/engine';
import type {GymEvent} from '../src/game/gym/engine';
import type {OfflineTrainingReport} from '../src/game/gym/offline';
import type {AlumniPage} from '../src/game/gym/history';
import type {AuthorityGymRankingProgress} from './gymRankProgress';

export type AuthorityCommand = {
 kind: 'start'|'adopt'|'action'|'resume'|'suspend'; fingerprint: string;
 payload: Record<string,unknown>; status: 'prepared'|'submitting'|'pending'|'received'|'applied'|'done';
 settlementId?: string; async?: boolean; report?: unknown;
 recoveryAttempts?: number; checkpointOnly?: boolean;
 result?: {events: GymEvent[]; offlineReport?: OfflineTrainingReport; error?: string};
 createdAt: number;
};
export type AuthorityDocument = {
 version: 1; applicationId: string; environmentId: string; workspaceId: string;
 actorId: string; epoch: string; scopeId: string; scopeType: 'gym';
 initialized: boolean; state: GymState|null; suspended: boolean;
 provenance: 'server-created'|'legacy-unverified'|null;
 ranking?: AuthorityGymRankingProgress|null;
 rewardChallenges?: Record<string,{actionHash:string;method:'ad'|'post';expiresAt:number;consumedBy?:string}>;
 commands: Record<string,AuthorityCommand>; pendingCommandId: string|null;
 settlements: Record<string,{commandId:string; status:'applied'|'acked'; cursor:number;reportHash:string}>;
};
export type AuthorityTransaction = {
 document: AuthorityDocument|null;
 commit(document: AuthorityDocument): Promise<AuthorityDocument>;
 alumni(offset: number,limit: number): Promise<AlumniPage>;
};
export interface GymAuthorityRepository {
 readonly kind: 'file-development'|'cloudbase';
 withActor<T>(key: string,work: (transaction:AuthorityTransaction)=>Promise<T>): Promise<T>;
}
const copy=<T>(value:T):T=>structuredClone(value);
const bindingQueues=new Map<string,Promise<unknown>>();
async function bindExclusive<T>(directory:string,work:()=>Promise<T>):Promise<T>{const prior=bindingQueues.get(directory)??Promise.resolve();const next=prior.catch(()=>{}).then(work);bindingQueues.set(directory,next);try{return await next;}finally{if(bindingQueues.get(directory)===next)bindingQueues.delete(directory);}}
export const authorityFailure=(code:string,statusCode=503,retryable=false,message=code)=>Object.assign(new Error(message),{code,statusCode,retryable});

/** Only the hot hundred travel on each commit. Cold records are appended in the same repository transaction. */
function compact(document: AuthorityDocument): {document:AuthorityDocument; additions:GymAlumnus[]; firstSequence:number} {
 const next=copy(document),state=next.state;
 if(!state)return{document:next,additions:[],firstSequence:0};
 const overflow=Math.max(0,state.alumni.length-100);
 const archive=state.alumniArchive;
 const firstSequence=archive?.count??0;
 if(!overflow)return{document:next,additions:[],firstSequence};
 const metadata={...(archive??{id:next.epoch,count:0,effectiveCount:0,legendCount:0,bestTier:0})};
 const additions=state.alumni.slice(0,overflow);
 for(const player of additions){const earned=recommendation(player);if(earned.growth>0&&earned.tier>=1){metadata.effectiveCount++;if(earned.tier===5)metadata.legendCount++;metadata.bestTier=Math.max(metadata.bestTier,earned.tier);}}
 metadata.count+=overflow;state.alumniArchive=metadata;state.alumni=state.alumni.slice(overflow);
 return{document:next,additions,firstSequence};
}
function page(document:AuthorityDocument|null,cold:readonly GymAlumnus[],offset:number,limit:number):AlumniPage {
 const state=document?.state;if(!state)return{players:[],total:0};
 const total=state.alumni.length+(state.alumniArchive?.count??0);
 if(cold.length!==(state.alumniArchive?.count??0))throw authorityFailure('HISTORY_INCOMPLETE');
 const newest=[...state.alumni].reverse();
 const players:GymAlumnus[]=[];
 for(let index=offset;index<Math.min(total,offset+limit);index++)players.push(copy(index<newest.length?newest[index]:cold[cold.length-1-(index-newest.length)]));
 return{players,total};
}

/** Single-process, local-development repository. Never select this in a production cloud function. */
export function createFileGymAuthorityRepository(directory:string):GymAuthorityRepository {
 const root=resolve(directory),queues=new Map<string,Promise<unknown>>();
 return{kind:'file-development',async withActor<T>(key:string,work:(tx:AuthorityTransaction)=>Promise<T>):Promise<T>{
  const previous=queues.get(key)??Promise.resolve();
  const next=previous.catch(()=>{}).then(async()=>{
   await mkdir(root,{recursive:true,mode:0o700});
   const file=resolve(root,createHash('sha256').update(key).digest('hex')+'.json');
   let record:{document:AuthorityDocument|null;cold:GymAlumnus[]}={document:null,cold:[]};
   try{record=JSON.parse(await readFile(file,'utf8'));if(!record||!Array.isArray(record.cold)||!('document'in record))throw Error('invalid repository');}
   catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw authorityFailure('REPOSITORY_INVALID');}
   const tx:AuthorityTransaction={document:copy(record.document),async commit(document){return bindExclusive(root,async()=>{
    // A local collision must fail before Timeflow registration, just like the
    // shared SQL unique ownership index. Do not merge another actor's clock.
    if(!record.document){for(const name of await readdir(root)){if(!name.endsWith('.json')||resolve(root,name)===file)continue;const other=JSON.parse(await readFile(resolve(root,name),'utf8')).document as AuthorityDocument|null;if(other&&(other.epoch===document.epoch||(other.workspaceId===document.workspaceId&&other.scopeType===document.scopeType&&other.scopeId===document.scopeId)))throw authorityFailure('SCOPE_BINDING_CONFLICT',409,false,'球馆时间作用域已绑定，未复用其他玩家进度');}}
    const prepared=compact(document);
    const sameEpoch=record.document?.epoch===document.epoch;
    const cold=sameEpoch?[...record.cold]:[];
    if(cold.length!==prepared.firstSequence)throw authorityFailure('HISTORY_CONFLICT');
    cold.push(...prepared.additions);
    const future={document:prepared.document,cold};
    const temporary=file+'.'+randomUUID()+'.tmp';let handle;
    try{handle=await open(temporary,'wx',0o600);await handle.writeFile(JSON.stringify(future));await handle.sync();await handle.close();handle=undefined;await rename(temporary,file);}
    catch{await handle?.close().catch(()=>{});await unlink(temporary).catch(()=>{});throw authorityFailure('SAVE_FAILED');}
    record=future;tx.document=copy(prepared.document);return copy(prepared.document);
   });
   },async alumni(offset,limit){return page(tx.document,record.cold,offset,limit);}};
   return work(tx);
  });
  queues.set(key,next);try{return await next;}finally{if(queues.get(key)===next)queues.delete(key);}
 }};
}

export type AuthorityRpc=(name:string,body:Record<string,unknown>)=>Promise<unknown>;
/** RPCs use one shared actor lease with fencing plus compare-and-swap document commits. */
export function createCloudBaseGymAuthorityRepository(rpc:AuthorityRpc,options:{leaseMs?:number}={}):GymAuthorityRepository {
 const leaseMs=options.leaseMs??120_000;
 if(!Number.isSafeInteger(leaseMs)||leaseMs<30_000||leaseMs>180_000)throw Error('Invalid repository lease');
 return{kind:'cloudbase',async withActor<T>(key:string,work:(tx:AuthorityTransaction)=>Promise<T>):Promise<T>{
  const owner=randomUUID();
  const claim=await rpc('gym_authority_claim',{p_actor_key:key,p_owner:owner,p_lease_ms:leaseMs}) as {document:AuthorityDocument|null;version:number;fence:number};
  if(!claim||!Number.isSafeInteger(claim.version)||!Number.isSafeInteger(claim.fence))throw authorityFailure('REPOSITORY_UNAVAILABLE');
  let version=claim.version;
  const tx:AuthorityTransaction={document:copy(claim.document),async commit(document){
   const prepared=compact(document);
   const saved=await rpc('gym_authority_commit',{p_actor_key:key,p_owner:owner,p_fence:claim.fence,p_expected_version:version,p_document:prepared.document,p_alumni:prepared.additions,p_first_sequence:prepared.firstSequence}) as {version:number};
   if(!saved||saved.version!==version+1)throw authorityFailure('REVISION_CONFLICT',409,true);
   version=saved.version;tx.document=copy(prepared.document);return copy(prepared.document);
  },async alumni(offset,limit){
   const result=await rpc('gym_authority_alumni',{p_actor_key:key,p_epoch:tx.document?.epoch,p_offset:offset,p_limit:limit}) as AlumniPage;
   if(!result||!Array.isArray(result.players)||!Number.isSafeInteger(result.total))throw authorityFailure('HISTORY_INCOMPLETE');
   return result;
  }};
  try{return await work(tx);}finally{await rpc('gym_authority_release',{p_actor_key:key,p_owner:owner,p_fence:claim.fence}).catch(()=>{});}
 }};
}
