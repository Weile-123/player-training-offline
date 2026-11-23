import {statKeys} from '../types';
import {
  applyChallengeGearTransfer, applyChallengeOffer, applyScheduledChallengeMove, challengeBenchCap, challengeDraft, challengeEntrant, challengeFamePerStage, challengeFixture,
  challengeLineupLimit, challengeMatchupLimit, challengeOffers, challengeReserveTarget, challengeRewardCategories, challengeRewardChoices,
  challengeRoster, challengeRosterCap, challengeScheduledMatchupLimit, challengeScheduledReward, challengeScheduledRewards, challengeSeed, challengeStage, challengeSupportsBench, challengeUnlockTemplates, challengeUsesCollection,
  challengeUsesManualMatchups, challengeUsesScheduledRewards, decodeChallengeMatchups, decodeScheduledMatchup, encodeChallengeMatchups, restoreChallengeLineup, scoreChallenge,
  type ChallengeGear, type ChallengePlayer, type ChallengeReplay, type ChallengeRewardCategory, type ChallengeRulesVersion, type ChallengeSettings, type ChallengeSquad, type GymChallenge,
} from './challenge';
import {challengeCards,challengeEquipment,challengeTemplateIds} from './challengeCatalog';
import {challengeProjectLevel,validChallengeProjectLevels} from './challengeProjects';
import type {GymState} from './engine';

const whole = (n:unknown, min:number, max=Number.MAX_SAFE_INTEGER):n is number =>
  typeof n==='number' && Number.isSafeInteger(n) && n>=min && n<=max;
const has = (value:object,key:string) => Object.prototype.hasOwnProperty.call(value,key);
const fields = (value:unknown, required:readonly string[], optional:readonly string[]=[]):value is Record<string,unknown> =>
  !!value && typeof value==='object' && !Array.isArray(value) && required.every(key=>has(value,key)) &&
  Object.keys(value).every(key=>required.includes(key)||optional.includes(key));
const replayKeys=['attempt','startPoolSize','starters','moves'];
const scheduledReplayKeys=['checkpoint','draftRefreshed','revival','gearMilestones','warehouseEnabled','gearTransfers'];
const optionalReplayKeys=['rulesVersion','settings','matchups',...scheduledReplayKeys];
const rulesVersionOf = (value:unknown):ChallengeRulesVersion|undefined => value===2||value===3||value===4||value===5||value===6?value:undefined;
function validCollectionPool(value:unknown, collection:GymState['collection']):value is string[] {
  return Array.isArray(value) && value.length<=Object.keys(collection).length &&
    new Set(value).size===value.length && value.every(id=>typeof id==='string'&&has(collection,id));
}
function validSettings(value:unknown,state:GymState):value is ChallengeSettings {
  if (!fields(value,['projects','referrals'])||!validChallengeProjectLevels(value.projects)||
      !value.referrals||typeof value.referrals!=='object'||Array.isArray(value.referrals)) return false;
  const projects=value.projects;
  if (Object.entries(projects).some(([id,level])=>level!>challengeProjectLevel(state.challengeProjects,id as keyof typeof projects))) return false;
  return Object.entries(value.referrals).every(([id,count])=>
    challengeCards.has(id)&&whole(count,1,state.challengeReferralCounts?.[id]??0));
}

function validScheduledMove(value:unknown,expected:ChallengeRewardCategory) {
  if (!Array.isArray(value)||value.length!==6) return false;
  const [size,category,offer,target,slot,second]=value;
  if (size!==challengeTemplateIds.length||category!==challengeRewardCategories.indexOf(expected)) return false;
  if (expected==='team') return whole(offer,0,statKeys.length-1)&&target===-1&&slot===-1&&second===-1;
  if (expected==='level') return offer===0&&whole(target,0,challengeRosterCap-1)&&whole(second,0,challengeRosterCap-1)&&target!==second&&slot===-1;
  if (second!==-1) return false;
  return expected==='gear'?whole(offer,0,2)&&whole(target,0,challengeRosterCap-1)&&whole(slot,-1,2):
    slot===-1&&(offer===-1?target===-1:whole(offer,0,2)&&whole(target,-1,challengeRosterCap-1));
}

