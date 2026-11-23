import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createRoot,type Root} from 'react-dom/client';
import {act} from 'preact/test-utils';
import type {UseBoundStore,StoreApi} from 'zustand';
import type {GymStore} from '../../src/gymStore';
import {newGym,type GymResult} from '../../src/game/gym/engine';
import {completeGymTutorial,gymTutorialCompleted,saveGymTutorialEnabled} from '../../src/presentation/gymTutorialPreference';

const harness=vi.hoisted(()=>({store:null as UseBoundStore<StoreApi<GymStore>>|null,start:vi.fn(),hydrate:vi.fn(),flush:vi.fn()}));
vi.mock('../../src/gymStore',async()=>{
 const {create}=await import('zustand');
 const {newGym}=await import('../../src/game/gym/engine');
 const store=create<GymStore>((_set,get)=>({
  state:newGym(1_800_000_000_000,41),hasSave:false,hydrating:false,actionError:'',saveMessage:'',isSuspended:false,pendingOfflineReport:null,
  hydrate:()=>harness.hydrate(),start:()=>harness.start(),flush:()=>harness.flush(),
  act:async()=>({state:get().state,events:[]}),tick:async()=>({state:get().state,events:[]}),
  resume:async()=>({state:get().state,events:[]}),suspend:async()=>{},
  loadAlumni:async()=>({players:[],total:0}),dismissOfflineReport:()=>{},
 }));
 harness.store=store;return {useGym:store};
});
vi.mock('../../src/components/GymTutorial',()=>({GymTutorial:({onComplete,onSkip,error}:{onComplete:()=>void;onSkip:()=>void;error?:string})=><section className="mock-gym-tutorial"><p>{error}</p><button onClick={onComplete}>完成练习</button><button onClick={onSkip}>跳过练习</button></section>}));
vi.mock('../../src/components/GymGame',()=>({default:()=> <main className="mock-real-gym"/>}));
vi.mock('../../src/presentation/audio',()=>({gameAudio:{install:vi.fn(()=>()=>{}),play:vi.fn(async()=>{}),unlock:vi.fn(),mute:vi.fn()}}));
vi.mock('../../src/platform/gymCloudSync',()=>{
 const snapshot={user:null,phase:'guest',busy:null,cloud:null,cloudKnown:false,message:'',preview:null};
 return {gymCloudSync:{subscribe:()=>()=>{},getSnapshot:()=>snapshot,start:()=>()=>{},cancelSync:vi.fn(),refresh:vi.fn(async()=>{})}};
});
import GymHome from '../../src/components/GymHome';

const at=1_800_000_000_000;
let root:Root|null=null;
const store=()=>harness.store!;
const flushMicrotasks=async()=>{for(let index=0;index<25;index++)await Promise.resolve();};
beforeEach(()=>{
 localStorage.clear();vi.clearAllMocks();
 Object.defineProperty(document,'fonts',{configurable:true,value:{ready:Promise.resolve()}});
 harness.hydrate.mockResolvedValue(undefined);harness.flush.mockResolvedValue(undefined);
 harness.start.mockImplementation(async()=>{
  const state=newGym(at+1000,52);store().setState({state,hasSave:true,actionError:''});return {state,events:[]};
 });
 store().setState({state:newGym(at,41),hasSave:false,hydrating:false,actionError:'',saveMessage:'',isSuspended:false,pendingOfflineReport:null});
});
afterEach(()=>{if(root)act(()=>root!.unmount());root=null;vi.restoreAllMocks();localStorage.clear();});
async function mount(){root=createRoot(document.getElementById('root')!);await act(async()=>{root!.render(<GymHome/>);await flushMicrotasks();});}
function button(name:string){const control=[...document.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.getAttribute('aria-label')===name||button.textContent===name);expect(control,name).toBeTruthy();return control!;}
async function press(name:string){await act(async()=>{button(name).click();await flushMicrotasks();});}
function deferred<T>(){let resolve!:(value:T)=>void;return {promise:new Promise<T>(accept=>{resolve=accept;}),resolve:(value:T)=>resolve(value)};}

