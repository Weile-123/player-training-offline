import {useEffect, useState} from 'react';
import {useGym} from '../gymStore';
import {assetUrl} from '../presentation/assetUrls';
import {gameAudio} from '../presentation/audio';
import {useModalAccessibility} from '../presentation/useModalAccessibility';
import {ComicDialog} from './ComicDialog';
import {GameIcon} from './GameIcon';
import {HomeMenuButton} from './HomeMenuButton';
import {HomeSettings} from './HomeSettings';
import {GymCollectionPanel} from './GymPanels';
import {GymCareerPanel} from './GymCareerPanel';
import {GymLeaderboard} from './GymLeaderboard';
import {gymLeaderboard, gymLeaderboardConfigured, gymRankReference} from '../platform/gymLeaderboard';
import type {GymAction} from '../game/gym/engine';
import GymGame from './GymGame';
import './GymGame.css';
import './GymHome.css';

type HomePanel = 'settings' | 'collection' | 'rank' | 'alumni' | 'start' | null;

export default function GymHome() {
 const store = useGym();
 const [playing, setPlaying] = useState(false);
 const [panel, setPanel] = useState<HomePanel>(null);
 const [busy, setBusy] = useState(false);
 useModalAccessibility(!playing);
 useEffect(() => gameAudio.install(document), []);
 useEffect(() => {void useGym.getState().hydrate();}, []);
 useEffect(() => {
  if (!playing && !store.hydrating && store.hasSave && gymLeaderboardConfigured()) {
   void gymLeaderboard.sync(gymRankReference(store.state)).catch(() => {/* Shown by the ranking panel; local play continues. */});
  }
 }, [playing, store.hydrating, store.hasSave]);

 const homeAction = async (action: GymAction) => {
  if (busy || store.hydrating || !store.hasSave) return;
  setBusy(true);
  try {await useGym.getState().act(action);} finally {setBusy(false);}
 };

 const start = async () => {
  if (busy || store.hydrating) return;
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

 const titles = {settings: '游戏设置', collection: '收藏图鉴', rank: '排行榜', alumni: '球馆档案', start: '开始新球馆'};
 return <main className="home-page contract-home gym-home" aria-label="王牌训练师训练馆首页">
  <div className="home-background"/>
  <div className="home-frame">
   <header className="home-brand"><h1 className="contract-title-image"><img src={assetUrl('art/home/title-comic.webp')} alt="传奇球馆 · 从训练球星开始"/></h1></header>
   <nav className="home-quick-actions" aria-label="设置"><button aria-label="设置" title="设置" onClick={() => setPanel('settings')}><GameIcon name="settings"/></button></nav>
   <div className="home-scene-space"/>
   <section className="home-controls">
    <div className="home-career-actions">
     <button className="art-button home-new-game" aria-label={store.hasSave ? '开始新球馆' : '开设训练馆'} aria-busy={busy || store.hydrating} disabled={busy || store.hydrating} onClick={() => store.hasSave ? setPanel('start') : void start()}><img src={assetUrl(`art/home/${store.hasSave ? 'button-new-career' : 'button-new-game'}.png`)} alt=""/></button>
     {store.hasSave && <button className="art-button home-continue has-progress" aria-label="继续经营" disabled={store.hydrating} onClick={() => setPlaying(true)}>
      <GameIcon name="folder"/><strong>继续经营</strong><span className="home-save-progress"><span>球馆 Lv.{store.state.gymLevel}</span><span>赞助券 {store.state.credits}</span></span><span className="continue-chevron" aria-hidden="true">›</span>
     </button>}
    </div>
    {store.hydrating && <p className="contract-home-message" role="status">正在恢复球馆与历史档案…</p>}
    <nav className="home-menu" aria-label="更多功能"><HomeMenuButton kind="collection" onClick={() => setPanel('collection')}/><HomeMenuButton kind="rank" onClick={() => setPanel('rank')}/><HomeMenuButton kind="career" onClick={() => setPanel('alumni')}/></nav>
    {(store.actionError || /失败|不可用|限制/.test(store.saveMessage)) && <p className="contract-home-message" role="alert">{store.actionError || store.saveMessage}</p>}
   </section>
  </div>
  {panel === 'settings' && <HomeSettings cloudEnabled={false} onClose={() => setPanel(null)}/>}
  {panel && panel !== 'settings' && <ComicDialog title={titles[panel]} onClose={() => setPanel(null)} variant={panel === 'collection' || panel === 'rank' || panel === 'alumni' ? 'album' : 'standard'} className={panel === 'collection' ? 'collection-album-dialog' : panel === 'rank' ? 'leaderboard-dialog' : panel === 'alumni' ? 'career-statistics-dialog gym-career-dialog gym-design-dialog' : panel === 'start' ? 'career-start-dialog' : ''}>
   <div className="contract-panel gym-panels">
    {panel === 'start' && <><h3>开设新的训练馆</h3><p>球馆经营进度、背包、在训球员和校友档案将重新开始，已获得的球星与器材图鉴保留。</p><button className="primary" disabled={busy} onClick={() => void start()}>确认开始</button>{store.actionError && <p role="alert">{store.actionError}</p>}</>}
    {panel === 'collection' && <><GymCollectionPanel state={store.state} onAction={action => void homeAction(action)} busy={busy || store.hydrating || !store.hasSave}/>{store.actionError && <p role="alert">{store.actionError}</p>}</>}
    {panel === 'rank' && <GymLeaderboard/>}
    {panel === 'alumni' && <GymCareerPanel state={store.state} loadAlumni={store.loadAlumni}/>}
   </div>
  </ComicDialog>}
 </main>;
}
