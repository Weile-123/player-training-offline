import manifest from '../data/runtime-assets.json';
import {assetSource,configureAssets,hasAsset,localAsset,rememberAsset,rememberAssetUrl,type AssetConfig} from './assetUrls';
import {applyAnimationConfig} from './animationConfig';
import {preloadProductionAssets} from './productionAssets';
import {selectStartupAssets,startupAssetBatches} from './startupAssets';
import {gameAudio} from './audio';

export type LoadingProgress={percent:number;completed:number;total:number;error:string};
const entries=selectStartupAssets(manifest.entries);
const total=entries.reduce((sum,a)=>sum+a.bytes,0),listeners=new Set<(p:LoadingProgress)=>void>();
let progress:LoadingProgress={percent:0,completed:0,total:entries.length,error:''},task:Promise<void>|null=null;
let assetsReady=false;
const done=new Set<string>();
const report=(error='')=>{const bytes=entries.reduce((sum,a)=>sum+(done.has(a.path)?a.bytes:0),0);progress={percent:total?Math.min(99,Math.floor(bytes/total*100)):99,completed:done.size,total:entries.length,error};listeners.forEach(l=>l(progress));};
export function subscribeLoading(listener:(p:LoadingProgress)=>void){listeners.add(listener);listener(progress);return()=>{listeners.delete(listener)};}
async function request(url:string){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);try{const r=await fetch(url,{signal:controller.signal,referrerPolicy:'no-referrer'});if(!r.ok)throw Error(`HTTP ${r.status}`);return await r.blob()}finally{clearTimeout(timer)}}
async function json(url:string){return JSON.parse(await(await request(url)).text()) as unknown;}
async function validate(blob:Blob,path:string){
 if(path.endsWith('.json')){const data=JSON.parse(await blob.text());if(path.endsWith('player-data.json')&&(!data.outcomes||!data.outcomes.great?.frames?.length))throw Error('动画数据不完整');return;}
 const url=URL.createObjectURL(blob);
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const img=new Image();img.src=url;
  await Promise.race([img.decode(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('图片解码超时')),45000);})]);
  return url;
 }catch(error){URL.revokeObjectURL(url);throw error;}finally{clearTimeout(timer);}
}
/** Count validated, usable assets. Persistent caching is optional in mobile WebViews. */
export function preloadAssets(){
 if(task)return task;
 // Audio preparation is optional and parallel: missing audio never blocks entry.
 void gameAudio.preload();
 report();
 task=(async()=>{
  if(import.meta.env.PROD)return preloadProductionAssets(done,report);
  const config=await json(localAsset('config/assets.json')) as AssetConfig;
  configureAssets(config);
  const base=config.baseUrl?.trim()??'';
  if(base&&!/^https?:\/\//.test(base))throw Error('资源地址配置不正确');
  let cache:Cache|undefined;
  try{if('caches' in window)cache=await caches.open('player-training-assets-v1')}catch{/* WebViews may only allow the in-memory cache. */}
  const failures:string[]=[];
  for(const batch of startupAssetBatches(entries)){
  let next=0;
  await Promise.all(Array.from({length:4},async()=>{
   while(next<batch.length&&!failures.length){const asset=batch[next++];if(hasAsset(asset.path)){done.add(asset.path);report();continue;}
    const source=new URL(assetSource(asset.path,asset.local),location.href).href;
    const cacheUrl=new URL(source);cacheUrl.searchParams.set('v',asset.hash);const key=cacheUrl.href;
    try{
     let blob:Blob|undefined,decodedUrl:string|undefined;
     try{
      const cached=await cache?.match(key);
      if(cached){try{const saved=await cached.blob();decodedUrl=await validate(saved,asset.path);blob=saved;}catch{await cache?.delete(key);}}
     }catch{cache=undefined; /* Security/quota/cache failures must not block a network load. */}
     if(!blob){
      blob=await request(source);decodedUrl=await validate(blob,asset.path);
      try{await cache?.put(key,new Response(blob));}catch{cache=undefined;}
     }
     // Reuse the exact decoded URL in DOM/canvas/CSS. Re-creating blob URLs and
     // decoding all local images again at the end causes a mobile decode spike.
     if(decodedUrl)rememberAssetUrl(asset.path,decodedUrl);else rememberAsset(asset.path,blob);
     done.add(asset.path);report();
    }catch{failures.push(asset.path);}
   }
  }));
  if(failures.length)break;
  }
  if(failures.length)throw Error(`${failures.length} 项资源未能加载，请检查网络后重试；已加载资源会保留。`);
  const animation=await json(localAsset('config/animation.json'));if(!applyAnimationConfig(animation))throw Error('动画配置加载失败，请重试。');
  await document.fonts.ready;
 })().then(()=>{assetsReady=true;}).catch(error=>{assetsReady=false;report(error instanceof Error?error.message:'加载失败，请重试。');task=null;throw error;});
 return task;
}
export function finishLoading(){if(!assetsReady)return false;progress={...progress,percent:100,error:''};listeners.forEach(l=>l(progress));return true;}