it.each(['知道了', '关闭面板'])('shows the latest announcement until it is dismissed using %s', async action => {
 localStorage.setItem('legend-gym.update-notice', 'level-cap-2000-v2');
 await mount();
 const notice = document.querySelector('.gym-update-notice');
 expect(notice?.querySelector('h2')?.textContent).toBe('新版公告');
 expect([...notice!.querySelectorAll('time')].map(date=>date.dateTime)).toEqual(['2026-11-23']);
 expect(notice?.textContent).toContain('球馆达到 Lv.3');
 const business = [...notice!.querySelectorAll('li')].find(item => item.querySelector('strong')?.textContent === '球馆经营');
 expect(business?.textContent).toContain('球馆 Lv.3 解锁挑战项目升级');
 expect(business?.textContent).toContain('恢复护理和招生培养最高 Lv.12，离线课表最高 Lv.8');
 expect(notice?.textContent).toContain('挑战榜');
 expect(notice?.textContent).not.toContain('球员等级上限提升');
 await act(async () => root!.unmount());
 root = null;
 await mount();
 expect(document.querySelector('.gym-update-notice')).toBeTruthy();
 await press(action);
 expect(document.querySelector('.gym-update-notice')).toBeNull();
 expect(localStorage.getItem('legend-gym.update-notice')).toBe('2026-11-23');
 await act(async () => root!.unmount());
 root = null;
 await mount();
 expect(document.querySelector('.gym-update-notice')).toBeNull();
 await press('公告');
 const history = document.querySelector('.gym-update-notice');
 expect(history?.querySelector('h2')?.textContent).toBe('更新公告');
 const releases = history!.querySelectorAll('.gym-update-notice-releases section');
 expect([...releases].map(release=>release.querySelector('time')?.dateTime)).toEqual(['2026-11-23','2026-11-20']);
 expect(releases[0].textContent).toContain('挑战榜');
 expect([...releases[1].querySelectorAll('li')].map(item=>item.textContent)).toEqual([
  '球员等级上限提升球员上限从 Lv.99 提升至 Lv.2000，已有球员可以继续培养。',
  '页面样式优化调整首页及部分游戏页面的布局与显示效果。',
  '动画更流畅优化训练和界面动画，减少卡顿。',
 ]);
});

it('offers a separate practice before creating the first real gym',async()=>{
 await mount();const before=structuredClone(store().getState().state);
 await press('开设训练馆');
 expect(document.querySelector('.mock-gym-tutorial')).toBeTruthy();expect(document.querySelector('.mock-real-gym')).toBeNull();
 expect(harness.start).not.toHaveBeenCalled();expect(store().getState().hasSave).toBe(false);expect(store().getState().state).toEqual(before);
 expect(gymTutorialCompleted()).toBe(false);
});

it.each(['完成练习','跳过练习'])('creates the real gym once after %s and persists tutorial completion',async action=>{
 await mount();await press('开设训练馆');await press(action);
 expect(harness.start).toHaveBeenCalledOnce();expect(store().getState().hasSave).toBe(true);
 expect(document.querySelector('.mock-gym-tutorial')).toBeNull();expect(document.querySelector('.mock-real-gym')).toBeTruthy();
 expect(gymTutorialCompleted()).toBe(true);
});

it('ignores repeated completion and skip callbacks while the first creation is pending',async()=>{
 const pending=deferred<GymResult>();harness.start.mockReturnValue(pending.promise);
 await mount();await press('开设训练馆');
 await act(async()=>{button('完成练习').click();button('完成练习').click();button('跳过练习').click();await flushMicrotasks();});
 expect(harness.start).toHaveBeenCalledOnce();expect(gymTutorialCompleted()).toBe(false);expect(document.querySelector('.mock-real-gym')).toBeNull();
 const state=newGym(at+1000,52);
 await act(async()=>{store().setState({state,hasSave:true});pending.resolve({state,events:[]});await flushMicrotasks();});
 expect(document.querySelector('.mock-real-gym')).toBeTruthy();expect(gymTutorialCompleted()).toBe(true);
});

