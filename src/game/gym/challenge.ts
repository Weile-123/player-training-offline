import {hash, random, type Stream} from '../contract/random';
import type {TemplateTier} from '../templates';
import {statKeys, type StatKey, type Stats} from '../types';
import {challengeCards, challengeEquipment, challengeEquipmentGroups, challengeMeans, challengeTemplateIds} from './challengeCatalog';
import {challengeLevelStatGain, challengeProjectLevel, challengeRecruitQualityBoostPerLevel, challengeScoutingOdds, type ChallengeProjectLevels} from './challengeProjects';

export const challengeUnlockLevel = 3;
export const challengeUnlockTemplates = 12;
export const challengeFamePerStage = 6;
export const challengeRulesVersion = 6 as const;
export const challengeBenchCap = 3;
export const challengeRosterCap = 6;
export type ChallengeRulesVersion = 2 | 3 | 4 | 5 | typeof challengeRulesVersion;
export const challengeRewardCategories = ['team','swap','gear','level'] as const;
export type ChallengeRewardCategory = typeof challengeRewardCategories[number];
export type ChallengeGear = {id: string; band: number};
export type ChallengePlayer = {id: string; level: number; gear: ChallengeGear[]};
export type ChallengeOffer = {kind:'level'} | {kind:'swap'; id:string} | {kind:'gear'; item:ChallengeGear} | {kind:'team'; key:StatKey};
export type ChallengeSettings = {projects: ChallengeProjectLevels; referrals: Readonly<Record<string,number>>};
export type ChallengeSquad = {team: ChallengePlayer[]; boosts: Stats; bench?: ChallengePlayer[]; warehouse?:ChallengeGear[]; settings?:ChallengeSettings; rulesVersion?:ChallengeRulesVersion};
// The recommendation or collection list is append-only. Its length at the draw fixes the
// offered cards even if more templates are recommended before selecting one.
export type ChallengeMove =
  | [poolSize:number, offer:number, target:number, replace:number]
  | [poolSize:number, category:number, offer:number, target:number, replace:number]
  | [poolSize:number, category:number, offer:number, target:number, replace:number, lineup:number];
export type ChallengeGearTransfer = [stage:number, afterRevival:0|1, player:number, itemIndex:number, equip:0|1];
export type ChallengeReplay = {
  rulesVersion?:ChallengeRulesVersion; attempt:number; startPoolSize:number; starters:string[]; moves:ChallengeMove[];
  settings?:ChallengeSettings; matchups?:number[];
  checkpoint?:number;
  draftRefreshed?:true;
  revival?:{stage:number; matchup:number; move?:ChallengeMove};
  gearMilestones?:Record<number,ChallengeMove>;
  warehouseEnabled?:true;
  gearTransfers?:ChallengeGearTransfer[];
};
export type ChallengeRun = ChallengeReplay & ChallengeSquad & {
  phase:'draft'|'ready'|'reward'|'lost'; offerPoolSize:number; rewardCategory?:ChallengeRewardCategory;
  assignments?:(string|null)[];
  retired?:true;
};
export type GymChallenge = {version:1; run:ChallengeRun; record:ChallengeReplay|null; collectionPool?:string[]; checkpointProofs?:ChallengeReplay[]};
type ChallengeGearAction = {attempt:number; stage:number; playerId:string; itemIndex:number; item:ChallengeGear};
export type ChallengeAction =
  | {type:'start-challenge'; attempt:number; checkpoint?:number}
  | {type:'refresh-challenge-draft'; attempt:number}
  | {type:'revive-challenge'; attempt:number; stage:number}
  | {type:'retire-challenge-run'; attempt:number; stage:number}
  | {type:'draft-challenge'; attempt:number; players:string[]}
  | {type:'assign-challenge-matchup'; attempt:number; stage:number; lane:number; playerId:string}
  | {type:'play-challenge'; attempt:number; stage:number}
  | {type:'choose-challenge-reward'; attempt:number; stage:number; category:ChallengeRewardCategory}
  | {type:'take-challenge-reward'; attempt:number; stage:number; offer:number; targetId?:string; replaceSlot?:number; toBench?:true; levelTargetIds?:[string,string]}
  | {type:'swap-challenge-lineup'; attempt:number; stage:number; starterId:string; reserveId:string}
  | (ChallengeGearAction&({type:'equip-challenge-gear'}|{type:'unequip-challenge-gear'}));

const gyms = ['滨江球馆','南桥球馆','红砖球馆','北岸球馆','灯塔球馆','西港球馆','长街球馆','青枫球馆','山城球馆','海风球馆','石桥球馆','老街球馆'];
const orders = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]] as const;
const anchors = [[1,30],[5,45],[10,61],[20,84],[40,118]] as const;
const templatesByTier = new Map<TemplateTier,string[]>();
for (const id of challengeTemplateIds) {
  const tier=challengeCards.get(id)!.tier;
  const group=templatesByTier.get(tier)??[];
  group.push(id);
  templatesByTier.set(tier,group);
}
const rotationTemplates = templatesByTier.get('rotation')!;
const rewardQuality = [
  {tier:'starter',opens:3,initial:12,growth:1,max:24},
  {tier:'star',opens:7,initial:6,growth:1,max:16},
  {tier:'superstar',opens:14,initial:3,growth:.5,max:9},
  {tier:'legend',opens:24,initial:1,growth:.25,max:5},
] as const;
const emptyBoosts = ():Stats => ({three:0,mid:0,drive:0,inside:0,handle:0,defense:0});
const emptyAssignments = ():[null,null,null] => [null,null,null];
const emptySettings:ChallengeSettings = {projects:{},referrals:{}};
export const challengeEntrant = (id:string,settings?:ChallengeSettings):ChallengePlayer => ({id,level:1+(settings?.referrals[id]??0),gear:[]});
export const challengeLevelGain = (settings?:ChallengeSettings) => challengeLevelStatGain+challengeProjectLevel(settings?.projects,'coaching');
export const challengeTeamFlatGain = (settings?:ChallengeSettings, rulesVersion?:ChallengeRulesVersion) =>
  (challengeUsesScheduledRewards(rulesVersion)?5:6)+challengeProjectLevel(settings?.projects,'training');
