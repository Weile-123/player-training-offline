import {dispatch,newContract,type Action} from './engine';
import {decodeContract,encodeContract} from './save';
import {templateRules} from './templates';
import {rules} from './rules';

export type TemplateWitness={seed:number;actions:Action[]};
/** Replays a fresh, empty-equipment career through the same public actions as the UI.
 * No injected RNG, attributes, outcomes, money, equipment or growth multiplier. */
export function replayTemplateWitness(id:string,witness:TemplateWitness){
 const target=templateRules.find(t=>t.id===id);
 if(!target)throw new Error(`未知模板 ${id}`);
 let state=newContract(witness.seed),acquisition:null|{step:number;playerId:string;height:number;level:number;peakLevel:number;stats:typeof target.stats;month:number}=null;
 const rank=(templateId:string|null)=>rules.tiers.findIndex(t=>t.id===templateRules.find(v=>v.id===templateId)?.tier);
 for(let step=0;step<witness.actions.length;step++){
  const action=witness.actions[step],previous=state;
  const result=dispatch(state,state.revision,action);
  if(result.error)throw new Error(`${id} step ${step}: ${result.error}`);
  state=result.state;
  if(action.type!=='rewind')for(const before of previous.players){
   const after=state.players.find(p=>p.id===before.id);
   if(after&&before.templateId&&rank(after.templateId)<rank(before.templateId))throw new Error(`${id}: 模板倒退 ${before.id}`);
  }
  for(const event of result.events)if(event.type==='unlock'&&event.templateId===id){
   const p=state.players.find(p=>p.id===event.playerId)!;
   acquisition={step,playerId:p.id,height:p.height,level:p.level,peakLevel:p.peakLevel,stats:p.stats,month:state.month};
  }
  // A mid-path save/load checks persistence without introducing a gameplay action.
  if(step===Math.floor(witness.actions.length/2))state=decodeContract(encodeContract(state))!;
 }
 if(!acquisition||!state.collection[id])throw new Error(`${id}: 未通过实际解锁事件取得模板`);
 const restored=decodeContract(encodeContract(state));
 if(!restored?.collection[id])throw new Error(`${id}: 收藏未保存`);
 return {id,seed:witness.seed,actions:witness.actions.length,shots:state.totalShots,acquisition,finalEquipment:state.equipment};
}