function validGearTransfers(value: unknown, firstStage:number, lastStage:number, revivedStage:unknown) {
  if (!Array.isArray(value)||!value.length) return false;
  let previousStage=firstStage, previousRevival=0;
  for (const transfer of value) {
    if (!Array.isArray(transfer)||transfer.length!==5) return false;
    const [stage,afterRevival,target,itemIndex,equip]=transfer;
    if (!whole(stage,previousStage,lastStage)||!whole(afterRevival,0,1)||
        afterRevival===1&&stage!==revivedStage||stage===previousStage&&afterRevival<previousRevival||
        !whole(target,0,challengeRosterCap-1)||!whole(equip,0,1)||
        !whole(itemIndex,0,equip?Math.floor((stage-1)/5)-1:2)) return false;
    previousStage=stage;
    previousRevival=afterRevival;
  }
  return true;
}

function validTrace(value:Record<string,unknown>, pool:readonly string[], state:GymState, draft:boolean, finalMatch:boolean,pendingMilestone=false) {
  const rulesVersion=rulesVersionOf(value.rulesVersion);
  if (!whole(value.attempt,1) || !whole(value.startPoolSize,challengeUnlockTemplates,pool.length) ||
      !Array.isArray(value.moves) || !Array.isArray(value.starters)) return false;
  if (has(value,'rulesVersion') && !rulesVersion) return false;
  let settings:ChallengeSettings|undefined;
  const manual=challengeUsesManualMatchups(rulesVersion);
  const scheduled=challengeUsesScheduledRewards(rulesVersion);
  let checkpoint=0;
  if (scheduled) {
    if (has(value,'warehouseEnabled')&&value.warehouseEnabled!==true) return false;
    if (has(value,'checkpoint')) {
      if (!whole(value.checkpoint,10)||value.checkpoint%10!==0) return false;
      checkpoint=value.checkpoint;
    }
    if (has(value,'draftRefreshed')&&value.draftRefreshed!==true) return false;
    const gearCount=Math.floor(value.moves.length/10)+Number(pendingMilestone);
    if (gearCount) {
      const gear=value.gearMilestones;
      if (!gear||typeof gear!=='object'||Array.isArray(gear)||Object.keys(gear).length!==gearCount||
          !Object.entries(gear).every(([key,move])=>/^[1-9]\d*$/.test(key)&&whole(Number(key),10,gearCount*10)&&
            Number(key)%10===0&&validScheduledMove(move,'gear'))) return false;
    } else if (has(value,'gearMilestones')) return false;
    let revivedStage:unknown;
    if (has(value,'revival')) {
      const revival=value.revival;
      if (draft||!fields(revival,['stage','matchup'],['move'])||!whole(revival.stage,checkpoint+1,value.moves.length+1)||
          !whole(revival.matchup,0,challengeScheduledMatchupLimit-1)||
          (has(revival,'move')?!validScheduledMove(revival.move,'swap'):finalMatch||revival.stage!==value.moves.length+1)) return false;
      if (has(revival,'move')) revivedStage=revival.stage;
    }
    if (has(value,'gearTransfers')&&(draft||!validGearTransfers(value.gearTransfers,Math.max(6,checkpoint+1),value.moves.length+1,revivedStage))) return false;
  } else if (scheduledReplayKeys.some(key=>has(value,key))) return false;
  if (manual) {
    if (!validSettings(value.settings,state)||value.startPoolSize!==challengeTemplateIds.length||
        !Array.isArray(value.matchups)||value.matchups.length!==value.moves.length+Number(finalMatch)||
        !value.matchups.every((encoded,index)=>index<checkpoint?encoded===-1:whole(encoded,0,(scheduled?challengeScheduledMatchupLimit:challengeMatchupLimit)-1))) return false;
    settings=value.settings;
  } else if (has(value,'settings')||has(value,'matchups')) return false;
  if (draft) return value.starters.length===0 && value.moves.length===0;
  const offered=challengeDraft(challengeSeed(state.seed,value.attempt),pool,value.startPoolSize,rulesVersion,settings,value.draftRefreshed===true);
  if (value.starters.length!==3 || new Set(value.starters).size!==3 || !value.starters.every(id=>offered.includes(id))) return false;
  if (scheduled) return value.moves.every((move,index)=>validScheduledMove(move,challengeScheduledReward(index+1)));
  let size=value.startPoolSize;
  for (const move of value.moves) {
    if (!Array.isArray(move)||!whole(move[0],size,pool.length)) return false;
    if (rulesVersion) {
      const [,category,offer,target,slot,lineup]=move;
      const reserves=challengeSupportsBench(rulesVersion);
      if (move.length!==(reserves?6:5)||!whole(category,0,challengeRewardCategories.length-1)||
        !whole(target,reserves?challengeReserveTarget:-1,2)||!whole(slot,-1,2)||
        reserves&&!whole(lineup,-1,challengeLineupLimit-1)) return false;
      const kind=challengeRewardCategories[category];
      if (target===challengeReserveTarget && (kind!=='swap'||slot!==-1)) return false;
      if (offer===-1 ? kind!=='swap'||target!==-1||slot!==-1 : !whole(offer,0,kind==='level'?0:2)) return false;
    } else if (move.length!==4||!whole(move[1],0,2)||!whole(move[2],-1,2)||!whole(move[3],-1,2)) return false;
    size=move[0];
  }
  return true;
}

