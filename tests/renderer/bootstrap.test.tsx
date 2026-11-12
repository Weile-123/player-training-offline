import {afterEach,it,expect,vi} from 'vitest';
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
afterEach(()=>{if(root)act(()=>root.unmount());vi.unstubAllGlobals();});
it('switches from Loading to the real dynamically imported home and opens its store-backed panels',async()=>{
 root=createRoot(document.getElementById('root')!);
 await act(async()=>root.render(<AppBootstrap/>));
 expect(document.querySelector('[aria-label="游戏资源加载"]')).toBeTruthy();
 await act(async()=>{loading.release();});
 await vi.waitFor(async()=>{
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
  expect(document.querySelector('[aria-label="王牌训练师训练馆首页"]')).toBeTruthy();
 },{timeout:5000});
 expect(document.querySelector('[aria-label="游戏资源加载"]')).toBeNull();
 expect(loading.finish).toHaveBeenCalledOnce();
 await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="球星图鉴"]')!.click());
 expect(document.querySelector('[role="dialog"]')).toBeTruthy();
});
it('artwork failure does not block the real home screen',async()=>{
 root=createRoot(document.getElementById('root')!);
 await act(async()=>root.render(<AppBootstrap/>));
 await act(async()=>loading.reject());
 await vi.waitFor(async()=>{
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
  expect(document.querySelector('[aria-label="王牌训练师训练馆首页"]')).toBeTruthy();
 },{timeout:5000});
});
