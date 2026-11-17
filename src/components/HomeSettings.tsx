import {gameAudio} from '../presentation/audio';
import {soundEnabled,saveSoundEnabled} from '../presentation/sampleAudio';
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {ComicDialog} from './ComicDialog';
import {GameIcon} from './GameIcon';
import {useContract} from '../contractStore';
import {feedbackLength,submitUserFeedback} from '../platform/hupuAccount';
import {cloudSync,cloudProgress,type CloudProgress} from '../platform/cloudSync';
import {safeAvatarUrl} from '../platform/hupuPlayers';
import {tutorialEnabled,saveTutorialEnabled} from '../presentation/tutorialPreference';
import {useGym} from '../gymStore';
import {gymCloudSync} from '../platform/gymCloudSync';
import {gymCloudProgress,type GymCloudProgress} from '../platform/gymCloudArchive';
import './HomeSettings.css';

const errorText=(error:unknown)=>error instanceof Error?error.message:'操作失败，请稍后重试';
const timeText=(value:number|null)=>value?new Date(value).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}):'时间未记录';
const progressText=(month:number|null,shots:number)=>month===null?'暂无进行中的生涯':`第 ${month} 月 · ${shots} 次训练`;
type HomeSettingsProps={onClose:()=>void;onTutorial?:()=>void;cloudEnabled?:boolean};
/** The gym uses its own slot, archive schema and restoration coordinator. */
export function HomeSettings({cloudEnabled=true,...props}:HomeSettingsProps){
 return cloudEnabled?<CloudHomeSettings {...props}/>:<LocalHomeSettings onClose={props.onClose}/>;
}
function LocalHomeSettings({onClose}:{onClose:()=>void}){
 const store=useGym(),sync=useSyncExternalStore(gymCloudSync.subscribe,gymCloudSync.getSnapshot,gymCloudSync.getSnapshot);
 const [notice,setNotice]=useState(''),[feedback,setFeedback]=useState(false),[failedAvatar,setFailedAvatar]=useState('');
 useEffect(()=>gymCloudSync.start(),[]);
 const avatar=safeAvatarUrl(sync.user?.avatar)||safeAvatarUrl(sync.user?.userHeadUrl),busy=!!sync.busy;
 const run=async(work:()=>Promise<unknown>)=>{setNotice('');try{await work();}catch(error){setNotice(errorText(error));}};
 const local=store.hasSave?{level:store.state.gymLevel,fame:store.state.fame,shots:0,updatedAt:store.state.updatedAt,uploadedAt:0}:null;
 return <ComicDialog title="设置" className="home-settings-dialog" onClose={()=>{gymCloudSync.cancelSync();onClose();}} dismissible={sync.busy!=='restore'}>
  <div className="home-settings">
   <section className="settings-account" aria-label="虎扑账号">
    <div className="settings-avatar">{avatar&&failedAvatar!==avatar?<img key={avatar} src={avatar} alt="虎扑头像" referrerPolicy="no-referrer" onError={()=>setFailedAvatar(avatar)}/>:<GameIcon name="people"/>}</div>
    <div><strong>{sync.busy==='account'?'正在获取虎扑账号…':sync.user?.nickname||(sync.user?'虎扑用户':'尚未登录虎扑')}</strong><p>{sync.user?'已登录':'请在虎扑登录后刷新账号'}</p></div>
    <button className="secondary" disabled={busy||!!sync.preview} onClick={()=>void run(gymCloudSync.refresh)}>刷新账号</button>
   </section>
   <section className="settings-block settings-cloud"><h3><GameIcon name="folder"/>云存档</h3>
    <div className="save-comparison"><GymSaveProgress label="本地进度" progress={local}/><GymSaveProgress label="云端进度" progress={sync.cloud} known={sync.cloudKnown} remote/></div>
    <div className="settings-actions"><button className="primary" disabled={busy||!sync.user||!sync.cloudKnown||!store.hasSave||!!sync.preview} onClick={()=>void run(gymCloudSync.upload)}>{sync.busy==='write'?'上传中…':'上传'}</button><button className="secondary cloud-sync-button" disabled={busy||!sync.user||!!sync.preview} onClick={()=>void run(gymCloudSync.prepareSync)}>{sync.busy==='read'?'读取中…':'同步'}</button></div>
    <small className="cloud-auto-status"><i data-active={sync.phase==='ready'&&!sync.preview}/>{sync.preview?'等待同步确认':sync.phase==='loading'?'正在连接云存档':sync.phase==='guest'?'登录后可手动上传或同步':'仅手动上传；更换设备后请先同步云存档'}</small>
   </section>
   <SettingsSoundSwitch gym/>
   <button className="settings-feedback-entry" onClick={()=>setFeedback(true)}><GameIcon name="feedback"/><span><strong>意见反馈</strong><small>遇到问题或建议，告诉我们</small></span><b aria-hidden="true">›</b></button>
   {(notice||sync.message)&&<p className="settings-notice" role="status" aria-live="polite">{notice||sync.message}</p>}
  </div>
  {sync.preview&&<ComicDialog title="同步云存档" onClose={gymCloudSync.cancelSync} dismissible={!busy} className="cloud-confirm-dialog"><p>同步会用以下云端进度替换当前球馆、球员、背包、图鉴和校友档案。</p><div className="save-comparison"><GymSaveProgress label="当前本地" progress={local}/><GymSaveProgress label="将同步的云端" progress={gymCloudProgress(sync.preview)} remote/></div><p>确认前不会修改进度；同步前保留一份完整本地备份。</p><div className="settings-actions"><button className="secondary" disabled={busy} onClick={gymCloudSync.cancelSync}>取消</button><button className="primary" disabled={busy} onClick={()=>void run(gymCloudSync.confirmSync)}>{sync.busy==='restore'?'同步中…':'确认同步'}</button></div>{(notice||sync.message)&&<p role="status">{notice||sync.message}</p>}</ComicDialog>}
  {feedback&&<FeedbackPage onClose={()=>setFeedback(false)}/>}
 </ComicDialog>;
}
function GymSaveProgress({label,progress,known=true,remote=false}:{label:string;progress:GymCloudProgress|null;known?:boolean;remote?:boolean}){
 return <div className={`save-progress${remote?' is-cloud':''}`}><strong>{label}</strong><b>{!known?'尚未读取':progress?`球馆 Lv.${progress.level} · 声望 ${progress.fame.toLocaleString()}`:remote?'暂无云存档':'尚未开设球馆'}</b><small>{remote?'上次上传':'上次更新'}：{progress?timeText(remote?progress.uploadedAt:progress.updatedAt):'—'}</small></div>;
}
function SettingsSoundSwitch({gym=false}:{gym?:boolean}){
 const [sound,setSound]=useState(soundEnabled);
 return <div className="settings-tutorial-row"><span><strong id="sound-switch-label">游戏音效</strong><small>{gym?'按钮、投篮结果与模板变化':'按钮、投篮结果、模板变化与月份更新'}</small></span><button type="button" className="tutorial-switch" data-audio-silent role="switch" aria-checked={sound} aria-labelledby="sound-switch-label" onClick={()=>{const next=!sound;saveSoundEnabled(next);setSound(next);if(next){gameAudio.unlock();void gameAudio.play('click',true);}else gameAudio.mute();}}><span/></button></div>;
}
function CloudHomeSettings({onClose,onTutorial}:HomeSettingsProps){
 const store=useContract(),sync=useSyncExternalStore(cloudSync.subscribe,cloudSync.getSnapshot,cloudSync.getSnapshot);
 const [enabled,setEnabled]=useState(tutorialEnabled),[notice,setNotice]=useState(''),[feedback,setFeedback]=useState(false),[failedAvatar,setFailedAvatar]=useState(''),[now,setNow]=useState(Date.now);
 useEffect(()=>{const stop=cloudSync.start(),timer=setInterval(()=>setNow(Date.now()),250);return()=>{clearInterval(timer);cloudSync.cancelSync();stop();};},[]);
 const run=async(action:()=>Promise<unknown>)=>{setNotice('');try{await action();}catch(error){setNotice(errorText(error));}};
 const uploadSeconds=Math.max(0,Math.ceil((sync.writeUntil-now)/1000)),syncSeconds=Math.max(0,Math.ceil((sync.readUntil-now)/1000));
 const avatar=safeAvatarUrl(sync.user?.avatar)||safeAvatarUrl(sync.user?.userHeadUrl);
 const busy=!!sync.busy;
 const cloudStatus=store.saveMessage.includes('当前可继续游玩')?store.saveMessage:sync.preview?'等待同步确认':sync.phase==='loading'?'正在连接云存档':sync.phase==='guest'?'登录后可手动上传或同步':'仅手动上传；更换设备后请先同步云存档';
 return <ComicDialog title="设置" className="home-settings-dialog" onClose={()=>{cloudSync.cancelSync();onClose();}} dismissible={sync.busy!=='restore'}>
  <div className="home-settings">
   <section className="settings-account" aria-label="虎扑账号">
    <div className="settings-avatar">{avatar&&failedAvatar!==avatar?<img key={avatar} src={avatar} alt="虎扑头像" referrerPolicy="no-referrer" onError={()=>setFailedAvatar(avatar)}/>:<GameIcon name="people"/>}</div>
    <div><strong>{sync.busy==='account'?'正在获取虎扑账号…':sync.user?.nickname||(sync.user?'虎扑用户':'尚未登录虎扑')}</strong><p>{sync.user?'已登录':'请在虎扑登录后刷新账号'}</p></div>
    <button className="secondary" disabled={busy||!!sync.preview} onClick={()=>void run(cloudSync.refresh)}>刷新账号</button>
   </section>
   <section className="settings-block settings-cloud"><h3><GameIcon name="folder"/>云存档</h3>
    <div className="save-comparison">
     <SaveProgress label="本地进度" month={store.hasSave?store.state.month:null} shots={store.state.totalShots} updatedAt={store.updatedAt}/>
     <SaveProgress label="云端进度" cloud={sync.cloud} known={sync.cloudKnown}/>
    </div>
    <div className="settings-actions"><button className="primary" disabled={busy||!sync.user||uploadSeconds>0||!!sync.preview} onClick={()=>void run(cloudSync.upload)}>{sync.busy==='write'?'上传中…':uploadSeconds>0?`上传（${uploadSeconds}s）`:'上传'}</button><button className="secondary cloud-sync-button" disabled={busy||!sync.user||syncSeconds>0||!!sync.preview} onClick={()=>void run(cloudSync.prepareSync)}>{sync.busy==='read'?'读取中…':syncSeconds>0?`同步（${syncSeconds}s）`:'同步'}</button></div>
    <small className="cloud-auto-status"><i data-active={sync.phase==='ready'&&!sync.preview}/>{cloudStatus}</small>
   </section>
   <SettingsSoundSwitch/>
   <div className="settings-tutorial-row"><span><strong id="tutorial-switch-label">新手教程</strong><small id="tutorial-switch-description">开启新生涯时是否进入教程</small></span><button type="button" className="tutorial-switch" role="switch" aria-checked={enabled} aria-labelledby="tutorial-switch-label" aria-describedby="tutorial-switch-description" onClick={()=>{try{saveTutorialEnabled(!enabled);setEnabled(!enabled);setNotice('教程设置已保存，下次开启新生涯时生效。');}catch{setNotice('教程设置保存失败，请检查浏览器存储空间。');}}}><span/></button></div>
   {onTutorial&&<button className="secondary" onClick={onTutorial}>重玩基础练习（不影响存档）</button>}
   <button className="settings-feedback-entry" onClick={()=>setFeedback(true)}><GameIcon name="feedback"/><span><strong>意见反馈</strong><small>遇到问题或建议，告诉我们</small></span><b aria-hidden="true">›</b></button>
   {(notice||sync.message)&&<p className="settings-notice" role="status" aria-live="polite">{notice||sync.message}</p>}
  </div>
  {sync.preview&&<ComicDialog title="同步云存档" onClose={cloudSync.cancelSync} dismissible={!busy} className="cloud-confirm-dialog">
   <p>同步会用以下云端进度替换当前本地生涯、图鉴和记录。</p>
   <div className="save-comparison"><SaveProgress label="当前本地" month={store.hasSave?store.state.month:null} shots={store.state.totalShots} updatedAt={store.updatedAt}/><SaveProgress label="将同步的云端" cloud={cloudProgress(sync.preview)} known/></div>
   <p>确认前不会修改本地进度；同步时会先保留一份本地备份。</p>
   <div className="settings-actions"><button className="secondary" disabled={busy} onClick={cloudSync.cancelSync}>取消</button><button className="primary" disabled={busy} onClick={()=>void run(cloudSync.confirmSync)}>{sync.busy==='restore'?'同步中…':'确认同步'}</button></div>
   {(notice||sync.phase==='error')&&<p role="status">{notice||sync.message}</p>}
  </ComicDialog>}
  {feedback&&<FeedbackPage onClose={()=>setFeedback(false)}/>}
 </ComicDialog>;
}
export function SaveProgress({label,month,shots=0,updatedAt=null,cloud,known=true}:{label:string;month?:number|null;shots?:number;updatedAt?:number|null;cloud?:CloudProgress|null;known?:boolean}){
 const remote=month===undefined;
 return <div className={remote?'save-progress is-cloud':'save-progress'}><strong>{label}</strong><b>{remote?(!known?'尚未读取':cloud?progressText(cloud.month,cloud.shots):'暂无云存档'):progressText(month!,shots)}</b><small>{remote?'上次上传':'上次更新'}：{remote?(cloud?timeText(cloud.uploadedAt):'—'):timeText(updatedAt)}</small></div>;
}
export function FeedbackPage({onClose}:{onClose:()=>void}){
 const [content,setContent]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const lock=useRef(false),length=feedbackLength(content);
 return <ComicDialog title="意见反馈" className="feedback-dialog" onClose={onClose} dismissible={!busy}>
  <form className="hupu-feedback-form" onSubmit={async event=>{
   event.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setNotice('');
   try{const receipt=await submitUserFeedback(content);setContent('');setNotice(`反馈已提交，谢谢你的建议！反馈编号：${receipt.id}`);}catch(error){setNotice(errorText(error));}finally{lock.current=false;setBusy(false);}
  }}>
   <p>请描述遇到的问题，或写下你对游戏的建议。</p><label htmlFor="hupu-feedback-content">反馈内容</label>
   <textarea id="hupu-feedback-content" value={content} disabled={busy} onChange={event=>setContent(event.target.value)} placeholder="例如：在哪个页面、进行了什么操作、出现了什么问题…" aria-describedby="feedback-count"/>
   <small id="feedback-count" className={length>2000?'is-error':''}>{length>2000?`已超出 ${length-2000} 字`:`还可输入 ${2000-length} 字`}</small>
   <button type="submit" className="primary" disabled={busy||length<1||length>2000}>{busy?'提交中…':'提交反馈'}</button>
   <p role="status" aria-live="polite">{notice}</p>
  </form>
 </ComicDialog>;
}
