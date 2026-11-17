import {afterEach,it,expect,vi} from 'vitest';
import timeline from '../../public/art/shot/player-data.json';

afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();vi.useRealTimers();});
it('does not expose image assets to the idle canvas until every bitmap is decoded',async()=>{
 vi.resetModules();
 const decoded:(()=>void)[]=[];
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>timeline})));
 vi.stubGlobal('Image',class {
  onload=()=>{};onerror=()=>{};
  decode=vi.fn(()=>new Promise<void>(resolve=>decoded.push(resolve)));
  set src(_value:string){queueMicrotask(()=>this.onload());}
 });
 const {loadShotAnimation}=await import('./shotAnimation');
 let ready=false;const load=loadShotAnimation().then(result=>{ready=true;return result;});
 await Promise.resolve();await Promise.resolve();
 expect(decoded).toHaveLength(4);expect(ready).toBe(false);
 decoded.slice(0,3).forEach(resolve=>resolve());await Promise.resolve();expect(ready).toBe(false);
 decoded[3]();expect((await load).images.court).toBeDefined();expect(ready).toBe(true);
});