it('keeps practice available after a failed real-gym creation and completes only after retry succeeds',async()=>{
 harness.start.mockImplementationOnce(async()=>{store().setState({actionError:'保存暂时失败'});return {state:store().getState().state,events:[],error:'保存暂时失败'};});
 await mount();await press('开设训练馆');await press('完成练习');
 expect(harness.start).toHaveBeenCalledOnce();expect(document.querySelector('.mock-gym-tutorial')?.textContent).toContain('保存暂时失败');
 expect(gymTutorialCompleted()).toBe(false);expect(store().getState().hasSave).toBe(false);expect(document.querySelector('.mock-real-gym')).toBeNull();
 await press('完成练习');expect(harness.start).toHaveBeenCalledTimes(2);expect(gymTutorialCompleted()).toBe(true);expect(document.querySelector('.mock-real-gym')).toBeTruthy();
});

it('continues an existing gym without introducing practice or starting over',async()=>{
 const state=newGym(at,91);state.gymLevel=4;state.credits=200;store().setState({state,hasSave:true});
 await mount();await press('继续经营');
 expect(harness.start).not.toHaveBeenCalled();expect(document.querySelector('.mock-real-gym')).toBeTruthy();expect(document.querySelector('.mock-gym-tutorial')).toBeNull();
 expect(store().getState().state).toBe(state);expect(gymTutorialCompleted()).toBe(false);
});

it('handles a rejected start request without exiting practice or recording completion, and allows retry',async()=>{
 harness.start.mockRejectedValueOnce(Error('保存服务暂不可用'));
 await mount();await press('开设训练馆');await press('跳过练习');
 expect(harness.start).toHaveBeenCalledOnce();expect(document.querySelector('.mock-gym-tutorial')?.textContent).toContain('保存服务暂不可用');
 expect(gymTutorialCompleted()).toBe(false);expect(store().getState().hasSave).toBe(false);expect(document.querySelector('.mock-real-gym')).toBeNull();
 await press('完成练习');expect(harness.start).toHaveBeenCalledTimes(2);expect(gymTutorialCompleted()).toBe(true);expect(document.querySelector('.mock-real-gym')).toBeTruthy();
});

it.each(['完成练习','跳过练习'])('returns to settings after replay %s without replacing the saved gym',async action=>{
 const state=newGym(at,92);state.gymLevel=5;state.fame=400;state.credits=47;store().setState({state,hasSave:true});
 const before=structuredClone(store().getState().state);
 await mount();await press('设置');await press('重玩新手引导');
 expect(document.querySelector('.mock-gym-tutorial')).toBeTruthy();expect(harness.start).not.toHaveBeenCalled();
 await press(action);
 expect(document.querySelector('.home-settings-dialog')).toBeTruthy();expect(document.querySelector('.mock-gym-tutorial')).toBeNull();expect(document.querySelector('.mock-real-gym')).toBeNull();
 expect(harness.start).not.toHaveBeenCalled();expect(store().getState().state).toEqual(before);expect(store().getState().hasSave).toBe(true);
});

it('ignores legacy disabled guidance preferences and still offers the first-gym practice',async()=>{
 saveGymTutorialEnabled(false);await mount();await press('开设训练馆');
 expect(harness.start).not.toHaveBeenCalled();expect(document.querySelector('.mock-gym-tutorial')).toBeTruthy();expect(document.querySelector('.mock-real-gym')).toBeNull();
});

it('removes the gym tutorial switch and keeps replay usable without changing the saved gym',async()=>{
 const state=newGym(at,93);store().setState({state,hasSave:true});
 await mount();await press('设置');
 expect(document.querySelector('#gym-tutorial-switch-label')).toBeNull();
 expect([...document.querySelectorAll('[role="switch"]')].map(button=>button.getAttribute('aria-labelledby'))).toEqual(['sound-switch-label']);
 expect(button('重玩新手引导').disabled).toBe(false);
 await press('重玩新手引导');expect(document.querySelector('.mock-gym-tutorial')).toBeTruthy();
 await press('完成练习');expect(document.querySelector('.home-settings-dialog')).toBeTruthy();
 expect(harness.start).not.toHaveBeenCalled();expect(store().getState().state).toBe(state);
});

it('starts directly after the first-gym practice has been completed',async()=>{
 completeGymTutorial();await mount();await press('开设训练馆');
 expect(harness.start).toHaveBeenCalledOnce();expect(document.querySelector('.mock-gym-tutorial')).toBeNull();expect(document.querySelector('.mock-real-gym')).toBeTruthy();
});
