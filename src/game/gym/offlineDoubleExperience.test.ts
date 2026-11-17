import {describe,expect,it} from 'vitest';
import {activePlayers,dispatchGym,experienceForLevel,newGym,requiredExperience,type GymAction,type GymPlayer,type GymState} from './engine';
import {offlineLimitMs,settleOfflineGym} from './offline';
import {decodeGym,encodeGym,validGym} from './save';

const start=1_800_000_000_000;
const earned=(player:GymPlayer)=>experienceForLevel(player.level)+player.experience+(player.overflowExperience??0);
function action(state:GymState,value:GymAction):GymState{
 const result=dispatchGym(state,state.revision,value,state.updatedAt);
 expect(result.error).toBeUndefined();expect(validGym(result.state)).toBe(true);
 return result.state;
}
function automatic(count=1):GymState{
 let state=newGym(start,170517);state.gymLevel=8;
 for(let i=1;i<count;i++)state=action(state,{type:'recruit'});
 for(const player of activePlayers(state))state=action(state,{type:'set-auto',id:player.id,enabled:true});
 return state;
}
function settlement(state:GymState,elapsed=30_000){
 const result=settleOfflineGym(state,state.updatedAt+elapsed);
 expect(result.report?.totalShots).toBeGreaterThan(0);
 expect(result.state.offlineReward?.report.reportId).toBe(result.report?.reportId);
 expect(validGym(result.state)).toBe(true);
 return result;
}
function claim(state:GymState){return action(state,{type:'double-offline-experience',reportId:state.offlineReward!.report.reportId!});}
function dismiss(state:GymState){return action(state,{type:'dismiss-offline-report',reportId:state.offlineReward!.report.reportId!});}
const trainingFacts=(state:GymState)=>({
 credits:state.credits,fame:state.fame,inventory:state.inventory,rngEconomy:state.rng.economy,rngRecruits:state.rng.recruits,
 alumni:state.alumni,nextPlayer:state.nextPlayer,postgameRecommendedTemplates:state.postgameRecommendedTemplates,
 players:activePlayers(state).map(player=>({id:player.id,shots:player.shots,stamina:player.stamina,recoveryMs:player.recoveryMs,
  nextShotAt:player.nextShotAt,training:player.training,equipmentTraining:player.equipmentTraining,cooperation:player.cooperation,
  book:player.book,greatShotsRemaining:player.greatShotsRemaining,greatShotReady:player.greatShotReady,shareLevelClaimed:player.shareLevelClaimed})),
});

