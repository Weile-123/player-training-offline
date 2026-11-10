import config from '../../public/config/assets.json';
import animation from '../../public/config/animation.json';
import manifest from '../data/runtime-assets.json';
import {assetSource,configureAssets,hasAsset,rememberAssetUrl} from './assetUrls';
import {applyAnimationConfig} from './animationConfig';
import {selectStartupAssets} from './startupAssets';

/** Images use the browser's normal image cache; packaged JSON needs no HTTP API. */
export async function preloadProductionAssets(done:Set<string>,report:()=>void){
 configureAssets(config);applyAnimationConfig(animation);
 const entries=selectStartupAssets(manifest.entries);
 let next=0;const failed:string[]=[];
 await Promise.all(Array.from({length:4},async()=>{
  while(next<entries.length){
   const asset=entries[next++];
   if(hasAsset(asset.path)||asset.path.endsWith('.json')){done.add(asset.path);report();continue;}
   try{
    const url=assetSource(asset.path,asset.local);
    const resolved=new URL(url,location.href);
    if(resolved.origin!==location.origin&&!['hupu.com','hoopchina.com.cn','static.cloudbase.net'].some(d=>resolved.hostname===d||resolved.hostname.endsWith('.'+d)))throw Error('资源域名不允许');
    await new Promise<void>((resolve,reject)=>{
     const img=new Image(),timer=setTimeout(()=>{img.src='';reject(Error('图片加载超时'));},45000);
     img.onload=()=>{void img.decode().then(()=>{clearTimeout(timer);resolve();},e=>{clearTimeout(timer);reject(e);});};
     img.onerror=()=>{clearTimeout(timer);reject(Error('图片加载失败'));};img.src=resolved.href;
    });
    // CSS lives under assets/: relative custom-property URLs would resolve there,
    // unlike Image.src, and silently lose local frames/backgrounds after deployment.
    rememberAssetUrl(asset.path,resolved.href);done.add(asset.path);report();
   }catch{failed.push(asset.path);}
  }
 }));
 if(failed.length)throw Error(`${failed.length} 项资源未能加载，请检查网络后重试；已加载资源会保留。`);
 await document.fonts.ready;
}
