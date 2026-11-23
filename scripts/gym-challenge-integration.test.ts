import {expect,it} from 'vitest';
import {challengePlayerPool,dispatchGym,newGym,recommendedTemplateIds,type GymAction,type GymState} from '../src/game/gym/engine';
import {
  challengeBest,challengeDraft,challengeFixture,challengeOffers,challengeRewardChoices,challengeRulesVersion,challengeSeed,challengeStage,
  recommendedChallengeDraft,scoreChallenge,type ChallengeRewardCategory,
} from '../src/game/gym/challenge';
import {challengeCards,challengeTemplateIds} from '../src/game/gym/challengeCatalog';
import {decodeGym,encodeGym,validGym} from '../src/game/gym/save';
import {parseGymCloudArchive} from '../src/platform/gymCloudArchive';
import {hupuProject} from '../src/platform/hupuProject';
import {validateLocalGymRankingArchive} from '../server/gymLocalRankProgress';
import {challengeMatchupActions,legacyV5ChallengeGym,qualifiedChallengeGym} from './fixtures/challengeGym';

const submit=(s:GymState,a:GymAction)=>dispatchGym(s,s.revision,a,s.updatedAt);
function act(s:GymState,a:GymAction) {
  const result=submit(s,a);
  expect(result.error).toBeUndefined();expect(validGym(result.state)).toBe(true);
  return result.state;
}
function draft(s:GymState) {
  const run=s.challenge!.run, seed=challengeSeed(s.seed,run.attempt);
  const offered=challengeDraft(seed,challengePlayerPool(s,run.rulesVersion),run.startPoolSize,run.rulesVersion,run.settings);
  return act(s,{type:'draft-challenge',attempt:run.attempt,players:recommendedChallengeDraft(offered,challengeFixture(seed,1,run.rulesVersion))});
}
function assign(s:GymState) {
  for(const action of challengeMatchupActions(s)) s=act(s,action);
  return s;
}
const archive=(s:GymState)=>JSON.stringify({format:'legend-gym-cloud-v1',applicationId:hupuProject.applicationId,uploadedAt:s.updatedAt,gym:encodeGym(s)});
const roundtrip=(s:GymState)=>parseGymCloudArchive(archive(s)).state;
function chooseCategory(s:GymState,category:ChallengeRewardCategory) {
  const run=s.challenge!.run;
  return act(s,{type:'choose-challenge-reward',attempt:run.attempt,stage:challengeStage(run),category});
}
function chosenReward(s:GymState) {
  const run=s.challenge!.run,stage=challengeStage(run),seed=challengeSeed(s.seed,run.attempt),pool=challengePlayerPool(s,run.rulesVersion);
  const offers=run.rulesVersion
    ?challengeRewardChoices(seed,stage,run.team,pool,run.offerPoolSize,run.rewardCategory!,run.rulesVersion,run.settings)
    :challengeOffers(seed,stage,run.team,pool,run.offerPoolSize);
  const offer=Math.max(0,offers.findIndex(card=>card.kind==='swap')), card=offers[offer], player=run.team[0];
  return {type:'take-challenge-reward',attempt:run.attempt,stage,offer,
    ...(card.kind!=='team'?{targetId:player.id}:{}),...(card.kind==='gear'&&player.gear.length===3?{replaceSlot:0}:{})} as const;
}

function collectionChallengeGym() {
  const state=newGym(1000,18201);
  state.gymLevel=3;
  const ids=challengeTemplateIds.filter(id=>challengeCards.get(id)!.tier!=='rotation').slice(0,12);
  state.collection=Object.fromEntries(ids.map(id=>[id,{firstAt:1000,highestRating:80,highestValue:'320'}]));
  return state;
}

it('unlocks at gym level three with no collected or recommended templates',()=>{
  const eligible={...newGym(1000,18201),gymLevel:3}, start={type:'start-challenge' as const,attempt:0};
  expect(recommendedTemplateIds(eligible)).toEqual([]);
  expect(submit({...eligible,gymLevel:2},start).error).toMatch(/3 级/);
  const started=act(decodeGym(encodeGym(eligible))!,start);
  expect(started.challenge?.run).toMatchObject({phase:'draft',rulesVersion:challengeRulesVersion,startPoolSize:119,starters:[],team:[],settings:{referrals:{}}});
  expect(roundtrip(started).challenge).toEqual(started.challenge);
  expect(submit(started,{type:'draft-challenge',attempt:1,players:['bryant','bryant','bryant']}).error).toBeTruthy();
  const drafted=roundtrip(draft(started));
  expect(drafted.challenge!.run.starters.every(id=>challengeCards.get(id)?.tier==='rotation')).toBe(true);
  expect(submit(drafted,{type:'play-challenge',attempt:1,stage:1}).error).toMatch(/对位/);
  const assigned=roundtrip(assign(drafted));
  expect(assigned.challenge!.run.assignments).toEqual(challengeMatchupActions(drafted).map(action=>action.playerId));
});

