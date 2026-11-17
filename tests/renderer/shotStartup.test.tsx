import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {createRoot} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {ShotScene} from '../../src/components/ShotScene';

const drawing=vi.hoisted(()=>({draw:vi.fn(),load:vi.fn()}));
vi.mock('../../src/presentation/shotRenderer.js',async original=>({...await original<object>(),drawMultiScene:(...args:unknown[])=>drawing.draw(...args)}));
vi.mock('../../src/presentation/shotAnimation',async original=>({...await original<object>(),loadShotAnimation:()=>drawing.load()}));
const assets={timeline:{outcomes:{great:{frames:[{endMs:3430,radius:10,x:360,y:500,alpha:1,rotation:0,netHeight:71}]}}},images:{}};
let root:ReturnType<typeof createRoot>,pending:Map<number,FrameRequestCallback>,next:number,width:number;
beforeEach(()=>{
 vi.useFakeTimers();next=0;width=390;pending=new Map();drawing.draw.mockClear();drawing.load.mockReset();
 vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{pending.set(++next,callback);return next;});
 vi.stubGlobal('cancelAnimationFrame',(id:number)=>pending.delete(id));
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({} as CanvasRenderingContext2D);
 vi.spyOn(HTMLCanvasElement.prototype,'getBoundingClientRect').mockImplementation(()=>({width,height:width?340:0} as DOMRect));
 root=createRoot(document.getElementById('root')!);
});
afterEach(()=>{act(()=>root.unmount());expect(pending.size).toBe(0);vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const render=()=>act(async()=>root.render(<ShotScene feedback={null} shots={[]} hot={false} busy={false} onFinish={()=>{}}/>));
const frame=()=>act(async()=>{const callbacks=[...pending.values()];pending.clear();callbacks.forEach(callback=>callback(performance.now()));});

it('keeps a complete local fallback and real backdrop until the first canvas paint, without a shot',async()=>{
 let resolve!:(value:typeof assets)=>void;drawing.load.mockReturnValue(new Promise(done=>{resolve=done;}));
 await render();
 expect(document.querySelector('svg.front-shot-backdrop')).not.toBeNull();
 expect(document.querySelector('img.front-shot-backdrop')).not.toBeNull();
 const canvas=document.querySelector('canvas')!;expect(canvas.style.opacity).toBe('0');
 await act(async()=>resolve(assets));
 expect(canvas.style.opacity).toBe('0');expect(drawing.draw).not.toHaveBeenCalled();
 await frame();
 expect(drawing.draw).toHaveBeenCalledOnce();expect(canvas.style.opacity).toBe('1');
 expect(drawing.draw.mock.calls[0].slice(4,6)).toEqual([390,340]);
 expect(document.querySelector('img.front-shot-backdrop')).not.toBeNull();
 expect(pending.size).toBe(0);
});

it('recovers an initial zero-size WebView layout without ResizeObserver or user interaction',async()=>{
 width=0;drawing.load.mockResolvedValue(assets);vi.stubGlobal('ResizeObserver',undefined);
 await render();await frame();
 expect(drawing.draw).not.toHaveBeenCalled();expect(document.querySelector('canvas')!.style.opacity).toBe('0');
 width=390;await act(async()=>vi.advanceTimersByTimeAsync(100));await frame();
 expect(drawing.draw).toHaveBeenCalledOnce();expect(document.querySelector('canvas')!.style.opacity).toBe('1');
 expect(pending.size).toBe(0);
});

it('repaints an idle scene after WebView page restoration and canvas context restoration',async()=>{
 drawing.load.mockResolvedValue(assets);await render();await frame();await frame();
 expect(drawing.draw).toHaveBeenCalledOnce();
 await act(async()=>window.dispatchEvent(new Event('pageshow')));expect(pending.size).toBe(1);await frame();
 expect(drawing.draw).toHaveBeenCalledTimes(2);
 await act(async()=>document.querySelector('canvas')!.dispatchEvent(new Event('contextrestored')));await frame();
 expect(drawing.draw).toHaveBeenCalledTimes(3);expect(pending.size).toBe(0);
});
