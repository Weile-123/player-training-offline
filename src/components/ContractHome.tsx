import {gameAudio} from '../presentation/audio';
import {cloudSync} from '../platform/cloudSync';
import {HomeSettings} from './HomeSettings';
import {tutorialEnabled} from '../presentation/tutorialPreference';
import {assetUrl} from '../presentation/assetUrls';
import {lazy,Suspense,useState,useEffect} from 'react';
import {useContract} from '../contractStore';
import ContractGame from './ContractGame';
import {ContractCollection} from './ContractPanels';
import {ContractLeaderboard} from './ContractLeaderboard';
import {CareerStatistics} from './CareerStatistics';
import {CareerStartCard} from './CareerStartCard';
import {CreditHearts} from './CreditHearts';
import {GameIcon} from './GameIcon';
import {ComicDialog} from './ComicDialog';
import {useModalAccessibility} from '../presentation/useModalAccessibility';
import CareerTutorial from './CareerTutorial';
import {HomeMenuButton} from './HomeMenuButton';
const DevConsole=import.meta.env.DEV?lazy(()=>import('./DevConsole')):null;
const art=(name:string)=>assetUrl(`art/home/${name}.png`);
export default function ContractHome(){
 const [game,setGame]=useState(false),[dialog,setDialog]=useState<'debug'|'start'|'collection'|'rank'|'settings'|'announcement'|'career'|null>(null),[note,setNote]=useState('');
 const [tutorial,setTutorial]=useState(false),[replay,setReplay]=useState(false);
 const snapshot=useContract(state=>game||tutorial||replay?null:state),store=snapshot??useContract.getState();
 useModalAccessibility(!game&&!tutorial&&!replay);
 useEffect(()=>cloudSync.start(),[]);
 useEffect(()=>gameAudio.install(document),[]);
 const start=()=>{setDialog(null);setNote('');if(tutorialEnabled())setTutorial(true);else completeTutorial();};
 const completeTutorial=()=>{if(store.start()){setTutorial(false);setNote('');setGame(true);}else setNote(useContract.getState().message);};
 const resume=()=>{setDialog(null);setNote('');setGame(true);};
 if(replay)return <CareerTutorial onComplete={()=>setReplay(false)} onExit={()=>setReplay(false)} error=""/>;
 if(tutorial)return <CareerTutorial onComplete={completeTutorial} onExit={()=>setTutorial(false)} error={note}/>;
 if(game)return <ContractGame onHome={()=>{const current=useContract.getState();if(current.state.status==='over')current.finish();else current.flush();setGame(false);setNote('');}}/>;
 return <main className="home-page contract-home" aria-label="王牌训练师首页"><div className="home-background"/><div className="home-frame"><header className="home-brand"><h1 className="contract-title-image"><img src={art('title-comic')} alt="王牌训练师 · 从训练球星开始"/></h1></header><nav className="home-quick-actions" aria-label="设置"><button aria-label="设置" title="设置" onClick={()=>setDialog('settings')}><GameIcon name="settings"/></button></nav><div className="home-scene-space"/><section className="home-controls">
 <div className="home-career-actions">
  <button className="art-button home-new-game" aria-label="开始新生涯" onClick={()=>store.hasSave?setDialog('start'):start()}><img src={art(store.hasSave?'button-new-career':'button-new-game')} alt=""/></button>
  {store.hasSave&&<button className="art-button home-continue has-progress" aria-label="继续游戏" onClick={resume}><GameIcon name="folder"/><strong>继续游戏</strong><span className="home-save-progress"><span>第 {store.state.month} 月 · 信用</span><CreditHearts credit={store.state.credit}/></span><span className="continue-chevron" aria-hidden="true">›</span></button>}
 </div>
 <nav className="home-menu" aria-label="更多功能"><HomeMenuButton kind="collection" onClick={()=>setDialog('collection')}/><HomeMenuButton kind="rank" onClick={()=>setDialog('rank')}/><HomeMenuButton kind="career" onClick={()=>setDialog('career')}/></nav>{(note||/失败|受限/.test(store.saveMessage))&&<p className="contract-home-message" role="status">{note||store.saveMessage}</p>}</section></div>
 {import.meta.env.DEV&&<button className="home-test-trigger" onClick={()=>setDialog('debug')}>测试</button>}
 {dialog==='settings'&&<HomeSettings onClose={()=>setDialog(null)} onTutorial={()=>{setDialog(null);setReplay(true);}}/>}
 {dialog&&dialog!=='settings'&&<ComicDialog title={{debug:'测试控制台',start:'开启新生涯',collection:'收藏图鉴',rank:'排行榜',announcement:'游戏公告',career:'教练生涯'}[dialog]} onClose={()=>setDialog(null)} variant={dialog==='collection'||dialog==='rank'||dialog==='career'?'album':'standard'} className={dialog==='collection'?'collection-album-dialog':dialog==='rank'?'leaderboard-dialog':dialog==='career'?'career-statistics-dialog':dialog==='announcement'?'announcement-dialog':dialog==='start'?'career-start-dialog':''}><div className="contract-panel">
 {dialog==='debug'&&DevConsole?<Suspense fallback={<p>加载控制台…</p>}><DevConsole/></Suspense>:dialog==='collection'?<ContractCollection/>:dialog==='start'?<CareerStartCard month={store.state.month} credit={store.state.credit} onResume={resume} onStart={start} error={/归档写入失败/.test(store.message)?store.message:undefined}/>:dialog==='rank'?<ContractLeaderboard/>:dialog==='career'?<CareerStatistics/>:dialog==='announcement'?<article className="game-announcement"><h3>训练师档案更新</h3><p>球星与器械图鉴现已合并，可在收藏图鉴中切换查看。</p><p>生涯记录会保留最高挑战月份、累计训练与交付，以及最高价值球员。</p><p>已获得的球星模板将保留外观，受伤降级不会退回旧模板。</p><small>排行榜在本局结束并返回首页后提交最佳成绩；本地记录独立保存。可在设置中提交意见反馈。</small></article>:null}
 </div></ComicDialog>}
 </main>;
}
