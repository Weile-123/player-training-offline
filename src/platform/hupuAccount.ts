import {ensureColorboxSdk,sdkDeadline,type HupuUser} from './hupuSdk';
import {hupuProject} from './hupuProject';

export const feedbackConfig=Object.freeze({
 applicationId:hupuProject.applicationId,
 apiBase:'https://feedback-public-d8fnf79rd0e395c3-1252166086.ap-shanghai.app.tcloudbase.com/api',
 envId:'feedback-public-d8fnf79rd0e395c3',
});
export const cloudSaveKey='player-training-offline.progress.v1';
// The current skill contract limits each read/write entry to one call per 3 seconds.
// Keep the guard outside React so closing and reopening Settings cannot bypass it.
const cloudCalls=new WeakMap<object,Partial<Record<'read'|'write',{started:number;pending:boolean}>>>();
export function getCloudRateState(){
 const api=typeof window==='undefined'?undefined:window.ColorboxAI?.cloudSave,calls=api?cloudCalls.get(api):undefined;
 return {readUntil:calls?.read?calls.read.started+3000:0,writeUntil:calls?.write?calls.write.started+3000:0};
}
async function guardedCloudCall<T>(api:object,kind:'read'|'write',call:()=>Promise<T>):Promise<T>{
 const calls=cloudCalls.get(api)??{},previous=calls[kind],now=Date.now();
 if(previous?.pending)throw Error('云存档正在处理中，请等待完成');
 if(previous&&now-previous.started<3000)throw Error(`操作过于频繁，请 ${Math.ceil((3000-(now-previous.started))/1000)} 秒后重试`);
 const current={started:now,pending:true};calls[kind]=current;cloudCalls.set(api,calls);
 try{return await call();}finally{current.pending=false;}
}
export const feedbackLength=(value:string)=>Array.from(value.trim()).length;
export async function getHupuUser():Promise<HupuUser|null>{
 await ensureColorboxSdk();
 const auth=window.ColorboxAI?.auth;
 if(!auth)throw Error('当前环境不支持虎扑账号，请在虎扑内打开');
 const response=await sdkDeadline(auth.getUserInfo());
 if(response.code!==200)throw Error(response.message||'获取虎扑账号失败，请稍后刷新');
 return response.data?.islogin===1?response.data:null;
}
async function requireUser(expectedPuid?:string){const user=await getHupuUser();if(!user)throw Error('请先在虎扑登录，再返回此页刷新账号');if(expectedPuid&&user.puid!==expectedPuid)throw Error('虎扑账号已切换，请刷新账号后再操作');return user;}
export async function submitUserFeedback(raw:string):Promise<{id:string}>{
 const content=raw.trim(),length=feedbackLength(content);
 if(length<1||length>2000)throw Error('请输入 1–2000 个字符的反馈内容');
 if(!/^app_[0-9a-f]{10}$/.test(feedbackConfig.applicationId))throw Error('反馈服务尚未配置完成');
 const user=await requireUser(),cloud=window.ColorboxAI?.cloud;
 if(!cloud)throw Error('当前环境不支持反馈，请在虎扑内打开');
 const security=window.ColorboxAI?.security;
 const auditUnavailable='内容检测暂不可用，请稍后再提交，反馈内容已保留';
 if(!security?.checkAudit)throw Error(auditUnavailable);
 let audit;
 try{audit=await sdkDeadline(security.checkAudit(content),auditUnavailable);}catch{throw Error(auditUnavailable);}
 if(audit.code===401)throw Error('登录状态已失效，请重新登录后提交');
 if(audit.code!==200)throw Error(auditUnavailable);
 if(audit.data!==true)throw Error(audit.data===false?'反馈内容未通过检测，请修改后再提交':auditUnavailable);
 const data:Record<string,string>={applicationId:feedbackConfig.applicationId,content};
 const nickname=typeof user.nickname==='string'?user.nickname.trim():'';
 const avatar=(typeof user.avatar==='string'&&user.avatar.trim())||(typeof user.userHeadUrl==='string'&&user.userHeadUrl.trim())||'';
 if(nickname)data.nickname=nickname;
 if(avatar.startsWith('https://'))data.avatarUrl=avatar;
 const uncertain='提交结果暂不确定，请稍后确认未成功后再试';
 let response;
 try{response=await sdkDeadline(cloud.request({url:feedbackConfig.apiBase+'/feedback',method:'POST',data,envId:feedbackConfig.envId,auth:true}),uncertain);}catch{throw Error(uncertain);}
 if(response.statusCode===201&&response.code===0){
  const receipt=response.data as {id?:unknown}|null;
  const id=receipt?.id;
  if(typeof id==='string'&&id.trim())return {id:id.trim()};
  if(typeof id==='number'&&Number.isSafeInteger(id)&&id>0)return {id:String(id)};
  throw Error('未收到反馈编号，暂时无法确认提交成功，请稍后确认，内容已保留');
 }
 const messages:Record<number,string>={400:'反馈内容不符合要求，请检查内容后重试',401:'登录状态已失效，请重新登录后提交',413:'反馈内容过长，请精简后提交',429:'提交过于频繁，请稍后再试'};
 throw Error(messages[response.statusCode]||uncertain);
}
export async function uploadCloudSave(value:string,expectedPuid?:string):Promise<void>{
 if(new TextEncoder().encode(value).byteLength>2*1024*1024)throw Error('存档超过云端 2 MB 限制，请先导出本地备份');
 await requireUser(expectedPuid);const api=window.ColorboxAI?.cloudSave;
 if(!api?.setValue)throw Error('当前环境不支持云存档，请在虎扑内打开');
 const result=await guardedCloudCall(api,'write',()=>sdkDeadline(api.setValue!({key:cloudSaveKey,value}),'云存档上传结果暂不确定，请稍后查看云端存档'));
 if(result.code!==200)throw Error(result.message||'云存档上传失败，本地进度已保留');
}
export async function downloadCloudSave(expectedPuid?:string):Promise<string|null>{
 await requireUser(expectedPuid);const api=window.ColorboxAI?.cloudSave;
 if(!api?.getValue)throw Error('当前环境不支持云存档，请在虎扑内打开');
 const result=await guardedCloudCall(api,'read',()=>sdkDeadline(api.getValue!({key:cloudSaveKey})));
 if(result.code!==200)throw Error(result.message||'云存档读取失败，本地进度已保留');
 if(result.data===null)return null;
 if(typeof result.data!=='string')throw Error('云存档格式异常，本地进度已保留');
 return result.data;
}
