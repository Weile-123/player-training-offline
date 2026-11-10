import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const entries=[{path:'art/home/title-comic.png',bytes:20,hash:'a',local:true},{path:'art/shot/ball.png',bytes:30,hash:'b',local:false},{path:'art/shot/player-data.json',bytes:50,hash:'c',local:false}];
let saved:Map<string,Response>,fetcher:ReturnType<typeof vi.fn>,cache:{match:ReturnType<typeof vi.fn>;put:ReturnType<typeof vi.fn>;delete:ReturnType<typeof vi.fn>};
beforeEach(()=>{
 vi.resetModules();vi.doMock('../data/runtime-assets.json',()=>({default:{entries}}));
 saved=new Map();cache={match:vi.fn(async(key:string)=>saved.get(key)?.clone()),put:vi.fn(async(key:string,r:Response)=>{saved.set(key,r.clone())}),delete:vi.fn(async(key:string)=>saved.delete(key))};
 vi.stubGlobal('window',{caches:{}});vi.stubGlobal('caches',{open:vi.fn(async()=>cache)});vi.stubGlobal('location',{href:'https://game.test/app/'});
 vi.stubGlobal('document',{documentElement:{style:{setProperty:vi.fn()}},fonts:{ready:Promise.resolve()}});
 vi.stubGlobal('Image',class{src='';decode=vi.fn(async()=>{})});
 fetcher=vi.fn(async(url:string)=>new Response(url.endsWith('config/assets.json')?JSON.stringify({baseUrl:'https://cdn.test/game/'}):url.endsWith('config/animation.json')?JSON.stringify({shotAnimationDurationSeconds:1,gameMaxWidthPx:640,hoopScale:1,shootButtonScale:1}):url.includes('player-data.json')?JSON.stringify({outcomes:{great:{frames:[{}]}}}):'picture'));
 vi.stubGlobal('fetch',fetcher);
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();vi.doUnmock('../data/runtime-assets.json')});
it('资源校验可用后累计进度，资源全部完成仍等待首页初始化确认100%',async()=>{
 const api=await import('./preloadAssets'),seen:number[]=[];api.subscribeLoading(p=>seen.push(p.percent));
 await api.preloadAssets();expect(cache.put).toHaveBeenCalledTimes(3);expect(Math.max(...seen)).toBe(99);
 expect(fetcher.mock.calls.some(([url])=>url==='https://cdn.test/game/art/shot/ball.png')).toBe(true);
 expect(fetcher.mock.calls.some(([url])=>url===new URL(import.meta.env.BASE_URL+'art/home/title-comic.png','https://game.test/app/').href)).toBe(true);
 api.finishLoading();expect(seen[seen.length-1]).toBe(100);
});
it('失败不能到100%，重试只重新请求失败资源，成功资源复用',async()=>{
 const original=fetcher.getMockImplementation() as (url:string)=>Promise<Response>;let broken=true;fetcher.mockImplementation(async url=>{if(url.includes('art/shot/ball.png')&&broken)throw Error('offline');return original(url)});
 const api=await import('./preloadAssets'),seen:number[]=[];api.subscribeLoading(p=>seen.push(p.percent));
 await expect(api.preloadAssets()).rejects.toThrow('1 项资源');expect(Math.max(...seen)).toBeLessThan(100);broken=false;
 await api.preloadAssets();expect(fetcher.mock.calls.filter(([url])=>url.includes('art/home/title-comic.png'))).toHaveLength(1);expect(fetcher.mock.calls.filter(([url])=>url.includes('art/shot/ball.png'))).toHaveLength(2);
});
it('按已完成资源体积增长，慢图片完成前持续等待，之后复用本地Blob',async()=>{
 const original=fetcher.getMockImplementation() as (url:string)=>Promise<Response>;
 let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve});
 fetcher.mockImplementation(async url=>{if(url.includes('art/shot/ball.png'))await held;return original(url)});
 const api=await import('./preloadAssets'),seen:number[]=[];api.subscribeLoading(p=>seen.push(p.percent));
 let ready=false;const pending=api.preloadAssets().then(()=>{ready=true});
 await vi.waitFor(()=>expect(cache.put).toHaveBeenCalledTimes(2));
 expect(seen[seen.length-1]).toBe(70);expect(ready).toBe(false);
 release();await pending;
 expect(seen[seen.length-1]).toBe(99);
 const {assetUrl}=await import('./assetUrls');
 expect(assetUrl('art/shot/ball.png')).toMatch(/^blob:/);
 const requests=fetcher.mock.calls.length;
 await api.preloadAssets();assetUrl('art/shot/ball.png');
 expect(fetcher).toHaveBeenCalledTimes(requests);
});
it('损坏的缓存会删除并重新下载，不会跳过校验进入首页',async()=>{
 saved.set('https://cdn.test/game/art/shot/player-data.json?v=c',new Response('{broken'));
 const api=await import('./preloadAssets');await api.preloadAssets();expect(cache.delete).toHaveBeenCalledWith('https://cdn.test/game/art/shot/player-data.json?v=c');
 expect(JSON.parse(await saved.get('https://cdn.test/game/art/shot/player-data.json?v=c')!.text()).outcomes.great.frames).toHaveLength(1);
});