export const challengeReserveTarget = -2;
const lineupBase=3+challengeBenchCap;
export const challengeLineupLimit = lineupBase**lineupBase;
export const challengeUsesCollection = (rulesVersion?:ChallengeRulesVersion) => rulesVersion===3 || rulesVersion===4;
export const challengeUsesScheduledRewards = (rulesVersion?:ChallengeRulesVersion) => rulesVersion===6;
export const challengeUsesManualMatchups = (rulesVersion?:ChallengeRulesVersion) => rulesVersion===5 || challengeUsesScheduledRewards(rulesVersion);
export const challengeSupportsBench = (rulesVersion?:ChallengeRulesVersion) => rulesVersion===4 || rulesVersion===5;
export const challengeMatchupLimit = orders.length;
export const challengeScheduledMatchupLimit = challengeRosterCap**3;
type AssignedMatchups = readonly [string,string,string];
export function challengeMatchesAssigned(squad:{team:ChallengePlayer[]; assignments?:readonly (string|null)[]}):
  squad is typeof squad & {assignments:AssignedMatchups} {
  const {team,assignments}=squad;
  return assignments?.length===3 && new Set(assignments).size===3 &&
    assignments.every(id=>id!==null&&team.some(player=>player.id===id));
}
export function encodeChallengeMatchups(squad:{team:ChallengePlayer[]; assignments?:readonly (string|null)[]; rulesVersion?:ChallengeRulesVersion}) {
  const rulesVersion=squad.rulesVersion;
  if (!challengeMatchesAssigned(squad)) return -1;
  if (challengeUsesScheduledRewards(rulesVersion)) {
    return squad.assignments.reduce((encoded,id)=>encoded*challengeRosterCap+squad.team.findIndex(player=>player.id===id),0);
  }
  return orders.findIndex(order=>order.every((index,lane)=>squad.team[index].id===squad.assignments[lane]));
}
export function decodeChallengeMatchups(squad:ChallengeSquad, encoded:number):AssignedMatchups {
  const order=orders[encoded];
  return [squad.team[order[0]].id,squad.team[order[1]].id,squad.team[order[2]].id];
}
export function decodeScheduledMatchup(squad:ChallengeSquad, encoded:number):AssignedMatchups|null {
  const last=encoded%challengeRosterCap;
  const middle=Math.floor(encoded/challengeRosterCap)%challengeRosterCap;
  const first=Math.floor(encoded/challengeRosterCap**2);
  const ids=[squad.team[first]?.id,squad.team[middle]?.id,squad.team[last]?.id] as const;
  return ids[0]&&ids[1]&&ids[2]&&new Set(ids).size===3?[ids[0],ids[1],ids[2]]:null;
}
export function challengeRoster(squad:Pick<ChallengeSquad,'team'|'bench'>):ChallengePlayer[] {
  return [...squad.team,...(squad.bench??[])];
}
export const challengeStage = (run:ChallengeReplay) => run.moves.length + 1;
export const challengeBest = (state?: GymChallenge) => state?.record ? challengeStage(state.record) : 0;
export const challengeCheckpoint = (state?: GymChallenge) => Math.floor(challengeBest(state)/10)*10;
export function challengeScheduledReward(stage:number):ChallengeRewardCategory {
  if (stage%10===0) return 'level';
  if (stage%5===0) return 'gear';
  if (stage%3===0) return 'swap';
  return 'team';
}
export function challengeScheduledRewards(stage:number):ChallengeRewardCategory[] {
  const primary=challengeScheduledReward(stage);
  return primary==='level'?['gear','level']:[primary];
}
export function challengeNextMilestone(stage:number) {
  let next=stage+1;
  let category=challengeScheduledReward(next);
  while (category==='team') category=challengeScheduledReward(++next);
  return {stage:next,category,categories:challengeScheduledRewards(next)};
}
export const challengeSeed = (gymSeed:number, attempt:number) => hash(`gym-challenge-v1:${gymSeed}:${attempt}`);
function draws(seed:number, stage:number, channel:number):Stream {
  return {state:(seed ^ Math.imul(stage,0x9e3779b1) ^ Math.imul(channel,0x85ebca6b)) >>> 0};
}
function sample<T>(source:readonly T[], count:number, rng:Stream):T[] {
  const values = [...source];
  for (let i=0; i<count; i++) {
    const j = i + Math.floor(random(rng) * (values.length-i));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values.slice(0,count);
}
type TierOdds = [tier:TemplateTier,points:number];
function qualityDraw(odds:readonly TierOdds[], count:number, rng:Stream, excluded:readonly string[]=[]):string[] {
  const available=odds.map(([tier,weight])=>({weight,ids:templatesByTier.get(tier)!.filter(id=>!excluded.includes(id))}));
  const picked:string[]=[];
  for (let i=0;i<count;i++) {
    const total=available.reduce((sum,group)=>sum+(group.ids.length?group.weight:0),0);
    if (!total) break;
    let roll=random(rng)*total;
    for (const group of available) {
      if (!group.ids.length) continue;
      roll-=group.weight;
      if (roll>=0) continue;
      const index=Math.floor(random(rng)*group.ids.length);
      picked.push(group.ids.splice(index,1)[0]);
      break;
    }
  }
  return picked;
}
export function challengeRecruitOdds(stage:number,settings?:ChallengeSettings):TierOdds[] {
  const enabled=rewardQuality.filter(tier=>stage>=tier.opens);
  const extraPerTier=enabled.length?challengeProjectLevel(settings?.projects,'recruiting')*challengeRecruitQualityBoostPerLevel/enabled.length:0;
  const odds:TierOdds[]=enabled.map(({tier,opens,initial,growth,max})=>[
    tier,Math.min(max+challengeRecruitQualityBoostPerLevel,Math.min(max,initial+(stage-opens)*growth)+extraPerTier),
  ]);
  return [['rotation',100-odds.reduce((sum,[,weight])=>sum+weight,0)],...odds];
}
export function challengeDraft(seed:number, pool:readonly string[], count:number, rulesVersion?:ChallengeRulesVersion, settings?:ChallengeSettings, refreshed?:boolean):string[] {
  const rng=draws(seed,1,1);
  if (challengeUsesManualMatchups(rulesVersion)) {
    const {starter,star}=challengeScoutingOdds[challengeProjectLevel(settings?.projects,'scouting')];
    const odds:TierOdds[]=[['rotation',100-starter-star],['starter',starter],['star',star]];
    const candidates=starter?qualityDraw(odds,5,rng):sample(rotationTemplates,5,rng);
    if (challengeUsesScheduledRewards(rulesVersion)&&refreshed) {
      const fresh=draws(seed,1,8);
      return [sample(templatesByTier.get('superstar')!,1,fresh)[0],
        ...qualityDraw(odds,4,fresh,candidates)];
    }
    return candidates;
  }
  if (challengeUsesCollection(rulesVersion)) return sample(rotationTemplates,5,rng);
  const signed=pool.slice(0,count).sort();
  if (!rulesVersion) return sample(signed,5,rng);
  const reserves=signed.filter(id=>challengeCards.get(id)?.tier==='rotation');
  if (reserves.length>=5) return sample(reserves,5,rng);
  // Signing twelve distinct templates need not include five reserves. Fill only
  // the empty draft slots so such a gym can still play after meeting the gate.
  const guests=rotationTemplates.filter(id=>!reserves.includes(id));
  return sample([...reserves,...sample(guests,5-reserves.length,rng)],5,rng);
}
function stageBaseline(stage:number) {
  for (let i=1;i<anchors.length;i++) {
    const [end,high]=anchors[i], [start,low]=anchors[i-1];
    if (stage<=end) return Math.round(low+(high-low)*(stage-start)/(end-start));
  }
  return Math.round(118+2.2*(stage-40));
}
// Integer hundredths keep the 2% bonuses exact until the individual lane is scored.
const points = (hundredths:number) => Math.floor((hundredths+200)/400);
export function challengeFixture(seed:number, stage:number,rulesVersion?:ChallengeRulesVersion) {
  const rng=draws(seed,stage,2);
  const rivals=challengeUsesManualMatchups(rulesVersion)?qualityDraw(challengeRecruitOdds(stage),3,rng):sample(challengeTemplateIds,3,rng);
  const keys=sample(statKeys,3,rng);
  const baseline=stageBaseline(stage);
  const lanes=rivals.map((id,i)=>{
    const key=keys[i], base=challengeCards.get(id)!.stats[key];
    const offset=Math.max(-8,Math.min(8,Math.round(.38*(base-challengeMeans[key]))));
    const power=baseline+offset;
    return {id,key,power,points:points(power*100)};
  });
  return {stage,club:gyms[Math.floor(random(rng)*gyms.length)],lanes};
}
export type ChallengeFixture = ReturnType<typeof challengeFixture>;
export function gearBonus(item:ChallengeGear) {
  return challengeEquipment.get(item.id)!.key==='all' ? 6+item.band : 12+3*item.band;
}
export function challengePower(player:ChallengePlayer, key:StatKey, boosts:Stats, settings?:ChallengeSettings, rulesVersion?:ChallengeRulesVersion) {
  const base=challengeCards.get(player.id)!.stats[key];
  let flat=(player.level-1)*challengeLevelGain(settings)+boosts[key]*challengeTeamFlatGain(settings,rulesVersion)+challengeProjectLevel(settings?.projects,'conditioning');
  for (const item of player.gear) {
    const skill=challengeEquipment.get(item.id)!.key;
    if (skill==='all'||skill===key) flat+=gearBonus(item);
  }
  return (base+flat)*100+base*2*boosts[key];
}
export function scoreChallenge(squad:ChallengeSquad, fixture:ChallengeFixture,assignments?:readonly (string|null)[]) {
  const values=squad.team.map(player=>fixture.lanes.map(lane=>challengePower(player,lane.key,squad.boosts,squad.settings,squad.rulesVersion)));
  if (assignments&&!challengeMatchesAssigned({team:squad.team,assignments})) throw new Error('Invalid challenge matchups');
  const choices=assignments?[assignments.map(id=>squad.team.findIndex(player=>player.id===id))]:
    squad.team.length===3?orders:allChallengeOrders(squad.team.length);
  let best:readonly number[]=orders[0], home=-1, exact=-1;
  for (const order of choices) {
    const raw=order.map((player,i)=>values[player][i]);
    const total=raw.reduce((sum,value)=>sum+points(value),0);
    const sum=raw[0]+raw[1]+raw[2];
    if (total>home || total===home && sum>exact) {best=order;home=total;exact=sum;}
  }
  const lanes=fixture.lanes.map((rival,i)=>{
    const power=values[best[i]][i];
    return {rival,player:squad.team[best[i]],power:power/100,points:points(power)};
  });
  const away=lanes.reduce((sum,lane)=>sum+lane.rival.points,0);
  return {lanes,home,away,exact,won:home>=away};
}

function allChallengeOrders(count:number):number[][] {
  const result:number[][]=[];
  for(let i=0;i<count;i++) for(let j=0;j<count;j++) for(let k=0;k<count;k++) {
    if (i!==j&&i!==k&&j!==k) result.push([i,j,k]);
  }
  return result;
}
export function recommendedChallengeDraft(draft:readonly string[], fixture:ChallengeFixture):string[] {
  let best:string[]=[], points=-1, exact=-1;
  for(let i=0;i<draft.length-2;i++) for(let j=i+1;j<draft.length-1;j++) for(let k=j+1;k<draft.length;k++) {
    const ids=[draft[i],draft[j],draft[k]];
    const score=scoreChallenge({team:ids.map(id=>challengeEntrant(id)),boosts:emptyBoosts()},fixture);
    if (score.home>points || score.home===points && score.exact>exact) {best=ids;points=score.home;exact=score.exact;}
  }
  return best;
}

export function challengeOffers(seed:number, stage:number, team:ChallengePlayer[], pool:readonly string[], count:number):ChallengeOffer[] {
  const rng=draws(seed,stage,3);
  const outside=pool.slice(0,count).sort().filter(id=>!team.some(p=>p.id===id));
  const keys=challengeFixture(seed,stage+1).lanes.map(l=>l.key);
  return sample(['level','gear','team','swap'] as const,3,rng).map(kind=>{
    if (kind==='level') return {kind};
    if (kind==='team') return {kind,key:keys[Math.floor(random(rng)*3)]};
    if (kind==='gear') {
      const key=random(rng)<.25?'all':keys[Math.floor(random(rng)*3)];
      const group=challengeEquipmentGroups.get(key)!;
      return {kind,item:{id:group[Math.floor(random(rng)*group.length)].id,band:Math.floor((stage-1)/10)}};
    }
    const candidates=sample(outside,Math.min(3,outside.length),rng);
    const strength=(id:string)=>Math.max(...keys.map(key=>challengeCards.get(id)!.stats[key]));
    return {kind,id:candidates.reduce((best,id)=>strength(id)>strength(best)?id:best)};
  });
}

export function challengeRewardChoices(
  seed:number, stage:number, team:readonly ChallengePlayer[], pool:readonly string[], count:number, category:ChallengeRewardCategory,
  rulesVersion?:ChallengeRulesVersion,settings?:ChallengeSettings,guaranteedSuperstar=false,
):ChallengeOffer[] {
  const rng=draws(seed,stage,4+challengeRewardCategories.indexOf(category));
  switch (category) {
    case 'team':
      return sample(statKeys,3,rng).map(key=>({kind:'team',key}));
    case 'swap': {
      if (challengeUsesManualMatchups(rulesVersion)) {
        const excluded=team.map(player=>player.id),odds=challengeRecruitOdds(stage,settings);
        if (challengeUsesScheduledRewards(rulesVersion)&&guaranteedSuperstar) {
          const fresh=draws(seed,stage,9);
          const star=sample(templatesByTier.get('superstar')!.filter(id=>!excluded.includes(id)),1,fresh)[0];
          return [star,...qualityDraw(odds.filter(([tier])=>tier!=='superstar'),2,fresh,excluded)].map(id=>({kind:'swap',id}));
        }
        return qualityDraw(odds,3,rng,excluded).map(id=>({kind:'swap',id}));
      }
      const available=pool.slice(0,count).sort().filter(id=>!team.some(player=>player.id===id));
      return sample(available,3,rng).map(id=>({kind:'swap',id}));
    }
    case 'gear': {
      const band=Math.floor((stage-1)/10);
      return sample([...challengeEquipment.keys()],3,rng).map(id=>({kind:'gear',item:{id,band}}));
    }
    case 'level':
      return [{kind:'level'}];
  }
}

export function applyChallengeOffer(squad:ChallengeSquad, card:ChallengeOffer, target:number, slot:number):ChallengeSquad|null {
  const {team,boosts,bench,settings}=squad;
  const benefits=settings?{settings}:{};
  const reserved=bench ? {bench} : {};
  if (card.kind==='swap' && challengeRoster(squad).some(player=>player.id===card.id)) return null;
  if (target===challengeReserveTarget) {
    if (card.kind!=='swap'||slot!==-1||!bench||bench.length>=challengeBenchCap) return null;
    return {team,boosts,bench:[...bench,challengeEntrant(card.id,settings)],...benefits};
  }
  if (card.kind==='team') {
    if (target!==-1||slot!==-1) return null;
    return {team,boosts:{...boosts,[card.key]:boosts[card.key]+1},...reserved,...benefits};
  }
  const current=team[target];
  if (!current || !Number.isInteger(target)) return null;
  let player:ChallengePlayer;
  if (card.kind==='gear') {
    const gear=[...current.gear];
    if (gear.length===3) {
      if (!Number.isInteger(slot)||slot<0||slot>=3) return null;
      gear[slot]=card.item;
    } else {
      if (slot!==-1) return null;
      gear.push(card.item);
    }
    player={...current,gear};
  } else {
    if (slot!==-1) return null;
    if (card.kind==='level') player={...current,level:current.level+1};
    else {
      const inRunLevels=current.level-challengeEntrant(current.id,settings).level;
      player={id:card.id,level:challengeEntrant(card.id,settings).level+inRunLevels,gear:current.gear};
    }
  }
  return {team:team.map((p,i)=>i===target?player:p),boosts,...reserved,...benefits};
}

function orderedRoster(squad:ChallengeSquad) {
  return challengeRoster(squad).sort((a,b)=>a.id===b.id?0:a.id<b.id?-1:1);
}

// Save the final order, regardless of how many exchanges were made before a game.
function encodeChallengeLineup(squad:ChallengeSquad) {
  const ordered=orderedRoster(squad);
  return challengeRoster(squad).reduce((encoded,player)=>encoded*lineupBase+ordered.indexOf(player),0);
}

export function restoreChallengeLineup(squad:ChallengeSquad, encoded:number):ChallengeSquad|null {
  if (encoded===-1) return squad;
  if (!squad.bench?.length||!Number.isInteger(encoded)||encoded<0||encoded>=challengeLineupLimit) return null;
  const roster=orderedRoster(squad);
  const order=roster.map(()=>{
    const index=encoded%lineupBase;
    encoded=Math.floor(encoded/lineupBase);
    return index;
  }).reverse();
  if (encoded!==0||new Set(order).size!==roster.length||order.some(index=>index>=roster.length)) return null;
  const players=order.map(index=>roster[index]);
  return {...squad,team:players.slice(0,3),bench:players.slice(3)};
}

export function challengeAutomaticMove(seed:number,stage:number):ChallengeMove {
  return [challengeTemplateIds.length,0,Math.floor(random(draws(seed,stage,10))*statKeys.length),-1,-1,-1];
}

export function applyChallengeGearTransfer(squad:ChallengeSquad,transfer:ChallengeGearTransfer):ChallengeSquad|null {
  const [, ,target,itemIndex,equip]=transfer;
  const player=squad.team[target], warehouse=squad.warehouse??[];
  if (!player) return null;
  const source=equip?warehouse:player.gear;
  const item=source[itemIndex];
  if (!item||equip&&player.gear.length>=3) return null;
  const remaining=source.filter((_,index)=>index!==itemIndex);
  const gear=equip?[...player.gear,item]:remaining;
  return {...squad,team:squad.team.map((member,index)=>index===target?{...player,gear}:member),
    warehouse:equip?remaining:[...warehouse,item]};
}

/** The last index stores the second level recipient in scheduled runs. */
export function applyScheduledChallengeMove(squad:ChallengeSquad,seed:number,stage:number,move:ChallengeMove,revival=false):ChallengeSquad|null {
  if (move.length!==6||move[0]!==challengeTemplateIds.length) return null;
  const [,category,offer,target,slot,second]=move;
  const expected=challengeRewardCategories[category];
  if (revival?expected!=='swap':!challengeScheduledRewards(stage).includes(expected)) return null;
  if (expected==='team') {
    const automatic=challengeAutomaticMove(seed,stage);
    if (!move.every((value,index)=>value===automatic[index])) return null;
    const key=statKeys[offer];
    return {...squad,boosts:{...squad.boosts,[key]:squad.boosts[key]+1}};
  }
  if (expected==='level') {
    if (offer!==0||slot!==-1||target===second||!squad.team[target]||!squad.team[second]) return null;
    return {...squad,team:squad.team.map((player,index)=>index===target||index===second?{...player,level:player.level+1}:player)};
  }
  if (second!==-1) return null;
  if (expected==='swap'&&offer===-1) return target===-1&&slot===-1?squad:null;
  const card=challengeRewardChoices(seed,stage,squad.team,challengeTemplateIds,move[0],expected,6,squad.settings,revival)[offer];
  if (!card) return null;
  if (card.kind==='swap') {
    if (slot!==-1) return null;
    const recruited=challengeEntrant(card.id,squad.settings);
    if (squad.team.length<challengeRosterCap) return target===-1?{...squad,team:[...squad.team,recruited]}:null;
    const outgoing=squad.team[target];
    if (!outgoing) return null;
    return {...squad,team:squad.team.map((player,index)=>index===target?recruited:player),
      ...(squad.warehouse&&outgoing.gear.length?{warehouse:[...squad.warehouse,...outgoing.gear]}:{})};
  }
  const geared=applyChallengeOffer(squad,card,target,slot);
  if (!geared) return null;
  const displaced=squad.team[target]?.gear[slot];
  return {...squad,team:geared.team,...(squad.warehouse&&displaced?{warehouse:[...squad.warehouse,displaced]}:{})};
}

const scheduledReady = ({rewardCategory,...run}:ChallengeRun):ChallengeRun =>
  ({...run,phase:'ready',offerPoolSize:0,assignments:emptyAssignments()});

function scheduledCheckpoint(run:ChallengeRun,seed:number):ChallengeRun {
  if (!run.checkpoint||run.moves.length>=run.checkpoint) return run;
  const moves=[...run.moves],matchups=[...run.matchups!];
  let squad=run;
  for (let stage=moves.length+1;stage<=run.checkpoint;stage++) {
    matchups.push(-1);
    const category=challengeScheduledRewards(stage)[0];
    if (category!=='team') return {...squad,moves,matchups,phase:'reward',offerPoolSize:challengeTemplateIds.length,rewardCategory:category};
    const move=challengeAutomaticMove(seed,stage);
    const {boosts}=applyScheduledChallengeMove(squad,seed,stage,move)!;
    squad={...squad,boosts};
    moves.push(move);
  }
  return {...squad,moves,matchups};
}

function scheduledRecord(run:ChallengeRun):ChallengeReplay {
  const {rulesVersion,attempt,startPoolSize,starters,moves,matchups,settings,checkpoint,draftRefreshed,revival,gearMilestones,warehouseEnabled,gearTransfers}=run;
  return {rulesVersion,attempt,startPoolSize,starters,moves,matchups,settings,
    ...(checkpoint?{checkpoint}:{}),...(draftRefreshed?{draftRefreshed}:{}),...(revival?{revival}:{}),...(gearMilestones?{gearMilestones}:{}),
    ...(warehouseEnabled?{warehouseEnabled}:{}),...(gearTransfers?{gearTransfers}:{})};
}

function finishScheduledMatch(current:GymChallenge,run:ChallengeRun,seed:number,stage:number,matchup:number):ChallengeChange {
  const category=challengeScheduledRewards(stage)[0],matchups=[...run.matchups!,matchup];
  const newBest=stage>challengeBest(current);
  let record=current.record,checkpointProofs=current.checkpointProofs;
  if (newBest) {
    if (!run.checkpoint) checkpointProofs=undefined;
    else if (record&&record.attempt!==run.attempt) checkpointProofs=[...(checkpointProofs??[]),record];
    record=scheduledRecord({...run,matchups});
  }
  const next:GymChallenge={...current,record,run:{...run,matchups,phase:'reward',offerPoolSize:challengeTemplateIds.length,rewardCategory:category}};
  if (checkpointProofs?.length) next.checkpointProofs=checkpointProofs;
  else delete next.checkpointProofs;
  if (newBest&&!checkpointProofs?.some(proof=>challengeUsesCollection(proof.rulesVersion))) delete next.collectionPool;
  if (category==='team') {
    const move=challengeAutomaticMove(seed,stage),{boosts}=applyScheduledChallengeMove(run,seed,stage,move)!;
    next.run=scheduledReady({...next.run,boosts,moves:[...run.moves,move]});
  }
  return {challenge:next,fame:newBest?challengeFamePerStage:0};
}

type ChallengeChange = {challenge:GymChallenge; fame:number} | {error:string};
export function advanceChallenge(current:GymChallenge|undefined, action:ChallengeAction, gymSeed:number, gymLevel:number, pool:readonly string[],settings=emptySettings):ChallengeChange {
  const fail={error:'挑战进度已变化，请按当前阵容再试。'};
  const run=current?.run;
  if (action.type==='retire-challenge-run') {
    if (!current||!run||run.retired||action.attempt!==run.attempt||action.stage!==challengeStage(run)) return fail;
    // Retiring keeps the run's actual phase and replay data, including a win with an unclaimed reward.
    return {challenge:{...current,run:{...run,retired:true}},fame:0};
  }
  const rulesVersion=action.type==='start-challenge'?challengeRulesVersion:current?.run.rulesVersion;
  const manual=challengeUsesManualMatchups(rulesVersion);
  const scheduled=challengeUsesScheduledRewards(rulesVersion);
  if (manual) pool=challengeTemplateIds;
  if (manual && gymLevel<challengeUnlockLevel) return {error:'球馆达到 3 级后开放挑战。'};
  if (!manual && (gymLevel<challengeUnlockLevel || pool.length<challengeUnlockTemplates)) return {
    error:challengeUsesCollection(rulesVersion)?'球馆达到 3 级且图鉴解锁 12 种球员后开放挑战。':'球馆达到 3 级并推荐 12 种不同模板后解锁挑战。',
  };
  if (action.attempt!==(current?.run.attempt??0)) return fail;
  const collectionCheckpoint=challengeUsesCollection(rulesVersion)?{collectionPool:[...pool]}:{};
  if (action.type==='start-challenge') {
    if (run&&!run.retired&&run.phase!=='lost') return fail;
    const checkpoint=action.checkpoint;
    if (checkpoint!==undefined&&(!Number.isSafeInteger(checkpoint)||checkpoint<10||checkpoint!==challengeCheckpoint(current))) return fail;
    const next:ChallengeRun={
      rulesVersion:challengeRulesVersion,attempt:action.attempt+1,startPoolSize:pool.length,starters:[],moves:[],team:[],
      boosts:emptyBoosts(),phase:'draft',offerPoolSize:0,settings:{projects:{...settings.projects},referrals:{...settings.referrals}},
      matchups:[],assignments:emptyAssignments(),warehouseEnabled:true,warehouse:[],...(checkpoint?{checkpoint}:{}),
    };
    const record=current?.record??null;
    const legacyPool=current?.collectionPool&&(challengeUsesCollection(record?.rulesVersion)||current.checkpointProofs?.some(proof=>challengeUsesCollection(proof.rulesVersion)))
      ? {collectionPool:current.collectionPool}:{};
    return {challenge:{version:1,run:next,record,...legacyPool,...(current?.checkpointProofs?{checkpointProofs:current.checkpointProofs}:{})},fame:0};
  }
  if (!current||!run||run.retired) return fail;
  const seed=challengeSeed(gymSeed,run.attempt), stage=challengeStage(run);
  const update=(next:ChallengeRun):ChallengeChange=>({challenge:{...current,...collectionCheckpoint,run:next},fame:0});
  if (action.type==='refresh-challenge-draft') {
    return scheduled&&run.phase==='draft'&&!run.draftRefreshed?update({...run,draftRefreshed:true}):fail;
  }
  if (action.type==='draft-challenge') {
    const draft=challengeDraft(seed,pool,run.startPoolSize,run.rulesVersion,run.settings,run.draftRefreshed);
    if (run.phase!=='draft'||!Array.isArray(action.players)||action.players.length!==3||new Set(action.players).size!==3||action.players.some(id=>!draft.includes(id))) return fail;
    const next={...run,starters:[...action.players],team:action.players.map(id=>challengeEntrant(id,run.settings)),phase:'ready' as const};
    return update(scheduled?scheduledCheckpoint(next,seed):next);
  }
  if (stage!==action.stage) return fail;
  if (action.type==='equip-challenge-gear'||action.type==='unequip-challenge-gear') {
    if (!scheduled||run.phase!=='ready'||!Number.isSafeInteger(action.itemIndex)||action.itemIndex<0) return fail;
    const target=run.team.findIndex(player=>player.id===action.playerId);
    const equip=action.type==='equip-challenge-gear'?1:0;
    const gear=equip?run.warehouse:run.team[target]?.gear;
    const item=gear?.[action.itemIndex];
    if (target<0||!item||item.id!==action.item?.id||item.band!==action.item?.band) return fail;
    const afterRevival=run.revival?.stage===stage&&run.revival.move?1:0;
    const transfer:ChallengeGearTransfer=[stage,afterRevival,target,action.itemIndex,equip];
    const squad=applyChallengeGearTransfer(run,transfer);
    if (!squad) return {error:'该球员的装备已满，请先卸下一件。'};
    return update({...run,team:squad.team,warehouse:squad.warehouse,gearTransfers:[...(run.gearTransfers??[]),transfer]});
  }
  if (action.type==='revive-challenge') {
    if (!scheduled||run.phase!=='lost'||run.revival) return fail;
    return update({...run,phase:'reward',rewardCategory:'swap',offerPoolSize:challengeTemplateIds.length,
      matchups:run.matchups!.slice(0,-1),assignments:emptyAssignments(),revival:{stage,matchup:run.matchups!.at(-1)!}});
  }
  if (action.type==='assign-challenge-matchup') {
    const {lane,playerId}=action;
    if (!manual||run.phase!=='ready'||!Number.isInteger(lane)||lane<0||lane>=3||
        !run.team.some(player=>player.id===playerId)) return fail;
    const assignments=[...(run.assignments??emptyAssignments())];
    const previous=assignments.indexOf(playerId);
    if (previous>=0) assignments[previous]=assignments[lane];
    assignments[lane]=playerId;
    return update({...run,assignments});
  }
  if (action.type==='swap-challenge-lineup') {
    const lastMove=run.moves[run.moves.length-1];
    if (run.phase!=='ready'||!run.bench?.length||lastMove?.length!==6) return fail;
    const starter=run.team.findIndex(player=>player.id===action.starterId);
    const reserve=run.bench.findIndex(player=>player.id===action.reserveId);
    if (starter<0||reserve<0) return fail;
    const team=[...run.team], bench=[...run.bench];
    [team[starter],bench[reserve]]=[bench[reserve],team[starter]];
    const moves=[...run.moves];
    moves[moves.length-1]=[lastMove[0],lastMove[1],lastMove[2],lastMove[3],lastMove[4],encodeChallengeLineup({team,bench,boosts:run.boosts})];
    const assignments=manual?{assignments:run.assignments!.map(id=>id===action.starterId?null:id)}:{};
    return update({...run,team,bench,moves,...assignments});
  }
  if (action.type==='play-challenge') {
    if (run.phase!=='ready') return fail;
    const matchup=manual?encodeChallengeMatchups(run):undefined;
    if (matchup===-1) return {error:'请先为三个对手安排对位球员。'};
    const score=scoreChallenge(run,challengeFixture(seed,stage,run.rulesVersion),run.assignments);
    const matchups=matchup===undefined?{}:{matchups:[...run.matchups!,matchup]};
    if (!score.won) return update({...run,...matchups,phase:'lost'});
    if (scheduled) return finishScheduledMatch(current,run,seed,stage,matchup!);
    const first=stage>challengeBest(current);
    const record=first?{
      ...(run.rulesVersion?{rulesVersion:run.rulesVersion}:{}),attempt:run.attempt,startPoolSize:run.startPoolSize,
      starters:run.starters,moves:run.moves,...matchups,...(manual?{settings:run.settings}:{}),
    }:current.record;
    const next:GymChallenge={...current,...collectionCheckpoint,record,run:{...run,...matchups,phase:'reward',offerPoolSize:pool.length}};
    if (manual && first) delete next.collectionPool;
    return {challenge:next,fame:first?challengeFamePerStage:0};
  }
  if (action.type==='choose-challenge-reward') {
    if (scheduled||run.phase!=='reward'||!run.rulesVersion||run.rewardCategory||!challengeRewardCategories.includes(action.category)) return fail;
    return update({...run,rewardCategory:action.category});
  }
  if (run.phase!=='reward'||!Number.isInteger(action.offer)) return fail;
  if (scheduled) {
    const revival=run.revival?.stage===stage&&!run.revival.move;
    if (action.toBench!==undefined||(action.replaceSlot!==undefined&&run.rewardCategory!=='gear')) return fail;
    let target=action.targetId===undefined?-1:run.team.findIndex(player=>player.id===action.targetId),second=-1;
    if (action.targetId!==undefined&&target===-1) return fail;
    if (run.rewardCategory==='level') {
      if (action.targetId!==undefined||!Array.isArray(action.levelTargetIds)||action.levelTargetIds.length!==2) return fail;
      const targets=action.levelTargetIds.map(id=>run.team.findIndex(player=>player.id===id));
      if (targets.some(index=>index<0)) return fail;
      [target,second]=targets;
    } else if (action.levelTargetIds!==undefined) return fail;
    const move:ChallengeMove=[run.offerPoolSize,challengeRewardCategories.indexOf(run.rewardCategory!),action.offer,target,action.replaceSlot??-1,second];
    const gear=run.gearMilestones?.[stage];
    const base=gear?applyScheduledChallengeMove(run,seed,stage,gear):run;
    const squad=base&&applyScheduledChallengeMove(base,seed,stage,move,revival);
    if (!squad) return {error:'请选择有效的奖励和阵容球员。'};
    // On milestone rounds, finish both selections before applying them. The
    // battle report stays on the roster and equipment actually used to win.
    if (run.rewardCategory==='gear'&&challengeScheduledReward(stage)==='level') {
      return update({...run,gearMilestones:{...run.gearMilestones,[stage]:move},rewardCategory:'level'});
    }
    const ready=scheduledReady({...run,...squad});
    if (revival) return update({...ready,revival:{...run.revival!,move}});
    return update(scheduledCheckpoint({...ready,moves:[...run.moves,move]},seed));
  }
  if (action.levelTargetIds!==undefined) return fail;
  const {rewardCategory,...base}=run;
  if (run.rulesVersion && !rewardCategory) return fail;
  const advance=(squad:ChallengeSquad,move:ChallengeMove)=>update({
    ...base,...squad,moves:[...run.moves,move],phase:'ready',offerPoolSize:0,
    ...(manual?{assignments:emptyAssignments()}:{}),
  });
  const categoryIndex=rewardCategory?challengeRewardCategories.indexOf(rewardCategory):-1;
  const movement=(offer:number,target:number,slot:number):ChallengeMove=>{
    if (!rewardCategory) return [run.offerPoolSize,offer,target,slot];
    if (challengeSupportsBench(run.rulesVersion)) return [run.offerPoolSize,categoryIndex,offer,target,slot,-1];
    return [run.offerPoolSize,categoryIndex,offer,target,slot];
  };
  if (action.toBench!==undefined && (action.toBench!==true||rewardCategory!=='swap'||!challengeSupportsBench(run.rulesVersion)||action.targetId!==undefined||action.replaceSlot!==undefined||action.offer===-1)) return fail;
  if (rewardCategory==='swap' && action.offer===-1 && action.targetId===undefined && action.replaceSlot===undefined) {
    return advance({team:run.team,boosts:run.boosts},movement(-1,-1,-1));
  }
  const choices=rewardCategory?challengeRewardChoices(seed,stage,challengeRoster(run),pool,run.offerPoolSize,rewardCategory,run.rulesVersion,run.settings):
    challengeOffers(seed,stage,run.team,pool,run.offerPoolSize);
  const card=choices[action.offer];
  if (!card) return fail;
  const targetIndex=action.toBench?challengeReserveTarget:action.targetId===undefined?-1:run.team.findIndex(player=>player.id===action.targetId);
  if (action.targetId!==undefined && targetIndex===-1) return fail;
  const slot=action.replaceSlot??-1;
  const squad=applyChallengeOffer(run,card,targetIndex,slot);
  if (!squad) return {error:action.toBench?'备战席已满，请更换首发或放弃奖励。':'请选择球员，器械位满时请选择要替换的器械。'};
  return advance(squad,movement(action.offer,targetIndex,slot));
}
