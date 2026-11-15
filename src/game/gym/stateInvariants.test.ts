import {describe,expect,it} from 'vitest';
import {activePlayers,dispatchGym,equipmentCatalog,newGym,recoverySeconds,staminaMax,type GymAction,type GymAlumnus,type GymState} from './engine';
import {decodeGym,encodeGym,gymSaveKeys,readGym,validGym,writeGym} from './save';
import {settleOfflineGym} from './offline';
import {nbaTemplates} from '../templates';

const at=1800000000000;
function command(state:GymState,action:GymAction,now=state.updatedAt){const result=dispatchGym(state,state.revision,action,now);expect(result.error).toBeUndefined();return result.state;}
function fixture(seed=17){
 const state={...newGym(at,seed),gymLevel:8,credits:10000};
 state.collection=Object.fromEntries(nbaTemplates.slice(0,25).map(template=>[template.id,{firstAt:at,highestRating:0,highestValue:'0'}]));
 return state;
}
function memory(){const values=new Map<string,string>();return{values,storage:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}}};}

describe('gym state invariants across operation sequences',()=>{
 it('keeps every equipment rebuy/sale cycle cash-negative and collection permanent',()=>{
  let state=fixture();
  for(const item of equipmentCatalog){
   for(let cycle=0;cycle<2;cycle++){
    const before=state.credits;
    state=command(state,{type:'buy-equipment',id:item.id});
    state=command(state,{type:'unequip',id:item.id});
    state=command(state,{type:'sell-equipment',id:item.id});
    expect(state.credits).toBe(before-item.price+Math.floor(item.price/2));
    expect(state.collectedEquipment).toHaveProperty(item.id);
    const replay=dispatchGym(state,state.revision,{type:'sell-equipment',id:item.id},state.updatedAt);
    expect(replay.state).toBe(state);expect(replay.error).toBeTruthy();
    expect(decodeGym(encodeGym(state))).toEqual(state);
   }
  }
 });

 it('preserves input, failures and save shape through mixed timers, training and selection',()=>{
  for(let seed=1;seed<=16;seed++){
   let state=fixture(seed);state=command(state,{type:'recruit'});
   for(let index=0;index<80;index++){
    const player=state.player!,action:GymAction=index%5===0?{type:'select-player',id:state.bench[0].id}
     :index%5===1?{type:'set-auto',id:player.id,enabled:!player.autoEnabled}
     :index%5===2?{type:'auto-step'}:index%5===3?{type:'train',id:player.id}:{type:'use-drink',id:player.id};
    const before=JSON.stringify(state),result=dispatchGym(state,state.revision,action,state.updatedAt+1234);
    expect(JSON.stringify(state)).toBe(before);
    if(result.error){expect(result.state).toBe(state);expect(result.events).toEqual([]);}else state=result.state;
    expect(validGym(state)).toBe(true);
    for(const p of activePlayers(state)){expect(p.stamina).toBeGreaterThanOrEqual(0);expect(p.stamina).toBeLessThanOrEqual(staminaMax(state));}
   }
   expect(decodeGym(encodeGym(state))).toEqual(state);
  }
 });

 it('keeps arbitrary within-cap offline segments equivalent with unequal stamina and cooldown',()=>{
  for(let seed=1;seed<=16;seed++){
   let state=fixture(seed);state=command(state,{type:'recruit'});state=command(state,{type:'recruit'});
   state.projects.recovery=6;state.projects.automation=3;
   for(const [index,player] of activePlayers(state).entries()){
    player.stamina=index;player.recoveryMs=(seed*113+index*17)%(recoverySeconds(state)*1000);
    state=command(state,{type:'set-auto',id:player.id,enabled:true});
   }
   const whole=settleOfflineGym(state,at+123456).state;
   let split=state;for(const elapsed of [1,1987,17899,31117,95003,123456])split=settleOfflineGym(split,at+elapsed).state;
   expect({...split,revision:0}).toEqual({...whole,revision:0});
   expect(validGym(whole)).toBe(true);
  }
 });

 it('refuses an oversized valid history before replacing either recoverable copy',()=>{
  const {storage,values}=memory(),safe=fixture();expect(writeGym(storage,safe).ok).toBe(true);
  const before=new Map(values),large=structuredClone(safe);
  large.alumni=Array.from({length:20000},(_,index)=>({...structuredClone(safe.player!),id:`large-archive-${index}`,recommendedAt:at,
   rewardCredits:0,rewardFame:0,finalValue:'320'} as GymAlumnus));
  expect(validGym(large)).toBe(true);
  const written=writeGym(storage,large);
  expect(written.ok).toBe(false);
  expect(values.get(gymSaveKeys.main)).toBe(before.get(gymSaveKeys.main));
  expect(values.get(gymSaveKeys.backup)).toBe(before.get(gymSaveKeys.backup));
  expect(readGym(storage).state).toEqual(safe);
 },20000);
});
