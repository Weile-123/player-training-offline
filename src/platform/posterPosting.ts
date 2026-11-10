import {getHupuUser} from './hupuAccount';
import {sdkDeadline,type PostParams} from './hupuSdk';
import postingTarget from '../data/poster-posting.json';

export type PostingStage='idle'|'uploading'|'opening'|'done'|'error';
/** A session belongs to one immutable generated PNG. Retry reuses its uploaded URL. */
export function createPosterPosting(){
 let inFlight=false,cachedBlob:Blob|undefined,cachedUrl='',cachedPuid:string|undefined;
 return async(blob:Blob,title:string,content:string,onStage:(stage:PostingStage)=>void=()=>{},signal?:AbortSignal)=>{
  if(inFlight)throw Error('海报正在分享中，请稍候');
  if(!blob.size||blob.type!=='image/png')throw Error('海报尚未生成，请重新生成');
  if(blob.size>10*1024*1024)throw Error('海报超过 10 MB，请重新生成');
  inFlight=true;
  const checkCancelled=()=>{if(signal?.aborted)throw Error('已取消分享');};
  try{
   checkCancelled();onStage('uploading');const user=await getHupuUser();checkCancelled();if(!user)throw Error('请先登录虎扑，再发帖分享');
   const sdk=window.ColorboxAI!;
   if(!sdk.oss?.uploadFile||!sdk.request?.bbs?.openPostEditor)throw Error('当前环境不支持海报发帖，请在虎扑 App 内打开');
   if(blob!==cachedBlob||user.puid!==cachedPuid){
    const result=await sdkDeadline(sdk.oss.uploadFile({file:blob,filename:`player-training-poster-${Date.now()}.png`}),'海报上传超时，请稍后手动重试');
    let url:URL;try{url=new URL(result.downloadUrl);}catch{throw Error('海报上传失败，未获得有效图片地址');}
    if(url.protocol!=='https:'||!url.hostname||url.username||url.password)throw Error('海报上传返回的图片地址无效');
    cachedUrl=url.href;cachedBlob=blob;cachedPuid=user.puid;
   }
   checkCancelled();
   const params:PostParams={...postingTarget,title:Array.from(title).slice(0,80).join(''),content:Array.from(content).slice(0,1500).join(''),imageUrl:cachedUrl};
   checkCancelled();onStage('opening');const result=await sdkDeadline(sdk.request.bbs.openPostEditor(params),'发帖编辑器响应超时，请确认当前状态后再试');
   if(result?.code!==200)throw Error(result?.message||'发帖已取消或未能打开，请稍后重试');
   onStage('done');return {editorOpened:true as const,imageUrl:cachedUrl};
  }catch(error){onStage('error');throw error;}finally{inFlight=false;}
 };
}
