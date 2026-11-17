import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {createRoot} from 'react-dom/client';
import {act} from 'preact/test-utils';
const loading=vi.hoisted(()=>{
 vi.stubGlobal('structuredClone',undefined);
 return {release:()=>{},reject:()=>{},finish:vi.fn()};
});
vi.mock('../../src/presentation/preloadAssets',()=>({
 preloadAssets:()=>new Promise<void>((resolve,reject)=>{loading.release=resolve;loading.reject=()=>reject(Error('artwork unavailable'));}),
 finishLoading:loading.finish,
 subscribeLoading:()=>()=>{},
}));
import AppBootstrap from '../../src/components/AppBootstrap';
let root:ReturnType<typeof createRoot>;
beforeEach(()=>loading.finish.mockClear());
afterEach(()=>{if(root)act(()=>root.unmount());vi.unstubAllGlobals();});
it('switches from Loading to the real dynamically imported home and opens its store-backed panels',async()=>{
 root=createRoot(document.getElementById('root')!);
 await act(async()=>root.render(<AppBootstrap/>));
 expect(document.querySelector('[aria-label="游戏资源加载"]')).toBeTruthy();
 await act(async()=>{loading.release();});
 await vi.waitFor(async()=>{
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
  expect(document.querySelector('[aria-label="传奇球馆首页"]')).toBeTruthy();
 },{timeout:5000});
 expect(document.querySelector('[aria-label="游戏资源加载"]')).toBeNull();
 expect(loading.finish).toHaveBeenCalledOnce();
 await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="球星图鉴"]')!.click());
 expect(document.querySelector('[role="dialog"]')).toBeTruthy();
});
it('retains the loading screen on artwork failure and retries before entering the real home',async()=>{
 root=createRoot(document.getElementById('root')!);
 await act(async()=>root.render(<AppBootstrap/>));
 await act(async()=>loading.reject());
 expect(document.querySelector('[aria-label="传奇球馆首页"]')).toBeNull();
 await vi.waitFor(async()=>{
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
  expect(document.querySelector('[role="status"]')?.textContent).toContain('artwork unavailable');
 });
 expect(loading.finish).not.toHaveBeenCalled();
 await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='重新加载')!.click());
 await act(async()=>loading.release());
 await vi.waitFor(async()=>{
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
  expect(document.querySelector('[aria-label="传奇球馆首页"]')).toBeTruthy();
 },{timeout:5000});
 expect(loading.finish).toHaveBeenCalledOnce();
});
