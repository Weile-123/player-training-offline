import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createRoot,type Root} from 'react-dom/client';
import {act} from 'preact/test-utils';
import GymHome from '../../src/components/GymHome';
import {useGym} from '../../src/gymStore';

vi.mock('../../src/gymStore',async importOriginal=>{
 const actual=await importOriginal<typeof import('../../src/gymStore')>();
 const values=new Map<string,string>();
 return{...actual,useGym:actual.createGymStore({getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);}},17,()=>1000)};
});
vi.mock('../../src/presentation/audio',()=>({gameAudio:{install:vi.fn(()=>()=>{}),unlock:vi.fn(),play:vi.fn(async()=>{}),mute:vi.fn()}}));
vi.mock('../../src/platform/gymLeaderboard',()=>({gymLeaderboard:{sync:vi.fn()},gymLeaderboardConfigured:()=>false,gymRankReference:vi.fn()}));

let root:Root|null=null,releaseHydration:()=>void,markReady:ReturnType<typeof vi.fn>;
let frames:Map<number,FrameRequestCallback>,sequence:number;
beforeEach(()=>{
 vi.clearAllMocks();frames=new Map();sequence=0;
 vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.set(++sequence,callback);return sequence;});
 vi.stubGlobal('cancelAnimationFrame',(id:number)=>{frames.delete(id);});
 const hydration=new Promise<void>(resolve=>{releaseHydration=()=>{useGym.setState({hydrating:false});resolve();};});
 useGym.setState({hasSave:false,hydrating:true,hydrate:()=>hydration,authorityMode:'local',actionError:'',saveMessage:''});
 markReady=vi.fn(()=>{expect(document.querySelector('[aria-label="传奇球馆首页"]')).toBeTruthy();});
 window.ShaperPerformance={markReady};
});
afterEach(()=>{if(root)act(()=>root!.unmount());root=null;delete window.ShaperPerformance;vi.unstubAllGlobals();});
async function mount(assetsReady=true){root=createRoot(document.getElementById('root')!);await act(async()=>root!.render(<GymHome startupAssetsReady={assetsReady}/>));}
async function hydrated(){await act(async()=>{releaseHydration();await Promise.resolve();});}
async function paint(){await act(async()=>{const pending=[...frames.values()];frames.clear();for(const frame of pending)frame(performance.now());await Promise.resolve();});}

it('reports only after genuine hydration and the committed home paint, once per measurement cycle',async()=>{
 await mount();await paint();expect(markReady).not.toHaveBeenCalled();
 await hydrated();expect(markReady).not.toHaveBeenCalled();await paint();expect(markReady).toHaveBeenCalledOnce();
 await act(async()=>useGym.setState({saveMessage:'已读取备份存档。'}));await paint();expect(markReady).toHaveBeenCalledOnce();
});
it('keeps a degraded home usable without reporting startup artwork as ready',async()=>{
 await mount(false);await hydrated();await paint();expect(document.querySelector('[aria-label="开设训练馆"]')).toBeTruthy();expect(markReady).not.toHaveBeenCalled();
 await act(async()=>window.dispatchEvent(new Event('shaper:performance:reset')));await paint();expect(markReady).not.toHaveBeenCalled();
});
it.each(['connecting','error'] as const)('keeps local gameplay ready independently of legacy cloud status (%s)',async authorityMode=>{
 useGym.setState({authorityMode});await mount();await hydrated();await paint();expect(markReady).toHaveBeenCalledOnce();
 expect(document.querySelector<HTMLButtonElement>('[aria-label="开设训练馆"]')?.disabled).toBe(false);
 await act(async()=>useGym.setState({authorityMode:'timeflow'}));await paint();expect(markReady).toHaveBeenCalledOnce();
});
it.each([{actionError:'历史档案暂时无法读取',saveMessage:''},{actionError:'',saveMessage:'存档校验失败，原数据已保留'}])('does not report failed business reads as usable (%j)',async failure=>{
 useGym.setState(failure);await mount();await hydrated();await paint();expect(markReady).not.toHaveBeenCalled();
 await act(async()=>useGym.setState({actionError:'',saveMessage:''}));await paint();expect(markReady).toHaveBeenCalledOnce();
});
it('rechecks local readiness after platform reset without waiting for a cloud reconnection',async()=>{
 await mount();await hydrated();await paint();expect(markReady).toHaveBeenCalledOnce();
 await act(async()=>{useGym.setState({authorityMode:'connecting'});window.dispatchEvent(new Event('shaper:performance:reset'));});await paint();expect(markReady).toHaveBeenCalledTimes(2);
 await act(async()=>useGym.setState({authorityMode:'timeflow'}));await paint();expect(markReady).toHaveBeenCalledTimes(2);
 await act(async()=>window.dispatchEvent(new Event('shaper:performance:reset')));expect(markReady).toHaveBeenCalledTimes(2);await paint();expect(markReady).toHaveBeenCalledTimes(3);
});
it('tolerates a missing optional SDK and can report when the platform resets after SDK installation',async()=>{
 delete window.ShaperPerformance;await mount();await hydrated();await paint();expect(markReady).not.toHaveBeenCalled();
 window.ShaperPerformance={markReady};await act(async()=>window.dispatchEvent(new Event('shaper:performance:reset')));await paint();expect(markReady).toHaveBeenCalledOnce();
});
it('cancels an uncommitted frame on unmount and contains optional SDK failures',async()=>{
 await mount();await hydrated();await act(async()=>root!.unmount());root=null;await paint();expect(markReady).not.toHaveBeenCalled();
 markReady.mockImplementation(()=>{throw Error('optional SDK unavailable');});await mount();await hydrated();await paint();expect(markReady).toHaveBeenCalledOnce();
});
