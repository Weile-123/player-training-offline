import {getGymDebug, toggleGymDebug, useGymDebug} from '../platform/gymDebug';
import {useState} from 'react';
import {useGym} from '../gymStore';
import {ComicDialog} from './ComicDialog';
export function GymDebugDialog({onClose,onLevelChange}: {onClose: () => void;onLevelChange?:()=>void}) {
 const debug = useGymDebug();
 const store=useGym(),[level,setLevel]=useState(store.state.gymLevel),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const change=async(restore=false)=>{
  setBusy(true);setError('');
  try{
   const method=restore?useGym.getState().debugRestoreGym:useGym.getState().debugSetGymLevel;
   if(!method)throw Error('测试球馆暂不可用');
   const result=restore?await useGym.getState().debugRestoreGym!():await useGym.getState().debugSetGymLevel!(level);
   if(result.error)throw Error(result.error);
   onLevelChange?.();
  }catch(cause){setError(cause instanceof Error?cause.message:'测试球馆切换失败');}
  finally{setBusy(false);}
 };
 return <ComicDialog title="本地测试" className="gym-management-dialog" onClose={onClose}><div className="gym-panel gym-debug-content"><p className="gm-muted">开关自动保存在当前浏览器，刷新后保留。仅本地开发环境生效，游戏奖励限制照常。</p>{([['skipPosting', '跳过发帖'], ['skipAds', '跳过广告']] as const).map(([key, label]) => <button key={key} className="gm-button" type="button" aria-pressed={debug[key]} onClick={() => toggleGymDebug(key)}>{label}：{getGymDebug()[key] ? '已开启' : '已关闭'}</button>)}<section className="gm-paper gm-stack"><h3>测试球馆等级</h3><p className="gm-muted">进入独立测试球馆，原球馆进度保留。切换等级会重新生成测试球员，测试数据不上传。</p><div className="gm-height-options" role="group" aria-label="测试球馆等级" style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:6}}>{Array.from({length:8},(_,i)=>i+1).map(value=><button type="button" key={value} className="gm-button" aria-pressed={level===value} disabled={busy} onClick={()=>setLevel(value)} style={level===value?{background:'#b52d23',color:'#fff2ca'}:undefined}>{value}级</button>)}</div><button type="button" className="gm-button gm-primary" disabled={busy} onClick={()=>void change()}>{busy?'切换中…':`进入${level}级测试球馆`}</button>{store.debugSessionActive&&<><p role="status">当前为{store.state.gymLevel}级独立测试球馆</p><button type="button" className="gm-button" disabled={busy} onClick={()=>void change(true)}>恢复测试前球馆</button></>}{error&&<p role="alert">{error}</p>}</section></div></ComicDialog>;
}
