import {describe,expect,it} from 'vitest';
import {aptitude,match,shape,templateRules} from '../contract/templates';
import {statKeys, type Stats} from '../types';
import {challengeCards,challengeEquipment,challengeMeans,challengeTemplateIds} from './challengeCatalog';
import {
  advanceChallenge, applyChallengeOffer, challengeDraft, challengeEntrant, challengeFixture, challengeOffers,
  challengePower, challengeRecruitOdds, challengeRewardChoices, challengeRulesVersion, challengeSeed, gearBonus,
  recommendedChallengeDraft, scoreChallenge, type ChallengeAction, type ChallengeGear, type ChallengeSettings, type ChallengeSquad,
} from './challenge';
import {validChallenge,verifyChallengeHistory} from './challengeSave';
import {newGym} from './engine';

const zero:Stats={three:0,mid:0,drive:0,inside:0,handle:0,defense:0};
const squad=(ids:string[]):ChallengeSquad=>({team:ids.map(id=>({id,level:1,gear:[]})),boosts:{...zero}});

describe('challenge cards and fixtures',()=>{
  it('all 119 fixed starting cards are the first qualifying step matched to their own full-game template',()=>{
    expect(challengeCards.size).toBe(119);
    for (const rule of templateRules) {
      let first:Stats|undefined;
      for(let percent=0;percent<=100;percent++) {
        const candidate=Object.fromEntries(statKeys.map(key=>[key,Math.max(rule.statFloor??0,rule.coreMinimums[key]??0,Math.ceil(rule.stats[key]*percent/100))])) as Stats;
        if(aptitude(candidate,rule.stats)<rule.enter || statKeys.reduce((sum,key)=>sum+candidate[key],0)/6 < (rule.ratingFloor??0))continue;
        const result=match({stats:candidate,level:rule.minLevel,peakLevel:rule.minLevel,height:Math.round((rule.height[0]+rule.height[1])/2),
          templateId:null,matchSeed:17,lastStyle:shape(candidate)});
        if(result.templateId===rule.id && result.rows.find(row=>row.id===rule.id)?.eligible){first=candidate;break;}
      }
      expect(challengeCards.get(rule.id)!.stats,rule.id).toEqual(first);
    }
  });
  it('draws three distinct opponents and skills, including unsigned opponents, following the stage curve',()=>{
    const seen=new Set<string>();
    for (const [stage,baseline] of [[1,30],[5,45],[10,61],[20,84],[40,118],[50,140],[100,250],[1000,2230]]) {
      for(let seed=0;seed<100;seed++) {
        const {lanes}=challengeFixture(seed,stage);
        expect(new Set(lanes.map(l=>l.id)).size).toBe(3);
        expect(new Set(lanes.map(l=>l.key)).size).toBe(3);
        for (const lane of lanes) {
          seen.add(lane.id);
          const offset=Math.round(.38*(challengeCards.get(lane.id)!.stats[lane.key]-challengeMeans[lane.key]));
          expect(lane.power).toBe(baseline+Math.max(-8,Math.min(8,offset)));
          expect(lane.points).toBe(Math.round(lane.power/4));
        }
      }
    }
    expect(seen.size).toBe(119);
    const pool=challengeTemplateIds.slice(0,12);
    expect(challengeDraft(17,pool,12)).toHaveLength(5);
    expect(challengeDraft(17,[...pool,...challengeTemplateIds.slice(12)],12)).toEqual(challengeDraft(17,pool,12));
  });
  it('only draws distinct reward categories and every original equipment card is obtainable',()=>{
    const team=squad(challengeTemplateIds.slice(0,3)).team, seen=new Set<string>();
    for (let seed=0;seed<4000;seed++) {
      const offers=challengeOffers(seed,12,team,challengeTemplateIds,12);
      expect(new Set(offers.map(o=>o.kind)).size).toBe(3);
      for (const card of offers) {
        if (card.kind==='gear') {seen.add(card.item.id);expect(card.item.band).toBe(1);}
        if (card.kind==='swap') expect(challengeTemplateIds.slice(3,12)).toContain(card.id);
      }
    }
    expect(seen.size).toBe(challengeEquipment.size);
    expect(seen.size).toBe(96);
  });
  it('draws legacy rotation rosters from the signed pool before filling empty slots',()=>{
    const allRotations=challengeTemplateIds.filter(id=>challengeCards.get(id)!.tier==='rotation');
    const otherPlayers=challengeTemplateIds.filter(id=>challengeCards.get(id)!.tier!=='rotation');
    const signed=[...otherPlayers.slice(0,7),...allRotations.slice(0,6)];
    for(let seed=0;seed<20;seed++) {
      const draft=challengeDraft(seed,signed,signed.length,2);
      expect(new Set(draft).size).toBe(5);
      expect(draft.every(id=>signed.includes(id)&&allRotations.includes(id))).toBe(true);
    }
    const smallPool=[...otherPlayers.slice(0,11),allRotations[0]];
    const draft=challengeDraft(17,smallPool,12,2);
    expect(new Set(draft).size).toBe(5);
    expect(draft).toContain(allRotations[0]);
    expect(draft.every(id=>allRotations.includes(id))).toBe(true);
  });
  it('draws five distinct global reserves independently of the gym collection',()=>{
    const reserves=challengeTemplateIds.filter(id=>challengeCards.get(id)!.tier==='rotation');
    const collection=challengeTemplateIds.filter(id=>challengeCards.get(id)!.tier!=='rotation').slice(0,12);
    const collectedReserves=reserves.slice(0,5);
    const seen=new Set<string>();
    for(let seed=0;seed<100;seed++) {
      const draft=challengeDraft(seed,collection,collection.length,3);
      expect(new Set(draft).size).toBe(5);
      expect(draft.every(id=>reserves.includes(id))).toBe(true);
      expect(draft).toEqual(challengeDraft(seed,collectedReserves,collectedReserves.length,3));
      draft.forEach(id=>seen.add(id));
    }
    expect(seen.size).toBe(reserves.length);
  });
  it('gives three distinct choices of the committed category and one targeted level reward',()=>{
    const pool=challengeTemplateIds.slice(0,12),team=squad(pool.slice(0,3)).team;
    const traits=challengeRewardChoices(17,12,team,pool,12,'team');
    expect(traits.every(offer=>offer.kind==='team')).toBe(true);
    expect(new Set(traits.map(offer=>offer.kind==='team'&&offer.key)).size).toBe(3);
    const players=challengeRewardChoices(17,12,team,pool,12,'swap');
    expect(players.every(offer=>offer.kind==='swap'&&pool.slice(3).includes(offer.id))).toBe(true);
    expect(new Set(players.map(offer=>offer.kind==='swap'&&offer.id)).size).toBe(3);
    const gear=challengeRewardChoices(17,12,team,pool,12,'gear');
    expect(gear.every(offer=>offer.kind==='gear'&&offer.item.band===1&&challengeEquipment.has(offer.item.id))).toBe(true);
    expect(new Set(gear.map(offer=>offer.kind==='gear'&&offer.item.id)).size).toBe(3);
    expect(challengeRewardChoices(17,12,team,pool,12,'level')).toEqual([{kind:'level'}]);
  });
});