describe('one-time bonus XP for an immutable offline report',()=>{
 it('adds each report member’s own original XP, leaves a manual trainee alone, and does not replay physical training or economy RNG',()=>{
  let state=automatic(4);const players=activePlayers(state);
  players[1].nextShotAt=start+12_000;players[2].nextShotAt=start+20_000;
  state=action(state,{type:'set-auto',id:players[3].id,enabled:false});
  const {state:paid,report}=settlement(state);expect(report!.players).toHaveLength(3);
  expect(new Set(report!.players.map(row=>row.xpGained)).size).toBeGreaterThan(1);
  const snapshot=structuredClone(paid),facts=structuredClone(trainingFacts(paid));
  const result=claim(paid);
  for(const original of activePlayers(snapshot)){
   const after=activePlayers(result).find(player=>player.id===original.id)!;
   expect(earned(after)-earned(original)).toBe(report!.players.find(row=>row.id===original.id)?.xpGained??0);
  }
  expect(trainingFacts(result)).toEqual(facts);
  expect(result.offlineReward).toMatchObject({claimed:true,dismissed:false,report});
  expect(paid).toEqual(snapshot);
 });

 it('adds the full original reported amount after an absence exceeds its time cap',()=>{
  const state=automatic(),{state:paid,report}=settlement(state,12*60*60_000);
  expect(report!.capped).toBe(true);expect(report!.creditedMs).toBe(offlineLimitMs(state));
  const before=earned(paid.player!),result=claim(paid);
  expect(earned(result.player!)-before).toBe(report!.totalExperience);
  expect(trainingFacts(result)).toEqual(trainingFacts(paid));
 });

 it('has no shared ad-count quota and permits a new one-time bonus on each later report',()=>{
  let state=automatic();state.staminaRewardCount=10_000;
  const ids=new Set<string>();
  for(let i=0;i<8;i++){
   const {state:paid,report}=settlement(state,60_000);
   expect(ids.has(report!.reportId!)).toBe(false);ids.add(report!.reportId!);
   const before=earned(paid.player!),result=claim(paid);
   expect(earned(result.player!)-before).toBe(report!.totalExperience);
   expect(result.staminaRewardCount).toBe(10_000);
   state=dismiss(result);
  }
  expect(ids.size).toBe(8);
 });

 it('refuses a bonus for an already level99 player without increasing XP or legacy overflow',()=>{
  const state=automatic();state.player!.level=state.player!.peakLevel=98;
  state.player!.experience=requiredExperience(98)-1;
  const {state:paid,report}=settlement(state,5_000);
  expect(paid.player).toMatchObject({level:99,experience:0,autoEnabled:false});
  expect(report!.totalExperience).toBe(1);
  paid.player!.overflowExperience=7;
  const before=structuredClone(paid),result=dispatchGym(paid,paid.revision,{type:'double-offline-experience',reportId:report!.reportId!},paid.updatedAt);
  expect(result.error).toContain('99级');expect(result.state).toBe(paid);expect(paid).toEqual(before);
  expect(decodeGym(encodeGym(paid))).toEqual(paid);
 });

 it('credits only XP left before level99 and stores the actual capped bonus in its receipt',()=>{
  const state=automatic();state.player!.level=state.player!.peakLevel=98;
  state.player!.experience=requiredExperience(98)-30;state.player!.stamina=1;state.player!.greatShotsRemaining=1;
  const {state:paid,report}=settlement(state,5_000);
  expect(report!.totalExperience).toBe(20);expect(paid.player!.level).toBe(98);
  const before=earned(paid.player!),result=claim(paid);
  expect(result.player).toMatchObject({level:99,experience:0,autoEnabled:false});expect(result.player!.overflowExperience).toBeUndefined();
  expect(earned(result.player!)-before).toBe(10);expect(result.offlineReward!.report.bonusExperience).toEqual({[result.player!.id]:10});
  expect(trainingFacts(result)).toEqual(trainingFacts(paid));
  expect(decodeGym(encodeGym(result))).toEqual(result);
 });

 it('skips max-level report members while giving eligible teammates their own capped bonus',()=>{
  const {state:paid,report}=settlement(automatic(2));paid.player!.level=paid.player!.peakLevel=99;paid.player!.experience=0;paid.player!.autoEnabled=false;
  const teammate=paid.bench[0],before=earned(teammate),row=report!.players.find(player=>player.id===teammate.id)!;
  const result=claim(paid);expect(result.player).toMatchObject({level:99,experience:0});expect(result.player!.overflowExperience).toBeUndefined();
  expect(earned(result.bench[0])-before).toBe(row.xpGained);expect(result.offlineReward!.report.bonusExperience).toEqual({[paid.player!.id]:0,[teammate.id]:row.xpGained});
 });

 it('rejects a repeated claim after reload without changing any state or consuming RNG',()=>{
  const {state:paid}=settlement(automatic());
  const result=decodeGym(encodeGym(claim(paid)))!,before=structuredClone(result);
  const duplicate=dispatchGym(result,result.revision,{type:'double-offline-experience',reportId:result.offlineReward!.report.reportId!},result.updatedAt);
  expect(duplicate.error).toContain('已领取');expect(duplicate.state).toBe(result);expect(duplicate.events).toEqual([]);expect(result).toEqual(before);
 });

 it('rejects missing or wrong report identifiers atomically',()=>{
  for(const state of [automatic(),settlement(automatic()).state]){
   const before=structuredClone(state);
   const result=dispatchGym(state,state.revision,{type:'double-offline-experience',reportId:'old-or-other-report'},state.updatedAt);
   expect(result.error).toBeTruthy();expect(result.state).toBe(state);expect(result.events).toEqual([]);expect(state).toEqual(before);
  }
 });

 it('rejects saved bonus receipts with invented XP or missing player amounts',()=>{
  const result=claim(settlement(automatic(2)).state);
  const overpaid=structuredClone(result),first=overpaid.offlineReward!.report.players[0];
  overpaid.offlineReward!.report.bonusExperience![first.id]=first.xpGained+1;
  expect(validGym(overpaid)).toBe(false);
  const incomplete=structuredClone(result);delete incomplete.offlineReward!.report.bonusExperience![first.id];
  expect(validGym(incomplete)).toBe(false);
 });

 it('does not partially award remaining members if a reported athlete has left the gym',()=>{
  const {state}=settlement(automatic(2));state.bench=[];
  const before=structuredClone(state);
  const result=dispatchGym(state,state.revision,{type:'double-offline-experience',reportId:state.offlineReward!.report.reportId!},state.updatedAt);
  expect(result.error).toContain('已离馆');expect(result.state).toBe(state);expect(result.events).toEqual([]);expect(state).toEqual(before);
 });

 it.each([false,true])('preserves the open report and claimed=%s during later background training',claimed=>{
  const first=settlement(automatic()),paid=claimed?claim(first.state):first.state;
  const receipt=structuredClone(paid.offlineReward);
  const next=settleOfflineGym(paid,paid.updatedAt+12_000);
  expect(next.report!.totalShots).toBeGreaterThan(0);
  expect(next.report!.reportId).not.toBe(receipt!.report.reportId);
  expect(next.state.offlineReward).toEqual(receipt);
  expect(decodeGym(encodeGym(next.state))!.offlineReward).toEqual(receipt);
 });

 it('closes a report without paying it, refuses later claiming and accepts a new settled report',()=>{
  const {state:paid}=settlement(automatic()),closed=dismiss(paid);
  expect(trainingFacts(closed)).toEqual(trainingFacts(paid));expect(earned(closed.player!)).toBe(earned(paid.player!));
  expect(closed.offlineReward).toMatchObject({dismissed:true,claimed:false});
  const refused=dispatchGym(closed,closed.revision,{type:'double-offline-experience',reportId:closed.offlineReward!.report.reportId!},closed.updatedAt);
  expect(refused.error).toContain('已结束');expect(refused.state).toBe(closed);
  const next=settlement(closed,10_000);expect(next.state.offlineReward!.report.reportId).not.toBe(paid.offlineReward!.report.reportId);
 });

 it('only creates a receipt for settled absences of at least five seconds with a real shot',()=>{
  const short=settleOfflineGym(automatic(),start+4_999);expect(short.report!.totalShots).toBeGreaterThan(0);expect(short.state.offlineReward).toBeUndefined();
  const noShot=automatic();noShot.player!.nextShotAt=start+60_000;
  expect(settleOfflineGym(noShot,start+5_000).state.offlineReward).toBeUndefined();
  const due=settlement(automatic(),5_000);expect(due.state.offlineReward).toMatchObject({claimed:false,dismissed:false});
 });
});
