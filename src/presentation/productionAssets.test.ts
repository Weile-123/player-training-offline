import {afterEach,it,expect,vi} from 'vitest';
vi.mock('../data/runtime-assets.json',()=>({default:{entries:[{path:'art/shot/ball.png',local:false},{path:'art/home/background-b-portrait.webp',local:true},{path:'art/home/background-b-landscape.webp',local:true},{path:'art/shot/player-data.json',local:true},{path:'art/products/relic_002.png',local:false},{path:'art/products/relic_001.png',local:false},{path:'art/career/album.png',local:true},{path:'art/poster-portraits/beverley.png',local:true},{path:'art/consumables/drink.png',local:true}]}}));
vi.mock('../../public/config/assets.json',()=>({default:{urls:{'art/shot/ball.png':'https://i1.hoopchina.com.cn/test.png','art/products/relic_002.png':'https://i1.hoopchina.com.cn/current.png','art/products/relic_001.png':'https://i1.hoopchina.com.cn/unused.png'}}}));
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.resetModules();});
it('loads production images without fetch and skips packaged JSON',async()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);vi.stubGlobal('location',{href:'https://activity.hupu.com/game/',origin:'https://activity.hupu.com'});
 vi.stubGlobal('document',{fonts:{ready:Promise.resolve()},documentElement:{style:{setProperty:vi.fn()}}});
 vi.stubGlobal('Image',class{onload=()=>{};decode=async()=>{};set src(_value:string){queueMicrotask(()=>this.onload());}});
 const {preloadProductionAssets}=await import('./productionAssets');const done=new Set<string>();await preloadProductionAssets(done,()=>{});
 expect([...done].sort()).toEqual(['art/home/background-b-portrait.webp','art/shot/ball.png','art/shot/player-data.json']);expect(fetch).not.toHaveBeenCalled();
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
it('does not request secondary panel art on startup and leaves its on-demand URLs intact',async()=>{
 vi.stubGlobal('location',{href:'https://activity.hupu.com/game/',origin:'https://activity.hupu.com'});
 vi.stubGlobal('document',{fonts:{ready:Promise.resolve()},documentElement:{style:{setProperty:vi.fn()}}});
 const images:string[]=[];
 vi.stubGlobal('Image',class{onload=()=>{};decode=async()=>{};set src(value:string){images.push(value);if(!value.includes('unused'))queueMicrotask(()=>this.onload());}});
 const {preloadProductionAssets}=await import('./productionAssets'),done=new Set<string>();await preloadProductionAssets(done,()=>{});
 expect(images.some(url=>/unused|current|consumables|career|beverley/.test(url))).toBe(false);
 expect(done.has('art/products/relic_002.png')).toBe(false);
 expect((await import('./assetUrls')).assetUrl('art/products/relic_002.png')).toBe('https://i1.hoopchina.com.cn/current.png');
 expect((await import('./assetUrls')).assetUrl('art/products/relic_001.png')).toBe('https://i1.hoopchina.com.cn/unused.png');
});
it('waits for the first-shot image decode before entering and leaves later artwork deferred',async()=>{
 vi.stubGlobal('location',{href:'https://activity.hupu.com/game/',origin:'https://activity.hupu.com'});
 vi.stubGlobal('document',{fonts:{ready:Promise.resolve()},documentElement:{style:{setProperty:vi.fn()}}});
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;}),images:string[]=[];
 vi.stubGlobal('Image',class{onload=()=>{};url='';decode=()=>this.url.includes('test.png')?held:Promise.resolve();set src(value:string){this.url=value;images.push(value);queueMicrotask(()=>this.onload());}});
 const {preloadProductionAssets}=await import('./productionAssets'),done=new Set<string>();let ready=false;
 const pending=preloadProductionAssets(done,()=>{}).then(()=>{ready=true;});
 await vi.waitFor(()=>expect(images.some(url=>url.includes('test.png'))).toBe(true));
 expect(ready).toBe(false);expect(done.has('art/shot/ball.png')).toBe(false);
 expect(images.some(url=>url.includes('/career/'))).toBe(false);
 release();await pending;expect(ready).toBe(true);expect(done.has('art/shot/ball.png')).toBe(true);
});

it('selects only the landscape cover in landscape and falls back to the actual portrait image when it fails',async()=>{
 const href='https://activity.hupu.com/game/';
 vi.stubEnv('BASE_URL','./');
 vi.stubGlobal('location',{href,origin:new URL(href).origin});vi.stubGlobal('matchMedia',()=>({matches:true}));
 vi.stubGlobal('document',{fonts:{ready:Promise.resolve()},documentElement:{style:{setProperty:vi.fn()}}});
 const requested:string[]=[];
 vi.stubGlobal('Image',class{onload=()=>{};onerror=()=>{};decode=async()=>{};set src(url:string){requested.push(url);queueMicrotask(()=>url.includes('landscape')?this.onerror():this.onload());}});
 const {preloadProductionAssets}=await import('./productionAssets'),done=new Set<string>();
 await preloadProductionAssets(done,()=>{});
 const landscape='art/home/background-b-landscape.webp',portrait='art/home/background-b-portrait.webp';
 expect(requested.filter(url=>url.endsWith('.webp'))).toEqual([href+landscape,href+portrait]);
 expect(done.has(landscape)).toBe(true);expect(done.has(portrait)).toBe(false);
 expect((await import('./assetUrls')).assetUrl(landscape)).toBe(href+portrait);
});

it('uses native completed image loads in WebViews without image decode or the font-set API',async()=>{
 const href='https://activity.hupu.com/game/';
 vi.stubGlobal('location',{href,origin:new URL(href).origin});
 vi.stubGlobal('document',{documentElement:{style:{setProperty:vi.fn()}}});
 vi.stubGlobal('Image',class{onload=()=>{};set src(_url:string){queueMicrotask(()=>this.onload());}});
 const {preloadProductionAssets}=await import('./productionAssets'),done=new Set<string>();
 await preloadProductionAssets(done,()=>{});
 expect(done.has('art/shot/ball.png')).toBe(true);
 expect(done.has('art/home/background-b-portrait.webp')).toBe(true);
});