it('restores each phase, settles fresh and repeat wins once, and restarts only after losing',()=>{
  const initial=qualifiedChallengeGym(), startingFame=initial.fame;
  let state=draft(legacyV5ChallengeGym(initial));
  expect(roundtrip(state).challenge).toEqual(state.challenge);
  for(let stage=1;stage<200;stage++) {
    state=assign(state);
    const run=state.challenge!.run, score=scoreChallenge(run,challengeFixture(challengeSeed(state.seed,1),stage,run.rulesVersion),run.assignments);
    const command={type:'play-challenge' as const,attempt:1,stage};
    state=act(state,command);
    expect(submit(state,command).state).toBe(state);
    expect(state.challenge!.run.phase).toBe(score.won?'reward':'lost');
    expect(state.fame).toBe(startingFame+challengeBest(state.challenge)*6);
    if(!score.won)break;
    if(stage===1){
      expect(roundtrip(state).challenge).toEqual(state.challenge);
      expect(submit(state,{type:'start-challenge',attempt:1}).error).toBeTruthy();
    }
    state=chooseCategory(state,'team');
    const choice=chosenReward(state);
    state=act(state,choice);
    expect(submit(state,choice).state).toBe(state);
    expect(submit(state,command).state).toBe(state);
  }
  expect(state.challenge!.run.phase).toBe('lost');
  const best=challengeBest(state.challenge), fame=state.fame;
  expect(best).toBeGreaterThan(0);expect(roundtrip(state).challenge).toEqual(state.challenge);
  expect(state.credits).toBe(initial.credits);expect(state.alumni).toEqual(initial.alumni);
  state=act(state,{type:'start-challenge',attempt:1});
  expect(submit(state,{type:'start-challenge',attempt:1}).state).toBe(state);
  state=draft(roundtrip(state));
  expect(state.challenge!.run.team.every(p=>p.level===1+(state.challengeReferralCounts?.[p.id]??0)&&!p.gear.length)).toBe(true);
  expect(state.challenge!.run.moves).toHaveLength(0);
  expect(submit(state,{type:'play-challenge',attempt:1,stage:1}).state).toBe(state);
  state=act(assign(state),{type:'play-challenge',attempt:2,stage:1});
  expect(state.challenge!.run.phase).toBe('ready');expect(state.fame).toBe(fame);
  state=roundtrip(state);expect(challengeStage(state.challenge!.run)).toBe(2);
  expect(Object.values(state.challenge!.run.boosts).reduce((sum,value)=>sum+value,0)).toBe(1);
  expect(challengeBest(state.challenge)).toBe(best);
});

it('draws from the entire stage-eligible catalog across reloads and new discoveries',()=>{
  const initial=collectionChallengeGym();
  let s=draft(legacyV5ChallengeGym(initial));
  s=act(assign(s),{type:'play-challenge',attempt:1,stage:1});
  expect(submit(s,{type:'take-challenge-reward',attempt:1,stage:1,offer:0}).error).toBeTruthy();
  s=chooseCategory(s,'swap');
  s=roundtrip(s);
  const run=s.challenge!.run, pool=challengePlayerPool(s,run.rulesVersion), seed=challengeSeed(s.seed,1);
  expect(run.rewardCategory).toBe('swap');
  expect(submit(s,{type:'choose-challenge-reward',attempt:1,stage:1,category:'gear'}).state).toBe(s);
  const before=challengeRewardChoices(seed,1,run.team,pool,run.offerPoolSize,'swap',run.rulesVersion,run.settings);
  expect(before).toHaveLength(3);
  expect(before.every(card=>card.kind==='swap'&&!s.collection[card.id]&&challengeCards.get(card.id)?.tier==='rotation')).toBe(true);
  expect(recommendedTemplateIds(s)).toEqual([]);
  const newId=challengeTemplateIds.find(id=>!s.collection[id]&&!run.starters.includes(id))!;
  s.collection[newId]={firstAt:s.updatedAt,highestRating:80,highestValue:'320'};
  // A jsonb column can return the collection keys in a different order.
  s.collection=Object.fromEntries(Object.entries(s.collection).reverse());
  expect(challengePlayerPool(s,run.rulesVersion)).toEqual(pool);
  expect(s.challenge!.run.offerPoolSize).toBe(119);
  expect(challengeRewardChoices(seed,1,run.team,pool,119,'swap',run.rulesVersion,run.settings)).toEqual(before);
  s=act(roundtrip(s),chosenReward(s));
  const next=s.challenge!.run.team[0].id;
  expect(before[0]).toEqual({kind:'swap',id:next});
  expect(roundtrip(s).challenge).toEqual(s.challenge);
  expect(s.challenge!.run.starters).not.toContain(next);
  const reference={runId:`${s.createdAt}-${s.seed}`,revision:s.revision};
  expect(validateLocalGymRankingArchive(archive(s),reference,s.updatedAt).fame).toBe(s.fame);
  const bounds={...s,fame:s.alumni.length*1000+6};
  expect(validateLocalGymRankingArchive(archive(bounds),reference,s.updatedAt).fame).toBe(bounds.fame);
  expect(()=>validateLocalGymRankingArchive(archive({...bounds,fame:bounds.fame+1}),reference,s.updatedAt)).toThrow('声望');
  const wrong=structuredClone(s),members=wrong.challenge!.run.team;
  [members[0],members[1]]=[members[1],members[0]];
  expect(validGym(wrong)).toBe(true);expect(()=>roundtrip(wrong)).toThrow('云存档');
  const unknown=structuredClone(s);Object.assign(unknown.challenge!.run.team[0],{extra:'private'});
  expect(validGym(unknown)).toBe(false);
});

