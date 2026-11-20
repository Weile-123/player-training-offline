import config from '../../public/config/assets.json';
import animation from '../../public/config/animation.json';
import manifest from '../data/runtime-assets.json';
import {assetSource,configureAssets,hasAsset,rememberAssetUrl} from './assetUrls';
import {applyAnimationConfig} from './animationConfig';
import {otherHomeBackground,selectStartupAssets} from './startupAssets';

async function loadImage(path:string,local:boolean){
 const url=new URL(assetSource(path,local),location.href);
 if(url.origin!==location.origin&&!['hupu.com','hoopchina.com.cn','static.cloudbase.net'].some(domain=>url.hostname===domain||url.hostname.endsWith('.'+domain)))throw Error('资源域名不允许');
 await new Promise<void>((resolve,reject)=>{
  const img=new Image(),timer=setTimeout(()=>{img.src='';reject(Error('图片加载超时'));},45000);
  img.onload=()=>{void Promise.resolve().then(()=>img.decode?.()).then(()=>{clearTimeout(timer);resolve();},error=>{clearTimeout(timer);reject(error);});};
  img.onerror=()=>{clearTimeout(timer);reject(Error('图片加载失败'));};
  img.src=url.href;
 });
 return url.href;
}

/** Images use the browser's normal image cache; packaged JSON needs no HTTP API. */
export async function preloadProductionAssets(done:Set<string>,report:()=>void,entries=selectStartupAssets(manifest.entries)){
 configureAssets(config);applyAnimationConfig(animation);
 const failed:string[]=[];
 let next=0;
 await Promise.all(Array.from({length:4},async()=>{
  while(next<entries.length&&!failed.length){
   const asset=entries[next++];
   if(hasAsset(asset.path)||asset.path.endsWith('.json')){done.add(asset.path);report();continue;}
   try{
    const resolved=await loadImage(asset.path,asset.local).catch(error=>{
     const alternate=otherHomeBackground(asset.path);
     if(!alternate)throw error;
     return loadImage(alternate,true);
    });
    // CSS lives under assets/: relative custom-property URLs would resolve there,
    // unlike Image.src, and silently lose local frames/backgrounds after deployment.
    rememberAssetUrl(asset.path,resolved);done.add(asset.path);report();
   }catch{failed.push(asset.path);}
  }
 }));
 if(failed.length)throw Error(`${failed.length} 项资源未能加载，请检查网络后重试；已加载资源会保留。`);
 await document.fonts?.ready;
}
