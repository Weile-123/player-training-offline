import manifest from '../data/runtime-assets.json';
export type AssetConfig={baseUrl?:string;urls?:Record<string,string>};
let config:AssetConfig={};
export function configureAssets(value:AssetConfig){config=value;}
export function assetSource(path:string,local=false){
 if(local)return localAsset(path);
 const entry=(manifest.entries as {path:string;local:boolean;url?:string}[]).find(a=>a.path===path);
 if(entry?.local)return localAsset(path);
 return config.urls?.[path]??(config.baseUrl?.trim()?`${config.baseUrl.trim().replace(/\/$/,'')}/${path}`:entry?.url??localAsset(path));
}
/** Downloaded blobs are reused by images, canvas and CSS for this page session. */
const downloaded=new Map<string,string>();
export function localAsset(path:string){return `${import.meta.env.BASE_URL}${path}`;}
export function assetUrl(path:string){return downloaded.get(path)??assetSource(path);}
export function rememberAsset(path:string,blob:Blob){
 if(downloaded.has(path))return;
 const url=URL.createObjectURL(blob);downloaded.set(path,url);
 if(typeof document!=='undefined')document.documentElement.style.setProperty(`--asset-${path.replace(/[^a-zA-Z0-9]/g,'-')}`,`url("${url}")`);
}
export const hasAsset=(path:string)=>downloaded.has(path);
export function rememberAssetUrl(path:string,url:string){
 downloaded.set(path,url);
 if(typeof document!=='undefined')document.documentElement.style.setProperty(`--asset-${path.replace(/[^a-zA-Z0-9]/g,'-')}`,`url("${url}")`);
}
