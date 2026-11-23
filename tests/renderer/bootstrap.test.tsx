import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {createRoot} from 'react-dom/client';
import {act} from 'preact/test-utils';
const loading=vi.hoisted(()=>{
 return {release:()=>{},reject:()=>{},start:vi.fn(),finish:vi.fn()};
});
vi.mock('../../src/presentation/preloadAssets',()=>({
 preloadAssets:()=>new Promise<void>((resolve,reject)=>{
  loading.start();loading.release=resolve;loading.reject=()=>reject(Error('artwork unavailable'));
 }),
 finishLoading:loading.finish,
 subscribeLoading:()=>()=>{},
}));
import AppBootstrap from '../../src/components/AppBootstrap';
let root:ReturnType<typeof createRoot>;
// The real lazy entry is transformed cold by Vite in this suite.
const coldStartTestTimeout=15_000;
beforeEach(()=>{
 vi.stubGlobal('structuredClone',undefined);
 loading.start.mockClear();loading.finish.mockClear();
});
afterEach(()=>{if(root)act(()=>root.unmount());vi.unstubAllGlobals();});
const waitForPreload=(count:number)=>vi.waitFor(()=>expect(loading.start).toHaveBeenCalledTimes(count));
const waitForHome=()=>vi.waitFor(async()=>{
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
 expect(document.querySelector('[aria-label="传奇球馆首页"]')).toBeTruthy();
},{timeout:10_000});
it('switches from Loading to the real dynamically imported home and opens its store-backed panels',async()=>{
 root=createRoot(document.getElementById('root')!);
 await act(async()=>root.render(<AppBootstrap/>));
 expect(document.querySelector('[aria-label="游戏资源加载"]')).toBeTruthy();
 await waitForPreload(1);
 await act(async()=>{loading.release();});
 await waitForHome();
 expect(document.querySelector('[aria-label="游戏资源加载"]')).toBeNull();
 expect(loading.finish).toHaveBeenCalledOnce();
 await act(async()=>document.querySelector<HTMLButtonElement>('.gym-update-notice-actions button')!.click());
 await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="球星图鉴"]')!.click());
 expect(document.querySelector('.collection-album-dialog[role="dialog"]')).toBeTruthy();
},coldStartTestTimeout);
it('retains the loading screen on artwork failure and retries before entering the real home',async()=>{
 root=createRoot(document.getElementById('root')!);
 await act(async()=>root.render(<AppBootstrap/>));
 await waitForPreload(1);
 await act(async()=>loading.reject());
 expect(document.querySelector('[aria-label="传奇球馆首页"]')).toBeNull();
 await vi.waitFor(async()=>{
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
  expect(document.querySelector('[role="status"]')?.textContent).toContain('artwork unavailable');
 });
 expect(loading.finish).not.toHaveBeenCalled();
 await act(async()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='重新加载')!.click());
 await waitForPreload(2);
 await act(async()=>loading.release());
 await waitForHome();
 expect(loading.finish).toHaveBeenCalledOnce();
},coldStartTestTimeout);
