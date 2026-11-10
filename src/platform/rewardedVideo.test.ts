import {afterEach,it,expect,vi} from 'vitest';
import {completeRewardedVideo,rewardVideoPending} from './rewardedVideo';
import type {HupuSdk,SdkResponse} from './hupuSdk';
const setup=(response:SdkResponse<{rewarded:boolean;reason?:string}>)=>{
 const sdk:HupuSdk={vatask:{completeRewardVideo:vi.fn().mockResolvedValue(response),getActivityTaskState:vi.fn().mockResolvedValue({})}};
 return {sdk,load:async()=>sdk};
};
afterEach(()=>vi.unstubAllEnvs());
it('calls the parameterless official API and grants only confirmed completion, then refreshes tasks',async()=>{
 const {sdk,load}=setup({code:200,data:{rewarded:true}}),grant=vi.fn();
 await completeRewardedVideo(grant,{load});expect(sdk.vatask!.completeRewardVideo).toHaveBeenCalledWith();expect(grant).toHaveBeenCalledTimes(1);expect(sdk.vatask!.getActivityTaskState).toHaveBeenCalledOnce();expect(rewardVideoPending()).toBe(false);
});
it.each([
 {code:200,data:{rewarded:false},message:'未看完'},
 {code:200,message:'仅启动'},
 {code:403,data:{rewarded:true},message:'请在虎扑打开'},
 {code:422,data:{rewarded:false},message:'不支持'},
 {code:500,data:{rewarded:false},message:'拉起失败'},
])('never rewards cancellation, launch acknowledgement, unavailability or errors: $message',async response=>{
 const {sdk,load}=setup(response),grant=vi.fn();await expect(completeRewardedVideo(grant,{load})).rejects.toThrow(response.message);
 expect(grant).not.toHaveBeenCalled();expect(sdk.vatask!.getActivityTaskState).not.toHaveBeenCalled();expect(rewardVideoPending()).toBe(false);
});
it('prevents concurrent ads across all placements until the first grant finishes',async()=>{
 let finish!:(r:SdkResponse<{rewarded:boolean}>)=>void;
 const sdk:HupuSdk={vatask:{completeRewardVideo:()=>new Promise(resolve=>{finish=resolve;}),getActivityTaskState:async()=>({})}};
 const grant=vi.fn(()=>expect(rewardVideoPending()).toBe(true));
 const first=completeRewardedVideo(grant,{load:async()=>sdk});await Promise.resolve();expect(rewardVideoPending()).toBe(true);
 const secondLoad=vi.fn();await expect(completeRewardedVideo(vi.fn(),{load:secondLoad})).rejects.toThrow('广告正在进行');expect(secondLoad).not.toHaveBeenCalled();
 finish({code:200,data:{rewarded:true}});await first;expect(grant).toHaveBeenCalledOnce();expect(rewardVideoPending()).toBe(false);
});
it('a task refresh failure does not revoke confirmed rewards; thrown request failures do not grant',async()=>{
 const {sdk,load}=setup({code:200,data:{rewarded:true}}),grant=vi.fn();sdk.vatask!.getActivityTaskState=vi.fn().mockRejectedValue(Error('offline'));
 await completeRewardedVideo(grant,{load});expect(grant).toHaveBeenCalledOnce();
 sdk.vatask!.completeRewardVideo=vi.fn().mockRejectedValue(Error('offline'));await expect(completeRewardedVideo(grant,{load})).rejects.toThrow('offline');expect(grant).toHaveBeenCalledOnce();expect(rewardVideoPending()).toBe(false);
});
it('unsupported SDK is an actionable failure and does not leave the mutex locked',async()=>{
 const grant=vi.fn();await expect(completeRewardedVideo(grant,{load:async()=>({})})).rejects.toThrow('不支持');expect(grant).not.toHaveBeenCalled();expect(rewardVideoPending()).toBe(false);
});
it('bypass works only in development; production ignores a persisted mock request',async()=>{
 const grant=vi.fn(),load=vi.fn().mockResolvedValue({});vi.stubEnv('DEV',true);
 await completeRewardedVideo(grant,{mock:true,load});expect(grant).toHaveBeenCalledOnce();expect(load).not.toHaveBeenCalled();
 vi.stubEnv('DEV',false);await expect(completeRewardedVideo(grant,{mock:true,load})).rejects.toThrow('不支持');expect(grant).toHaveBeenCalledOnce();expect(load).toHaveBeenCalledOnce();
});
it('stale game grant failure still releases the shared lock',async()=>{
 const {load}=setup({code:200,data:{rewarded:true}});await expect(completeRewardedVideo(()=>{throw Error('stale');},{load})).rejects.toThrow('stale');expect(rewardVideoPending()).toBe(false);
});
it('missing native callback releases the gameplay lock and ignores late rewards',async()=>{
 vi.useFakeTimers();
 try{
  let resolve!:(r:SdkResponse<{rewarded:boolean}>)=>void;
  const grant=vi.fn(),sdk:HupuSdk={vatask:{completeRewardVideo:()=>new Promise(r=>{resolve=r;}),getActivityTaskState:async()=>({})}};
  const task=completeRewardedVideo(grant,{load:async()=>sdk});
  const rejected=expect(task).rejects.toThrow('响应超时');
  await vi.advanceTimersByTimeAsync(120001);await rejected;
  expect(rewardVideoPending()).toBe(false);
  resolve({code:200,data:{rewarded:true}});await Promise.resolve();expect(grant).not.toHaveBeenCalled();
 }finally{vi.useRealTimers();}
});
