import {createHash,randomBytes,randomUUID} from 'node:crypto';
import activity from '../hupu-skills/activity.json';
import {challengeCanStart,challengeReferralCounts,dispatchGym,newGym,finishEquipmentMigration,initializeRecommendationRecords,type GymAction,type GymEvent,type GymState} from '../src/game/gym/engine';
import {settleOfflineGym,offlineLimitMs,type OfflineTrainingReport} from '../src/game/gym/offline';
import {validGym,validGymAlumnus} from '../src/game/gym/save';
import {challengeRewardCategories} from '../src/game/gym/challenge';
import {challengeEquipment} from '../src/game/gym/challengeCatalog';
import {validChallengeProjectLevels} from '../src/game/gym/challengeProjects';
import {parseGymCloudArchive} from '../src/platform/gymCloudArchive';
import {extractGymClockInterval,extractGymRecoveryClockInterval} from './gymTimeflowClock.mjs';
import {authorityFailure,type AuthorityCommand,type AuthorityDocument,type AuthorityTransaction,type GymAuthorityRepository} from './gymAuthorityRepository';
import {buildAuthorityGymRankingProgress,verifiedGymRankingProgress} from './gymRankProgress';

export type AuthorityActor={id:string;name?:string};
export type GymClockBinding={applicationId:string;environmentId:string;workspaceId:string;scopeType:'gym';scopeId:string;state:'active';displayName:string};
export type AuthorityClock={streamKey:string;ensure(options:{requestId:string}):Promise<unknown>;settle(options:{requestId:string;trigger:'login'|'foreground';async?:boolean}):Promise<ClockResult>;resume(options:{settlementId:string;async?:boolean;maxPolls?:number}):Promise<ClockResult>;ack(report:unknown):Promise<unknown>};
type ClockResult={status:'ready';settlementId:string;report:unknown}|{status:'pending';settlementId:string;pollAfterMs?:number;retryable?:boolean};
export type GymAuthoritySnapshot={applicationId:string;epoch:string;hasSave:boolean;mode:'timeflow';serverTime:number;revision:number;state?:GymState;events:GymEvent[];offlineReport?:OfflineTrainingReport;error?:string;replayed?:boolean;pending?:{pollAfterMs:number;stage:'settlement'|'ack'|'baseline';retryable:boolean};capabilities:{platformRewards:boolean;legacyAdoption:boolean}};
export type AuthorityPayload={epoch:string;requestId:string;expectedRevision?:number;action?:GymAction;archive?:string;rewardProof?:unknown};
const allowedActions:Record<string,readonly string[]>={
 'start-challenge':['attempt','checkpoint'],'refresh-challenge-draft':['attempt'],'draft-challenge':['attempt','players'],'play-challenge':['attempt','stage'],
 'choose-challenge-reward':['attempt','stage','category'],'take-challenge-reward':['attempt','stage','offer','targetId','replaceSlot','toBench','levelTargetIds'],
 'revive-challenge':['attempt','stage'],'retire-challenge-run':['attempt','stage'],
 'swap-challenge-lineup':['attempt','stage','starterId','reserveId'],
 'equip-challenge-gear':['attempt','stage','playerId','itemIndex','item'],'unequip-challenge-gear':['attempt','stage','playerId','itemIndex','item'],
 'assign-challenge-matchup':['attempt','stage','lane','playerId'],'upgrade-challenge-project':['projectId'],
 train:['id'],recommend:['id'],'use-drink':['id'],recruit:['preference','mode','direction','expectedNextPlayer','selectRecruited'],
 'buy-equipment':['id','replaceId','destination'],equip:['id','replaceId'],unequip:['id'],'sell-equipment':['id'],'upgrade-project':['id'],
 'set-training-plan':['id','playerId','scope'],'accept-cooperation':['id','playerId','scope'],'abandon-cooperation':['playerId','scope'],
 'share-player-levels':['playerId'],'restore-stamina-reward':['playerId','method','expectedCount'],
 'double-offline-experience':['reportId'],'dismiss-offline-report':['reportId'],
 'complete-cooperation-ad':['id','playerId','expectedCooperationId','expectedCooperationRevision','scope'],
 'select-player':['id'],'set-auto':['id','enabled'],'buy-drink':[],'buy-consumable':['id'],'use-consumable':['id','playerId'],'upgrade-gym':['targetLevel'],
};
const protectedActions=new Set(['share-player-levels','restore-stamina-reward','complete-cooperation-ad','double-offline-experience','refresh-challenge-draft','revive-challenge']);
const rewardMethod=(action:GymAction):'ad'|'post'=>action.type==='share-player-levels'||action.type==='revive-challenge'||action.type==='restore-stamina-reward'&&action.method==='share'?'post':'ad';
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const integer=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
function parseArchive(value:string){try{return parseGymCloudArchive(value);}catch{throw authorityFailure('ARCHIVE_INVALID',400,false,'本地档案无效，原进度已保留');}}
function canonical(value:unknown):string {if(Array.isArray(value))return'['+value.map(canonical).join(',')+']';if(object(value))return'{'+Object.keys(value).filter(key=>value[key]!==undefined).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';return JSON.stringify(value)??'null';}
const digest=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
function checkActor(actor:AuthorityActor){if(!actor||typeof actor.id!=='string'||!actor.id.trim()||actor.id.length>200||/[\u0000-\u001f]/.test(actor.id))throw authorityFailure('AUTH_REQUIRED',401,false,'请先登录虎扑');}
function checkAction(value:unknown):asserts value is GymAction {
 const reject=()=>{throw authorityFailure('ACTION_INVALID',400,false,'游戏操作参数无效');};
 if(!object(value)||typeof value.type!=='string'||!Object.hasOwn(allowedActions,value.type))reject();
 const action=value as Record<string,unknown>,type=action.type as string,fields=allowedActions[type];
 if(Object.keys(action).some(key=>key!=='type'&&!fields.includes(key)))reject();
 const id=(field:string,required=false)=>{if(action[field]===undefined&&!required)return;if(typeof action[field]!=='string'||!/^[A-Za-z0-9_:-]{1,120}$/.test(action[field] as string))reject();};
 const choice=(field:string,choices:readonly unknown[],required=false)=>{if(action[field]===undefined&&!required)return;if(!choices.includes(action[field]))reject();};
 if(fields.includes('id'))id('id',true);if(fields.includes('playerId'))id('playerId',true);
 if(fields.includes('replaceId'))id('replaceId');
 if(fields.includes('attempt')&&(!integer(action.attempt)||type!=='start-challenge'&&action.attempt<1))reject();
 if(fields.includes('stage')&&(!integer(action.stage)||action.stage<1))reject();
 if(type==='start-challenge'&&action.checkpoint!==undefined&&(!integer(action.checkpoint)||action.checkpoint<10||action.checkpoint%10!==0))reject();
 if(type==='draft-challenge'&&(!Array.isArray(action.players)||action.players.length!==3||new Set(action.players).size!==3||
    !action.players.every(player=>typeof player==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(player))))reject();
 if(type==='choose-challenge-reward')choice('category',challengeRewardCategories,true);
 if(type==='swap-challenge-lineup'){id('starterId',true);id('reserveId',true);}
 if(type==='equip-challenge-gear'||type==='unequip-challenge-gear'){
  const item=action.item;
  if(!integer(action.itemIndex)||!object(item)||Object.keys(item).length!==2||typeof item.id!=='string'||
     !challengeEquipment.has(item.id)||!integer(item.band))reject();
 }
 if(type==='assign-challenge-matchup'&&(!integer(action.lane)||action.lane>2))reject();
 if(type==='upgrade-challenge-project'&&(typeof action.projectId!=='string'||!validChallengeProjectLevels({[action.projectId]:0})))reject();
 if(type==='take-challenge-reward'){
  if(action.offer===-1){
   if(action.targetId!==undefined||action.replaceSlot!==undefined)reject();
  }else if(!integer(action.offer)||action.offer>2)reject();
  if(action.replaceSlot!==undefined&&(!integer(action.replaceSlot)||action.replaceSlot>2))reject();
  if(action.toBench!==undefined&&(action.toBench!==true||action.offer===-1||action.targetId!==undefined||action.replaceSlot!==undefined))reject();
  if(action.levelTargetIds!==undefined&&(!Array.isArray(action.levelTargetIds)||action.levelTargetIds.length!==2||
   new Set(action.levelTargetIds).size!==2||action.levelTargetIds.some(target=>typeof target!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(target))||
   action.offer!==0||action.targetId!==undefined||action.replaceSlot!==undefined||action.toBench!==undefined))reject();
  id('targetId');
 }
 if(fields.includes('reportId'))id('reportId',true);
 if(fields.includes('scope'))choice('scope',['roster']);
 if(fields.includes('destination'))choice('destination',['warehouse']);
 if(type==='set-training-plan')choice('id',['balanced','shooting','finishing','interior'],true);
 if(type==='set-auto'&&typeof action.enabled!=='boolean')reject();
 if(type==='recruit'){
  choice('preference',['any','guard','forward','center']);choice('mode',['selected']);choice('direction',['shooting','finishing','interior']);
  if(action.mode==='selected'&&action.direction===undefined||action.direction!==undefined&&action.mode!=='selected')reject();
  if(action.expectedNextPlayer!==undefined&&(!integer(action.expectedNextPlayer)||action.expectedNextPlayer<1))reject();
  if(action.selectRecruited!==undefined&&typeof action.selectRecruited!=='boolean')reject();
 }
 if(type==='restore-stamina-reward'){choice('method',['share','ad'],true);if(!integer(action.expectedCount))reject();}
 if(type==='complete-cooperation-ad'){
  if(action.expectedCooperationId!==null){id('expectedCooperationId',true);}
  if(action.expectedCooperationRevision!==null&&!integer(action.expectedCooperationRevision))reject();
 }
 if(type==='upgrade-gym'&&action.targetLevel!==undefined&&(!integer(action.targetLevel)||action.targetLevel<2||action.targetLevel>8))reject();
}

async function loadColdAlumni(tx: AuthorityTransaction, state: GymState) {
 const archived=state.alumniArchive?.count??0,persisted=tx.document?.state;
 const incomplete=()=>authorityFailure('HISTORY_INCOMPLETE',503,false,'球馆历史档案不完整，已保留原进度，请重试');
 if(!persisted||persisted.createdAt!==state.createdAt||persisted.seed!==state.seed
  ||(persisted.alumniArchive?.count??0)!==archived)throw incomplete();
 const hotCount=persisted.alumni.length,total=hotCount+archived,cold:GymState['alumni']=[];
 const ids=new Set(state.alumni.map(player=>player.id));
 while(cold.length<archived){
  const limit=Math.min(100,archived-cold.length),page=await tx.alumni(hotCount+cold.length,limit);
  if(!page||page.total!==total||!Array.isArray(page.players)||page.players.length!==limit)throw incomplete();
  for(const player of page.players){if(!validGymAlumnus(player,state)||ids.has(player.id))throw incomplete();ids.add(player.id);cold.push(player);}
 }
 return cold;
}
function checkPayload(value:unknown,kind:AuthorityCommand['kind']):asserts value is AuthorityPayload {
 const fields=['epoch','requestId',...(kind==='action'?['expectedRevision','action','rewardProof']:kind==='adopt'?['archive']:['expectedRevision'])];
 if(!object(value)||Object.keys(value).some(key=>!fields.includes(key))||typeof value.epoch!=='string'||typeof value.requestId!=='string'
  ||!/^[A-Za-z0-9][A-Za-z0-9_:-]{0,99}$/.test(value.requestId)||['constructor','prototype','__proto__'].includes(value.requestId)
  ||(value.expectedRevision!==undefined&&!integer(value.expectedRevision)))throw authorityFailure('REQUEST_INVALID',400,false,'请求参数无效');
 if(kind==='action'){if(!integer(value.expectedRevision))throw authorityFailure('REQUEST_INVALID',400);checkAction(value.action);}
 if(value.rewardProof!==undefined&&Buffer.byteLength(JSON.stringify(value.rewardProof))>16384)throw authorityFailure('REQUEST_INVALID',400);
 if(kind==='adopt'&&(typeof value.archive!=='string'||Buffer.byteLength(value.archive)>2*1024*1024))throw authorityFailure('ARCHIVE_INVALID',400,false,'本地档案无效或超过2MiB');
}

/** Preserve relative cooldowns, not the browser's absolute clock or prior offline interval. */
export function rebaseLegacyGym(source:GymState,anchor:number):GymState {
 const next=structuredClone(source),before=next.updatedAt,delta=anchor-before;
 const shift=(value:number)=>{const shifted=value===0?0:value+delta;if(!integer(shifted))throw authorityFailure('ARCHIVE_TIME_INVALID',400,false,'旧档时间无法迁移，原本地档案已保留');return shifted;};
 next.createdAt=shift(next.createdAt);next.updatedAt=anchor;
 for(const player of [next.player,...next.bench,...next.alumni])if(player){player.enteredAt=shift(player.enteredAt);player.nextShotAt=anchor+Math.max(0,player.nextShotAt-before);if('recommendedAt'in player)(player as typeof next.alumni[number]).recommendedAt=shift((player as typeof next.alumni[number]).recommendedAt);}
 for(const collection of [next.collection,next.collectedEquipment,next.legacyEquipmentCollection])if(collection)for(const item of Object.values(collection))item.firstAt=shift(item.firstAt);
 if(next.nextShotAt!==undefined)next.nextShotAt=anchor+Math.max(0,next.nextShotAt-before);
 next.offlineRulesVersion=2;next.revision++;
 delete next.offlineReward;
 const finished=finishEquipmentMigration(next);if(!validGym(finished)||finished.alumniArchive?.count)throw authorityFailure('ARCHIVE_INVALID',400,false,'旧档校验失败，原本地档案已保留');return finished;
}

export function createGymAuthorityService(options:{repository:GymAuthorityRepository;clockFactory:(binding:GymClockBinding)=>AuthorityClock;environmentId:string;workspaceId?:string;now?:()=>number;randomSeed?:()=>number;allowNativeRewards?:boolean;verifyReward?:(actor:AuthorityActor,action:GymAction,proof:unknown,context:{epoch:string;requestId:string})=>Promise<boolean>}){
 const {repository,clockFactory,environmentId,verifyReward}=options,now=options.now??Date.now,seed=options.randomSeed??(()=>randomBytes(4).readUInt32BE());
 const applicationId=activity.activityId,workspaceId=options.workspaceId??applicationId;
 if(!repository||!clockFactory||!environmentId||typeof window!=='undefined')throw Error('Server authority requires configured repository, clock and environment');
 const key=(actor:AuthorityActor)=>digest({applicationId,environmentId,actor:actor.id});
 const guard=async<T>(work:()=>Promise<T>):Promise<T>=>{try{return await work();}catch(error){const value=object(error)?error:{};if(typeof value.code==='string'&&Number.isInteger(value.statusCode))throw error;throw authorityFailure('TIMEFLOW_UNAVAILABLE',503,value.retryable===true,'平台离线结算暂不可用，已保存进度保留');}};
 const binding=(doc:AuthorityDocument):GymClockBinding=>({applicationId,environmentId,workspaceId,scopeType:'gym',scopeId:doc.scopeId,state:'active',displayName:`传奇球馆 · ${environmentId} · ${doc.epoch}`});
 const snapshot=(doc:AuthorityDocument,result:AuthorityCommand['result']={events:[]},pending?:GymAuthoritySnapshot['pending'],replayed=false):GymAuthoritySnapshot=>({applicationId,epoch:doc.epoch,hasSave:!!doc.state,mode:'timeflow',serverTime:doc.state?.updatedAt??now(),revision:doc.state?.revision??0,...(doc.state?{state:structuredClone(doc.state)}:{}),events:result?.events??[],...(doc.state?.offlineReward&&!doc.state.offlineReward.dismissed?{offlineReport:doc.state.offlineReward.report}:result?.offlineReport?{offlineReport:result.offlineReport}:{}),...(result?.error?{error:result.error}:{}),...(pending?{pending}:{}),...(replayed?{replayed:true}:{}),capabilities:{platformRewards:!!verifyReward||options.allowNativeRewards===true,legacyAdoption:!doc.state}});
 function nativeConfirmation(doc:AuthorityDocument,action:GymAction,proof:unknown,id:string){
  if(!options.allowNativeRewards||!object(proof)||Object.keys(proof).some(k=>!['challengeId','confirmation'].includes(k))||proof.confirmation!=='native-sdk-confirmation'||typeof proof.challengeId!=='string')return false;
  const challenge=doc.rewardChallenges?.[proof.challengeId];
  if(!challenge||challenge.actionHash!==digest(action)||challenge.method!==rewardMethod(action)||challenge.expiresAt<now()||challenge.consumedBy&&challenge.consumedBy!==id)return false;
  challenge.consumedBy=id;return true;
 }
 async function initial(tx:AuthorityTransaction,actor:AuthorityActor){
  if(tx.document){const d=tx.document;if(d.actorId!==actor.id||d.applicationId!==applicationId||d.environmentId!==environmentId||d.workspaceId!==workspaceId)throw authorityFailure('APP_NOT_AUTHORIZED',403);return d;}
  const numeric=BigInt('0x'+randomBytes(7).toString('hex'))+1n;
  return tx.commit({version:1,applicationId,environmentId,workspaceId,actorId:actor.id,epoch:randomUUID(),scopeId:numeric.toString(),scopeType:'gym',initialized:false,state:null,suspended:true,provenance:null,commands:{},pendingCommandId:null,settlements:{}});
 }
 async function process(tx:AuthorityTransaction,doc:AuthorityDocument,actor:AuthorityActor,id:string):Promise<GymAuthoritySnapshot>{
  let command=doc.commands[id];
  const responseUnknown=()=>authorityFailure('SETTLEMENT_RESPONSE_UNKNOWN',409,true,'平台结算确认暂时中断，原进度已保留，重新连接后继续恢复');
  const clock=clockFactory(binding(doc));
  const commit=async()=>{doc=await tx.commit(doc);command=doc.commands[id];};
  const clockKey=(phase:string)=>'gym_'+digest({epoch:doc.epoch,id,phase}).slice(0,60);
  // The platform does not replay settlement POSTs by logical key. A lost
  // response is retained as an unknown attempt; a NEW anchor request recovers
  // the same business command using its last durable platform cursor.
  if(command.status==='submitting'){
   command.recoveryAttempts=(command.recoveryAttempts??0)+1;
   command.payload.baselineAttempt=(integer(command.payload.baselineAttempt)?command.payload.baselineAttempt:0)+1;
   command.status='prepared';await commit();
  }
  if(!doc.initialized){await clock.ensure({requestId:clockKey('ensure')});doc.initialized=true;await commit();}
  if(command.status==='applied'){
   if(digest(command.report)!==doc.settlements[command.settlementId!]?.reportHash)throw authorityFailure('SETTLEMENT_CONFLICT',409,false,'结算报告内容与持久记录不一致');
   try{await clock.ack(command.report);}catch(error){return snapshot(doc,command.result,{pollAfterMs:1000,stage:'ack',retryable:(error as {retryable?:unknown})?.retryable===true});}
   doc.settlements[command.settlementId!].status='acked';
   if(command.checkpointOnly){command.status='prepared';command.payload.baselineAttempt=(integer(command.payload.baselineAttempt)?command.payload.baselineAttempt:0)+1;delete command.checkpointOnly;delete command.report;delete command.settlementId;await commit();return snapshot(doc,undefined,{pollAfterMs:250,stage:'settlement',retryable:true});}
   if(!doc.state){command.status='prepared';command.payload.baselineAttempt=(integer(command.payload.baselineAttempt)?command.payload.baselineAttempt:0)+1;delete command.report;delete command.settlementId;await commit();return snapshot(doc,undefined,{pollAfterMs:250,stage:'baseline',retryable:true});}
   command.status='done';doc.pendingCommandId=null;delete command.report;await commit();return snapshot(doc,command.result);
  }
  const attempt=integer(command.payload.baselineAttempt)?command.payload.baselineAttempt:0;
  if(command.status==='prepared'&&command.async===undefined){command.async=!!doc.state&&now()-doc.state.updatedAt>=5*60_000;await commit();}
  let response:ClockResult;
  if(command.status==='received'&&command.settlementId&&command.report)response={status:'ready',settlementId:command.settlementId,report:command.report};
  else if(command.status==='pending'&&command.settlementId)response=await clock.resume({settlementId:command.settlementId,async:command.async,maxPolls:0});
  else if(command.status==='prepared'){
   command.status='submitting';await commit();
   try{response=await clock.settle({requestId:clockKey('settle:'+attempt),trigger:doc.state?'foreground':'login',async:command.async===true});}
   catch(error){const failure=error as {retryable?:unknown;retryAfterMs?:unknown};return snapshot(doc,undefined,{pollAfterMs:integer(failure?.retryAfterMs)?Math.min(30000,Math.max(250,failure.retryAfterMs)):1000,stage:'settlement',retryable:failure?.retryable===true});}
  }else throw responseUnknown();
  if(typeof response.settlementId!=='string'||!/^[A-Za-z0-9_:-]{1,64}$/.test(response.settlementId))throw responseUnknown();
  if(response.status==='pending'){command.status='pending';command.settlementId=response.settlementId;await commit();return snapshot(doc,undefined,{pollAfterMs:Math.max(250,response.pollAfterMs??1000),stage:'settlement',retryable:response.retryable!==false});}
  if(command.status!=='received'){
   // Preserve the known report before validation/business work. If that work is
   // interrupted, resume this exact report rather than advancing platform time.
   command.status='received';command.settlementId=response.settlementId;command.report=response.report;await commit();
  }
  let interval:{from:number;to:number;effectiveTo:number;realDuration:number;effectiveDuration:number}|null;
  try{interval=(command.recoveryAttempts&&doc.state?extractGymRecoveryClockInterval(response.report,clock.streamKey,doc.state.updatedAt):extractGymClockInterval(response.report,clock.streamKey,doc.state?.updatedAt)) as typeof interval;}
  catch{throw authorityFailure('CLOCK_REPORT_INVALID',409,false,'平台时间报告无法与已保存游标对齐，已暂停结算');}
  const prior=doc.settlements[response.settlementId];
  const reportHash=digest(response.report);
  if(prior&&(prior.commandId!==id||prior.reportHash!==reportHash))throw authorityFailure('SETTLEMENT_CONFLICT',409,false,'平台结算号或报告内容与已提交操作冲突');
  if(command.recoveryAttempts&&doc.state&&!interval){
   command.checkpointOnly=true;command.result={events:[]};command.status='applied';
   doc.settlements[response.settlementId]={commandId:id,status:'applied',cursor:doc.state.updatedAt,reportHash};await commit();
   try{await clock.ack(command.report);}catch(error){return snapshot(doc,undefined,{pollAfterMs:1000,stage:'ack',retryable:(error as {retryable?:unknown})?.retryable===true});}
   doc.settlements[response.settlementId].status='acked';command.status='prepared';command.payload.baselineAttempt=attempt+1;delete command.checkpointOnly;delete command.report;delete command.settlementId;await commit();return snapshot(doc,undefined,{pollAfterMs:250,stage:'settlement',retryable:true});
  }
  if(!doc.state&&!interval){
   // A zero initial report has no absolute platform anchor. Receipt it, then use
   // a new persisted logical key; never seed a game using a fabricated timestamp.
   command.status='applied';command.result={events:[]};doc.settlements[response.settlementId]={commandId:id,status:'applied',cursor:0,reportHash};await commit();
   try{await clock.ack(command.report);}catch(error){return snapshot(doc,undefined,{pollAfterMs:1000,stage:'ack',retryable:(error as {retryable?:unknown})?.retryable===true});}
   doc.settlements[response.settlementId].status='acked';command.status='prepared';command.payload.baselineAttempt=attempt+1;delete command.report;delete command.settlementId;await commit();return snapshot(doc,undefined,{pollAfterMs:250,stage:'baseline',retryable:true});
  }
  let result:AuthorityCommand['result']={events:[]};
  let coldAlumni:GymState['alumni']|undefined;
  if(!doc.state){
   if(command.kind!=='start'&&command.kind!=='adopt')throw authorityFailure('GYM_REQUIRED',409,false,'请先开设训练馆');
   const anchor=interval!.to;
   if(command.kind==='start'){const random=seed();if(!integer(random)||random>0xffffffff)throw Error('Invalid server seed');doc.state=newGym(anchor,random);doc.provenance='server-created';}
   else{doc.state=rebaseLegacyGym(parseArchive(command.payload.archive as string).state,anchor);doc.provenance='legacy-unverified';delete command.payload.archive;}
   doc.suspended=false;
  }else{
   const current=doc.state;
   if(interval&&interval.from>current.updatedAt)throw authorityFailure('CLOCK_GAP',409,false,'平台时间与已保存游标之间存在缺口，已暂停结算');
   const end=interval?Math.max(current.updatedAt,interval.to):current.updatedAt;
   const resumed=command.kind==='resume'||doc.suspended||!!command.recoveryAttempts||end-current.updatedAt>=10000;
   const available=interval?interval.effectiveDuration:0;
   const onlineEvents:GymEvent[]=[];
   const collect=end-current.updatedAt<5000&&!doc.suspended?(events:readonly GymEvent[])=>{onlineEvents.push(...events);if(onlineEvents.length>64)onlineEvents.splice(0,onlineEvents.length-64);}:undefined;
   const replay=settleOfflineGym(current,end,Math.min(available,resumed?offlineLimitMs(current):available),collect);
   doc.state={...replay.state,offlineRulesVersion:2};
   result.events=onlineEvents;
   if(resumed&&replay.report&&end-current.updatedAt>=5000&&replay.report.totalShots>0)result.offlineReport=replay.report;
   if(command.kind==='action'){
    const action=command.payload.action as GymAction;
    let verified=true;
    if(protectedActions.has(action.type))verified=verifyReward?await verifyReward(actor,action,command.payload.rewardProof,{epoch:doc.epoch,requestId:id}):nativeConfirmation(doc,action,command.payload.rewardProof,id);
    if(!verified)result.error='平台奖励尚未完成服务器校验，未发放奖励';
    else{
     if(action.type==='start-challenge'&&challengeCanStart(doc.state)&&!doc.state.challengeReferralCounts&&doc.state.alumniArchive?.count){
      coldAlumni=await loadColdAlumni(tx,doc.state);
      const archived=challengeReferralCounts(coldAlumni);
      doc.state={...initializeRecommendationRecords(doc.state,Object.keys(archived)),challengeReferralCounts:challengeReferralCounts(doc.state.alumni,archived)};
     }
     const dispatched=dispatchGym(doc.state,doc.state.revision,action,doc.state.updatedAt);doc.state=dispatched.state;
     result.events.push(...dispatched.events);if(dispatched.error)result.error=dispatched.error;
    }
   }
   doc.suspended=command.kind==='suspend';
  }
  if(!validGym(doc.state))throw authorityFailure('STATE_INVALID');
  if(doc.provenance==='server-created'&&!doc.ranking&&(doc.state.alumniArchive?.count??0)>0){
   // Older authoritative gyms predate ranking checkpoints. Bootstrap once from
   // the actual persisted cold history; the current action may already have
   // appended a recommendation to the in-memory hot history, so do not reload
   // or replace that current hot suffix with its pre-action database version.
   const archived=doc.state.alumniArchive!.count,cold=coldAlumni??await loadColdAlumni(tx,doc.state);
   doc.ranking={...verifiedGymRankingProgress({binding:{applicationId,actor:doc.actorId,runId:`${doc.state.createdAt}-${doc.state.seed}`},
    evidenceId:response.settlementId,state:doc.state,alumni:[...cold,...doc.state.alumni]}),historyCount:archived+doc.state.alumni.length};
  }else doc.ranking=buildAuthorityGymRankingProgress(doc,response.settlementId);
  command.result=result;command.status='applied';doc.settlements[response.settlementId]={commandId:id,status:'applied',cursor:doc.state.updatedAt,reportHash};
  await commit(); // State, report and unique receipt become durable before ACK.
  try{await clock.ack(command.report);}catch(error){return snapshot(doc,result,{pollAfterMs:1000,stage:'ack',retryable:(error as {retryable?:unknown})?.retryable===true});}
  doc.settlements[response.settlementId].status='acked';command.status='done';doc.pendingCommandId=null;delete command.report;
  const done=Object.entries(doc.commands).filter(([,value])=>value.status==='done').sort((a,b)=>a[1].createdAt-b[1].createdAt);
  for(const [old]of done.slice(0,Math.max(0,done.length-256)))delete doc.commands[old];
  const receipts=Object.entries(doc.settlements).filter(([,value])=>value.status==='acked');for(const [old]of receipts.slice(0,Math.max(0,receipts.length-1024)))delete doc.settlements[old];
  await commit();return snapshot(doc,result);
 }
 async function command(actor:AuthorityActor,payload:AuthorityPayload,kind:AuthorityCommand['kind']){
  checkActor(actor);checkPayload(payload,kind);
  return guard(()=>repository.withActor(key(actor),async tx=>{
   let doc=await initial(tx,actor);if(payload.epoch!==doc.epoch)throw authorityFailure('EPOCH_MISMATCH',409,false,'账号或球馆已切换，请刷新后重试');
   const fingerprint=digest({kind,payload});
   const existing=Object.hasOwn(doc.commands,payload.requestId)?doc.commands[payload.requestId]:null;
   if(existing){if(existing.fingerprint!==fingerprint)throw authorityFailure('IDEMPOTENCY_KEY_MISMATCH',409,false,'同一操作标识不能用于不同请求');if(existing.status==='done')return snapshot(doc,existing.result,undefined,true);return process(tx,doc,actor,payload.requestId);}
   if(doc.pendingCommandId){const recovered=await process(tx,doc,actor,doc.pendingCommandId);if(recovered.pending)return recovered;doc=tx.document!;}
   if((kind==='start'||kind==='adopt')&&doc.state)throw authorityFailure('GYM_ALREADY_EXISTS',409,false,'当前球馆已开设，请继续经营');
   if(kind!=='start'&&kind!=='adopt'&&!doc.state)throw authorityFailure('GYM_REQUIRED',409,false,'请先开设训练馆');
   if(payload.expectedRevision!==undefined&&payload.expectedRevision!==(doc.state?.revision??0))throw authorityFailure('REVISION_CONFLICT',409,true,'球馆已更新，请刷新进度后重试');
   if(kind==='adopt')parseArchive(payload.archive!);
   doc.commands[payload.requestId]={kind,fingerprint,payload:structuredClone(payload) as unknown as Record<string,unknown>,status:'prepared',createdAt:now()};doc.pendingCommandId=payload.requestId;
   doc=await tx.commit(doc);return process(tx,doc,actor,payload.requestId);
  }));
 }
 return Object.freeze({
  async prepareReward(actor:AuthorityActor,payload:{epoch:string;action:GymAction}){
   checkActor(actor);if(!object(payload)||Object.keys(payload).some(k=>!['epoch','action'].includes(k)))throw authorityFailure('REQUEST_INVALID',400);checkAction(payload.action);
   if(!options.allowNativeRewards||!protectedActions.has(payload.action.type))throw authorityFailure('REWARD_UNAVAILABLE',409,false,'当前奖励暂不可用');
   return guard(()=>repository.withActor(key(actor),async tx=>{
    let doc=await initial(tx,actor);if(payload.epoch!==doc.epoch)throw authorityFailure('EPOCH_MISMATCH',409,false,'账号或球馆已切换');
    if(doc.pendingCommandId){const recovered=await process(tx,doc,actor,doc.pendingCommandId);if(recovered.pending)throw authorityFailure('SETTLEMENT_PENDING',409,true,'离线收益正在保存，请稍后领取');doc=tx.document!;}
    if(!doc.state)throw authorityFailure('GYM_REQUIRED',409);
    // Reject stale/claimed rewards before opening a native ad or post editor.
    const preview=dispatchGym(doc.state,doc.state.revision,payload.action,doc.state.updatedAt);
    if(preview.error)throw authorityFailure('REWARD_INELIGIBLE',409,false,preview.error);
    const challengeId=randomUUID(),expiresAt=now()+15*60_000;
    const challenges=doc.rewardChallenges??{};
    for(const [id,entry]of Object.entries(challenges))if(entry.expiresAt<now())delete challenges[id];
    if(Object.keys(challenges).length>=128)throw authorityFailure('RATE_LIMITED',429,true,'奖励请求过于频繁，请稍后再试');
    challenges[challengeId]={actionHash:digest(payload.action),method:rewardMethod(payload.action),expiresAt};doc.rewardChallenges=challenges;await tx.commit(doc);
    return{challengeId,expiresAt,method:rewardMethod(payload.action),confirmation:'native-sdk-confirmation'};
   }));
  },
  async session(actor:AuthorityActor){checkActor(actor);return guard(()=>repository.withActor(key(actor),async tx=>{const doc=await initial(tx,actor);return doc.pendingCommandId?process(tx,doc,actor,doc.pendingCommandId):snapshot(doc);}));},
  start:(actor:AuthorityActor,payload:AuthorityPayload)=>command(actor,payload,'start'),
  adopt:(actor:AuthorityActor,payload:AuthorityPayload)=>command(actor,payload,'adopt'),
  action:(actor:AuthorityActor,payload:AuthorityPayload)=>command(actor,payload,'action'),
  resume:(actor:AuthorityActor,payload:AuthorityPayload)=>command(actor,payload,'resume'),
  suspend:(actor:AuthorityActor,payload:AuthorityPayload)=>command(actor,payload,'suspend'),
  async alumni(actor:AuthorityActor,payload:{epoch:string;offset?:number;limit?:number}){checkActor(actor);if(!object(payload)||Object.keys(payload).some(key=>!['epoch','offset','limit'].includes(key))||!integer(payload.offset??0)||!integer(payload.limit??20)||(payload.limit??20)<1||(payload.limit??20)>100)throw authorityFailure('REQUEST_INVALID',400);return guard(()=>repository.withActor(key(actor),async tx=>{const doc=await initial(tx,actor);if(payload.epoch!==doc.epoch)throw authorityFailure('EPOCH_MISMATCH',409);return tx.alumni(payload.offset??0,payload.limit??20);}));},
 });
}
export type GymAuthorityService=ReturnType<typeof createGymAuthorityService>;
