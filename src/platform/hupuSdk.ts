export type SdkResponse<T>={code:number;message?:string;data?:T|null};
export type HupuUser={islogin?:number;puid?:string;nickname?:string;avatar?:string;userHeadUrl?:string};
export type PostParams={title:string;content:string;imageUrl?:string;topicId?:string;tagId?:string;topicName?:string;tagName?:string};
type PlayerResponse=SdkResponse<{player?:{playerId?:string;name?:string;eng_name?:string;photo?:string;big_photo?:string}}>;
export type HupuSdk={
 security?:{checkAudit:(content:string)=>Promise<SdkResponse<boolean>>};
 vatask?:{completeRewardVideo:()=>Promise<SdkResponse<{rewarded:boolean;reason?:string}>>;getActivityTaskState:()=>Promise<unknown>};
 request?:{basketball?:{playerInfo:(params:{playerId:string;leagueType:'NBA'})=>Promise<PlayerResponse>};bbs?:{openPostEditor:(params:PostParams)=>Promise<{code:number;message?:string}>}};
 oss?:{uploadFile:(params:{file:Blob;filename:string})=>Promise<{downloadUrl:string;name?:string}>};
 bbsConfig?:{get:()=>Promise<{bbsTopicId?:string;bbsTagId?:string;bbsTopicName?:string;bbsTagName?:string}|null>};
 auth?:{getUserInfo:()=>Promise<SdkResponse<HupuUser>>};
 cloud?:{request:(params:{url:string;method:'POST'|'GET';data?:Record<string,unknown>;envId:string;auth:boolean})=>Promise<{statusCode:number;code:number;message?:string;data?:unknown}>};
 cloudSave?:{getValue:(params:{key:string})=>Promise<SdkResponse<string>>;setValue:(params:{key:string;value:string})=>Promise<SdkResponse<unknown>>};
};
declare global {interface Window {ColorboxAI?:HupuSdk}}
let loading:Promise<void>|undefined;
const sdkUrl='https://activity-static.hoopchina.com.cn/games/static/colorbox-ai/colorbox-ai_v2.2.19.js';
/** One SDK script shared by portraits, account, feedback and saves. Failed loads can be retried explicitly. */
export function ensureColorboxSdk():Promise<void>{
 if(typeof window!=='undefined'&&window.ColorboxAI)return Promise.resolve();
 if(typeof window!=='undefined'&&['localhost','127.0.0.1','::1','[::1]'].includes(window.location?.hostname??'')){
  return Promise.reject(Error('本地预览不连接虎扑服务'));
 }
 if(loading)return loading;
 loading=new Promise<void>((resolve,reject)=>{
  if(typeof document==='undefined'){reject(Error('虎扑服务暂不可用'));return;}
  const existing=document.getElementById('hupu-player-sdk') as HTMLScriptElement|null;
  const script=existing??document.createElement('script');
  const finish=(message?:string)=>{clearTimeout(timer);script.removeEventListener('load',onLoad);script.removeEventListener('error',onError);if(message){script.remove();reject(Error(message));}else resolve();};
  const onLoad=()=>finish(window.ColorboxAI?undefined:'虎扑服务初始化失败');
  const onError=()=>finish('虎扑服务加载失败，请检查网络后重试');
  const timer=setTimeout(()=>finish('虎扑服务加载超时，请稍后重试'),10000);
  script.addEventListener('load',onLoad,{once:true});script.addEventListener('error',onError,{once:true});
  if(!existing){script.id='hupu-player-sdk';script.src=sdkUrl;script.async=true;document.head.append(script);}
 }).catch(error=>{loading=undefined;throw error;});
 return loading;
}
export async function sdkDeadline<T>(promise:Promise<T>,message='请求超时，请稍后重试'):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),20000);})]);}
 finally{clearTimeout(timer);}
}
