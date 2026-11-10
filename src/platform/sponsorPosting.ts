import {getHupuUser} from './hupuAccount';
import {sdkDeadline,type PostParams} from './hupuSdk';
import {createSponsorPoster,sponsorPostText,type SponsorRecord} from '../presentation/sponsorPoster';
import postingTarget from '../data/poster-posting.json';
let cached:{key:string;puid:string;url:string}|undefined;

/** Same reward success criterion as player sharing: editor successfully opened. */
export async function openSponsorPost(record:SponsorRecord,onStage:(text:string)=>void=()=>{}){
 const snapshot={month:record.month,delivered:record.delivered,totalShots:record.totalShots};
 const user=await getHupuUser();if(!user)throw Error('请先登录虎扑，再发帖分享');
 const sdk=window.ColorboxAI;
 if(!sdk?.request?.bbs?.openPostEditor)throw Error('请在虎扑 App 内发帖分享');
 if(!sdk.oss?.uploadFile)throw Error('当前环境不支持分享图上传');
 const key=JSON.stringify(snapshot);
 if(!cached||cached.key!==key||cached.puid!==user.puid){
  onStage('正在生成分享图…');const blob=await createSponsorPoster(snapshot);
  if(!blob.size||blob.type!=='image/png'||blob.size>10*1024*1024)throw Error('分享图无效或超过 10 MB，请重试');
  onStage('正在上传分享图…');const uploaded=await sdkDeadline(sdk.oss.uploadFile({file:blob,filename:`training-camp-${snapshot.month}-${Date.now()}.png`}));
  let url:URL;try{url=new URL(uploaded.downloadUrl);}catch{throw Error('分享图上传失败');}
  if(url.protocol!=='https:'||!url.hostname||url.username||url.password)throw Error('分享图地址无效');
  cached={key,puid:user.puid!,url:url.href};
 }
 // The game has an explicit posting destination, shared with player posters.
 const params:PostParams={...postingTarget,title:'王牌训练师｜我的篮球训练营养成记',content:sponsorPostText(snapshot),imageUrl:cached.url};
 onStage('正在打开发帖…');
 const result=await sdkDeadline(sdk.request.bbs.openPostEditor(params),'发帖编辑器响应超时，请稍后重试');
 if(result?.code!==200)throw Error(result?.message||'发帖编辑器未能打开，请稍后重试');
}
