import {afterEach,expect,it,vi} from 'vitest';

afterEach(()=>{vi.unstubAllEnvs();vi.doUnmock('./audio');vi.doUnmock('./productionAssets');vi.resetModules();});

it('starts optional audio while production images are still loading and never gates readiness on it',async()=>{
 vi.resetModules();vi.stubEnv('PROD',true);
 const order:string[]=[];
 const preload=vi.fn(()=>{order.push('audio');return new Promise<boolean>(()=>{});});
 let release!:()=>void;
 const images=vi.fn(()=>{order.push('production-images');return new Promise<void>(resolve=>{release=resolve;});});
 vi.doMock('./audio',()=>({gameAudio:{preload}}));
 vi.doMock('./productionAssets',()=>({preloadProductionAssets:images}));
 const startup=await import('./preloadAssets');
 const ready=startup.preloadAssets();
 await vi.waitFor(()=>expect(order).toEqual(['production-images','audio']));
 expect(startup.finishLoading()).toBe(false);
 release();await ready;
 expect(images).toHaveBeenCalledOnce();
 expect(startup.finishLoading()).toBe(true);
});
