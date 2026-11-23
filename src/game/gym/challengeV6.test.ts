import {describe,expect,it} from 'vitest';
import {statKeys,type Stats} from '../types';
import {newGym} from './engine';
import {
  advanceChallenge,applyScheduledChallengeMove,challengeBest,challengeCheckpoint,challengeDraft,challengeEntrant,challengeFixture,
  challengeNextMilestone,challengePower,challengeRewardCategories,challengeRewardChoices,challengeRulesVersion,
  challengeScheduledReward,challengeScheduledRewards,challengeSeed,challengeStage,scoreChallenge,
  type ChallengeAction,type ChallengeMove,type ChallengeSettings,type ChallengeSquad,type GymChallenge,
} from './challenge';
import {challengeCards,challengeTemplateIds} from './challengeCatalog';
import {validChallenge,verifyChallengeHistory} from './challengeSave';

const empty:Stats={three:0,mid:0,drive:0,inside:0,handle:0,defense:0};
const baseSettings:ChallengeSettings={projects:{},referrals:{}};
const version=challengeRulesVersion;

function scenario(gymSeed:number,settings=baseSettings) {
  let current:GymChallenge|undefined,fame=0;
  const run=()=>current!.run;
  const seed=()=>challengeSeed(gymSeed,run().attempt);
  const tryAction=(action:ChallengeAction)=>advanceChallenge(current,action,gymSeed,3,challengeTemplateIds,settings);
  function act(action:ChallengeAction) {
    const result=tryAction(action);
    if ('error' in result) throw Error(`${action.type}: ${result.error}`);
    current=result.challenge;
    fame+=result.fame;
  }
  function assertSave() {
    current=JSON.parse(JSON.stringify(current));
    const state={...newGym(0,gymSeed),gymLevel:3,fame,challengeProjects:settings.projects,challengeReferralCounts:{...settings.referrals},challenge:current};
    expect(validChallenge(current,state)).toBe(true);
    expect(verifyChallengeHistory(state)).toBe(true);
    return state;
  }
  const draft=()=>challengeDraft(seed(),[],0,version,settings,run().draftRefreshed);
  function choose(players=draft().slice(0,3)) {
    act({type:'draft-challenge',attempt:run().attempt,players});
  }
  function play(order?:string[]) {
    const {attempt}=run(),stage=challengeStage(run());
    const laneIds=order??scoreChallenge(run(),challengeFixture(seed(),stage,version)).lanes.map(lane=>lane.player.id);
    laneIds.forEach((playerId,lane)=>act({type:'assign-challenge-matchup',attempt,stage,lane,playerId}));
    act({type:'play-challenge',attempt,stage});
  }
  function reward() {
    const {attempt,rewardCategory,team}=run(),stage=challengeStage(run());
    if (rewardCategory==='level') act({type:'take-challenge-reward',attempt,stage,offer:0,levelTargetIds:[team[0].id,team[1].id]});
    if (rewardCategory==='swap') act({type:'take-challenge-reward',attempt,stage,offer:-1});
    if (rewardCategory==='gear') {
      const index=team.findIndex(player=>player.gear.length<3);
      act({type:'take-challenge-reward',attempt,stage,offer:0,targetId:team[Math.max(0,index)].id,...(index===-1?{replaceSlot:0}:{})});
    }
  }
  return {run,seed,act,tryAction,draft,choose,play,reward,assertSave,fame:()=>fame,current:()=>current!};
}

