import {afterEach,it,expect,vi} from 'vitest';
import {createContractStore,debugSettingsKey} from './contractStore';
import {writeContract} from './game/contract/save';
import {completeRewardedVideo} from './platform/rewardedVideo';
import {restoreCloudArchive} from './platform/cloudArchive';
const memory=()=>{const data=new Map<string,string>();return {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}};};
afterEach(()=>vi.unstubAllEnvs());
it('keeps an unused revive across local reload and cloud restore; grants once and selects a rookie',()=>{
 const storage=memory(),store=createContractStore(storage,()=>7);store.getState().start();
 for(let n=0;n<3;n++)store.getState().act({type:'settle'});
 expect(store.getState().state.status).toBe('over');const loaded=createContractStore(storage,()=>9);expect(loaded.getState().hasSave).toBe(true);
 const target=memory();restoreCloudArchive(target,loaded.getState().exportCloudArchive());const restored=createContractStore(target,()=>9);expect(restored.getState().hasSave).toBe(true);
 const before=restored.getState().state;const r=restored.getState().act({type:'ad-reward',reward:'revive',careerId:before.careerId!,revision:before.revision});
 expect(r.error).toBeUndefined();expect(restored.getState().selectedId).toBe(`p${before.nextId}`);expect(restored.getState().state.credit).toBe(3);expect(restored.getState().state.month).toBe(before.month);
 const again=createContractStore(target,()=>10);expect(again.getState().state.adRewards?.revived).toBe(true);
 const ended={...again.getState().state,status:'over' as const,credit:0};writeContract(target,ended);
 const final=createContractStore(target,()=>10);expect(final.getState().hasSave).toBe(true);expect(final.getState().state.status).toBe('over');
 final.getState().finish();expect(createContractStore(target,()=>11).getState().hasSave).toBe(false);
});
it('DEV toggle survives reload, production cannot enable it',()=>{
 vi.stubEnv('DEV',true);const storage=memory(),store=createContractStore(storage,()=>7);store.getState().debugAct('mock-rewarded-ads');
 expect(createContractStore(storage,()=>7).getState().debug.mockRewardedAds).toBe(true);expect(storage.getItem(debugSettingsKey)).toContain('mockRewardedAds');
 vi.stubEnv('DEV',false);const production=createContractStore(storage,()=>7);production.getState().debugAct('mock-rewarded-ads');expect(production.getState().debug.mockRewardedAds).toBe(false);
});
it('blocks gameplay mutations throughout an active native video but allows atomic reward',async()=>{
 const store=createContractStore(memory(),()=>7);store.getState().start();const before=store.getState().state;
 let finish!:(r:{code:number;data:{rewarded:boolean}})=>void;
 const flow=completeRewardedVideo(()=>{const r=store.getState().act({type:'ad-reward',reward:'heat',playerId:'p1',careerId:before.careerId!,revision:before.revision});expect(r.error).toBeUndefined();},{load:async()=>({vatask:{completeRewardVideo:()=>new Promise(resolve=>{finish=resolve;}),getActivityTaskState:async()=>({})}})});
 await Promise.resolve();expect(store.getState().act({type:'train',playerId:'p1'}).error).toBe('ad-busy');expect(store.getState().start()).toBe(false);store.getState().select('p2');store.getState().debugAct('cash');expect(store.getState().state).toBe(before);expect(store.getState().selectedId).toBe('p1');
 await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
 finish({code:200,data:{rewarded:true}});await flow;
 expect(store.getState().state.players[0].heat).toBe(3);
 expect(store.getState().state.players[0].hotShotsRemaining??0).toBe(0);
 expect(store.getState().state.adRewards?.heatMonth).toBe(before.month);
});