describe('three individual scores determine the winner',()=>{
  it('rounds each lane, selects the highest total among all six permutations and gives a tied total to the player',()=>{
    const team=squad(['bryant','oneal','caruso']);
    team.boosts.handle=1;
    for (let seed=0;seed<100;seed++) {
      const fixture=challengeFixture(seed,6), result=scoreChallenge(team,fixture);
      const possibles=[];
      for(const a of team.team) for(const b of team.team) for(const c of team.team) {
        if(new Set([a,b,c]).size!==3)continue;
        const raw=[a,b,c].map((p,i)=>challengePower(p,fixture.lanes[i].key,team.boosts));
        possibles.push([raw.reduce((sum,v)=>sum+Math.round(v/400),0),raw.reduce((sum,v)=>sum+v,0)]);
      }
      possibles.sort((a,b)=>b[0]-a[0]||b[1]-a[1]);
      expect([result.home,result.exact]).toEqual(possibles[0]);
      expect(result.lanes.reduce((sum,l)=>sum+l.points,0)).toBe(result.home);
      expect(new Set(result.lanes.map(l=>l.player.id)).size).toBe(3);
      const tied={...fixture,lanes:fixture.lanes.map((l,i)=>({...l,power:result.lanes[i].points*4,points:result.lanes[i].points}))};
      expect(scoreChallenge(team,tied).won).toBe(true);
      tied.lanes[0].power+=4;tied.lanes[0].points++;
      expect(scoreChallenge(team,tied).won).toBe(false);
    }
  });
  it('recommends an optimal selection of three from the actual five candidates',()=>{
    const fixture=challengeFixture(99,1), pool=challengeDraft(99,challengeTemplateIds,12);
    const pick=recommendedChallengeDraft(pool,fixture);
    const scores=[];
    for(let i=0;i<3;i++)for(let j=i+1;j<4;j++)for(let k=j+1;k<5;k++)scores.push(scoreChallenge(squad([pool[i],pool[j],pool[k]]),fixture).home);
    expect(scoreChallenge(squad(pick),fixture).home).toBe(Math.max(...scores));
  });
});

