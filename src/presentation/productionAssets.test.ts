import {afterEach,it,expect,vi} from 'vitest';
vi.mock('../data/runtime-assets.json',()=>({default:{entries:[{path:'art/shot/ball.png',local:false},{path:'art/home/continue-frame.svg',local:true},{path:'art/shot/player-data.json',local:true},{path:'art/products/relic_001.png',local:false}]}}));
vi.mock('../../public/config/assets.json',()=>({default:{urls:{'art/shot/ball.png':'https://i1.hoopchina.com.cn/test.png','art/products/relic_001.png':'https://i1.hoopchina.com.cn/deferred.png'}}}));
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.resetModules();});
it('loads production images without fetch and skips packaged JSON',async()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);vi.stubGlobal('location',{href:'https://activity.hupu.com/game/',origin:'https://activity.hupu.com'});
 vi.stubGlobal('document',{fonts:{ready:Promise.resolve()},documentElement:{style:{setProperty:vi.fn()}}});
 vi.stubGlobal('Image',class{onload=()=>{};decode=async()=>{};set src(_value:string){queueMicrotask(()=>this.onload());}});
 const {preloadProductionAssets}=await import('./productionAssets');const done=new Set<string>();await preloadProductionAssets(done,()=>{});
 expect([...done].sort()).toEqual(['art/home/continue-frame.svg','art/shot/ball.png','art/shot/player-data.json']);expect(fetch).not.toHaveBeenCalled();
});
it.each(['https://activity.hupu.com/','https://activity.hupu.com/games/trainer/index.html'])('keeps the continue-button frame at the same URL in images and extracted CSS under %s',async href=>{
 vi.stubEnv('BASE_URL','./');vi.stubGlobal('location',{href,origin:new URL(href).origin});
 const setProperty=vi.fn(),images:string[]=[];
 vi.stubGlobal('document',{fonts:{ready:Promise.resolve()},documentElement:{style:{setProperty}}});
 vi.stubGlobal('Image',class{onload=()=>{};decode=async()=>{};set src(value:string){images.push(new URL(value,href).href);queueMicrotask(()=>this.onload());}});
 const {preloadProductionAssets}=await import('./productionAssets');await preloadProductionAssets(new Set(),()=>{});
 const cssValue=setProperty.mock.calls.find(([name])=>name==='--asset-art-home-continue-frame-svg')?.[1] as string;
 const frameUrl=new URL('./art/home/continue-frame.svg',href).href;
 const cssUrl=cssValue.match(/^url\("(.+)"\)$/)?.[1];expect(cssUrl).toBeDefined();
 // A deployed stylesheet lives one directory deeper than index.html.
 expect(new URL(cssUrl!,new URL('./assets/index.css',href)).href).toBe(frameUrl);
 expect(images).toContain(frameUrl);
});
it('failed image remains retryable without marking it loaded',async()=>{
 vi.stubGlobal('location',{href:'https://activity.hupu.com/game/',origin:'https://activity.hupu.com'});
 vi.stubGlobal('document',{fonts:{ready:Promise.resolve()},documentElement:{style:{setProperty:vi.fn()}}});
 vi.stubGlobal('Image',class{onerror=()=>{};set src(_value:string){queueMicrotask(()=>this.onerror());}});
 const {preloadProductionAssets}=await import('./productionAssets');const done=new Set<string>();await expect(preloadProductionAssets(done,()=>{})).rejects.toThrow();expect(done.has('art/shot/ball.png')).toBe(false);
});
it('does not fetch or wait for deferred shop artwork, but keeps its URL usable on demand',async()=>{
 vi.stubGlobal('location',{href:'https://activity.hupu.com/game/',origin:'https://activity.hupu.com'});
 vi.stubGlobal('document',{fonts:{ready:Promise.resolve()},documentElement:{style:{setProperty:vi.fn()}}});
 const images:string[]=[];
 vi.stubGlobal('Image',class{onload=()=>{};decode=async()=>{};set src(value:string){images.push(value);if(!value.includes('deferred'))queueMicrotask(()=>this.onload());}});
 const {preloadProductionAssets}=await import('./productionAssets'),done=new Set<string>();await preloadProductionAssets(done,()=>{});
 expect(images.some(url=>url.includes('deferred'))).toBe(false);expect(done.has('art/products/relic_001.png')).toBe(false);
 expect((await import('./assetUrls')).assetUrl('art/products/relic_001.png')).toBe('https://i1.hoopchina.com.cn/deferred.png');
});