/** Cheap structural checks on ordinary save writes. Verify the actual games on import. */
export function validChallenge(value:unknown, state:GymState):value is GymChallenge {
  if (!fields(value,['version','run','record'],['collectionPool','checkpointProofs'])||value.version!==1) return false;
  const r=value.run;
  if (!fields(r,[...replayKeys,'phase','offerPoolSize','team','boosts'],[...optionalReplayKeys,'rewardCategory','bench','warehouse','assignments','retired']) ||
      typeof r.phase!=='string' || !['draft','ready','reward','lost'].includes(r.phase)) return false;
  const rulesVersion=rulesVersionOf(r.rulesVersion), signedPool=state.postgameRecommendedTemplates??[];
  const record=value.record;
  if (record!==null && !fields(record,replayKeys,optionalReplayKeys)) return false;
  const recordVersion=record===null?undefined:rulesVersionOf(record.rulesVersion);
  const manual=challengeUsesManualMatchups(rulesVersion);
  const scheduled=challengeUsesScheduledRewards(rulesVersion);
  const proofs=value.checkpointProofs;
  if (has(value,'checkpointProofs')&&(!scheduled||!record||!Array.isArray(proofs)||!proofs.length||
      !proofs.every(proof=>fields(proof,replayKeys,optionalReplayKeys)))) return false;
  const recordChain=[...(Array.isArray(proofs)?proofs:[]),...(record?[record]:[])] as Record<string, unknown>[];
  const traceVersions=[rulesVersion,...recordChain.map(trace=>rulesVersionOf(trace.rulesVersion))];
  const requiresSignedPool=(version?:ChallengeRulesVersion)=>!challengeUsesManualMatchups(version)&&!challengeUsesCollection(version);
  if (traceVersions.some(requiresSignedPool)&&state.recommendationRulesVersion!==11) return false;
  let collectionPool:readonly string[]=[];
  if (traceVersions.some(challengeUsesCollection)) {
    if (!validCollectionPool(value.collectionPool,state.collection)) return false;
    collectionPool=value.collectionPool;
  } else if (has(value,'collectionPool')) return false;
  const poolFor=(version?:ChallengeRulesVersion)=>challengeUsesManualMatchups(version)?challengeTemplateIds:challengeUsesCollection(version)?collectionPool:signedPool;
  const pool=poolFor(rulesVersion);
  const pendingRevival=scheduled&&fields(r.revival,['stage','matchup'],['move'])&&!has(r.revival,'move');
  const pendingMilestone=scheduled&&r.phase==='reward'&&r.rewardCategory==='level'&&Array.isArray(r.moves)&&
    challengeScheduledReward(r.moves.length+1)==='level';
  const finalMatch=r.phase==='reward'&&!pendingRevival||r.phase==='lost';
  if (!validTrace(r,pool,state,r.phase==='draft',finalMatch,pendingMilestone) || !Array.isArray(r.moves) || !Array.isArray(r.team) || !Array.isArray(r.starters) ||
      !fields(r.boosts,statKeys) || (r.phase==='draft'?r.team.length!==0:r.team.length<3||r.team.length>(scheduled?challengeRosterCap:3))) return false;
  const supportsBench=challengeSupportsBench(rulesVersion);
  const bench=supportsBench?r.bench:[];
  if (!Array.isArray(bench)||bench.length>Math.min(challengeBenchCap,r.moves.length)||
      !supportsBench&&has(r,'bench')) return false;
  if (has(r,'rewardCategory') && (!rulesVersion || r.phase!=='reward' ||
      !challengeRewardCategories.some(category=>category===r.rewardCategory))) return false;
  const stage=r.moves.length+1;
  const checkpoint=scheduled?Number(r.checkpoint??0):0;
  if (has(r,'retired')&&r.retired!==true) return false;
  if (pendingRevival&&r.phase!=='reward') return false;
  if (scheduled&&r.phase==='reward') {
    const expected=pendingRevival?'swap':pendingMilestone?'level':challengeScheduledRewards(stage)[0];
    if (expected==='team'||r.rewardCategory!==expected) return false;
  }
  if (scheduled&&stage<=checkpoint&&(r.phase==='ready'||r.phase==='lost')) return false;
  const usedSize=r.moves[r.moves.length-1]?.[0]??r.startPoolSize;
  if (r.phase==='reward'?!whole(r.offerPoolSize,usedSize,pool.length):r.offerPoolSize!==0) return false;
  const warehouse=r.warehouse;
  const validGear=(item:unknown)=>fields(item,['id','band'])&&typeof item.id==='string'&&challengeEquipment.has(item.id)&&
    whole(item.band,0,Math.floor((stage-2)/10));
  if (r.warehouseEnabled===true||has(r,'gearTransfers')) {
    if (!Array.isArray(warehouse)||warehouse.length>Math.floor((stage-1)/5)||!warehouse.every(validGear)) return false;
  } else if (has(r,'warehouse')) return false;
  let upgrades=Array.isArray(warehouse)?warehouse.length:0;
  const ids=new Set<string>();
  const team=r.team;
  const settings=manual?r.settings as ChallengeSettings:undefined;
  for (const p of [...team,...bench]) {
    if (!fields(p,['id','level','gear'])||typeof p.id!=='string'||
        !(pool.includes(p.id)||rulesVersion&&r.starters.includes(p.id))||ids.has(p.id)||
        !Array.isArray(p.gear)||p.gear.length>3) return false;
    const baseLevel=challengeEntrant(p.id,settings).level;
    if (!whole(p.level,baseLevel,baseLevel+stage-1)) return false;
    ids.add(p.id);
    upgrades+=p.level-baseLevel+p.gear.length;
    if (!p.gear.every(validGear)) return false;
  }
  if (manual) {
    const assignments=r.assignments, matchups=r.matchups as number[];
    if (!Array.isArray(assignments)||assignments.length!==3) return false;
    const assigned=assignments.filter(id=>id!==null);
    if (assigned.some(id=>typeof id!=='string'||!team.some(p=>p.id===id))||new Set(assigned).size!==assigned.length) return false;
    if (finalMatch&&stage>checkpoint&&encodeChallengeMatchups({team,assignments,rulesVersion})!==matchups[stage-1]) return false;
    if ((r.phase==='draft'||pendingRevival||stage<=checkpoint)&&assigned.length!==0) return false;
  } else if (has(r,'assignments')) return false;
  for (const key of statKeys) {
    const layers=r.boosts[key];
    if (!whole(layers,0,stage-1)) return false;
    upgrades+=layers;
  }
  if (upgrades>stage-1+(scheduled?2*Math.floor((stage-1)/10):0)) return false;
  const cleared=r.phase==='reward'&&!pendingRevival?stage:stage-1;
  if (record===null) return cleared===0&&checkpoint===0;
  let best=0, previousAttempt=0, previousBest=0;
  for (const trace of recordChain) {
    if (!validTrace(trace,poolFor(rulesVersionOf(trace.rulesVersion)),state,false,true)||!Array.isArray(trace.moves)||
        !whole(trace.attempt,previousAttempt+1,r.attempt as number)) return false;
    previousBest=best;
    best=trace.moves.length+1;
    previousAttempt=trace.attempt;
    if (best<=previousBest||(trace.checkpoint??0)!==Math.floor(previousBest/10)*10||best<=Number(trace.checkpoint??0)) return false;
  }
  if (checkpoint!==0&&checkpoint!==Math.floor((record.attempt===r.attempt?previousBest:best)/10)*10) return false;
  return best>=cleared && (recordVersion??1)<=(rulesVersion??1) &&
    (record.attempt!==r.attempt||best===cleared&&recordVersion===rulesVersion) &&
    best*challengeFamePerStage<=state.fame;
}

