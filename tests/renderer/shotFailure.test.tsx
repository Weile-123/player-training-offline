import {afterEach,it,expect,vi} from 'vitest';
import {createRoot} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {ShotScene} from '../../src/components/ShotScene';
vi.mock('../../src/presentation/shotAnimation',()=>({
 loadShotAnimation:async()=>({timeline:{outcomes:{great:{frames:[{}]}}},images:{}}),
 ConcurrentShots:class{sync(){}step(){return {frames:[],finished:[]};}},
 shotPlayback:{duration:3430,ballScale:1},shotArt:(file:string)=>'/'+file,
}));
vi.mock('../../src/presentation/shotRenderer.js',()=>({drawMultiScene:()=>{throw Error('Canvas unavailable');}}));
let root:ReturnType<typeof createRoot>;
afterEach(()=>{if(root)act(()=>root.unmount());vi.restoreAllMocks();});
it('reports a canvas rendering failure through the completion callback instead of leaving a severe shot locked',async()=>{
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({} as CanvasRenderingContext2D);
 vi.spyOn(HTMLCanvasElement.prototype,'getBoundingClientRect').mockReturnValue({width:390,height:340} as DOMRect);
 const finish=vi.fn();root=createRoot(document.getElementById('root')!);
 await act(async()=>root.render(<ShotScene feedback={null} shots={[]} hot={false} busy={false} onFinish={finish}/>));
 await vi.waitFor(async()=>{
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
  expect(finish).toHaveBeenCalledOnce();
 });
 expect(document.querySelector('.shot-load-status')?.textContent).toContain('动画暂不可用');
});
