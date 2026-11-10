import {afterEach,describe,expect,it,vi} from 'vitest';
import {animationDefaults,applyAnimationConfig,getAnimationConfig,subscribeAnimationConfig,watchAnimationConfig} from './animationConfig';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();applyAnimationConfig(animationDefaults);});
describe('live animation configuration',()=>{
 it('validates live shoot-button scale and preserves it for older configuration files',()=>{
  expect(applyAnimationConfig({...animationDefaults,shootButtonScale:1.4})).toBe(true);
  expect(applyAnimationConfig({shotAnimationDurationSeconds:1,gameMaxWidthPx:640})).toBe(true);
  expect(getAnimationConfig().shootButtonScale).toBe(1.4);
  for(const shootButtonScale of [0,.49,2.01,Infinity,NaN,'1.2'])expect(applyAnimationConfig({...animationDefaults,shootButtonScale})).toBe(false);
  expect(getAnimationConfig().shootButtonScale).toBe(1.4);
 });
 it('updates layout subscribers only when a valid configuration changes',()=>{
  const listener=vi.fn(),stop=subscribeAnimationConfig(listener);
  const value={shotAnimationDurationSeconds:2,gameMaxWidthPx:1280};
  applyAnimationConfig(value);applyAnimationConfig(value);
  for(const width of [0,319,2561,NaN,Infinity])expect(applyAnimationConfig({...value,gameMaxWidthPx:width})).toBe(false);
  expect(listener).toHaveBeenCalledTimes(1);expect(getAnimationConfig()).toEqual({...value,hoopScale:animationDefaults.hoopScale,shootButtonScale:1});
  stop();applyAnimationConfig(animationDefaults);expect(listener).toHaveBeenCalledTimes(1);
 });
 it('accepts duration in seconds and keeps last good value while a file is invalid',()=>{
  expect(applyAnimationConfig({shotAnimationDurationSeconds:.5,gameMaxWidthPx:960})).toBe(true);
  for(const input of [null,{}, {shotAnimationDurationSeconds:0},{shotAnimationDurationSeconds:31,gameMaxWidthPx:960},{shotAnimationDurationSeconds:'2'}, {shotAnimationDurationSeconds:Infinity}]){
   expect(applyAnimationConfig(input)).toBe(false);expect(getAnimationConfig().shotAnimationDurationSeconds).toBe(.5);
  }
  expect(applyAnimationConfig({shotAnimationDurationSeconds:2,gameMaxWidthPx:1200})).toBe(true);expect(getAnimationConfig().shotAnimationDurationSeconds).toBe(2);
 });
 it('hot reloads a valid hoop size and rejects invalid geometry without replacing the last good value',()=>{
  const value={...animationDefaults,hoopScale:.8};
  expect(applyAnimationConfig(value)).toBe(true);expect(getAnimationConfig().hoopScale).toBe(.8);
  for(const hoopScale of [0,.49,1.26,NaN,Infinity,'0.8'])expect(applyAnimationConfig({...value,hoopScale})).toBe(false);
  expect(getAnimationConfig().hoopScale).toBe(.8);
 });
 it('reloads saved values without caching or page reload, and cleans up polling',async()=>{
  vi.useFakeTimers({toFake:['setInterval','clearInterval','setTimeout','clearTimeout']});
  let speed=1;
  const fetcher=vi.fn(async()=>({ok:true,json:async()=>({shotAnimationDurationSeconds:speed,gameMaxWidthPx:1200})}));vi.stubGlobal('fetch',fetcher);
  const stop=watchAnimationConfig();await vi.advanceTimersByTimeAsync(0);
  speed=2;await vi.advanceTimersByTimeAsync(1000);
  expect(getAnimationConfig().shotAnimationDurationSeconds).toBe(2);
  expect(fetcher.mock.calls.length).toBe(2);
  expect(vi.mocked(fetch).mock.calls[0][1]?.cache).toBe('no-store');
  stop();await vi.advanceTimersByTimeAsync(5000);expect(fetcher.mock.calls.length).toBe(2);
 });
 it('ignores a delayed response after unmount',async()=>{
  vi.useFakeTimers({toFake:['setInterval','clearInterval','setTimeout','clearTimeout']});let resolve!:(value:unknown)=>void;
  vi.stubGlobal('fetch',()=>new Promise(r=>{resolve=r;}));
  const stop=watchAnimationConfig();stop();resolve({ok:true,json:async()=>({shotAnimationDurationSeconds:3,gameMaxWidthPx:960})});
  await vi.advanceTimersByTimeAsync(0);expect(getAnimationConfig().shotAnimationDurationSeconds).toBe(animationDefaults.shotAnimationDurationSeconds);
 });
});

it('生产模式不轮询动画配置，避免移动端每秒请求',()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);vi.useFakeTimers();
 const stop=watchAnimationConfig(false);vi.advanceTimersByTime(60000);
 expect(fetcher).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);stop();vi.useRealTimers();vi.unstubAllGlobals();
});
