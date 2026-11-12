import {useEffect, useState} from 'react';
import {useGym} from '../gymStore';
import {assetUrl} from '../presentation/assetUrls';
import {gameAudio} from '../presentation/audio';
import {saveSoundEnabled, soundEnabled} from '../presentation/sampleAudio';
import {decodePreferences, presentationConfig} from '../presentation/feedback';
import {useModalAccessibility} from '../presentation/useModalAccessibility';
import {ComicDialog} from './ComicDialog';
import {GameIcon} from './GameIcon';
import {HomeMenuButton} from './HomeMenuButton';
import {GymAlumniPanel, GymCollectionPanel} from './GymPanels';
import GymGame from './GymGame';
import './GymGame.css';
import './GymHome.css';

type HomePanel = 'settings' | 'collection' | 'rank' | 'alumni' | 'start' | null;

export default function GymHome() {
 const store = useGym();
 const [playing, setPlaying] = useState(false);
 const [panel, setPanel] = useState<HomePanel>(null);
 const [busy, setBusy] = useState(false);
 const [sound, setSound] = useState(soundEnabled);
 const [reduced, setReduced] = useState(() => {
  try { return decodePreferences(localStorage.getItem(presentationConfig.preferenceKey)).reducedMotion; }
  catch { return false; }
 });
 useModalAccessibility(!playing);
 useEffect(() => gameAudio.install(document), []);

 const start = async () => {
  if (busy) return;
  setBusy(true);
  try {
   const result = await useGym.getState().start();
   if (!result.error) {
    setPanel(null);
    setPlaying(true);
   }
  } finally { setBusy(false); }
 };

 const changeReduced = (enabled: boolean) => {
  setReduced(enabled);
  try {
   const preferences = decodePreferences(localStorage.getItem(presentationConfig.preferenceKey));
   localStorage.setItem(presentationConfig.preferenceKey, JSON.stringify({version: 1, ...preferences, reducedMotion: enabled}));
  } catch { /* The current page still honors the preference. */ }
 };

 if (playing) return <GymGame onHome={() => {
  void useGym.getState().flush();
  setPlaying(false);
 }}/>;

 const titles = {settings: '游戏设置', collection: '收藏图鉴', rank: '排行榜', alumni: '球馆档案', start: '开始新球馆'};
 return <main className="home-page contract-home gym-home" aria-label="王牌训练师训练馆首页">
  <div className="home-background"/>
  <div className="home-frame">
   <header className="home-brand"><h1 className="contract-title-image"><img src={assetUrl('art/home/title-comic.png')} alt="王牌训练师 · 从训练球星开始"/></h1></header>
   <nav className="home-quick-actions" aria-label="设置"><button aria-label="设置" title="设置" onClick={() => setPanel('settings')}><GameIcon name="settings"/></button></nav>
   <div className="home-scene-space"/>
   <section className="home-controls">
    <div className="home-career-actions">
     <button className="art-button home-new-game" aria-label={store.hasSave ? '开始新球馆' : '开设训练馆'} aria-busy={busy} disabled={busy} onClick={() => store.hasSave ? setPanel('start') : void start()}><img src={assetUrl(`art/home/${store.hasSave ? 'button-new-career' : 'button-new-game'}.png`)} alt=""/></button>
     {store.hasSave && <button className="art-button home-continue has-progress" aria-label="继续经营" onClick={() => {void store.tick(); setPlaying(true);}}>
      <GameIcon name="folder"/><strong>继续经营</strong><span className="home-save-progress"><span>球馆 Lv.{store.state.gymLevel}</span><span>赞助券 {store.state.credits}</span></span><span className="continue-chevron" aria-hidden="true">›</span>
     </button>}
    </div>
    <nav className="home-menu" aria-label="更多功能"><HomeMenuButton kind="collection" onClick={() => setPanel('collection')}/><HomeMenuButton kind="rank" onClick={() => setPanel('rank')}/><HomeMenuButton kind="career" onClick={() => setPanel('alumni')}/></nav>
    {(store.actionError || /失败|不可用|限制/.test(store.saveMessage)) && <p className="contract-home-message" role="alert">{store.actionError || store.saveMessage}</p>}
   </section>
  </div>
  {panel && <ComicDialog title={titles[panel]} onClose={() => setPanel(null)} variant={panel === 'collection' || panel === 'rank' || panel === 'alumni' ? 'album' : 'standard'} className={panel === 'collection' ? 'collection-album-dialog' : panel === 'rank' ? 'leaderboard-dialog' : panel === 'alumni' ? 'career-statistics-dialog' : panel === 'start' ? 'career-start-dialog' : ''}>
   <div className="contract-panel gym-panels">
    {panel === 'start' && <><h3>开设新的训练馆</h3><p>球馆经营进度、背包、在训球员和校友档案将重新开始，已获得的球星与器材图鉴保留。</p><button className="primary" disabled={busy} onClick={() => void start()}>确认开始</button>{store.actionError && <p role="alert">{store.actionError}</p>}</>}
    {panel === 'collection' && <GymCollectionPanel state={store.state} onAction={() => {}}/>}
    {panel === 'rank' && <><h3>球员榜与球馆榜</h3><p>排行榜将在后续版本开放。继续培养球员、提升球馆，积累你的经营成果。</p></>}
    {panel === 'alumni' && <GymAlumniPanel state={store.state} onAction={() => {}}/>}
    {panel === 'settings' && <div className="gym-settings">
     <label><span>游戏音效</span><input type="checkbox" checked={sound} onChange={event => {setSound(event.target.checked); saveSoundEnabled(event.target.checked);}}/></label>
     <label><span>减少动态效果</span><input type="checkbox" checked={reduced} onChange={event => changeReduced(event.target.checked)}/></label>
     <h3>训练说明</h3><p>每次投篮消耗 1 体力，手动冷却 1 秒，只训练当前选中的球员。训练获得经验，经验槽升满后升级并增加属性。</p><p>维持 30% 获得 8 经验、成功 60% 获得 12 经验、大成功 10% 获得 20 经验。每级需求可点击训练页的经验槽查看。</p><p>训练位数等于球馆等级。Lv.2 免费开放每人独立自动训练，基础 2 秒/球，可升级自动项目提速。到球员名册选人、招募或启停自动。</p><p>先选专项训练计划与可选的赞助合作。每 10 球完成一课并恢复体力，完整课程提高推荐时的培养声望；培养加券同时检查当前等级和模板档次，合作达标另奖券与声望。</p><p>推荐球员签约可获得赞助券与声望。球馆项目和器材由在训球员共享，空位可免费招募新人。</p><p className="gym-muted">自动仅在训练馆页面可见时进行。离线期间恢复体力，不补投篮；排行榜将在后续版本开放。</p>
    </div>}
   </div>
  </ComicDialog>}
 </main>;
}