describe('scheduled challenge rules',()=>{
  it('selects only the highest-priority milestone and lowers the silent fixed bonus',()=>{
    expect(Array.from({length:30},(_,index)=>index+1).filter(stage=>challengeScheduledReward(stage)==='level')).toEqual([10,20,30]);
    expect(Array.from({length:30},(_,index)=>index+1).filter(stage=>challengeScheduledReward(stage)==='gear')).toEqual([5,15,25]);
    expect(challengeNextMilestone(14)).toEqual({stage:15,category:'gear',categories:['gear']});
    expect(challengeNextMilestone(29)).toEqual({stage:30,category:'level',categories:['gear','level']});
    const player=challengeEntrant('jordan');
    const bonus=challengePower(player,'drive',{...empty,drive:1},undefined,6)-challengePower(player,'drive',empty,undefined,6);
    expect(bonus).toBe(500+2*challengeCards.get(player.id)!.stats.drive);
  });

  it('refreshes all five candidates once and offers exactly one random superstar',()=>{
    const picked=new Set<string>();
    for(let seed=1;seed<=100;seed++) {
      const game=scenario(seed);
      game.act({type:'start-challenge',attempt:0});
      const before=game.draft();
      const refresh={type:'refresh-challenge-draft',attempt:1} as const;
      game.act(refresh);
      const after=game.draft(),stars=after.filter(id=>challengeCards.get(id)?.tier==='superstar');
      expect(new Set(after).size).toBe(5);
      expect(after.some(id=>before.includes(id))).toBe(false);
      expect(stars).toHaveLength(1);
      picked.add(stars[0]);
      expect(game.tryAction(refresh)).toHaveProperty('error');
      game.choose();
      game.assertSave();
    }
    expect(picked.size).toBeGreaterThan(1);
  });

  it('revives once after a real loss, hands out a superstar and replays at the failed stage',()=>{
    const game=scenario(1);
    game.act({type:'start-challenge',attempt:0});
    game.choose();
    game.play(['dell-curry','birdman','jose-calderon']);
    expect(game.run().phase).toBe('lost');
    const revive={type:'revive-challenge',attempt:1,stage:1} as const;
    game.act(revive);
    game.assertSave();
    const offers=challengeRewardChoices(game.seed(),1,game.run().team,[],119,'swap',version,baseSettings,true);
    expect(offers.filter(card=>card.kind==='swap'&&challengeCards.get(card.id)?.tier==='superstar')).toHaveLength(1);
    game.act({type:'take-challenge-reward',attempt:1,stage:1,offer:0});
    expect(game.run().team.map(player=>player.id)).toContain(offers[0].kind==='swap'&&offers[0].id);
    expect(game.run().team).toHaveLength(4);
    expect(challengeStage(game.run())).toBe(1);
    expect(game.tryAction(revive)).toHaveProperty('error');
    game.assertSave();
    game.play();
    expect(game.fame()).toBe(6);
    expect(challengeStage(game.run())).toBe(2);
    game.assertSave();
  });

  it('keeps six players in one roster, releases gear on replacement and levels two different players',()=>{
    const starterIds=challengeDraft(4,[],0,version).slice(0,3);
    let roster:ChallengeSquad={team:starterIds.map(id=>challengeEntrant(id)),boosts:empty,rulesVersion:version};
    const move=(category:typeof challengeRewardCategories[number],offer:number,target=-1,slot=-1,second=-1):ChallengeMove=>
      [119,challengeRewardCategories.indexOf(category),offer,target,slot,second];
    for(const stage of [3,6,9]) roster=applyScheduledChallengeMove(roster,4,stage,move('swap',0))!;
    expect(roster.team).toHaveLength(6);
    expect(applyScheduledChallengeMove(roster,4,10,move('level',0,5,-1,5))).toBeNull();
    roster=applyScheduledChallengeMove(roster,4,10,move('level',0,0,-1,5))!;
    expect(roster.team.map(player=>player.level)).toEqual([2,1,1,1,1,2]);
    roster=applyScheduledChallengeMove(roster,4,5,move('gear',0,0))!;
    expect(roster.team[0].gear).toHaveLength(1);
    expect(applyScheduledChallengeMove(roster,4,12,move('swap',0))).toBeNull();
    roster=applyScheduledChallengeMove(roster,4,12,move('swap',0,0))!;
    expect(roster.team).toHaveLength(6);
    expect(roster.team[0]).toMatchObject({level:1,gear:[]});
    const order=roster.team.slice(-3).map(player=>player.id);
    const score=scoreChallenge(roster,challengeFixture(4,13,version),order);
    expect(score.lanes.map(lane=>lane.player.id)).toEqual(order);
  });

  it('replays previous checkpoint rewards without awarding new fame',()=>{
    const settings={projects:{conditioning:5,coaching:3,training:4,scouting:2},
      referrals:Object.fromEntries(challengeTemplateIds.map(id=>[id,4]))} satisfies ChallengeSettings;
    const game=scenario(6,settings);
    game.act({type:'start-challenge',attempt:0});
    game.choose();
    for(let i=0;i<140&&game.run().phase!=='lost';i++) {
      if (game.run().phase==='ready') {
        const run=game.run(),stage=challengeStage(run),ids=run.team.map(player=>player.id);
        const fixture=challengeFixture(game.seed(),stage,version);
        const orders=ids.flatMap(a=>ids.filter(b=>a!==b).map(b=>[a,b,ids.find(c=>c!==a&&c!==b)!]));
        const worst=orders.reduce((a,b)=>scoreChallenge(run,fixture,a).home<scoreChallenge(run,fixture,b).home?a:b);
        game.play(stage>10?worst:undefined);
      }
      game.reward();
    }
    expect(game.run().phase).toBe('lost');
    game.assertSave();
    const checkpoint=challengeCheckpoint(game.current()),fame=game.fame(),best=challengeBest(game.current());
    expect(checkpoint).toBeGreaterThanOrEqual(10);
    const retire={type:'retire-challenge-run',attempt:1,stage:best+1} as const;
    game.act(retire);
    expect(game.tryAction({type:'revive-challenge',attempt:1,stage:best+1})).toHaveProperty('error');
    expect(game.tryAction({type:'start-challenge',attempt:1,checkpoint:checkpoint+10})).toHaveProperty('error');
    game.act({type:'start-challenge',attempt:1,checkpoint});
    game.act({type:'refresh-challenge-draft',attempt:2});
    game.choose();
    const milestones:number[]=[];
    while (game.run().phase==='reward') {
      milestones.push(challengeStage(game.run()));
      game.assertSave();
      game.reward();
    }
    expect(milestones).toEqual(Array.from({length:checkpoint},(_,index)=>index+1).flatMap(stage=>
      challengeScheduledRewards(stage).filter(category=>category!=='team').map(()=>stage)));
    expect(challengeStage(game.run())).toBe(checkpoint+1);
    expect(game.fame()).toBe(fame);
    expect(challengeBest(game.current())).toBe(best);
    expect(Object.values(game.run().boosts).reduce((sum,value)=>sum+value,0)).toBe(checkpoint-new Set(milestones).size);
    expect(game.run().team[0].level).toBe(5+checkpoint/10);
    game.assertSave();
    for(let i=0;i<20&&game.run().phase==='ready'&&challengeBest(game.current())===best;i++) {
      game.play();
      if (game.run().phase==='reward') game.reward();
    }
    expect(challengeBest(game.current())).toBe(best+1);
    expect(game.current().checkpointProofs).toHaveLength(1);
    expect(game.fame()).toBe(fame+6);
    const verified=game.assertSave(),forge=structuredClone(verified);
    delete forge.challenge!.checkpointProofs;
    expect(validChallenge(forge.challenge,forge)).toBe(false);
  });
});