it('逐文件CDN映射优先，保留本地资源且不修改下载URL，所有请求禁用referrer',async()=>{
 const original=fetcher.getMockImplementation() as (url:string)=>Promise<Response>;
 const remote='https://i2.hoopchina.com.cn/shaper-img/test.png?token=keep';
 fetcher.mockImplementation(async url=>url.endsWith('config/assets.json')?new Response(JSON.stringify({baseUrl:'https://unused.test/',urls:{'art/home/title-comic.png':remote,'art/shot/ball.png':remote}})):original(url));
 const api=await import('./preloadAssets');await api.preloadAssets();
 expect(fetcher.mock.calls.some(([url])=>url===remote)).toBe(true);
 expect(fetcher.mock.calls.filter(([url])=>url===remote)).toHaveLength(1);
 expect(cache.put.mock.calls.some(([key])=>key===remote+'&v=b')).toBe(true);
 for(const call of fetcher.mock.calls)expect(call[1]).toMatchObject({referrerPolicy:'no-referrer'});
 const {assetSource}=await import('./assetUrls');expect(assetSource('art/home/title-comic.png')).not.toBe(remote);
});

it.each(['open','match','put'])('缓存 %s 被禁用或空间耗尽时，仍可完成加载并复用内存资源',async(kind)=>{
 const failure=new DOMException('storage unavailable',kind==='put'?'QuotaExceededError':'SecurityError');
 if(kind==='open')vi.mocked(caches.open).mockRejectedValue(failure);
 else cache[kind as 'match'|'put'].mockRejectedValue(failure);
 const api=await import('./preloadAssets');await api.preloadAssets();
 const {hasAsset}=await import('./assetUrls');
 for(const entry of entries)expect(hasAsset(entry.path)).toBe(true);
 const calls=fetcher.mock.calls.length;await api.preloadAssets();expect(fetcher.mock.calls.length).toBe(calls);
});
it('损坏缓存连删除也失败时，仍重新下载有效资源',async()=>{
 saved.set('https://cdn.test/game/art/shot/player-data.json?v=c',new Response('{broken'));
 cache.delete.mockRejectedValue(new DOMException('blocked','SecurityError'));
 const api=await import('./preloadAssets');await api.preloadAssets();
 expect(fetcher.mock.calls.filter(([url])=>url.includes('player-data.json'))).toHaveLength(1);
 expect((await import('./assetUrls')).hasAsset(entries[2].path)).toBe(true);
});
it('HTTP错误可重试且成功的资源不重复下载',async()=>{
 const original=fetcher.getMockImplementation() as (url:string)=>Promise<Response>;
 let failed=true;fetcher.mockImplementation(async url=>url.includes('art/shot/ball.png')&&failed?new Response('unavailable',{status:503}):original(url));
 const api=await import('./preloadAssets');await expect(api.preloadAssets()).rejects.toThrow('1 项资源');
 failed=false;await api.preloadAssets();
 expect(fetcher.mock.calls.filter(([url])=>url.includes('art/home/title-comic.png'))).toHaveLength(1);
 expect(fetcher.mock.calls.filter(([url])=>url.includes('art/shot/ball.png'))).toHaveLength(2);
});
it('弱网45秒超时会中止请求，恢复后只重试失败资源',async()=>{
 vi.useFakeTimers();
 const original=fetcher.getMockImplementation() as (url:string)=>Promise<Response>;
 let slow=true;fetcher.mockImplementation((url,options)=>url.includes('art/shot/ball.png')&&slow?
 new Promise<Response>((_,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('timeout','AbortError')))):original(url));
 const api=await import('./preloadAssets');const result=api.preloadAssets().catch(error=>error);
 await vi.advanceTimersByTimeAsync(45000);expect(await result).toBeInstanceOf(Error);
 slow=false;await api.preloadAssets();
 expect(fetcher.mock.calls.filter(([url])=>url.includes('art/home/title-comic.png'))).toHaveLength(1);
 expect(fetcher.mock.calls.filter(([url])=>url.includes('art/shot/ball.png'))).toHaveLength(2);
 expect(vi.getTimerCount()).toBe(0);
});
it('网络返回损坏图片时不能假装成功，修复后可重试',async()=>{
 let broken=true;vi.stubGlobal('Image',class{src='';decode=async()=>{if(broken)throw Error('invalid image')}});
 const api=await import('./preloadAssets');await expect(api.preloadAssets()).rejects.toThrow('2 项资源');
 broken=false;await api.preloadAssets();expect((await import('./assetUrls')).hasAsset('art/shot/ball.png')).toBe(true);
});
it('慢网不使用虚假进度且下载并发上限为4',async()=>{
 vi.useFakeTimers();
 vi.doMock('../data/runtime-assets.json',()=>({default:{entries:Array.from({length:12},(_,i)=>({path:'art/home/'+i+'.png',bytes:10,hash:String(i),local:false}))}}));
 const original=fetcher.getMockImplementation() as (url:string)=>Promise<Response>;
 let active=0,maxActive=0;
 fetcher.mockImplementation(async url=>{
  if(!url.includes('/art/'))return original(url);
  active++;maxActive=Math.max(maxActive,active);
  await new Promise(resolve=>setTimeout(resolve,2000));active--;return original(url);
 });
 const api=await import('./preloadAssets');let progress=0;api.subscribeLoading(p=>{progress=p.percent;});
 const pending=api.preloadAssets();await vi.advanceTimersByTimeAsync(1999);expect(progress).toBe(0);
 await vi.advanceTimersByTimeAsync(1);expect(progress).toBe(33);
 await vi.advanceTimersByTimeAsync(4000);await pending;
 expect(progress).toBe(99);expect(maxActive).toBe(4);expect(vi.getTimerCount()).toBe(0);
});
it('动画配置断网重试不会重新下载已经完成的全部图片',async()=>{
 const original=fetcher.getMockImplementation() as (url:string)=>Promise<Response>;
 let failed=true;fetcher.mockImplementation(async url=>{if(url.endsWith('config/animation.json')&&failed)throw Error('offline');return original(url)});
 const api=await import('./preloadAssets');await expect(api.preloadAssets()).rejects.toThrow('offline');
 failed=false;await api.preloadAssets();
 expect(fetcher.mock.calls.filter(([url])=>url.includes('art/home/title-comic.png'))).toHaveLength(1);
});
it('延后加载的商店图片不参与启动下载和进度分母，打开功能时仍能获得原地址',async()=>{
 vi.doMock('../data/runtime-assets.json',()=>({default:{entries:[...entries,{path:'art/products/relic_001.png',bytes:60_000_000,hash:'deferred',local:false}]}}));
 const api=await import('./preloadAssets');let last={percent:0,completed:0,total:0,error:''};api.subscribeLoading(p=>{last=p;});
 await api.preloadAssets();expect(last).toMatchObject({percent:99,completed:3,total:3,error:''});
 expect(fetcher.mock.calls.some(([url])=>url.includes('relic_001'))).toBe(false);
 expect((await import('./assetUrls')).assetUrl('art/products/relic_001.png')).toBe('https://cdn.test/game/art/products/relic_001.png');
 api.finishLoading();expect(last.percent).toBe(100);
});
