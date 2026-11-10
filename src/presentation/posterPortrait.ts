import portraits from '../data/poster-portraits.json';
import {localAsset} from './assetUrls';
import {templateById} from '../game/templates';

/** Same-origin export copies: NBA images display in <img> but do not grant Canvas CORS. */
export function posterPortrait(templateId?:string|null,highPotential=false){
 const template=templateById(templateId),key=template?.id??(highPotential?'high-potential':'rookie-atlas');
 const path=(portraits as Record<string,string>)[key];
 return {src:localAsset(path),tier:template?.tier??'undiscovered',crop:key==='rookie-atlas'?[62,922,233,255] as const:undefined};
}
export async function loadPosterPortrait(templateId?:string|null,highPotential=false){
 const source=posterPortrait(templateId,highPotential);
 const image=await new Promise<HTMLImageElement>((resolve,reject)=>{
  const img=new Image(),timer=setTimeout(()=>reject(Error('球员头像加载超时，请点击发帖分享重试。')),15000);
  img.onload=()=>{clearTimeout(timer);resolve(img);};
  img.onerror=()=>{clearTimeout(timer);reject(Error('球员头像加载失败，请点击发帖分享重试。'));};
  img.src=source.src;
 });
 return {...source,image};
}
