import {it,expect} from 'vitest';
import {createContractStore} from './contractStore';
import {completeRewardedVideo} from './platform/rewardedVideo';
import {newContract,dispatch,type AdReward,type Contract} from './game/contract/engine';
import {newCommerce} from './game/contract/commerce';
const memory=()=>{const data=new Map<string,string>();return {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}};};
function fixture(reward:AdReward):Contract{
 for(let seed=1;seed<1000;seed++){
  const g=newContract(seed);g.month=3;g.careerId='flow-test';g.commerce=newCommerce(3,[],3,g.rng.market);
  if(reward==='revive'){g.credit=0;g.status='over';}
  if(reward!=='injury-rewind')return g;
  g.players[0].level=20;g.players[0].peakLevel=20;
  const result=dispatch(g,0,{type:'train',playerId:'p1'});if(result.state.adInjury)return result.state;
 }throw Error('No fixture');
}
const rewards:AdReward[]=['heat','legendary-shop','injury-rewind','merchant-refresh','revive'];
for(const reward of rewards){
 it.each([{code:200,data:{rewarded:false}},{code:200},{code:403,data:{rewarded:true}}])(`${reward}: incomplete/invalid SDK response cannot mutate a real store`,async response=>{
  const store=createContractStore(memory(),()=>7),before=fixture(reward);store.setState({state:before,hasSave:true});
  await expect(completeRewardedVideo(()=>{store.getState().act({type:'ad-reward',reward,careerId:before.careerId!,revision:before.revision,playerId:'p1'});},{load:async()=>({vatask:{completeRewardVideo:async()=>({...response,message:'未完成'}),getActivityTaskState:async()=>({})}})})).rejects.toThrow('未完成');
  expect(store.getState().state).toBe(before);
 });
 it(`${reward}: confirmed SDK -> store -> save/reload -> duplicate rejection`,async()=>{
  const storage=memory(),store=createContractStore(storage,()=>7),before=fixture(reward);store.setState({state:before,hasSave:true});
  const action={type:'ad-reward' as const,reward,careerId:before.careerId!,revision:before.revision,playerId:'p1'};
  await completeRewardedVideo(()=>expect(store.getState().act(action).error).toBeUndefined(),{load:async()=>({vatask:{completeRewardVideo:async()=>({code:200,data:{rewarded:true}}),getActivityTaskState:async()=>({})}})});
  const after=store.getState().state;expect(after.revision).toBe(before.revision+1);
  const reloaded=createContractStore(storage,()=>9);expect(reloaded.getState().state.adRewards).toEqual(after.adRewards);
  const again=reloaded.getState().act(action);expect(again.error).toBeDefined();expect(reloaded.getState().state.revision).toBe(after.revision);
  if(reward==='injury-rewind')expect(after.adRewards?.shields.p1).toBe(1);
  if(reward==='revive'){expect(after.credit).toBe(3);expect(after.month).toBe(before.month);expect(after.players.length-before.players.length).toBe(3);}
 });
}