function scoreRecordedMatch(trace:ChallengeReplay, squad:ChallengeSquad, seed:number, stage:number, encoded=trace.matchups?.[stage-1]) {
  const assignments=encoded===undefined?undefined:challengeUsesScheduledRewards(trace.rulesVersion)
    ?decodeScheduledMatchup(squad,encoded):decodeChallengeMatchups(squad,encoded);
  if (assignments===null) return null;
  return scoreChallenge(squad,challengeFixture(seed,stage,trace.rulesVersion),assignments);
}
function replay(trace:ChallengeReplay, gymSeed:number, pool:readonly string[]):ChallengeSquad|null {
  const seed=challengeSeed(gymSeed,trace.attempt);
  let squad:ChallengeSquad={
    team:trace.starters.map(id=>challengeEntrant(id,trace.settings)),
    boosts:{three:0,mid:0,drive:0,inside:0,handle:0,defense:0},
    ...(challengeSupportsBench(trace.rulesVersion)?{bench:[]}:{}),
    ...(trace.warehouseEnabled?{warehouse:[]}:{}),
    ...(trace.settings?{settings:trace.settings}:{}),rulesVersion:trace.rulesVersion,
  };
  if (challengeUsesScheduledRewards(trace.rulesVersion)) return replayScheduled(trace,seed,squad);
  for (const [index,move] of trace.moves.entries()) {
    const stage=index+1;
    if (!scoreRecordedMatch(trace,squad,seed,stage)?.won) return null;
    if (move.length!==4) {
      const [size,category,offer,target,slot]=move;
      let afterReward:ChallengeSquad|null=squad;
      if (offer!==-1) {
        const card=challengeRewardChoices(seed,stage,challengeRoster(squad),pool,size,challengeRewardCategories[category],trace.rulesVersion,trace.settings)[offer];
        afterReward=card?applyChallengeOffer(squad,card,target,slot):null;
      }
      if (!afterReward) return null;
      const lineup=restoreChallengeLineup(afterReward,move.length===6?move[5]:-1);
      if (!lineup) return null;
      squad=lineup;
    } else {
      const [size,offer,target,slot]=move;
      const card=challengeOffers(seed,stage,squad.team,pool,size)[offer];
      const next=card?applyChallengeOffer(squad,card,target,slot):null;
      if (!next) return null;
      squad=next;
    }
  }
  return squad;
}

