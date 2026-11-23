import {expect,it} from 'vitest';
import {
  challengeBenchCap, challengeDraft, challengeFixture, challengeRewardChoices, challengeRoster, challengeSeed,
  challengeStage, recommendedChallengeDraft, type ChallengeRewardCategory,
} from '../src/game/gym/challenge';
import {challengeTemplateIds} from '../src/game/gym/challengeCatalog';
import {challengePlayerPool, dispatchGym, newGym, type GymAction, type GymState} from '../src/game/gym/engine';
import {decodeGym, encodeGym, validGym} from '../src/game/gym/save';
import {verifyChallengeHistory} from '../src/game/gym/challengeSave';
import {challengeMatchupActions,legacyV5ChallengeGym} from './fixtures/challengeGym';

function act(state:GymState,action:GymAction) {
  const result=dispatchGym(state,state.revision,action,state.updatedAt);
  if (result.error) throw Error(result.error);
  expect(validGym(result.state)).toBe(true);
  return result.state;
}

function winAndPick(state:GymState,category:ChallengeRewardCategory) {
  const run=state.challenge!.run, stage=challengeStage(run);
  for (const assignment of challengeMatchupActions(state)) state=act(state,assignment);
  state=act(state,{type:'play-challenge',attempt:run.attempt,stage});
  expect(state.challenge!.run.phase).toBe('reward');
  return act(state,{type:'choose-challenge-reward',attempt:run.attempt,stage,category});
}

function reload(state:GymState) {
  const decoded=decodeGym(encodeGym(state));
  expect(decoded).toBeTruthy();
  expect(verifyChallengeHistory(decoded!)).toBe(true);
  expect(decoded!.challenge).toEqual(state.challenge);
  return decoded!;
}

it('retires a legacy challenge while preserving its best result across the next draft',()=>{
  const initial=newGym(1000,18201);
  initial.gymLevel=3;
  initial.challengeProjects={conditioning:5,coaching:3};
  let state=legacyV5ChallengeGym(initial);
  const attempt=1,seed=challengeSeed(state.seed,attempt);
  const {rulesVersion,settings}=state.challenge!.run;
  const pool=challengePlayerPool(state,rulesVersion);
  const players=recommendedChallengeDraft(challengeDraft(seed,pool,pool.length,rulesVersion,settings),challengeFixture(seed,1,rulesVersion));
  state=act(state,{type:'draft-challenge',attempt,players});
  state=winAndPick(state,'level');
  const record=state.challenge!.record,fame=state.fame;
  state=reload(act(state,{type:'retire-challenge-run',attempt,stage:1}));
  expect(state.challenge!.run).toMatchObject({phase:'reward',retired:true});
  state=reload(act(state,{type:'start-challenge',attempt}));
  expect(state.challenge!.run).toMatchObject({attempt:2,phase:'draft'});
  expect(state.challenge!.record).toEqual(record);
  expect(state.fame).toBe(fame);
});

it('recruits three reserves, exchanges their own levels and gear, and replays the lineup after a declined reward',()=>{
  let state=newGym(1000,18201);
  state.gymLevel=3;
  state.challengeProjects={conditioning:5,coaching:3};
  state.collection=Object.fromEntries(challengeTemplateIds.map(id=>[id,{firstAt:1000,highestRating:80,highestValue:'320'}]));
  state=legacyV5ChallengeGym(state);
  const attempt=1, seed=challengeSeed(state.seed,attempt);
  const pool=challengePlayerPool(state,state.challenge!.run.rulesVersion);
  const {rulesVersion,settings}=state.challenge!.run;
  const starters=recommendedChallengeDraft(challengeDraft(seed,pool,pool.length,rulesVersion,settings),challengeFixture(seed,1,rulesVersion));
  state=act(state,{type:'draft-challenge',attempt,players:starters});
  const starterId=starters[0];
  state=winAndPick(state,'level');
  state=act(state,{type:'take-challenge-reward',attempt,stage:1,offer:0,targetId:starterId});
  state=winAndPick(state,'gear');
  state=act(state,{type:'take-challenge-reward',attempt,stage:2,offer:0,targetId:starterId});
  const upgraded=state.challenge!.run.team[0];
  expect(upgraded.level).toBe(2);
  expect(upgraded.gear).toHaveLength(1);

  for (const stage of [3,4,5]) {
    state=winAndPick(state,'swap');
    const run=state.challenge!.run;
    const occupied=challengeRoster(run).map(player=>player.id);
    const choices=challengeRewardChoices(seed,stage,challengeRoster(run),pool,run.offerPoolSize,'swap',rulesVersion,settings);
    expect(choices.every(card=>card.kind==='swap'&&!occupied.includes(card.id))).toBe(true);
    state=act(state,{type:'take-challenge-reward',attempt,stage,offer:0,toBench:true});
    expect(state.challenge!.run.bench).toHaveLength(stage-2);
    const recruit=state.challenge!.run.bench![stage-3];
    expect(recruit).toMatchObject({level:1,gear:[]});
    if (choices[0].kind==='swap') expect(recruit.id).toBe(choices[0].id);
    if (stage===3) {
      const record=structuredClone(state.challenge!.record);
      state=act(state,{type:'swap-challenge-lineup',attempt,stage:4,starterId,reserveId:recruit.id});
      expect(state.challenge!.run.team[0]).toEqual(recruit);
      expect(state.challenge!.run.bench![0]).toEqual(upgraded);
      expect(state.challenge!.run.assignments).toEqual([null,null,null]);
      expect(state.challenge!.record).toEqual(record);
    }
    state=reload(state);
  }

  state=winAndPick(state,'swap');
  const run=state.challenge!.run;
  expect(run.bench).toHaveLength(challengeBenchCap);
  expect(dispatchGym(state,state.revision,{type:'take-challenge-reward',attempt,stage:6,offer:0,toBench:true},state.updatedAt).error).toMatch(/备战席已满/);
  expect(dispatchGym(state,state.revision,{type:'swap-challenge-lineup',attempt,stage:6,starterId:run.team[0].id,reserveId:starterId},state.updatedAt).state).toBe(state);
  state=act(state,{type:'take-challenge-reward',attempt,stage:6,offer:-1});
  state=act(state,{type:'swap-challenge-lineup',attempt,stage:7,starterId:run.team[0].id,reserveId:starterId});
  expect(state.challenge!.run.team[0]).toEqual(upgraded);
  expect(state.challenge!.run.bench![0]).toEqual(run.team[0]);
  state=reload(state);

  const forged=structuredClone(state);
  forged.challenge!.run.bench![1].id=forged.challenge!.run.team[0].id;
  expect(validGym(forged)).toBe(false);
  const reordered=structuredClone(state);
  const lastMove=reordered.challenge!.run.moves.at(-1)!;
  if (lastMove.length!==6) throw Error('Missing bench history');
  lastMove[5]=0;
  expect(validGym(reordered)).toBe(true);
  expect(verifyChallengeHistory(reordered)).toBe(false);
});
