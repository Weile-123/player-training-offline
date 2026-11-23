import {advanceGym,dispatchGym,newGym,recommendedTemplateIds,trainPlayer,type GymAction,type GymState} from '../../src/game/gym/engine';
import {challengeFixture,challengeSeed,challengeStage,challengeUsesManualMatchups,scoreChallenge} from '../../src/game/gym/challenge';

export function challengeMatchupActions(state:GymState):Extract<GymAction,{type:'assign-challenge-matchup'}>[] {
  const run=state.challenge!.run;
  if (!challengeUsesManualMatchups(run.rulesVersion)) return [];
  const stage=challengeStage(run),fixture=challengeFixture(challengeSeed(state.seed,run.attempt),stage,run.rulesVersion);
  return scoreChallenge(run,fixture).lanes.map(({player},lane)=>({type:'assign-challenge-matchup',attempt:run.attempt,stage,lane,playerId:player.id}));
}

/** A draft already begun under V5, so its old categories and bench can be tested after upgrading. */
export function legacyV5ChallengeGym(state:GymState):GymState {
  const result=dispatchGym(state,state.revision,{type:'start-challenge',attempt:0},state.updatedAt);
  if(result.error)throw Error(result.error);
  const started=result.state,run=started.challenge!.run;
  return {...started,challenge:{version:1,record:null,run:{
    rulesVersion:5,attempt:run.attempt,startPoolSize:run.startPoolSize,starters:[],moves:[],team:[],bench:[],
    boosts:run.boosts,phase:'draft',offerPoolSize:0,settings:run.settings,matchups:[],assignments:[null,null,null],
  }}};
}

/** Build a qualifying save entirely through recruit, train, recommend and upgrade. */
export function qualifiedChallengeGym():GymState {
  let time=1_790_000_000_000,state=newGym(time,18201);
  const roles=['guard','forward','center','any'] as const, plans=['balanced','shooting','finishing','interior'] as const;
  const targets=[8,15,24,12,21,30,10,26];
  function act(action:GymAction) {
    const result=dispatchGym(state,state.revision,action,time);
    if(result.error)throw Error(result.error);
    state=result.state;
  }
  for(let i=0;i<100;i++) {
    if(!state.player)act({type:'recruit',preference:roles[i%roles.length]});
    const plan=plans[(Math.floor(i/4)+i)%plans.length];
    if(plan!=='balanced')act({type:'set-training-plan',id:plan,playerId:state.player!.id});
    while(state.player!.level<targets[i%targets.length]||!state.player!.templateId) {
      time+=30_000;state=advanceGym(state,time);
      trainPlayer(state,state.player!,time,[],state.player!.shots>0);
    }
    act({type:'recommend',id:state.player!.id});
    const upgrade=dispatchGym(state,state.revision,{type:'upgrade-gym',targetLevel:state.gymLevel+1},time);
    if(!upgrade.error)state=upgrade.state;
    if(state.gymLevel>=3&&recommendedTemplateIds(state).length===12)return state;
  }
  throw Error('Challenge test gym did not sign twelve distinct templates');
}