it('keeps slot investment when swapping, requires a specific full slot and uses the new base for additive team layers',()=>{
  const starting=squad(['bryant','oneal','caruso']);
  const gear:ChallengeGear[]=[{id:'relic_002',band:0},{id:'relic_004',band:1},{id:'relic_005',band:0}];
  let current=applyChallengeOffer(starting,{kind:'level'},0,-1)!;
  for(const item of gear)current=applyChallengeOffer(current,{kind:'gear',item},0,-1)!;
  const replacement={kind:'gear' as const,item:{id:'relic_001',band:2}};
  expect(applyChallengeOffer(current,replacement,0,-1)).toBeNull();
  current=applyChallengeOffer(current,replacement,0,1)!;
  current=applyChallengeOffer(current,{kind:'team',key:'defense'},-1,-1)!;
  current=applyChallengeOffer(current,{kind:'team',key:'defense'},-1,-1)!;
  current=applyChallengeOffer(current,{kind:'swap',id:'jordan'},0,-1)!;
  const p=current.team[0],base=challengeCards.get(p.id)!.stats.defense;
  expect(p).toEqual({id:'jordan',level:2,gear:[gear[0],replacement.item,gear[2]]});
  expect(challengePower(p,'defense',current.boosts)).toBe((base+5+12+gearBonus(replacement.item)+gearBonus(gear[2]))*100+base*4);
  expect(starting.team[0]).toEqual({id:'bryant',level:1,gear:[]});
  expect(statKeys.every(key=>starting.boosts[key]===0)).toBe(true);
});

