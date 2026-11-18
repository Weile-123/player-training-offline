import {afterEach,expect,it,vi} from 'vitest';

afterEach(()=>{vi.unstubAllEnvs();vi.doUnmock('./audio');vi.doUnmock('./productionAssets');vi.resetModules();});

it('starts audio preparation before production image loading without waiting for optional audio',async()=>{
 vi.resetModules();vi.stubEnv('PROD',true);
 const order:string[]=[];
 const preload=vi.fn(()=>{order.push('audio');return new Promise<boolean>(()=>{});});
 const images=vi.fn(async()=>{order.push('production-images');});
 vi.doMock('./audio',()=>({gameAudio:{preload}}));
 vi.doMock('./productionAssets',()=>({preloadProductionAssets:images}));
 const startup=await import('./preloadAssets');
 await startup.preloadAssets();
 expect(order).toEqual(['audio','production-images']);
 expect(images).toHaveBeenCalledOnce();
 expect(startup.finishLoading()).toBe(true);
});