function replayScheduled(trace:ChallengeReplay,seed:number,original:ChallengeSquad):ChallengeSquad|null {
  let squad=original;
  const nextStage=challengeStage(trace);
  const transfers=trace.gearTransfers??[];
  let transferIndex=0;
  for(let stage=1;stage<=nextStage;stage++) {
    while (transfers[transferIndex]?.[0]===stage&&transfers[transferIndex][1]===0) {
      const moved=applyChallengeGearTransfer(squad,transfers[transferIndex++]);
      if (!moved) return null;
      squad=moved;
    }
    if (trace.revival?.stage===stage) {
      const loss=scoreRecordedMatch(trace,squad,seed,stage,trace.revival.matchup);
      if (!loss||loss.won) return null;
      if (trace.revival.move) {
        const restored=applyScheduledChallengeMove(squad,seed,stage,trace.revival.move,true);
        if (!restored) return null;
        squad=restored;
      }
    }
    while (transfers[transferIndex]?.[0]===stage&&transfers[transferIndex][1]===1) {
      const moved=applyChallengeGearTransfer(squad,transfers[transferIndex++]);
      if (!moved) return null;
      squad=moved;
    }
    if (stage<nextStage&&stage>(trace.checkpoint??0)&&!scoreRecordedMatch(trace,squad,seed,stage)?.won) return null;
    const gear=trace.gearMilestones?.[stage];
    const geared=gear?applyScheduledChallengeMove(squad,seed,stage,gear):squad;
    if (!geared) return null;
    if (stage===nextStage) break;
    const after=applyScheduledChallengeMove(geared,seed,stage,trace.moves[stage-1]);
    if (!after) return null;
    squad=after;
  }
  return transferIndex===transfers.length?squad:null;
}

