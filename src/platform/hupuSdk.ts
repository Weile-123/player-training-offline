import {assertHupuProject} from './hupuProject';
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
 cloudSave?:{getValue?:(params:{key:string})=>Promise<SdkResponse<string>>;setValue?:(params:{key:string;value:string})=>Promise<SdkResponse<unknown>>;load?:(params:{slot:number})=>Promise<SdkResponse<string>>;save?:(params:{slot:number;value:string})=>Promise<SdkResponse<unknown>>};
};
declare global {interface Window {ColorboxAI?:HupuSdk}}
/** Use the current SDK injected by this project's Shaper host. No legacy game's SDK fallback. */
export function ensureColorboxSdk():Promise<void>{
 try {assertHupuProject();} catch(error) {return Promise.reject(error);}
 if(typeof window!=='undefined'&&window.ColorboxAI)return Promise.resolve();
 if(typeof window!=='undefined'&&['localhost','127.0.0.1','::1','[::1]'].includes(window.location?.hostname??'')){
  return Promise.reject(Error('本地预览不连接虎扑服务'));
 }
 return Promise.reject(Error('虎扑服务尚未就绪，请从本项目虎扑活动页重新打开'));
}
export async function sdkDeadline<T>(promise:Promise<T>,message='请求超时，请稍后重试'):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),20000);})]);}
 finally{clearTimeout(timer);}
}