describe('manual challenge rules',()=>{
  const settings:ChallengeSettings={
    projects:{scouting:2,conditioning:2,coaching:1,training:3,recruiting:4},
    referrals:{caruso:3,curry:2},
  };
  const tierOf=(id:string)=>challengeCards.get(id)!.tier;
  const version=challengeRulesVersion;
  it('keeps stage one rival and reward draws low-tier and caps high-quality weighted recruiting',()=>{
    for (let seed=0;seed<100;seed++) {
      for (const stage of [1,2]) {
        expect(challengeFixture(seed,stage,version).lanes.every(lane=>tierOf(lane.id)==='rotation')).toBe(true);
        const choices=challengeRewardChoices(seed,stage,[],[],0,'swap',version,settings);
        expect(choices.every(card=>card.kind==='swap'&&tierOf(card.id)==='rotation')).toBe(true);
      }
    }
    expect(challengeRecruitOdds(3)).toEqual([['rotation',88],['starter',12]]);
    expect(challengeRecruitOdds(3,settings)).toEqual([['rotation',76],['starter',24]]);
    expect(challengeRecruitOdds(7).map(([tier])=>tier)).toEqual(['rotation','starter','star']);
    expect(challengeRecruitOdds(14).map(([tier])=>tier)).toEqual(['rotation','starter','star','superstar']);
    expect(challengeRecruitOdds(24).map(([tier])=>tier)).toEqual(['rotation','starter','star','superstar','legend']);
    expect(challengeRecruitOdds(100,settings)).toEqual(challengeRecruitOdds(1000,settings));
    expect(challengeRecruitOdds(100,settings)[0]).toEqual(['rotation',34]);
    const draws=new Set<string>();
    for (let seed=0;seed<1000;seed++) {
      for (const card of challengeRewardChoices(seed,100,[],[],0,'swap',version,settings)) {
        if (card.kind==='swap') draws.add(card.id);
      }
    }
    expect(draws.size).toBe(challengeTemplateIds.length);
  });

  it('unlocks draft quality only through upgrades and stores referral levels separately from run progression',()=>{
    const unscouted=new Set<string>(),scouted=new Set<string>(),highScouted=new Set<string>();
    for (let seed=0;seed<100;seed++) {
      challengeDraft(seed,[],0,version).forEach(id=>unscouted.add(tierOf(id)));
      challengeDraft(seed,[],0,version,{...settings,projects:{scouting:1}}).forEach(id=>scouted.add(tierOf(id)));
      challengeDraft(seed,[],0,version,settings).forEach(id=>highScouted.add(tierOf(id)));
    }
    expect([...unscouted]).toEqual(['rotation']);
    expect([...scouted].sort()).toEqual(['rotation','starter']);
    expect([...highScouted].sort()).toEqual(['rotation','star','starter']);
    expect(challengeEntrant('curry',settings).level).toBe(3);
    const initial:ChallengeSquad={team:[challengeEntrant('caruso',settings)],boosts:zero,bench:[],settings};
    const trained=applyChallengeOffer(initial,{kind:'level'},0,-1)!;
    const swapped=applyChallengeOffer(trained,{kind:'swap',id:'curry'},0,-1)!;
    expect(swapped.team[0]).toEqual({id:'curry',level:4,gear:[]});
    expect(applyChallengeOffer(initial,{kind:'swap',id:'curry'},-2,-1)?.bench?.[0].level).toBe(3);
    const buffed=applyChallengeOffer(swapped,{kind:'team',key:'three'},-1,-1)!;
    const base=challengeCards.get('curry')!.stats.three;
    expect(challengePower(buffed.team[0],'three',buffed.boosts,settings)).toBe((base+3*6+2+9)*100+base*2);
  });

  it('requires distinct manual assignments and scores, saves and verifies the chosen order',()=>{
    const gymSeed=42, fixture=challengeFixture(challengeSeed(gymSeed,1),1,version);
    const start={type:'start-challenge' as const,attempt:0};
    expect(advanceChallenge(undefined,start,gymSeed,2,[])).toHaveProperty('error');
    const started=advanceChallenge(undefined,start,gymSeed,3,[],settings);
    if ('error' in started) throw new Error(started.error);
    let current=started.challenge;
    const advance=(action:ChallengeAction)=>{
      const result=advanceChallenge(current,action,gymSeed,3,[]);
      if ('error' in result) throw new Error(result.error);
      current=result.challenge;
      return result.fame;
    };
    const players=challengeDraft(challengeSeed(gymSeed,1),[],0,version,settings).slice(0,3);
    advance({type:'draft-challenge',attempt:1,players});
    const play={type:'play-challenge' as const,attempt:1,stage:1};
    expect(advanceChallenge(current,play,gymSeed,3,[])).toHaveProperty('error');
    const ordered=scoreChallenge(current.run,fixture).lanes.map(lane=>lane.player.id);
    const assign=(lane:number,playerId:string)=>advance({type:'assign-challenge-matchup',attempt:1,stage:1,lane,playerId});
    assign(0,ordered[1]);
    assign(1,ordered[0]);
    assign(0,ordered[0]);
    expect(current.run.assignments).toEqual([ordered[0],ordered[1],null]);
    current=JSON.parse(JSON.stringify(current));
    const partialState={...newGym(0,gymSeed),gymLevel:3,challengeProjects:settings.projects,
      challengeReferralCounts:{...settings.referrals},challenge:current};
    expect(validChallenge(current,partialState)).toBe(true);
    expect(verifyChallengeHistory(partialState)).toBe(true);
    expect(current.run.assignments).toEqual([ordered[0],ordered[1],null]);
    assign(2,ordered[2]);
    expect(scoreChallenge(current.run,fixture,current.run.assignments).lanes.map(lane=>lane.player.id)).toEqual(ordered);
    expect(advance(play)).toBe(6);
    const state={...newGym(0,gymSeed),gymLevel:3,fame:6,challengeProjects:settings.projects,
      challengeReferralCounts:{...settings.referrals},challenge:current};
    expect(validChallenge(current,state)).toBe(true);
    expect(verifyChallengeHistory(state)).toBe(true);
    const altered=structuredClone(current);
    altered.record!.matchups![0]=(altered.record!.matchups![0]+1)%216;
    expect(verifyChallengeHistory({...state,challenge:altered})).toBe(false);
    const inflatedProjects={...current.run.settings!,projects:{...settings.projects,coaching:2}};
    expect(validChallenge({...current,run:{...current.run,settings:inflatedProjects}},state)).toBe(false);
    expect(current.run.assignments).toEqual([null,null,null]);
    expect(Object.values(current.run.boosts).reduce((sum,amount)=>sum+amount,0)).toBe(1);
    expect(validChallenge(current,state)).toBe(true);
    expect(verifyChallengeHistory({...state,challenge:current})).toBe(true);
  });

  it('settles a poorly assigned match as a loss even when the same roster could have won',()=>{
    const gymSeed=1,seed=challengeSeed(gymSeed,1);
    const started=advanceChallenge(undefined,{type:'start-challenge',attempt:0},gymSeed,3,[]);
    if ('error' in started) throw new Error(started.error);
    let current=started.challenge;
    const advance=(action:ChallengeAction)=>{
      const result=advanceChallenge(current,action,gymSeed,3,[]);
      if ('error' in result) throw new Error(result.error);
      current=result.challenge;
      return result.fame;
    };
    advance({type:'draft-challenge',attempt:1,players:challengeDraft(seed,[],0,version).slice(0,3)});
    const order=['dell-curry','birdman','jose-calderon'];
    order.forEach((playerId,lane)=>advance({type:'assign-challenge-matchup',attempt:1,stage:1,lane,playerId}));
    const fixture=challengeFixture(seed,1,version);
    expect(scoreChallenge(current.run,fixture).won).toBe(true);
    expect(scoreChallenge(current.run,fixture,order)).toMatchObject({home:15,away:21,won:false});
    expect(advance({type:'play-challenge',attempt:1,stage:1})).toBe(0);
    expect(current.run.phase).toBe('lost');
    expect(current.record).toBeNull();
    const state={...newGym(0,gymSeed),gymLevel:3,challenge:current};
    expect(validChallenge(current,state)).toBe(true);
    expect(verifyChallengeHistory(state)).toBe(true);
  });
});
