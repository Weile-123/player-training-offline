import {cloneData} from '../utils/cloneData';
import {newContract,dispatch,playerValue,type Contract,type Action,type Athlete} from '../game/contract/engine';
import {shape} from '../game/contract/templates';

export const tutorialSteps=['intro','train','flight','growth','goal','deliver','queued','month','confirm','settled','complete'] as const;
export type TutorialStep=typeof tutorialSteps[number];
export type TutorialState={step:TutorialStep;game:Contract;beforeTraining:Athlete;beforeValue:string;deliveryValue?:string};
/** Separate practice fixture. A real success crosses a real template threshold; nothing is persisted. */
export function createTutorial():TutorialState{
 const game=newContract(6),player=game.players[0];
 player.level=4;player.peakLevel=4;player.height=193;
 player.stats={three:31,mid:22,drive:31,inside:28,handle:33,defense:44};
 player.lastStyle=shape(player.stats);player.peakValue=playerValue(game,player);
 game.commerce.shop.giftAvailable=false;game.commerce.shop.offers=[];
 return {step:'intro',game,beforeTraining:cloneData(player),beforeValue:playerValue(game,player)};
}
export function advanceTutorial(state:TutorialState,action:TutorialStep):TutorialState{
 if(action!==state.step||state.step==='complete')return state;
 const actions:Partial<Record<TutorialStep,Action>>={train:{type:'train',playerId:'p1'},deliver:{type:'queue',playerId:'p1',queued:true},confirm:{type:'settle'}};
 const command=actions[action],next=tutorialSteps[tutorialSteps.indexOf(action)+1];
 if(!command)return {...state,step:next};
 const deliveryValue=action==='deliver'?playerValue(state.game,state.game.players.find(p=>p.id==='p1')!):state.deliveryValue;
 const result=dispatch(state.game,state.game.revision,command);
 if(result.error)throw new Error(`教程操作失败：${result.error}`);
 return {...state,game:result.state,deliveryValue,step:next};
}

/** Skipping discards the practice and enters the same mandatory real-career gift flow. */
export function skipTutorial(state:TutorialState):TutorialState{return {...state,step:'complete'};}
