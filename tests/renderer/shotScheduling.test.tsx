import {it,expect,vi} from 'vitest';
import {createRoot} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {writeFileSync,mkdirSync} from 'node:fs';
import {ShotScene} from '../../src/components/ShotScene';
import type {ShotFeedback} from '../../src/presentation/feedback';
import {ConcurrentShots} from '../../src/presentation/shotAnimation';
const drawing=vi.hoisted(()=>({draw:vi.fn()}));
vi.mock('../../src/presentation/shotRenderer.js',async importOriginal=>({...await importOriginal<object>(),drawMultiScene:(...args:unknown[])=>drawing.draw(...args)}));
vi.mock('../../src/presentation/shotAnimation',async importOriginal=>{
 const actual=await importOriginal<object>();
 const frame={endMs:3430,radius:10,x:360,y:100,alpha:1,rotation:0,netHeight:71};
 return {...actual,loadShotAnimation:async()=>({timeline:{outcomes:{great:{frames:[frame]},success:{frames:[frame]}}},images:{}})};
});

it('parks idle animation, wakes for shots and heat, and preserves completion',async()=>{
 let now=0,next=0,callbacks=0;
 const pending=new Map<number,FrameRequestCallback>();
 vi.spyOn(performance,'now').mockImplementation(()=>now);
 vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{pending.set(++next,cb);return next;});
 vi.stubGlobal('cancelAnimationFrame',(id:number)=>pending.delete(id));
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({} as CanvasRenderingContext2D);
 const sync=vi.spyOn(ConcurrentShots.prototype,'sync'),finish=vi.fn(),root=createRoot(document.getElementById('root')!);
 const tick=async(n:number)=>{for(let i=0;i<n;i++){now+=1000/60;const work=[...pending.values()];pending.clear();callbacks+=work.length;await act(async()=>work.forEach(cb=>cb(now)));}};
 const render=async(shots:ShotFeedback[],hot=false)=>{await act(async()=>root.render(<ShotScene feedback={shots[0]??null} shots={shots} hot={hot} busy={!!shots.length} onFinish={finish}/>));};
 try{
  await render([]);await tick(60);const idleCallbacks=callbacks;
  const shot={id:1,outcome:'success'} as ShotFeedback;
  await render([shot]);await tick(220);expect(finish).toHaveBeenCalledExactlyOnceWith(1);
  await render([]);await tick(2);const resting=callbacks;await tick(60);
  const resumedIdleCallbacks=callbacks-resting;
  await render([],true);const hotStart=drawing.draw.mock.calls.length;await tick(60);
  expect(drawing.draw.mock.calls.length).toBeGreaterThan(hotStart);
  await render([],false);await tick(60);const coolCallbacks=callbacks;await tick(60);
  const cooledIdleCallbacks=callbacks-coolCallbacks;
  if(process.env.GAME_PERF_LABEL){mkdirSync('output/performance',{recursive:true});writeFileSync('output/performance/animation-'+process.env.GAME_PERF_LABEL+'.json',JSON.stringify({idleCallbacks,resumedIdleCallbacks,cooledIdleCallbacks,syncCalls:sync.mock.calls.length,completionCalls:finish.mock.calls.length}));}
  if(process.env.GAME_PERF_LABEL!=='before'){expect(idleCallbacks).toBe(1);expect(resumedIdleCallbacks).toBe(0);expect(cooledIdleCallbacks).toBe(0);}
 }finally{act(()=>root.unmount());expect(pending.size).toBe(0);vi.restoreAllMocks();vi.unstubAllGlobals();}
});