it('accepts a declined swap and replays it as a round with an identical team',()=>{
  let state=draft(legacyV5ChallengeGym(qualifiedChallengeGym()));
  state=act(assign(state),{type:'play-challenge',attempt:1,stage:1});
  state=chooseCategory(state,'swap');
  const run=state.challenge!.run, fame=state.fame;
  const skip={type:'take-challenge-reward',attempt:1,stage:1,offer:-1} as const;
  expect(submit(state,{...skip,targetId:run.team[0].id}).state).toBe(state);
  state=roundtrip(act(state,skip));
  expect(state.challenge!.run.phase).toBe('ready');
  expect(state.challenge!.run.rewardCategory).toBeUndefined();
  expect(challengeStage(state.challenge!.run)).toBe(2);
  expect(state.challenge!.run.team).toEqual(run.team);
  expect(state.challenge!.run.boosts).toEqual(run.boosts);
  expect(state.fame).toBe(fame);
  expect(submit(state,skip).state).toBe(state);
  const tampered=structuredClone(state), move=tampered.challenge!.run.moves[0];
  move[1]=0; // Attribute selections cannot be declined.
  expect(validGym(tampered)).toBe(false);
});

it.each([undefined,2,3,4,5] as const)('resumes old rules %s using their original player pool and reward format',rulesVersion=>{
  let state=legacyV5ChallengeGym(qualifiedChallengeGym());
  if (rulesVersion!==3&&rulesVersion!==4) {
    state.collection={};
    delete state.challenge!.collectionPool;
  }
  const run=state.challenge!.run;
  if (rulesVersion!==4&&rulesVersion!==5) delete run.bench;
  if (rulesVersion!==5) {
    delete run.matchups;
    delete run.assignments;
    delete run.settings;
  }
  const legacyPool=challengePlayerPool(state,rulesVersion);
  run.startPoolSize=legacyPool.length;
  if(rulesVersion===3||rulesVersion===4)state.challenge!.collectionPool=legacyPool;
  if (rulesVersion===undefined) delete run.rulesVersion;
  else run.rulesVersion=rulesVersion;
  state=draft(roundtrip(state));
  state=act(assign(state),{type:'play-challenge',attempt:1,stage:1});
  expect(state.challenge!.record?.rulesVersion).toBe(rulesVersion);
  if (rulesVersion) state=chooseCategory(state,'swap');
  else expect(submit(state,{type:'choose-challenge-reward',attempt:1,stage:1,category:'team'}).state).toBe(state);
  state=roundtrip(act(roundtrip(state),chosenReward(state)));
  expect(state.challenge!.run.moves[0]).toHaveLength(rulesVersion===4||rulesVersion===5?6:rulesVersion?5:4);
  expect(legacyPool).toContain(state.challenge!.run.team[0].id);
  expect(challengeStage(state.challenge!.run)).toBe(2);
  for(let stage=2;stage<200;stage++){
    state=act(assign(state),{type:'play-challenge',attempt:1,stage});
    if(state.challenge!.run.phase==='lost')break;
    if(rulesVersion)state=chooseCategory(state,'team');
    state=act(state,chosenReward(state));
  }
  expect(state.challenge!.run.phase).toBe('lost');
  if (rulesVersion!==3&&rulesVersion!==4) {
    state.collection=collectionChallengeGym().collection;
    for(const entry of Object.values(state.collection))entry.firstAt=state.createdAt;
  }
  const record=state.challenge!.record;
  const restarted=roundtrip(act(state,{type:'start-challenge',attempt:1}));
  expect(restarted.challenge!.record).toEqual(record);
  expect(restarted.challenge!.run.rulesVersion).toBe(challengeRulesVersion);
  if(rulesVersion===3||rulesVersion===4)expect(restarted.challenge!.collectionPool).toEqual(state.challenge!.collectionPool);
});
