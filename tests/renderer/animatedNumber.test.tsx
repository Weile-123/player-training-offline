import {afterEach,expect,it,vi} from 'vitest';
import {createRoot} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {AnimatedNumber} from '../../src/components/AnimatedNumber';
let root:ReturnType<typeof createRoot>;
afterEach(()=>{if(root)act(()=>root.unmount());vi.restoreAllMocks();vi.unstubAllGlobals();});
it('schedules no frame for settled numbers and preserves every displayed animation sample',()=>{
 let frame:FrameRequestCallback|undefined,now=0;
 vi.spyOn(performance,'now').mockImplementation(()=>now);
 const schedule=vi.fn((fn:FrameRequestCallback)=>{frame=fn;return 1;});
 vi.stubGlobal('requestAnimationFrame',schedule);vi.stubGlobal('cancelAnimationFrame',vi.fn());
 root=createRoot(document.getElementById('root')!);
 act(()=>root.render(<AnimatedNumber value={50}/>));expect(schedule).not.toHaveBeenCalled();
 act(()=>root.render(<AnimatedNumber value={51}/>));
 for(now=16;now<=432;now+=16){const callback=frame;frame=undefined;act(()=>callback?.(now));
  const t=Math.min(now/420,1);expect(document.querySelector('b')!.textContent).toBe((50+1-(1-t)**3).toFixed(0));
 }
 expect(frame).toBeUndefined();expect(document.querySelector('b')!.textContent).toBe('51');
 act(()=>root.render(<AnimatedNumber value={51} decimals={1}/>));
 expect(document.querySelector('b')!.textContent).toBe('51.0');expect(frame).toBeUndefined();
});