export function verifyChallengeHistory(state:GymState):boolean {
  const {challenge:value,seed:gymSeed}=state;
  if (!value) return true;
  const {record,run}=value;
  const signedPool=state.postgameRecommendedTemplates??[];
  const usesSignedPool=(trace:ChallengeReplay)=>!challengeUsesManualMatchups(trace.rulesVersion)&&!challengeUsesCollection(trace.rulesVersion);
  const records=[...(value.checkpointProofs??[]),...(record?[record]:[])];
  if (usesSignedPool(run)||records.some(usesSignedPool)) {
    const signed=new Set(state.alumni.map(player=>player.templateId));
    if (!signedPool.every(id=>signed.has(id))) return false;
  }
  // Use the saved ordered pool. A new gallery unlock will join it on the next
  // successful challenge action and must not change candidates already drawn.
  const poolFor=(trace:ChallengeReplay)=>challengeUsesManualMatchups(trace.rulesVersion)?challengeTemplateIds:
    challengeUsesCollection(trace.rulesVersion)?value.collectionPool!:signedPool;
  for (const trace of records) {
    const squad=replay(trace,gymSeed,poolFor(trace));
    if (!squad||!scoreRecordedMatch(trace,squad,challengeSeed(gymSeed,trace.attempt),challengeStage(trace))?.won) return false;
  }
  if (record&&record.attempt===run.attempt&&(record.startPoolSize!==run.startPoolSize||
      !record.starters.every((id,i)=>id===run.starters[i])||
      !record.moves.every((move,i)=>move.every((n,j)=>n===run.moves[i]?.[j]))||
      record.matchups?.some((index,i)=>index!==run.matchups?.[i])||
      record.checkpoint!==run.checkpoint||record.draftRefreshed!==run.draftRefreshed||!sameGearHistory(record,run)||
      Object.entries(record.gearMilestones??{}).some(([stage,move])=>move.some((n,i)=>n!==run.gearMilestones?.[Number(stage)]?.[i]))||
      !sameRevival(record,run)||!sameSettings(record.settings,run.settings))) return false;
  if (run.phase==='draft') return true;
  const rebuilt=replay(run,gymSeed,poolFor(run));
  const sameGear=(actual:ChallengeGear[],expected:ChallengeGear[])=>actual.length===expected.length&&
    actual.every((item,i)=>item.id===expected[i].id&&item.band===expected[i].band);
  const samePlayers=(actual:ChallengePlayer[],expected:ChallengePlayer[])=>actual.length===expected.length&&
    actual.every((player,i)=>{
      const saved=expected[i];
      return player.id===saved.id&&player.level===saved.level&&sameGear(player.gear,saved.gear);
    });
  if (!rebuilt||!statKeys.every(key=>rebuilt.boosts[key]===run.boosts[key])||
      !samePlayers(rebuilt.team,run.team)||!samePlayers(rebuilt.bench??[],run.bench??[])||
      !sameGear(rebuilt.warehouse??[],run.warehouse??[])) return false;
  const stage=challengeStage(run);
  if (run.phase==='ready'||run.phase==='reward'&&(stage<=(run.checkpoint??0)||run.revival?.stage===stage&&!run.revival.move)) return true;
  return scoreRecordedMatch(run,rebuilt,challengeSeed(gymSeed,run.attempt),stage)?.won===(run.phase==='reward');
}

function sameGearHistory(record:ChallengeReplay,run:ChallengeReplay) {
  const stage=challengeStage(record), saved=record.gearTransfers??[];
  const played=(run.gearTransfers??[]).filter(transfer=>transfer[0]<=stage);
  return record.warehouseEnabled===run.warehouseEnabled&&saved.length===played.length&&
    saved.every((transfer,i)=>transfer.every((value,j)=>value===played[i][j]));
}

function sameRevival(record:ChallengeReplay,run:ChallengeReplay) {
  if (!run.revival||run.revival.stage>challengeStage(record)) return record.revival===undefined;
  return record.revival?.stage===run.revival.stage&&record.revival.matchup===run.revival.matchup&&
    record.revival.move?.every((value,index)=>value===run.revival!.move?.[index])===true;
}

function sameSettings(a?:ChallengeSettings,b?:ChallengeSettings) {
  if (!a||!b) return a===b;
  const sameCounts=(a:Readonly<Record<string,number>>,b:Readonly<Record<string,number>>)=>
    Object.keys(a).length===Object.keys(b).length&&Object.entries(a).every(([key,count])=>b[key]===count);
  return sameCounts(a.projects,b.projects)&&sameCounts(a.referrals,b.referrals);
}
