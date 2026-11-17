import {afterEach,it,expect,vi} from 'vitest';
vi.mock('../data/runtime-assets.json',()=>({default:{entries:[{path:'art/shot/ball.png',local:false},{path:'art/home/background-b-portrait.webp',local:true},{path:'art/shot/player-data.json',local:true},{path:'art/products/relic_002.png',local:false},{path:'art/products/relic_001.png',local:false},{path:'art/career/album.png',local:true},{path:'art/poster-portraits/beverley.png',local:true},{path:'art/consumables/drink.png',local:true}]}}));
vi.mock('../../public/config/assets.json',()=>({default:{urls:{'art/shot/ball.png':'https://i1.hoopchina.com.cn/test.png','art/products/relic_002.png':'https://i1.hoopchina.com.cn/current.png','art/products/relic_001.png':'https://i1.hoopchina.com.cn/unused.png'}}}));
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.resetModules();});
it('loads production images without fetch and skips packaged JSON',async()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);vi.stubGlobal('location',{href:'https://activity.hupu.com/game/',origin:'https://activity.hupu.com'});
 vi.stubGlobal('document',{fonts:{ready:Promise.resolve()},documentElement:{style:{setProperty:vi.fn()}}});
 vi.stubGlobal('Image',class{onload=()=>{};decode=async()=>{};set src(_value:string){queueMicrotask(()=>this.onload());}});
 const {preloadProductionAssets}=await import('./productionAssets');const done=new Set<string>();await preloadProductionAssets(done,()=>{});
 expect([...done].sort()).toEqual(['art/career/album.png','art/home/background-b-portrait.webp','art/poster-portraits/beverley.png','art/products/relic_002.png','art/shot/ball.png','art/shot/player-data.json']);expect(fetch).not.toHaveBeenCalled();
});
it.each(['https://activity.hupu.com/','https://activity.hupu.com/games/trainer/index.html'])('keeps the B cover background at the same URL in images and extracted CSS under %s',async href=>{
 vi.stubEnv('BASE_URL','./');vi.stubGlobal('location',{href,origin:new URL(href).origin});
 const setProperty=vi.fn(),images:string[]=[];
 vi.stubGlobal('document',{fonts:{ready:Promise.resolve()},documentElement:{style:{setProperty}}});
 vi.stubGlobal('Image',class{onload=()=>{};decode=async()=>{};set src(value:string){images.push(new URL(value,href).href);queueMicrotask(()=>this.onload());}});
 const {preloadProductionAssets}=await import('./productionAssets');await preloadProductionAssets(new Set(),()=>{});
 const cssValue=setProperty.mock.calls.find(([name])=>name==='--asset-art-home-background-b-portrait-webp')?.[1] as string;
 const backgroundUrl=new URL('./art/home/background-b-portrait.webp',href).href;
 const cssUrl=cssValue.match(/^url\("(.+)"\)$/)?.[1];expect(cssUrl).toBeDefined();
 // A deployed stylesheet lives one directory deeper than index.html.
 expect(new URL(cssUrl!,new URL('./assets/index.css',href)).href).toBe(backgroundUrl);
 expect(images).toContain(backgroundUrl);
});
it('failed image remains retryable without marking it loaded',async()=>{
 vi.stubGlobal('location',{href:'https://activity.hupu.com/game/',origin:'https://activity.hupu.com'});
 vi.stubGlobal('document',{fonts:{ready:Promise.resolve()},documentElement:{style:{setProperty:vi.fn()}}});
 const images:string[]=[];vi.stubGlobal('Image',class{onerror=()=>{};set src(value:string){images.push(value);queueMicrotask(()=>this.onerror());}});
 const {preloadProductionAssets}=await import('./productionAssets');const done=new Set<string>();await expect(preloadProductionAssets(done,()=>{})).rejects.toThrow();expect(done.has('art/shot/ball.png')).toBe(false);
 expect(images.some(url=>url.includes('/career/')||url.includes('/poster-portraits/')||url.includes('/current.png'))).toBe(false);
});
it('skips unused original shop art and disabled consumables while warming the current catalog',async()=>{
 vi.stubGlobal('location',{href:'https://activity.hupu.com/game/',origin:'https://activity.hupu.com'});
 vi.stubGlobal('document',{fonts:{ready:Promise.resolve()},documentElement:{style:{setProperty:vi.fn()}}});
 const images:string[]=[];
 vi.stubGlobal('Image',class{onload=()=>{};decode=async()=>{};set src(value:string){images.push(value);if(!value.includes('unused'))queueMicrotask(()=>this.onload());}});
 const {preloadProductionAssets}=await import('./productionAssets'),done=new Set<string>();await preloadProductionAssets(done,()=>{});
 expect(images.some(url=>url.includes('unused')||url.includes('/consumables/'))).toBe(false);expect(done.has('art/products/relic_001.png')).toBe(false);
 expect(images).toContain('https://i1.hoopchina.com.cn/current.png');expect(done.has('art/products/relic_002.png')).toBe(true);
 expect((await import('./assetUrls')).assetUrl('art/products/relic_001.png')).toBe('https://i1.hoopchina.com.cn/unused.png');
});
it('waits for a portrait decode before marking it usable or starting lower-priority career images',async()=>{
 vi.stubGlobal('location',{href:'https://activity.hupu.com/game/',origin:'https://activity.hupu.com'});
 vi.stubGlobal('document',{fonts:{ready:Promise.resolve()},documentElement:{style:{setProperty:vi.fn()}}});
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;}),images:string[]=[];
 vi.stubGlobal('Image',class{onload=()=>{};url='';decode=()=>this.url.includes('beverley')?held:Promise.resolve();set src(value:string){this.url=value;images.push(value);queueMicrotask(()=>this.onload());}});
 const {preloadProductionAssets}=await import('./productionAssets'),done=new Set<string>();let ready=false;
 const pending=preloadProductionAssets(done,()=>{}).then(()=>{ready=true;});
 await vi.waitFor(()=>expect(images.some(url=>url.includes('beverley'))).toBe(true));
 expect(ready).toBe(false);expect(done.has('art/poster-portraits/beverley.png')).toBe(false);
 expect(images.some(url=>url.includes('/career/'))).toBe(false);
 release();await pending;expect(ready).toBe(true);expect(done.has('art/poster-portraits/beverley.png')).toBe(true);
});
