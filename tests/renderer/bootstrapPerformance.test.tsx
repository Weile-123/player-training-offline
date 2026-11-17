import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createRoot,type Root} from 'react-dom/client';
import {act} from 'preact/test-utils';
const loading=vi.hoisted(()=>({release:()=>{},reject:()=>{},finish:vi.fn()}));
vi.mock('../../src/presentation/preloadAssets',()=>({
 preloadAssets:()=>new Promise<void>((resolve,reject)=>{loading.release=resolve;loading.reject=()=>reject(Error('artwork unavailable'));}),
 finishLoading:loading.finish,subscribeLoading:()=>()=>{},
}));
vi.mock('../../src/components/GymHome',()=>({default:({startupAssetsReady}:{startupAssetsReady?:boolean})=><main aria-label="performance home fixture" data-assets-ready={String(startupAssetsReady)}/>}));
import AppBootstrap from '../../src/components/AppBootstrap';
let root:Root|null=null;
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();});
afterEach(()=>{if(root)act(()=>root!.unmount());root=null;vi.useRealTimers();});
async function mount(){root=createRoot(document.getElementById('root')!);await act(async()=>root!.render(<AppBootstrap/>));}
async function paintHome(){await vi.dynamicImportSettled();await act(async()=>{await vi.runAllTimersAsync();});}
const home=()=>document.querySelector('[aria-label="performance home fixture"]');
it('passes asset readiness only after the actual preload promise resolves',async()=>{
 await mount();expect(home()).toBeNull();await act(async()=>loading.release());await paintHome();expect(home()?.getAttribute('data-assets-ready')).toBe('true');
});
it('shows a retryable asset error without entering home or claiming readiness',async()=>{
 await mount();await act(async()=>loading.reject());await paintHome();expect(home()).toBeNull();
 expect(document.querySelector('[role="status"]')?.textContent).toContain('artwork unavailable');expect(loading.finish).not.toHaveBeenCalled();
});
it('keeps waiting beyond twelve seconds and reaches home only after real assets are ready',async()=>{
 await mount();await act(async()=>{await vi.advanceTimersByTimeAsync(30000);});await paintHome();expect(home()).toBeNull();expect(loading.finish).not.toHaveBeenCalled();
 expect(document.querySelector('[aria-label="游戏资源加载"]')).not.toBeNull();
 await act(async()=>loading.release());await paintHome();expect(home()?.getAttribute('data-assets-ready')).toBe('true');expect(loading.finish).toHaveBeenCalledOnce();
});
