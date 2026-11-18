import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {useGym} from '../gymStore';
import {gameAudio} from '../presentation/audio';
import {useModalAccessibility} from '../presentation/useModalAccessibility';
import {useShaperPerformanceReady} from '../presentation/useShaperPerformanceReady';
import {ComicDialog} from './ComicDialog';
import {ActionNotice} from './ActionNotice';
import {GymHomeArt, GymHomeBackground, GymHomeFooter, GymHomeIcon} from './GymHomeArt';
import {HomeSettings} from './HomeSettings';
import {GymCollectionPanel} from './GymPanels';
import {GymCareerPanel} from './GymCareerPanel';
import {GymLeaderboard} from './GymLeaderboard';
import {GymTutorial} from './GymTutorial';
import {completeGymTutorial,shouldOfferGymTutorial} from '../presentation/gymTutorialPreference';
import {gymLeaderboard,gymLeaderboardConfigured,gymRankReference} from '../platform/gymLeaderboard';
import type {GymAction} from '../game/gym/engine';
import GymGame from './GymGame';
import './GymGame.css';
import './GymHome.css';

type HomePanel = 'settings' | 'collection' | 'rank' | 'alumni' | null;

export default function GymHome({startupAssetsReady=false}:{startupAssetsReady?:boolean}={}) {
 const store = useGym();
 const [playing, setPlaying] = useState(false);
 const [panel, setPanel] = useState<HomePanel>(null);
 const [collectionTab, setCollectionTab] = useState<0 | 1>(0);
 const [busy, setBusy] = useState(false);
 const [tutorialMode,setTutorialMode]=useState<'new'|'replay'|null>(null);
 const [tutorialError,setTutorialError]=useState('');
 const tutorialTransition=useRef(false);
 const [hydrationFinished,setHydrationFinished]=useState(false);
 const homeFrame=useRef<HTMLDivElement>(null),homeDesign=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const frame=homeFrame.current,design=homeDesign.current;
  if(playing||tutorialMode||!frame||!design)return;
  let request=0,active=true;
  const fit=()=>{
   request=0;
   if(design.querySelector('.b-actions')&&design.clientWidth>0){
    const style=getComputedStyle(design);
    const pixels=(value:string,fallback=0)=>{const parsed=Number.parseFloat(value);return Number.isFinite(parsed)?parsed:fallback;};
    const contentWidth=design.clientWidth-pixels(style.paddingLeft)-pixels(style.paddingRight);
    const sideGap=contentWidth-pixels(style.getPropertyValue('--home-command-width'),240)-pixels(style.getPropertyValue('--home-menu-width'),88);
    const menuGap=pixels(style.getPropertyValue('--home-wide-menu-gap'),12);
    design.dataset.layout=sideGap<menuGap?'narrow':'wide';
   }
   // Layout is resolved first. These dimensions are unscaled, unlike screen bounds.
   const available=frame.clientHeight,natural=Math.max(design.scrollHeight,design.clientHeight);
   if(available>0&&natural>0)design.style.setProperty('--home-fit-scale',String(Math.min(1,available/natural)));
  };
  const schedule=()=>{if(active&&!request)request=requestAnimationFrame(fit);};
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;
  observer?.observe(frame);observer?.observe(design);
  for(const child of design.children)observer?.observe(child);
  window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);
  void document.fonts?.ready.then(schedule);
  fit();
  return()=>{active=false;cancelAnimationFrame(request);observer?.disconnect();window.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('resize',schedule);};
 },[playing,store.hasSave,tutorialMode]);
 useModalAccessibility(!playing&&!tutorialMode);
 useEffect(() => gameAudio.install(document), []);
 useEffect(() => {
  let active=true;
  void useGym.getState().hydrate().then(()=>{if(active)setHydrationFinished(true);}).catch(()=>{/* The store keeps the read error visible. */});
  return()=>{active=false;};
 }, []);
 const businessReady=()=>{
  const current=useGym.getState();
  return !tutorialMode&&startupAssetsReady&&hydrationFinished&&!busy&&!current.hydrating
   &&!current.actionError
   &&!/失败|不可用|限制|无法读取|同步暂停/.test(current.saveMessage);
 };
 useShaperPerformanceReady(businessReady(),businessReady);

 const homeAction = async (action: GymAction) => {
  if (busy || store.hydrating || !store.hasSave) return;
  setBusy(true);
  try {await useGym.getState().act(action);} finally {setBusy(false);}
 };

 const start = async () => {
  const current = useGym.getState();
  if (busy || current.hydrating) return;
  // A late click from the pre-hydration screen can only continue an existing gym.
  if (current.hasSave) {setPlaying(true); return;}
  if(shouldOfferGymTutorial()){setTutorialError('');setPanel(null);setTutorialMode('new');return;}
  setBusy(true);
  try {
   const result = await useGym.getState().start();
   if (!result.error) {
    setPanel(null);
    setPlaying(true);
   }
  } finally { setBusy(false); }
 };

 const finishTutorial=async()=>{
  if(tutorialTransition.current)return;
  tutorialTransition.current=true;
  setTutorialError('');
  try{
   if(tutorialMode==='replay'){completeGymTutorial();setTutorialMode(null);setPanel('settings');return;}
   setBusy(true);
   const current=useGym.getState();
   const result=current.hasSave?null:await current.start();
   if(!result?.error){completeGymTutorial();setTutorialMode(null);setPanel(null);setPlaying(true);}
  }catch(error){setTutorialError(error instanceof Error?error.message:'开馆暂未成功，请重试');}
  finally{tutorialTransition.current=false;setBusy(false);}
 };

 useEffect(()=>{
  if(!playing&&!tutorialMode&&hydrationFinished&&!store.hydrating&&store.hasSave&&!store.debugSessionActive&&gymLeaderboardConfigured()){
   void gymLeaderboard.sync(gymRankReference(useGym.getState().state)).catch(()=>{/* The ranking screen displays retryable submission errors. */});
  }
 },[playing,tutorialMode,hydrationFinished,store.hydrating,store.hasSave,store.debugSessionActive]);

 if(tutorialMode)return <GymTutorial onComplete={()=>void finishTutorial()} onSkip={()=>void finishTutorial()} error={tutorialError||store.actionError}/>;

 if (playing) return <GymGame onHome={() => {
  const current = useGym.getState();
  if (current.debugSessionActive) {void current.debugRestoreGym?.().then(() => setPlaying(false)); return;}
  void current.flush();
  setPlaying(false);
 }}/>;

 const titles = {settings: '游戏设置', collection: '收藏图鉴', rank: '排行榜', alumni: '球馆档案'};
 const homeError=store.actionError||(/失败|不可用|限制/.test(store.saveMessage)?store.saveMessage:'');
 return <main className="home-page gym-home gym-home-b" aria-label="传奇球馆首页">
  <GymHomeBackground/>
  <div className="gym-home-fit" ref={homeFrame}>
  <div className="gym-home-design" ref={homeDesign} data-mode={store.hasSave ? 'saved' : 'new'}>
   <GymHomeArt/>
   <div className="b-lower">
    <div className="b-actions">
   <section className="b-command" aria-label="球馆经营">
    {store.hasSave ? <>
     <div className="b-save"><span>当前球馆</span><strong>Lv.<b>{store.state.gymLevel}</b></strong><i/><span>赞助券 <b>{store.state.credits.toLocaleString('zh-CN')}</b></span></div>
     <button type="button" className="b-continue" aria-label="继续经营" disabled={store.hydrating || busy} onClick={() => setPlaying(true)}><span>继续经营</span><i><GymHomeIcon name="arrow"/></i></button>
    </> : <button type="button" className="b-new" aria-label="开设训练馆" aria-busy={busy || store.hydrating} disabled={busy || store.hydrating} onClick={() => void start()}><i><GymHomeIcon name="new"/></i><strong>{busy?'正在开馆…':store.hydrating?'读取中…':'开设训练馆'}</strong></button>}
   </section>
   <nav className="b-menu" aria-label="更多功能">
    <button type="button" aria-label="球星图鉴" onClick={() => {setCollectionTab(0); setPanel('collection');}}><span><GymHomeIcon name="book"/></span><strong>图鉴</strong></button>
    <button type="button" aria-label="排行榜" onClick={() => setPanel('rank')}><span><GymHomeIcon name="rank"/></span><strong>排行榜</strong></button>
    <button type="button" aria-label="生涯" onClick={() => setPanel('alumni')}><span><GymHomeIcon name="career"/></span><strong>生涯</strong></button>
    <button type="button" aria-label="设置" onClick={() => setPanel('settings')}><span><GymHomeIcon name="settings"/></span><strong>设置</strong></button>
   </nav>
    </div>
   </div>
   <GymHomeFooter/>
   <ActionNotice message={!panel||panel==='collection'?homeError||(store.hydrating?'正在恢复球馆与历史档案…':''):''} role={homeError?'alert':'status'}/>
  </div>
  </div>
  {panel === 'settings' && <HomeSettings cloudEnabled={false} onClose={() => setPanel(null)} onTutorial={()=>{setPanel(null);setTutorialMode('replay');}}/>}
  {panel && panel !== 'settings' && <ComicDialog title={titles[panel]} onClose={() => setPanel(null)} variant="album" className={panel === 'collection' ? 'collection-album-dialog' : panel === 'rank' ? 'leaderboard-dialog' : 'career-statistics-dialog gym-career-dialog'}>
   {panel === 'alumni' ? <GymCareerPanel state={store.state} loadAlumni={store.hasSave ? store.loadAlumni : undefined} onCollection={tab => {setCollectionTab(tab); setPanel('collection');}}/> : <div className="contract-panel gym-panels">
    {panel === 'collection' && <GymCollectionPanel state={store.state} initialTab={collectionTab} onAction={action => void homeAction(action)} busy={busy || store.hydrating || !store.hasSave}/>}
    {panel === 'rank' && <GymLeaderboard/>}
   </div>}
  </ComicDialog>}
 </main>;
}
