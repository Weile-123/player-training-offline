import {describe,expect,it} from 'vitest';
import {statKeys,type Stats} from '../types';
import {decodeGym,encodeGym} from './save';
import {dispatchGym,newGym} from './engine';
import {parseGymCloudArchive} from '../../platform/gymCloudArchive';
import {hupuProject} from '../../platform/hupuProject';
import {validateLocalGymRankingArchive} from '../../../server/gymLocalRankProgress';
import {
  advanceChallenge,applyChallengeGearTransfer,applyScheduledChallengeMove,challengeBest,challengeCheckpoint,challengeDraft,challengeEntrant,challengeFamePerStage,challengeFixture,
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

  it.each([
    {cleared:0,phase:'draft'},
    {cleared:1,phase:'ready'},
    {cleared:3,phase:'reward'},
    {cleared:10,phase:'reward'},
  ])('retires a $phase run after $cleared wins without changing its ranking history',({cleared,phase})=>{
    const settings:ChallengeSettings={projects:{conditioning:5,coaching:3,training:4},referrals:{}};
    const game=scenario(41,settings);
    game.act({type:'start-challenge',attempt:0});
    if (cleared) {
      game.act({type:'refresh-challenge-draft',attempt:1});
      game.choose();
    }
    for (let stage=1;stage<=cleared;stage++) {
      game.play();
      expect(game.run().phase).not.toBe('lost');
      if (stage<cleared) game.reward();
    }
    if (cleared===10) {
      game.act({type:'take-challenge-reward',attempt:1,stage:10,offer:0,targetId:game.run().team[0].id});
      expect(game.run().rewardCategory).toBe('level');
    }
    expect(game.run().phase).toBe(phase);
    const before=game.assertSave();
    const stage=challengeStage(game.run());
    const retire={type:'retire-challenge-run',attempt:1,stage} as const;
    expect(dispatchGym(before,before.revision,{...retire,stage:stage+1},1).error).toBeDefined();
    const {state,error}=dispatchGym(before,before.revision,retire,1);
    expect(error).toBeUndefined();
    expect(state.challenge).toEqual({...before.challenge,run:{...before.challenge!.run,retired:true}});
    expect(state.fame).toBe(cleared*challengeFamePerStage);
    const archive=JSON.stringify({format:'legend-gym-cloud-v1',applicationId:hupuProject.applicationId,uploadedAt:1,gym:encodeGym(state)});
    const restored=parseGymCloudArchive(archive).state;
    const reference={runId:`${restored.createdAt}-${restored.seed}`,revision:restored.revision};
    expect(validateLocalGymRankingArchive(archive,reference,2).challenge).toBe(cleared);
    expect(dispatchGym(restored,restored.revision,retire,2).error).toBeDefined();
    const resume:ChallengeAction=phase==='draft'?{type:'draft-challenge',attempt:1,players:game.draft().slice(0,3)}:
      phase==='ready'?{type:'assign-challenge-matchup',attempt:1,stage,lane:0,playerId:game.run().team[0].id}:
        game.run().rewardCategory==='level'?{type:'take-challenge-reward',attempt:1,stage,offer:0,levelTargetIds:[game.run().team[0].id,game.run().team[1].id]}:
          {type:'take-challenge-reward',attempt:1,stage,offer:-1};
    expect(dispatchGym(restored,restored.revision,resume,2).error).toBeDefined();
    const next=dispatchGym(restored,restored.revision,{type:'start-challenge',attempt:1,...(cleared===10?{checkpoint:10}:{})},2);
    expect(next.error).toBeUndefined();
    expect(next.state.challenge!.run).toMatchObject({attempt:2,phase:'draft'});
    expect(next.state.challenge!.run.retired).toBeUndefined();
    expect(challengeBest(next.state.challenge)).toBe(cleared);
    expect(verifyChallengeHistory(decodeGym(encodeGym(next.state))!)).toBe(true);
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
    const withWarehouse=applyScheduledChallengeMove({...roster,warehouse:[]},4,12,move('swap',0,0))!;
    expect(withWarehouse.warehouse).toEqual(roster.team[0].gear);
    roster=applyScheduledChallengeMove(roster,4,12,move('swap',0,0))!;
    expect(roster.team).toHaveLength(6);
    expect(roster.team[0]).toMatchObject({level:1,gear:[]});
    const order=roster.team.slice(-3).map(player=>player.id);
    const score=scoreChallenge(roster,challengeFixture(4,13,version),order);
    expect(score.lanes.map(lane=>lane.player.id)).toEqual(order);
  });

  it('keeps the outgoing item when a fourth reward replaces equipment',()=>{
    const [id]=challengeTemplateIds;
    let squad:ChallengeSquad={team:[challengeEntrant(id)],boosts:empty,warehouse:[],rulesVersion:version};
    const reward=(slot=-1):ChallengeMove=>[challengeTemplateIds.length,challengeRewardCategories.indexOf('gear'),0,0,slot,-1];
    for (const stage of [5,10,15]) squad=applyScheduledChallengeMove(squad,4,stage,reward())!;
    const replaced=squad.team[0].gear[1];
    const result=applyScheduledChallengeMove(squad,4,20,reward(1))!;
    expect(result.team[0].gear).toHaveLength(3);
    expect(result.warehouse).toEqual([replaced]);
    expect(squad.warehouse).toEqual([]);
    expect(applyChallengeGearTransfer(result,[21,0,0,0,1])).toBeNull();
  });

  it('moves exactly one earned item through the warehouse, including existing runs and cloud archives',()=>{
    const game=scenario(1);
    game.act({type:'start-challenge',attempt:0});
    game.act({type:'refresh-challenge-draft',attempt:1});
    game.choose();
    while (challengeStage(game.run())<6) {
      game.play();
      expect(game.run().phase).not.toBe('lost');
      game.reward();
    }
    const save=game.assertSave();
    const run=save.challenge!.run,record=save.challenge!.record!;
    delete run.warehouseEnabled;
    delete run.warehouse;
    delete record.warehouseEnabled;
    expect(verifyChallengeHistory(save)).toBe(true);
    const [owner,recipient]=run.team;
    const gear=owner.gear[0];
    const unequip={type:'unequip-challenge-gear',attempt:1,stage:6,playerId:owner.id,itemIndex:0,item:gear} as const;
    const equip={...unequip,type:'equip-challenge-gear',playerId:recipient.id} as const;
    const changed=dispatchGym(save,save.revision,unequip,1);
    expect(changed.error).toBeUndefined();
    expect(changed.state.challenge!.run.warehouse).toEqual([gear]);
    expect(changed.state.challenge!.run.team[0].gear).toEqual([]);
    expect(verifyChallengeHistory(changed.state)).toBe(true);
    const archive=JSON.stringify({format:'legend-gym-cloud-v1',applicationId:hupuProject.applicationId,uploadedAt:1,gym:encodeGym(changed.state)});
    const restored=parseGymCloudArchive(archive).state;
    expect(restored.challenge?.run.warehouse).toEqual([gear]);
    const reference={runId:`${restored.createdAt}-${restored.seed}`,revision:restored.revision};
    expect(validateLocalGymRankingArchive(archive,reference,2).challenge).toBe(5);
    expect(dispatchGym(restored,restored.revision,{...equip,item:{...gear,band:gear.band+1}},2).error).toBeDefined();
    const equipped=dispatchGym(restored,restored.revision,equip,2);
    expect(equipped.error).toBeUndefined();
    expect(equipped.state.challenge!.run.team[1].gear).toEqual([gear]);
    expect(equipped.state.challenge!.run.warehouse).toEqual([]);
    expect(verifyChallengeHistory(decodeGym(encodeGym(equipped.state))!)).toBe(true);
    const duplicate=structuredClone(equipped.state);
    duplicate.challenge!.run.warehouse!.push(gear);
    expect(verifyChallengeHistory(duplicate)).toBe(false);
    expect(dispatchGym(equipped.state,equipped.state.revision,equip,3).error).toBeDefined();
  });

  it('replays equipment moved on both sides of a revived match',()=>{
    const game=scenario(1);
    game.act({type:'start-challenge',attempt:0});
    game.act({type:'refresh-challenge-draft',attempt:1});
    game.choose();
    let failedStage=0;
    for (let stage=1;stage<=100;stage++) {
      const run=game.run(), fixture=challengeFixture(game.seed(),stage,version);
      const ids=run.team.map(member=>member.id);
      const possibleOrders=ids.flatMap(first=>ids.filter(second=>first!==second).flatMap(second=>
        ids.filter(third=>third!==first&&third!==second).map(third=>[first,second,third])));
      const loses=stage>5&&possibleOrders.find(order=>!scoreChallenge(run,fixture,order).won);
      if (loses) {
        const owner=run.team.find(player=>player.gear.length)!;
        const item=owner.gear[0];
        game.act({type:'unequip-challenge-gear',attempt:1,stage,playerId:owner.id,itemIndex:0,item});
        game.play(loses);
        expect(game.run().phase).toBe('lost');
        game.act({type:'revive-challenge',attempt:1,stage});
        game.assertSave();
        game.act({type:'take-challenge-reward',attempt:1,stage,offer:0});
        const recipient=game.run().team.at(-1)!;
        game.act({type:'equip-challenge-gear',attempt:1,stage,playerId:recipient.id,itemIndex:0,item});
        expect(game.run().gearTransfers?.map(transfer=>transfer.slice(0,2))).toEqual([[stage,0],[stage,1]]);
        expect(game.run().team.at(-1)?.gear).toEqual([item]);
        game.assertSave();
        failedStage=stage;
        break;
      }
      game.play();
      expect(game.run().phase).not.toBe('lost');
      game.reward();
    }
    expect(failedStage).toBeGreaterThan(5);
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
    const owner=game.run().team.find(player=>player.gear.length)!;
    const item=owner.gear.at(-1)!;
    const stored=game.run().warehouse!.length;
    game.act({type:'unequip-challenge-gear',attempt:2,stage:checkpoint+1,playerId:owner.id,itemIndex:owner.gear.length-1,item});
    game.assertSave();
    game.act({type:'equip-challenge-gear',attempt:2,stage:checkpoint+1,playerId:owner.id,itemIndex:stored,item});
    for(let i=0;i<20&&game.run().phase==='ready'&&challengeBest(game.current())===best;i++) {
      game.play();
      if (game.run().phase==='reward') game.reward();
    }
    expect(challengeBest(game.current())).toBe(best+1);
    expect(game.current().checkpointProofs).toHaveLength(1);
    expect(game.current().record?.gearTransfers).toHaveLength(2);
    expect(game.fame()).toBe(fame+6);
    const verified=game.assertSave(),forge=structuredClone(verified);
    delete forge.challenge!.checkpointProofs;
    expect(validChallenge(forge.challenge,forge)).toBe(false);
  });
});
