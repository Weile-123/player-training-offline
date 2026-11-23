import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createHash,createHmac} from 'node:crypto';
import {mkdir,mkdtemp,readdir,readFile,rm,writeFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {createServer} from 'node:http';
import {createGymAuthorityService,type AuthorityClock,type GymClockBinding} from '../server/gymAuthorityService';
import {createFileGymAuthorityRepository,createCloudBaseGymAuthorityRepository,type AuthorityDocument,type GymAuthorityRepository} from '../server/gymAuthorityRepository';
import {createGymAuthorityHttpHandler} from '../server/gymAuthorityHttp';
import {challengePlayerPool,dispatchGym,newGym,type GymAction,type GymState} from '../src/game/gym/engine';
import {encodeGym,validGym} from '../src/game/gym/save';
import {settleOfflineGym} from '../src/game/gym/offline';
import {createGymClock} from '../server/gymTimeflowClock.mjs';
import {templateRules} from '../src/game/contract/templates';
import {challengeDraft,challengeFixture,challengeRewardChoices,challengeRulesVersion,challengeSeed,challengeStage,recommendedChallengeDraft} from '../src/game/gym/challenge';
import {challengeCards,challengeTemplateIds} from '../src/game/gym/challengeCatalog';
import {challengeMatchupActions,legacyV5ChallengeGym,qualifiedChallengeGym} from './fixtures/challengeGym';

const applicationId='app_847cdb589a',actor={id:'verified-player-a'},base=resolve('.tmp/gym-authority-tests');
const authorityKey=createHash('sha256').update(JSON.stringify({actor:actor.id,applicationId,environmentId:'test'})).digest('hex');
let directory:string;
beforeEach(async()=>{await mkdir(base,{recursive:true});directory=await mkdtemp(resolve(base,'case-'));});
afterEach(async()=>{if(!resolve(directory).startsWith(base+sep))throw Error('Unsafe test directory');await rm(directory,{recursive:true,force:true});});
const report=(id:string,from:number,to:number)=>({settlementId:id,realDuration:to-from,effectiveDuration:to-from,segments:to>from?[{from,to,streamKey:'clock:main',metricId:'elapsed_ms',phaseIndex:0,rate:'1',produced:String(to-from),capped:'0',netChange:String(to-from)}]:[],gains:to>from?{elapsed_ms:String(to-from)}:{},losses:{},capped:{},events:[],ruleVersions:to>from?{gym_clock_ms:1}:{},definitionVersion:1,replayed:false,approximated:false});
function clocks(){
 let time=1_800_000_000_000,serial=0,ackFailures=0,zero=0,pending=0,gap=0,resumePending=0,cap=0;
 const cursors=new Map<string,number>(),reports=new Map<string,ReturnType<typeof report>>(),requests=new Map<string,ReturnType<typeof report>>(),acks:string[]=[];
 const asyncFlags:boolean[]=[];
 const factory=(binding:GymClockBinding):AuthorityClock=>({streamKey:'clock:main',async ensure(){if(!cursors.has(binding.scopeId))cursors.set(binding.scopeId,time-1);},async settle({requestId,async}){
  asyncFlags.push(async===true);
  let item=requests.get(requestId);if(!item){const from=cursors.get(binding.scopeId)!;item=report('receipt-'+(++serial),from+gap,zero>0?from:time);if(zero>0)zero--;else cursors.set(binding.scopeId,time);gap=0;requests.set(requestId,item);reports.set(item.settlementId,item);}
  if(cap&&item.realDuration>cap){const capped=report(item.settlementId,time-cap,time);item={...capped,realDuration:item.realDuration};requests.set(requestId,item);reports.set(item.settlementId,item);cap=0;}
  if(pending>0){pending--;return{status:'pending',settlementId:item.settlementId,pollAfterMs:250};}return{status:'ready',settlementId:item.settlementId,report:item};
 },async resume({settlementId}){if(resumePending>0){resumePending--;return{status:'pending',settlementId,pollAfterMs:250};}const item=reports.get(settlementId)!;return{status:'ready',settlementId,report:item};},async ack(value){const item=value as ReturnType<typeof report>;acks.push(item.settlementId);if(ackFailures>0){ackFailures--;throw Error('ACK disconnected');}}});
 return{factory,acks,requests,asyncFlags,advance:(ms:number)=>{time+=ms;},failAck:()=>{ackFailures++;},zero:()=>{zero++;},pending:()=>{pending++;},resumePending:(count:number)=>{resumePending=count;},cap:(ms:number)=>{cap=ms;},gap:()=>{gap=5;},get time(){return time;}};
}
function fixture(){const clock=clocks(),repository=createFileGymAuthorityRepository(directory);return{clock,repository,service:createGymAuthorityService({repository,clockFactory:clock.factory,environmentId:'test',now:()=>42,randomSeed:()=>123})};}
async function document(){const file=(await readdir(directory)).find(name=>name.endsWith('.json'))!;return JSON.parse(await readFile(resolve(directory,file),'utf8')) as {document:AuthorityDocument;cold:unknown[]};}
const archive=(state:GymState)=>JSON.stringify({format:'legend-gym-cloud-v1',applicationId,uploadedAt:state.updatedAt,gym:encodeGym(state)});
async function open(test:ReturnType<typeof fixture>){const session=await test.service.session(actor);return test.service.start(actor,{epoch:session.epoch,requestId:'start-1'});}
async function seedPreRankingHistory(test:ReturnType<typeof fixture>){
 await open(test);
 return test.repository.withActor(authorityKey,async tx=>{
  const doc=structuredClone(tx.document!),state=doc.state!,template=templateRules.find(item=>item.tier==='rotation')!;
  state.player!.templateId=template.id;state.player!.highestTier=template.tier;state.player!.height=template.height[0];
  state.alumni=Array.from({length:235},(_,index)=>({...structuredClone(state.player!),id:'historical-'+index,recommendedAt:state.updatedAt,
   rewardCredits:0,rewardFame:0,finalValue:index===0?'999999999999999999999':'320'}));
  state.revision++;delete doc.ranking;
  expect(validGym(state)).toBe(true);
  return tx.commit(doc); // Real repository compaction writes 135 cold records.
 });
}
function failCommit(repository:GymAuthorityRepository,predicate:(doc:AuthorityDocument)=>boolean):GymAuthorityRepository {
 return{kind:repository.kind,withActor:(key,work)=>repository.withActor(key,tx=>work(new Proxy(tx,{get(target,property){if(property==='commit')return async(doc:AuthorityDocument)=>{if(predicate(doc))throw Object.assign(Error('simulated process interruption'),{code:'SAVE_FAILED',statusCode:503,retryable:false});return target.commit(doc);};return Reflect.get(target,property);}})))};
}

describe('authoritative Gym business service',()=>{
 it('keeps existing V5 challenge draws, scoring, and bench rewards available through the authoritative commands',async()=>{
  const test=fixture(),session=await test.service.session(actor),eligible=qualifiedChallengeGym();
  eligible.challengeProjects={scouting:1};
  let snapshot=await test.service.adopt(actor,{epoch:session.epoch,requestId:'challenge-adopt',archive:archive(legacyV5ChallengeGym(eligible))});
  const command=(requestId:string,action:GymAction)=>({
    epoch:snapshot.epoch,requestId,expectedRevision:snapshot.revision,action});
  const state=snapshot.state!,seed=challengeSeed(state.seed,1),run=state.challenge!.run,pool=challengePlayerPool(state,run.rulesVersion);
  expect(run.rulesVersion).toBe(5);
  expect(run.settings?.projects).toEqual({scouting:1});
  const players=recommendedChallengeDraft(challengeDraft(seed,pool,pool.length,run.rulesVersion,run.settings),challengeFixture(seed,1,run.rulesVersion));
  snapshot=await test.service.action(actor,command('challenge-draft',{type:'draft-challenge',attempt:1,players}));
  await expect(test.service.action(actor,command('challenge-invalid-lane',{type:'assign-challenge-matchup',attempt:1,stage:1,lane:3,playerId:players[0]}))).rejects.toMatchObject({code:'ACTION_INVALID'});
  const arrange=async()=>{
   for(const assignment of challengeMatchupActions(snapshot.state!)){
    snapshot=await test.service.action(actor,command(`challenge-lane-${assignment.stage}-${assignment.lane}`,assignment));
   }
  };
  await arrange();
  const play=command('challenge-play',{type:'play-challenge',attempt:1,stage:1});
  snapshot=await test.service.action(actor,play);
  expect(snapshot.state!.challenge!.run.phase).toBe('reward');
  expect(snapshot.state!.fame).toBe(eligible.fame+6);
  expect((await test.service.action(actor,play)).state!.fame).toBe(snapshot.state!.fame);
  const extra=command('challenge-score',{type:'play-challenge',attempt:1,stage:1});
  await expect(test.service.action(actor,{...extra,action:{...extra.action,score:999} as typeof extra.action})).rejects.toMatchObject({code:'ACTION_INVALID'});
  snapshot=await test.service.action(actor,command('challenge-category',{type:'choose-challenge-reward',attempt:1,stage:1,category:'level'}));
  expect(snapshot.state!.challenge!.run.rewardCategory).toBe('level');
  const target=snapshot.state!.challenge!.run.team[0];
  snapshot=await test.service.action(actor,command('challenge-take',{type:'take-challenge-reward',attempt:1,stage:1,offer:0,targetId:target.id}));
  expect(snapshot.state!.challenge!.run.phase).toBe('ready');
  expect(snapshot.state!.challenge!.run.team[0].level).toBe(target.level+1);
  expect(snapshot.state!.challenge!.run.moves).toHaveLength(1);
  await arrange();
  snapshot=await test.service.action(actor,command('challenge-second-game',{type:'play-challenge',attempt:1,stage:2}));
  snapshot=await test.service.action(actor,command('challenge-recruit-category',{type:'choose-challenge-reward',attempt:1,stage:2,category:'swap'}));
  await expect(test.service.action(actor,command('challenge-invalid-reserve',{
   type:'take-challenge-reward',attempt:1,stage:2,offer:0,toBench:true,targetId:target.id,
  }))).rejects.toMatchObject({code:'ACTION_INVALID'});
  snapshot=await test.service.action(actor,command('challenge-bench',{type:'take-challenge-reward',attempt:1,stage:2,offer:0,toBench:true}));
  const recruited=snapshot.state!.challenge!.run.bench![0];
  snapshot=await test.service.action(actor,command('challenge-lineup',{
   type:'swap-challenge-lineup',attempt:1,stage:3,starterId:target.id,reserveId:recruited.id,
  }));
  expect(snapshot.state!.challenge!.run.team[0]).toEqual(recruited);
  expect(snapshot.state!.challenge!.run.bench![0]).toMatchObject({id:target.id,level:target.level+1});
 });
 it('commits a confirmed draft refresh once, then auto-applies a silent first-stage reward',async()=>{
  const test=fixture(),eligible={...newGym(1_700_000_000_000,18201),gymLevel:3,credits:120};
  const service=createGymAuthorityService({repository:test.repository,clockFactory:test.clock.factory,environmentId:'test',allowNativeRewards:true});
  const session=await service.session(actor),epoch=session.epoch;
  let snapshot=await service.adopt(actor,{epoch,requestId:'scheduled-adopt',archive:archive(eligible)});
  async function send(requestId:string,action:GymAction,rewardProof?:unknown){
   snapshot=await service.action(actor,{epoch,requestId,expectedRevision:snapshot.revision,action,rewardProof});
   return snapshot;
  }
  await send('scheduled-project',{type:'upgrade-challenge-project',projectId:'scouting'});
  expect(snapshot.state!.challengeProjects).toEqual({scouting:1});
  expect(snapshot.state!.credits).toBe(108);
  await send('scheduled-start',{type:'start-challenge',attempt:0});
  const refresh={type:'refresh-challenge-draft',attempt:1} as const;
  const ticket=await service.prepareReward(actor,{epoch,action:refresh});expect(ticket.method).toBe('ad');
  expect((await send('missing-refresh-proof',refresh)).error).toBeTruthy();
  expect(snapshot.state!.challenge!.run.draftRefreshed).toBeUndefined();
  const proof={challengeId:ticket.challengeId,confirmation:'native-sdk-confirmation'};
  expect((await send('confirm-refresh',refresh,proof)).error).toBeUndefined();
  expect(snapshot.state!.challenge!.run.draftRefreshed).toBe(true);
  expect((await send('duplicate-refresh',refresh,proof)).error).toBeTruthy();
  await expect(service.prepareReward(actor,{epoch,action:refresh})).rejects.toMatchObject({code:'REWARD_INELIGIBLE'});
  const state=snapshot.state!,run=state.challenge!.run,seed=challengeSeed(state.seed,1),pool=challengeTemplateIds;
  expect(run.rulesVersion).toBe(challengeRulesVersion);
  const candidates=challengeDraft(seed,pool,pool.length,run.rulesVersion,run.settings,true);
  expect(candidates.filter(id=>challengeCards.get(id)?.tier==='superstar')).toHaveLength(1);
  const players=recommendedChallengeDraft(candidates,challengeFixture(seed,1,run.rulesVersion));
  await send('scheduled-draft',{type:'draft-challenge',attempt:1,players});
  for(const action of challengeMatchupActions(snapshot.state!)) await send(`scheduled-lane-${action.lane}`,action);
  expect((await send('scheduled-win',{type:'play-challenge',attempt:1,stage:1})).error).toBeUndefined();
  expect(snapshot.state!.fame).toBe(6);
  expect(snapshot.state!.challenge!.run.phase).toBe('ready');
  expect(snapshot.state!.challenge!.run.rewardCategory).toBeUndefined();
  expect(challengeStage(snapshot.state!.challenge!.run)).toBe(2);
 });
 it('binds revival to a confirmed post and returns the same stage with a guaranteed superstar offer',async()=>{
  const test=fixture();
  let local={...newGym(1_700_000_000_000,18201),gymLevel:3};
  const play=(action:GymAction)=>{
   const result=dispatchGym(local,local.revision,action,local.updatedAt);
   if(result.error)throw Error(result.error);
   local=result.state;
  };
  play({type:'start-challenge',attempt:0});
  const seed=challengeSeed(local.seed,1),pool=challengeTemplateIds;
  play({type:'draft-challenge',attempt:1,players:challengeDraft(seed,pool,pool.length,challengeRulesVersion).slice(0,3)});
  for(let stage=1;stage<30;stage++) {
   const run=local.challenge!.run;
   for(const [lane,player] of run.team.slice(0,3).entries())play({type:'assign-challenge-matchup',attempt:1,stage,lane,playerId:player.id});
   play({type:'play-challenge',attempt:1,stage});
   const settled=local.challenge!.run;
   if(settled.phase==='lost')break;
   if(settled.rewardCategory==='swap')play({type:'take-challenge-reward',attempt:1,stage,offer:-1});
   if(settled.rewardCategory==='gear')play({type:'take-challenge-reward',attempt:1,stage,offer:0,targetId:settled.team[0].id,...(settled.team[0].gear.length===3?{replaceSlot:0}:{})});
   if(local.challenge!.run.rewardCategory==='level')play({type:'take-challenge-reward',attempt:1,stage,offer:0,levelTargetIds:[settled.team[0].id,settled.team[1].id]});
  }
  const lost=local.challenge!.run,stage=challengeStage(lost);
  expect(lost.phase).toBe('lost');
  const service=createGymAuthorityService({repository:test.repository,clockFactory:test.clock.factory,environmentId:'test',allowNativeRewards:true});
  const {epoch}=await service.session(actor);
  const snapshot=await service.adopt(actor,{epoch,requestId:'revive-adopt',archive:archive(local)});
  const action={type:'revive-challenge',attempt:1,stage} as const;
  const ticket=await service.prepareReward(actor,{epoch,action});
  expect(ticket.method).toBe('post');
  const request={epoch,requestId:'revive-proof',expectedRevision:snapshot.revision,action};
  const unconfirmed=await service.action(actor,{...request,requestId:'revive-no-proof'});
  expect(unconfirmed.state!.challenge!.run.phase).toBe('lost');
  const confirmed=await service.action(actor,{...request,expectedRevision:unconfirmed.revision,rewardProof:{challengeId:ticket.challengeId,confirmation:'native-sdk-confirmation'}});
  const run=confirmed.state!.challenge!.run;
  expect(confirmed.error).toBeUndefined();expect(run.rewardCategory).toBe('swap');expect(challengeStage(run)).toBe(stage);
  expect(challengeRewardChoices(seed,stage,run.team,pool,pool.length,'swap',challengeRulesVersion,run.settings,true)
   .filter(offer=>offer.kind==='swap'&&challengeCards.get(offer.id)?.tier==='superstar')).toHaveLength(1);
  expect(confirmed.state!.fame).toBe(local.fame);
  await expect(service.prepareReward(actor,{epoch,action})).rejects.toMatchObject({code:'REWARD_INELIGIBLE'});
 });
 it('loads exact repeat counts from a legacy cold archive before opening a challenge',async()=>{
  const test=fixture(),prior=await seedPreRankingHistory(test);
  await test.repository.withActor(authorityKey,async tx=>{
   const doc=structuredClone(tx.document!);
   doc.state!.gymLevel=3;
   delete doc.state!.challengeReferralCounts;
   await tx.commit(doc);
  });
  const state=prior.state!;
  const started=await test.service.action(actor,{epoch:prior.epoch,requestId:'legacy-challenge',expectedRevision:state.revision,action:{type:'start-challenge',attempt:0}});
  const counts={[state.player!.templateId!]:235};
  expect(started.state!.challengeReferralCounts).toEqual(counts);
  expect(started.state!.challenge!.run.settings?.referrals).toEqual(counts);
  expect((await document()).document.ranking!.historyCount).toBe(235);
 });
 it.each(['train','recommend'] as const)('bootstraps an older server gym ranking once from real paged cold history before %s commits',async type=>{
  const test=fixture(),prior=await seedPreRankingHistory(test),reads:{offset:number;limit:number}[]=[];
  const repository:GymAuthorityRepository={kind:test.repository.kind,withActor:(key,work)=>test.repository.withActor(key,tx=>work(new Proxy(tx,{get(target,property){
   if(property==='alumni')return async(offset:number,limit:number)=>{reads.push({offset,limit});return target.alumni(offset,limit);};return Reflect.get(target,property);
  }})))};
  const service=createGymAuthorityService({repository,clockFactory:test.clock.factory,environmentId:'test'});
  test.clock.advance(1000);
  const result=await service.action(actor,{epoch:prior.epoch,requestId:'old-ranked-'+type,expectedRevision:prior.state!.revision,action:{type,id:prior.state!.player!.id}});
  expect(result.error).toBeUndefined();expect(result.pending).toBeUndefined();
  if(type==='train')expect(result.state!.player!.shots).toBe(1);
  else expect(result.events.some(event=>event.type==='recommended')).toBe(true);
  const saved=(await document()).document;
  expect(saved.ranking).toMatchObject({best:{playerId:'historical-0',value:'999999999999999999999'},historyCount:type==='train'?235:236});
  expect(saved.pendingCommandId).toBeNull();expect(reads).toEqual([{offset:100,limit:100},{offset:200,limit:35}]);
  test.clock.advance(1000);await service.resume(actor,{epoch:prior.epoch,requestId:'after-bootstrap',expectedRevision:result.revision});
  expect(reads).toHaveLength(2);expect((await document()).document.ranking!.best).toEqual(saved.ranking!.best);
 });
 it.each(['total','short-page','invalid-player'] as const)('keeps a received settlement unawarded when bootstrap history has %s',async fault=>{
  const test=fixture(),prior=await seedPreRankingHistory(test);
  const repository:GymAuthorityRepository={kind:test.repository.kind,withActor:(key,work)=>test.repository.withActor(key,tx=>work(new Proxy(tx,{get(target,property){
   if(property==='alumni')return async(offset:number,limit:number)=>{const page=await target.alumni(offset,limit);return fault==='total'?{...page,total:page.total+1}:fault==='short-page'?{...page,players:page.players.slice(1)}:{...page,players:page.players.map((p,index)=>index===0?{...p,rewardFame:-1}:p)};};return Reflect.get(target,property);
  }})))};
  const service=createGymAuthorityService({repository,clockFactory:test.clock.factory,environmentId:'test'});
  test.clock.advance(1000);const request={epoch:prior.epoch,requestId:'history-fault',expectedRevision:prior.state!.revision,action:{type:'train' as const,id:prior.state!.player!.id}};
  await expect(service.action(actor,request)).rejects.toMatchObject({code:'HISTORY_INCOMPLETE'});
  const unchanged=(await document()).document;
  expect(unchanged.state).toEqual(prior.state);expect(unchanged.ranking).toBeUndefined();expect(unchanged.commands['history-fault'].status).toBe('received');
  const resumed=await test.service.action(actor,request);
  expect(resumed.state!.player!.shots).toBe(1);expect((await document()).document.ranking!.best!.playerId).toBe('historical-0');
 });
 it('never bootstraps a legacy imported gym into verified rankings even when it has cold history',async()=>{
  const test=fixture(),local=newGym(1_700_000_000_000,23);
  local.alumni=Array.from({length:113},(_,index)=>({...structuredClone(local.player!),id:'legacy-'+index,recommendedAt:local.updatedAt,rewardCredits:0,rewardFame:0,finalValue:'999999999999999999999'}));
  const session=await test.service.session(actor),adopted=await test.service.adopt(actor,{epoch:session.epoch,requestId:'legacy-no-ranking',archive:archive(local)});
  test.clock.advance(1000);const trained=await test.service.action(actor,{epoch:session.epoch,requestId:'legacy-train',expectedRevision:adopted.revision,action:{type:'train',id:adopted.state!.player!.id}});
  expect(trained.state!.player!.shots).toBe(1);expect((await document()).document.ranking).toBeNull();
 });
 it('creates a stable per-actor epoch and uses the platform baseline rather than browser or BFF clock',async()=>{
  const test=fixture(),session=await test.service.session(actor);expect(session.hasSave).toBe(false);expect((await test.service.session(actor)).epoch).toBe(session.epoch);
  const started=await test.service.start(actor,{epoch:session.epoch,requestId:'start-1'});expect(started.state?.createdAt).toBe(test.clock.time);expect(started.state?.seed).toBe(123);expect(started.serverTime).not.toBe(42);
  await expect(test.service.start(actor,{epoch:session.epoch,requestId:'restart'})).rejects.toMatchObject({code:'GYM_ALREADY_EXISTS'});
  expect(JSON.stringify(started)).not.toMatch(/scopeId|workspaceId|actorId|X-Shaper|settlementId/);
 });
 it('refuses cross-account epochs and browser-provided identity or time fields',async()=>{
  const test=fixture(),started=await open(test),other=await test.service.session({id:'verified-player-b'});
  expect(other.epoch).not.toBe(started.epoch);
  await expect(test.service.resume({id:'verified-player-b'},{epoch:started.epoch,requestId:'bad'})).rejects.toMatchObject({code:'EPOCH_MISMATCH'});
  for(const extra of [{puid:'someone'},{from:0},{to:1e15},{scopeId:'other'},{workspaceId:'other'}])await expect(test.service.resume(actor,{epoch:started.epoch,requestId:'bad',...extra})).rejects.toMatchObject({code:'REQUEST_INVALID'});
 });
 it('uses a numeric partially-produced first scope interval only as baseline, then trains only subsequent strict intervals',async()=>{
  const repository=createFileGymAuthorityRepository(directory);let serial=0;
  const factory=()=>({streamKey:'clock:main',ensure:async()=>({}),settle:async()=>{
   const first=serial++===0,from=first?100_000:100_090,to=first?100_090:101_090,amount=first?35:1000,settlementId='numeric-'+serial;
   return{status:'ready' as const,settlementId,report:{settlementId,realDuration:to-from,effectiveDuration:to-from,segments:[{from,to,streamKey:'clock:main',metricId:'elapsed_ms',phaseIndex:0,rate:1,produced:amount,capped:0,netChange:amount,valueStart:0,valueEnd:amount}],gains:{elapsed_ms:amount},losses:{},capped:{},events:[],ruleVersions:{gym_clock_ms:1},definitionVersion:1,replayed:false,approximated:false}};
  },resume:async()=>{throw Error('not pending');},ack:async()=>({})});
  const service=createGymAuthorityService({repository,clockFactory:factory,environmentId:'numeric-test',randomSeed:()=>123}),session=await service.session(actor);
  const started=await service.start(actor,{epoch:session.epoch,requestId:'numeric-start'});expect(started.state!.createdAt).toBe(100_090);expect(started.state!.player!.shots).toBe(0);
  const trained=await service.action(actor,{epoch:session.epoch,requestId:'numeric-train',expectedRevision:started.revision,action:{type:'train',id:started.state!.player!.id}});expect(trained.state!.updatedAt).toBe(101_090);expect(trained.state!.player!.shots).toBe(1);
 });
 it('deduplicates commands, rejects mismatched payloads and applies concurrent actions at most once',async()=>{
  const test=fixture(),started=await open(test);test.clock.advance(1000);
  const payload={epoch:started.epoch,requestId:'shot-1',expectedRevision:started.revision,action:{type:'train',id:started.state!.player!.id} as const};
  const result=await test.service.action(actor,payload),retry=await test.service.action(actor,payload);expect(retry.replayed).toBe(true);expect(retry.state).toEqual(result.state);
  await expect(test.service.action(actor,{...payload,action:{type:'buy-drink'}})).rejects.toMatchObject({code:'IDEMPOTENCY_KEY_MISMATCH'});
  test.clock.advance(1000);const actions=await Promise.allSettled(['a','b'].map(id=>test.service.action(actor,{...payload,requestId:'parallel-'+id,expectedRevision:result.revision})));
  expect(actions.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((await test.service.session(actor)).state!.player!.shots).toBe(2);
 });
 it('commits the canonical state and receipt before ACK, then retries ACK without awarding again after restart',async()=>{
  const test=fixture(),started=await open(test);test.clock.advance(1000);test.clock.failAck();
  const result=await test.service.action(actor,{epoch:started.epoch,requestId:'shot-ack',expectedRevision:started.revision,action:{type:'train',id:started.state!.player!.id}});
  expect(result.pending?.stage).toBe('ack');expect(result.pending?.retryable).toBe(false);const saved=await document();expect(saved.document.state?.player?.shots).toBe(1);expect(Object.values(saved.document.settlements).some(receipt=>receipt.status==='applied')).toBe(true);
  const service=createGymAuthorityService({repository:createFileGymAuthorityRepository(directory),clockFactory:test.clock.factory,environmentId:'test'});
  const recovered=await service.session(actor);expect(recovered.pending).toBeUndefined();expect(recovered.state).toEqual(result.state);expect(recovered.state!.rng).toEqual(result.state!.rng);
 });
 it('recovers a lost accepted POST through a new platform anchor and consumes the business interval once after restart',async()=>{
  const test=fixture(),started=await open(test),acks=test.clock.acks.length;let posts=0;
  test.clock.advance(6000);
  const factory=(binding:GymClockBinding)=>{const clock=test.clock.factory(binding);return{...clock,settle:async(options:Parameters<typeof clock.settle>[0])=>{posts++;expect((await document()).document.commands['lost-post'].status).toBe('submitting');const result=await clock.settle(options);if(posts===1)throw Object.assign(Error('accepted upstream but response socket lost'),{retryable:true});return result;}};};
  const service=createGymAuthorityService({repository:test.repository,clockFactory:factory,environmentId:'test'}),payload={epoch:started.epoch,requestId:'lost-post'};
  expect((await service.resume(actor,payload)).pending).toMatchObject({stage:'settlement',retryable:true});
  expect((await document()).document.state).toEqual(started.state);expect((await document()).document.commands['lost-post'].status).toBe('submitting');
  test.clock.advance(1000);
  const restarted=createGymAuthorityService({repository:createFileGymAuthorityRepository(directory),clockFactory:factory,environmentId:'test'});
  const recovered=await restarted.session(actor);
  expect(recovered.pending).toBeUndefined();expect(recovered.state).toEqual(settleOfflineGym(started.state!,test.clock.time,0).state);
  expect(posts).toBe(2);expect(test.clock.acks).toHaveLength(acks+1);
  expect((await restarted.resume(actor,payload)).state).toEqual(recovered.state);expect(posts).toBe(2);
  expect((await document()).document.commands['lost-post'].recoveryAttempts).toBe(1);
 });
 it('recovers when the received settlement ID could not be persisted before a crash without replaying its old key',async()=>{
  const test=fixture(),started=await open(test);test.clock.advance(1000);let posts=0;
  const factory=(binding:GymClockBinding)=>{const clock=test.clock.factory(binding);return{...clock,settle:async(options:Parameters<typeof clock.settle>[0])=>{posts++;return clock.settle(options);}};};
  const repository=failCommit(test.repository,doc=>doc.commands['lost-id']?.status==='received'),service=createGymAuthorityService({repository,clockFactory:factory,environmentId:'test'});
  await expect(service.resume(actor,{epoch:started.epoch,requestId:'lost-id'})).rejects.toMatchObject({code:'SAVE_FAILED'});
  const saved=await document();expect(saved.document.commands['lost-id'].status).toBe('submitting');expect(saved.document.commands['lost-id'].settlementId).toBeUndefined();expect(saved.document.state).toEqual(started.state);
  const restarted=createGymAuthorityService({repository:test.repository,clockFactory:factory,environmentId:'test'});
  test.clock.advance(1000);const recovered=await restarted.session(actor);
  expect(recovered.pending).toBeUndefined();expect(recovered.state!.updatedAt).toBe(test.clock.time);expect(posts).toBe(2);expect(test.clock.requests.size).toBe(3);
 });
 it('reuses a durably received report after interrupted business commit, without another POST or GET',async()=>{
  const test=fixture(),started=await open(test);test.clock.advance(1000);let posts=0,gets=0;
  const factory=(binding:GymClockBinding)=>{const clock=test.clock.factory(binding);return{...clock,settle:async(options:Parameters<typeof clock.settle>[0])=>{posts++;return clock.settle(options);},resume:async(options:Parameters<typeof clock.resume>[0])=>{gets++;return clock.resume(options);}};};
  const repository=failCommit(test.repository,doc=>doc.commands['received-before-crash']?.status==='applied'),service=createGymAuthorityService({repository,clockFactory:factory,environmentId:'test'});
  const payload={epoch:started.epoch,requestId:'received-before-crash',expectedRevision:started.revision,action:{type:'train' as const,id:started.state!.player!.id}};
  await expect(service.action(actor,payload)).rejects.toMatchObject({code:'SAVE_FAILED'});const saved=await document();expect(saved.document.commands[payload.requestId].status).toBe('received');expect(saved.document.state).toEqual(started.state);
  const restarted=createGymAuthorityService({repository:test.repository,clockFactory:factory,environmentId:'test'}),completed=await restarted.session(actor);
  expect(completed.state!.player!.shots).toBe(1);expect(completed.state!.updatedAt).toBe(test.clock.time);expect(posts).toBe(1);expect(gets).toBe(0);
  expect((await restarted.action(actor,payload)).state).toEqual(completed.state);expect(posts).toBe(1);
 });
 it('recovers a lost accepted report with capped catch-up, including a capped recovery checkpoint and ACK retry',async()=>{
  const test=fixture(),local=newGym(1_700_000_000_000,23);local.gymLevel=2;local.player!.autoEnabled=true;
  const session=await test.service.session(actor),started=await test.service.adopt(actor,{epoch:session.epoch,requestId:'recovery-adopt',archive:archive(local)});
  let posts=0;
  const factory=(binding:GymClockBinding)=>{const clock=test.clock.factory(binding);return{...clock,settle:async(options:Parameters<typeof clock.settle>[0])=>{posts++;const response=await clock.settle(options);if(posts===1)throw Object.assign(Error('lost accepted report'),{retryable:true});return response;}};};
  const service=createGymAuthorityService({repository:test.repository,clockFactory:factory,environmentId:'test'});
  test.clock.advance(6*60*60_000);
  expect((await service.resume(actor,{epoch:session.epoch,requestId:'recover-capped'})).pending?.retryable).toBe(true);
  test.clock.advance(6000);test.clock.cap(1000);test.clock.failAck();
  const checkpoint=await service.session(actor);expect(checkpoint.pending?.stage).toBe('ack');expect(checkpoint.state).toEqual(started.state);
  expect((await service.session(actor)).pending?.stage).toBe('settlement');
  test.clock.advance(1000);const recovered=await service.session(actor),expected=settleOfflineGym(started.state!,test.clock.time);
  expect(recovered.pending).toBeUndefined();expect(recovered.state).toEqual(expected.state);expect(recovered.state!.rng).toEqual(expected.state.rng);
  expect(recovered.offlineReport!.capped).toBe(true);expect(recovered.offlineReport!.elapsedMs).toBe(6*60*60_000+7000);
  const replay=await service.resume(actor,{epoch:session.epoch,requestId:'recover-capped'});expect(replay.replayed).toBe(true);expect(replay.state).toEqual(recovered.state);expect(posts).toBe(3);
 });
 it('binds native reward confirmations to one actor, action, challenge and report and persists the one-time bonus',async()=>{
  const test=fixture(),local=newGym(1_700_000_000_000,23);local.gymLevel=2;local.player!.autoEnabled=true;
  const service=createGymAuthorityService({repository:test.repository,clockFactory:test.clock.factory,environmentId:'test',allowNativeRewards:true});
  const session=await service.session(actor),started=await service.adopt(actor,{epoch:session.epoch,requestId:'reward-adopt',archive:archive(local)});
  test.clock.advance(6000);const earned=await service.resume(actor,{epoch:session.epoch,requestId:'reward-report'});
  const action={type:'double-offline-experience' as const,reportId:earned.offlineReport!.reportId!};
  const challenge=await service.prepareReward(actor,{epoch:session.epoch,action});expect(challenge.confirmation).toBe('native-sdk-confirmation');
  await expect(service.prepareReward({id:'other'}, {epoch:session.epoch,action})).rejects.toMatchObject({code:'EPOCH_MISMATCH'});
  const missing=await service.action(actor,{epoch:session.epoch,requestId:'missing-reward-proof',expectedRevision:earned.revision,action});
  expect(missing.error).toBeTruthy();expect(missing.state!.offlineReward!.claimed).toBe(false);
  const payload={epoch:session.epoch,requestId:'claim-offline-bonus',expectedRevision:missing.revision,action,rewardProof:{challengeId:challenge.challengeId,confirmation:'native-sdk-confirmation'}};
  const claimed=await service.action(actor,payload);expect(claimed.error).toBeUndefined();expect(claimed.state!.offlineReward!.claimed).toBe(true);
  expect(claimed.state!.player!.shots).toBe(earned.state!.player!.shots);expect(claimed.events.find(e=>e.type==='offline-experience-doubled')?.experienceGain).toBe(earned.offlineReport!.totalExperience);
  expect((await service.action(actor,payload)).state).toEqual(claimed.state);
  const reused=await service.action(actor,{...payload,requestId:'reuse-challenge',expectedRevision:claimed.revision});expect(reused.error).toBeTruthy();expect(reused.state).toEqual(claimed.state);
  await expect(service.prepareReward(actor,{epoch:session.epoch,action})).rejects.toMatchObject({code:'REWARD_INELIGIBLE'});
  const restarted=createGymAuthorityService({repository:createFileGymAuthorityRepository(directory),clockFactory:test.clock.factory,environmentId:'test',allowNativeRewards:true});
  expect((await restarted.session(actor)).state!.offlineReward!.claimed).toBe(true);expect(started.state!.offlineReward).toBeUndefined();
 });
 it('does not invent a baseline for a zero report, including interrupted zero-report ACK',async()=>{
  const test=fixture(),session=await test.service.session(actor);test.clock.zero();test.clock.failAck();
  const first=await test.service.start(actor,{epoch:session.epoch,requestId:'zero-start'});expect(first.hasSave).toBe(false);expect(first.pending?.stage).toBe('ack');
  const acked=await test.service.session(actor);expect(acked.hasSave).toBe(false);expect(acked.pending?.stage).toBe('baseline');
  const ready=await test.service.session(actor);expect(ready.hasSave).toBe(true);expect(ready.state!.updatedAt).toBe(test.clock.time);expect(test.clock.requests.size).toBe(2);
 });
 it('checks the complete persisted report digest before resuming an interrupted ACK',async()=>{
  const test=fixture(),started=await open(test);test.clock.advance(1000);test.clock.failAck();
  const committed=await test.service.action(actor,{epoch:started.epoch,requestId:'tampered-ack',expectedRevision:started.revision,action:{type:'train',id:started.state!.player!.id}});
  const saved=await document(),command=saved.document.commands['tampered-ack'];(command.report as {gains:Record<string,string>}).gains.elapsed_ms='999';
  const file=(await readdir(directory)).find(name=>name.endsWith('.json'))!;await writeFile(resolve(directory,file),JSON.stringify(saved));const acknowledgements=test.clock.acks.length;
  await expect(test.service.session(actor)).rejects.toMatchObject({code:'SETTLEMENT_CONFLICT'});expect(test.clock.acks).toHaveLength(acknowledgements);expect((await document()).document.state).toEqual(committed.state);
 });
 it('keeps an asynchronous settlement pending and resumes the same platform receipt',async()=>{
  const test=fixture(),session=await test.service.session(actor);test.clock.pending();
  const waiting=await test.service.start(actor,{epoch:session.epoch,requestId:'async-start'});expect(waiting.pending?.stage).toBe('settlement');expect(waiting.hasSave).toBe(false);
  const ready=await test.service.session(actor);expect(ready.hasSave).toBe(true);expect(test.clock.requests.size).toBe(1);
 });
 it('imports legacy progress once, rebases timestamps and preserves full cold alumni with an explicit unverified origin',async()=>{
  const test=fixture(),local=newGym(1_700_000_000_000,23);local.gymLevel=2;local.player!.autoEnabled=true;
  local.alumni=Array.from({length:113},(_,index)=>({...structuredClone(local.player!),id:'alumnus-'+index,recommendedAt:local.updatedAt,rewardCredits:0,rewardFame:0,finalValue:'320'}));
  expect(validGym(local)).toBe(true);const session=await test.service.session(actor);
  const adopted=await test.service.adopt(actor,{epoch:session.epoch,requestId:'adopt-1',archive:archive(local)});
  expect(adopted.state!.updatedAt).toBe(test.clock.time);expect(adopted.state!.player!.enteredAt).toBe(test.clock.time);expect(adopted.state!.player!.shots).toBe(local.player!.shots);expect(adopted.state!.rng).toEqual(local.rng);expect(adopted.state!.alumni).toHaveLength(100);
  const saved=await document();expect(saved.document.provenance).toBe('legacy-unverified');expect(saved.cold).toHaveLength(13);
  const alumni=await test.service.alumni(actor,{epoch:session.epoch,offset:100,limit:20});expect(alumni.total).toBe(113);expect(alumni.players).toHaveLength(13);
  await expect(test.service.adopt(actor,{epoch:session.epoch,requestId:'adopt-again',archive:archive(local)})).rejects.toMatchObject({code:'GYM_ALREADY_EXISTS'});
 });
 it('replays actual capped automatic training from platform time and consumes overlap only once',async()=>{
  const test=fixture(),local=newGym(1_700_000_000_000,23);local.gymLevel=2;local.player!.autoEnabled=true;
  const session=await test.service.session(actor),adopted=await test.service.adopt(actor,{epoch:session.epoch,requestId:'adopt-1',archive:archive(local)});
  test.clock.advance(2*60*60*1000);const expected=settleOfflineGym(adopted.state!,test.clock.time);
  const resumed=await test.service.resume(actor,{epoch:session.epoch,requestId:'return-1',expectedRevision:adopted.revision});
  expect(resumed.state).toEqual(expected.state);expect(resumed.offlineReport).toEqual(expected.report);expect(resumed.offlineReport?.creditedMs).toBe(30*60*1000);
  const replayed=await test.service.resume(actor,{epoch:session.epoch,requestId:'return-1',expectedRevision:adopted.revision});expect(replayed.state).toEqual(resumed.state);
 });
 it('fails closed for a forward clock gap without granting progress',async()=>{
  const test=fixture(),started=await open(test);test.clock.advance(1000);test.clock.gap();
  await expect(test.service.resume(actor,{epoch:started.epoch,requestId:'gap'})).rejects.toMatchObject({code:'CLOCK_REPORT_INVALID'});
  expect((await document()).document.state).toEqual(started.state);
 });
 it('returns true automatic events for short active intervals and only a report for long absences',async()=>{
  const test=fixture(),local=newGym(1_700_000_000_000,23);local.gymLevel=2;local.player!.autoEnabled=true;
  const session=await test.service.session(actor),adopted=await test.service.adopt(actor,{epoch:session.epoch,requestId:'adopt-animation',archive:archive(local)});
  test.clock.advance(2000);const online=await test.service.resume(actor,{epoch:session.epoch,requestId:'online-auto',expectedRevision:adopted.revision});
  expect(online.events.some(event=>event.type==='trained'&&event.outcome)).toBe(true);expect(online.offlineReport).toBeUndefined();
  test.clock.advance(60_000);const offline=await test.service.resume(actor,{epoch:session.epoch,requestId:'offline-auto',expectedRevision:online.revision});
  expect(offline.events).toEqual([]);expect(offline.offlineReport?.totalShots).toBeGreaterThan(0);
 });
 it('persists long-absence async selection and polls the same receipt without premature progress',async()=>{
  const test=fixture(),service=createGymAuthorityService({repository:test.repository,clockFactory:test.clock.factory,environmentId:'test',now:()=>test.clock.time});
  const session=await service.session(actor),started=await service.start(actor,{epoch:session.epoch,requestId:'start-long'});test.clock.advance(6*60_000);test.clock.pending();test.clock.resumePending(1);
  const first=await service.resume(actor,{epoch:session.epoch,requestId:'long-absence',expectedRevision:started.revision});expect(first.pending).toMatchObject({stage:'settlement',retryable:true});expect(first.state).toEqual(started.state);
  expect((await document()).document.commands['long-absence'].async).toBe(true);expect(test.clock.asyncFlags.at(-1)).toBe(true);
  const still=await service.session(actor);expect(still.pending?.stage).toBe('settlement');expect(still.state).toEqual(started.state);
  const ready=await service.session(actor);expect(ready.pending).toBeUndefined();expect(ready.state!.updatedAt).toBe(test.clock.time);expect(test.clock.requests.size).toBe(2);
 });
 it('uses the prior platform cursor for suffix-capped reports and applies only the gym training budget',async()=>{
  const test=fixture(),local=newGym(1_700_000_000_000,23);local.gymLevel=2;local.player!.autoEnabled=true;
  const session=await test.service.session(actor),adopted=await test.service.adopt(actor,{epoch:session.epoch,requestId:'adopt-cap',archive:archive(local)});
  test.clock.advance(35*24*60*60*1000);test.clock.cap(30*24*60*60*1000);
  const expected=settleOfflineGym(adopted.state!,test.clock.time),resumed=await test.service.resume(actor,{epoch:session.epoch,requestId:'suffix-cap',expectedRevision:adopted.revision});
  expect(resumed.state).toEqual(expected.state);expect(resumed.offlineReport?.creditedMs).toBe(30*60_000);expect(resumed.state!.updatedAt).toBe(test.clock.time);
 });
 it('refuses a duplicate local scope binding before another actor can register that clock',async()=>{
  const test=fixture();await open(test);const first=(await document()).document;
  await expect(test.repository.withActor('other-actor-key',tx=>tx.commit({...first,actorId:'other',epoch:'another-epoch'}))).rejects.toMatchObject({code:'SCOPE_BINDING_CONFLICT'});
 });
 it('does not accept browser auto-step or platform reward acknowledgements as proof',async()=>{
  const test=fixture(),started=await open(test);
  await expect(test.service.action(actor,{epoch:started.epoch,requestId:'auto',expectedRevision:started.revision,action:{type:'auto-step'}})).rejects.toMatchObject({code:'ACTION_INVALID'});
  const denied=await test.service.action(actor,{epoch:started.epoch,requestId:'reward',expectedRevision:started.revision,action:{type:'share-player-levels',playerId:started.state!.player!.id},rewardProof:{rewarded:true}});
  expect(denied.error).toContain('服务器校验');expect(denied.state!.player!.level).toBe(0);expect(denied.capabilities.platformRewards).toBe(false);
 });
 it('rejects malformed action fields before persisting a command or consuming platform time',async()=>{
  const test=fixture(),started=await open(test),before=(await document()).document,requests=test.clock.requests.size;
  const actions=[{type:'set-auto',id:started.state!.player!.id,enabled:'false'},{type:'set-training-plan',playerId:started.state!.player!.id,id:'unknown'},{type:'recruit',preference:'invalid'},{type:'train'},{type:'upgrade-gym',targetLevel:99}];
  for(let index=0;index<actions.length;index++)await expect(test.service.action(actor,{epoch:started.epoch,requestId:'malformed-'+index,expectedRevision:started.revision,action:actions[index] as never})).rejects.toMatchObject({code:'ACTION_INVALID'});
  expect((await document()).document).toEqual(before);expect(test.clock.requests.size).toBe(requests);
 });
});

it('uses the real protocol client and signed clock through registration, baseline, business commit and ACK',async()=>{
 let cursor=100_000,end=100_001,sequence=0;
 const requests:{path:string;body?:string;headers:Record<string,string>;method:string}[]=[];
 const transport={send:vi.fn(async(request:{path:string;body?:string;headers:Record<string,string>;method:string})=>{requests.push(request);let data:unknown={};if(request.path.endsWith('/settlements')){data=report('protocol-'+(++sequence),cursor,end);cursor=end;}return{status:200,headers:{},body:JSON.stringify({ok:true,data})};})};
 const service=createGymAuthorityService({repository:createFileGymAuthorityRepository(directory),environmentId:'test',now:()=>end,randomSeed:()=>5,clockFactory:binding=>createGymClock({binding,token:'fixture-not-a-production-token',transport,now:()=>1_800_000_000_000})});
 const session=await service.session(actor),started=await service.start(actor,{epoch:session.epoch,requestId:'protocol-start'});expect(started.state!.updatedAt).toBe(100_001);
 end+=1000;const trained=await service.action(actor,{epoch:session.epoch,requestId:'protocol-shot',expectedRevision:started.revision,action:{type:'train',id:started.state!.player!.id}});expect(trained.state!.player!.shots).toBe(1);
 expect(requests.some(request=>request.path.endsWith('/scopes/register'))).toBe(true);expect(requests.filter(request=>request.path.endsWith('/ack'))).toHaveLength(2);
 for(const request of requests){const canonical=[request.method,request.path,request.headers['X-Timestamp'],request.headers['X-Idempotency-Key']??'',request.body??''].join('\n');expect(request.headers['X-Signature']).toBe(createHmac('sha256','fixture-not-a-production-token').update(canonical).digest('hex'));}
});

it('HTTP rejects unauthenticated identities, scope/time injection, unknown routes and unsafe origins',async()=>{
 const test=fixture(),handler=createGymAuthorityHttpHandler({service:test.service,authenticate:async request=>request.headers['x-test-actor']==='verified'?actor:null,allowedOrigin:'http://127.0.0.1:8800'});
 const server=createServer(handler);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address() as {port:number},baseUrl='http://127.0.0.1:'+address.port;
 try{
  expect((await fetch(baseUrl+'/api/gym/session')).status).toBe(401);
  const session=(await(await fetch(baseUrl+'/api/gym/session',{headers:{'x-test-actor':'verified'}})).json()).data;
  expect((await fetch(baseUrl+'/api/gym/start',{method:'POST',headers:{'x-test-actor':'verified','Content-Type':'application/json'},body:JSON.stringify({epoch:session.epoch,requestId:'bad',puid:'other',from:0})})).status).toBe(400);
  expect((await fetch(baseUrl+'/api/gym/any-proxy',{headers:{'x-test-actor':'verified'}})).status).toBe(404);
  expect((await fetch(baseUrl+'/api/gym/session',{headers:{'x-test-actor':'verified',Origin:'https://wrong.example'}})).status).toBe(403);
 }finally{await new Promise<void>((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();});}
});

it('CloudBase adapter uses shared lease fencing/CAS and never sends cold history on ordinary commits',async()=>{
 const calls:{name:string;body:Record<string,unknown>}[]=[];
 const rpc=vi.fn(async(name:string,body:Record<string,unknown>)=>{calls.push({name,body});if(name==='gym_authority_claim')return{document:null,version:0,fence:9};if(name==='gym_authority_commit')return{version:1};return{};});
 const repository=createCloudBaseGymAuthorityRepository(rpc);await repository.withActor('a'.repeat(64),async tx=>{await tx.commit({version:1,applicationId,environmentId:'test',workspaceId:applicationId,actorId:'a',epoch:'epoch-a',scopeId:'123',scopeType:'gym',initialized:false,state:null,suspended:true,provenance:null,commands:{},pendingCommandId:null,settlements:{}});});
 expect(calls.map(call=>call.name)).toEqual(['gym_authority_claim','gym_authority_commit','gym_authority_release']);expect(calls[1].body).toMatchObject({p_fence:9,p_expected_version:0,p_alumni:[]});expect(calls[2].body.p_fence).toBe(9);
});
