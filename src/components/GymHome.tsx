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
 const [hydrationFinished,setHydrationFinished]=useState(false);
 const homeFrame=useRef<HTMLDivElement>(null),homeDesign=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const frame=homeFrame.current,design=homeDesign.current;
  if(playing||!frame||!design)return;
  let request=0,active=true;
  const fit=()=>{
   request=0;
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
 },[playing,store.hasSave]);
 useModalAccessibility(!playing);
 useEffect(() => gameAudio.install(document), []);
 useEffect(() => {
  let active=true;
  void useGym.getState().hydrate().then(()=>{if(active)setHydrationFinished(true);}).catch(()=>{/* The store keeps the read error visible. */});
  return()=>{active=false;};
 }, []);
 const businessReady=()=>{
  const current=useGym.getState();
  return startupAssetsReady&&hydrationFinished&&!busy&&!current.hydrating
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
  setBusy(true);
  try {
   const result = await useGym.getState().start();
   if (!result.error) {
    setPanel(null);
    setPlaying(true);
   }
  } finally { setBusy(false); }
 };

 if (playing) return <GymGame onHome={() => {
  void useGym.getState().flush();
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
  {panel === 'settings' && <HomeSettings cloudEnabled={false} onClose={() => setPanel(null)}/>}
  {panel && panel !== 'settings' && <ComicDialog title={titles[panel]} onClose={() => setPanel(null)} variant="album" className={panel === 'collection' ? 'collection-album-dialog' : panel === 'rank' ? 'leaderboard-dialog' : 'career-statistics-dialog gym-career-dialog'}>
   {panel === 'alumni' ? <GymCareerPanel state={store.state} loadAlumni={store.hasSave ? store.loadAlumni : undefined} onCollection={tab => {setCollectionTab(tab); setPanel('collection');}}/> : <div className="contract-panel gym-panels">
    {panel === 'collection' && <GymCollectionPanel state={store.state} initialTab={collectionTab} onAction={action => void homeAction(action)} busy={busy || store.hydrating || !store.hasSave}/>}
    {panel === 'rank' && <GymLeaderboard/>}
   </div>}
  </ComicDialog>}
 </main>;
}
