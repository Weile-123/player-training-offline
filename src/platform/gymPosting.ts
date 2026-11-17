import {ensureColorboxSdk, sdkDeadline, type PostParams} from './hupuSdk';
import {getGymDebug} from './gymDebug';
import {assertHupuProject, hupuProject} from './hupuProject';

let pending = false;
/** The only success criterion is an acknowledged editor open; this never publishes a post. */
const uploadedPosters = new WeakMap<Blob, {sdk: object; url: string}>();
export type GymPostingStage = 'uploading' | 'opening';
/** Explicit business destination supplied for this activity, independent of host defaults. */
export const gymPostDestination = Object.freeze({topicId: '871', tagId: '162117', topicName: 'AI工坊', tagName: '传奇球馆'});
export async function openGymPost(title: string, content: string, signal?: AbortSignal, poster?: {blob: Blob; onStage?: (stage: GymPostingStage) => void}) {
 if (pending) throw Error('发帖正在处理中，请稍候');
 pending = true;
 const check = () => {if (signal?.aborted) throw Error('已取消分享');};
 try {
  check();
  if (getGymDebug().skipPosting) {await Promise.resolve(); check(); return {editorOpened: true, simulated: true};}
  await ensureColorboxSdk(); assertHupuProject(); check();
  const sdk = window.ColorboxAI;
  if (!sdk?.request?.bbs?.openPostEditor) throw Error('请在虎扑 App 内打开本项目后分享');
  let imageUrl: string | undefined;
  if (poster) {
   if (!poster.blob.size || poster.blob.type !== 'image/png') throw Error('海报尚未生成，请重试');
   if (poster.blob.size > 10 * 1024 * 1024) throw Error('海报超过 10 MB，请重试');
   if (!sdk.oss?.uploadFile) throw Error('当前环境不支持海报上传，请在虎扑 App 内打开');
   const cached = uploadedPosters.get(poster.blob);
   if (cached?.sdk === sdk) imageUrl = cached.url;
   else {
    poster.onStage?.('uploading');
    const uploaded = await sdkDeadline(sdk.oss.uploadFile({file: poster.blob, filename: `legend-gym-${Date.now()}.png`}), '海报上传超时，请稍后手动重试');
    assertHupuProject(); check();
    let url: URL;
    try {url = new URL(uploaded.downloadUrl);} catch {throw Error('海报上传失败，未获得有效图片地址');}
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw Error('海报图片地址无效');
    imageUrl = url.href; uploadedPosters.set(poster.blob, {sdk, url: imageUrl});
   }
  }
  // The official contract gives explicitly configured business fields precedence.
  // Do not query bbsConfig or let another host destination override this activity.
  const params: PostParams = {...gymPostDestination, title: Array.from(title).slice(0, 80).join(''), content: Array.from(content).slice(0, 1500).join('')};
  if (imageUrl) params.imageUrl = imageUrl;
  assertHupuProject(); check();
  poster?.onStage?.('opening');
  const result = await sdkDeadline(sdk.request.bbs.openPostEditor(params), '发帖编辑器响应超时，请稍后重试');
  assertHupuProject(); check();
  if (result?.code !== 200) throw Error(result?.message || '发帖编辑器未打开，奖励未领取');
  return {editorOpened: true, simulated: false};
 } finally {pending = false;}
}
export const gymPostTitle = `${hupuProject.name}｜我的球星培养记录`;
