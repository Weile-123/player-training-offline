import {HomeIcon} from './HomeIcon';
import {assetUrl} from '../presentation/assetUrls';
import { useState } from 'react';
import App from '../App';
import { useGame } from '../store';
import { CollectionPanel } from './Collection';
import { useModalAccessibility } from '../presentation/useModalAccessibility';
import { ComicDialog } from './ComicDialog';
import { ExistingCareerWarning } from './ComicDialogContent';
const money = (n: number) => '$' + n.toLocaleString('en-US');
const art = (name: string) => assetUrl('art/home/' + name + '.png');

export default function Home() {
 const store = useGame();
 const [screen, setScreen] = useState<'home' | 'game' | 'collection'>('home');
 const [dialog, setDialog] = useState<'rank' | 'feedback' | 'overwrite' | 'no-save' | null>(null);
 const [message, setMessage] = useState('');
 useModalAccessibility();
 const home = () => { setScreen('home'); setDialog(null); setMessage(''); };
 const start = () => { store.startNewGame(); setDialog(null); setScreen('game'); };
 const copy = async () => {
  const text = `《负债千万：从训练球星开始》反馈\n版本：单生涯首页 v3\n浏览器：${navigator.userAgent}\n问题描述：\n复现步骤：`;
  try { await navigator.clipboard.writeText(text); setMessage('反馈信息已复制，请粘贴给开发者并补充问题。'); }
  catch { setMessage('无法访问剪贴板，请直接描述问题和复现步骤。'); }
 };
 if (screen === 'game') return <App onHome={home}/>;
 if (screen === 'collection') return <main className="shell comic-ui"><div className="game-home-link"><button onClick={home}>← 返回首页</button><span>永久球星图鉴</span></div><CollectionPanel/></main>;
 const warning = /失败|受限|未写入|损坏/.test(store.saveMessage) ? store.saveMessage : '';
 return <main className="home-page" aria-label="负债千万游戏首页">
  <div className="home-background" aria-hidden="true"/>
  <div className="home-frame">
   <header className="home-brand"><h1><img src={art('title-comic')} alt="负债千万：从训练球星开始"/></h1></header>
   <div className="home-scene-space" aria-hidden="true"/>
   <section className="home-controls" aria-label="训练师生涯">
    {warning && <p className="home-notice" role="status">{warning}</p>}
    <div className="home-career-actions">
     {store.hasSave
      ? <button className="art-button home-new-career" aria-label="开启新生涯" onClick={() => setDialog('overwrite')}><img src={art('button-new-career')} alt=""/></button>
      : <button className="art-button home-new-game" aria-label="新游戏" onClick={start}><img src={art('button-new-game')} alt=""/></button>}
     <button className="art-button home-continue legacy-vector-button" aria-label="继续游戏" onClick={() => { if (store.continueGame()) setScreen('game'); else setDialog('no-save'); }}><HomeIcon name="folder"/><span>继续游戏</span><HomeIcon name="arrow"/></button>
    </div>
    <nav className="home-menu" aria-label="更多功能">
     <button className="art-button" aria-label="图鉴" onClick={() => setScreen('collection')}><img src={art('button-collection')} alt=""/></button>
     <button className="art-button" aria-label="排行榜" onClick={() => setDialog('rank')}><img src={art('button-rank')} alt=""/></button>
     <button className="art-button legacy-vector-button" aria-label="反馈" onClick={() => { setMessage(''); setDialog('feedback'); }}><HomeIcon name="feedback"/><span>反馈</span></button>
    </nav>
   </section>
  </div>
  {dialog && <ComicDialog title={dialog === 'rank' ? '本机生涯纪录' : dialog === 'feedback' ? '反馈' : dialog === 'no-save' ? '本地无存档' : '覆盖已有存档？'} onClose={()=>setDialog(null)}>
   {dialog === 'no-save' ? <>
    <p>本地无存档，请先开始新游戏。</p>
    <button className="primary mt-5" onClick={() => setDialog(null)}>知道了</button>
   </> : dialog === 'overwrite' ? <>
    <ExistingCareerWarning game={store.game}/>
    <div className="dialog-actions grid grid-cols-2 gap-3 mt-5"><button className="secondary" onClick={() => setDialog(null)}>保留存档</button><button className="primary" onClick={start}>覆盖存档，开启新生涯</button></div>
   </> : dialog === 'rank' ? <>
    <p>暂未接入线上排行，以下为本机当前生涯的真实纪录。</p>
    {store.hasSave ? <div className="local-rank"><strong>当前生涯</strong><span>第 {store.game.month} 月 · {store.game.status === 'over' ? '已关营' : '经营中'}</span><b>累计还款 {money(store.game.totalPaid)}</b></div> : <p>还没有生涯纪录，开始新游戏后记录。</p>}
    <button className="secondary mt-5" onClick={() => setDialog(null)}>关闭</button>
   </> : <>
    <p>可将反馈信息复制给开发者，补充截图、问题描述和复现步骤。此入口不会自动发送信息。</p>
    <button className="primary mt-5" onClick={copy}>复制反馈信息</button>{message && <p role="status">{message}</p>}
    <button className="secondary mt-3" onClick={() => setDialog(null)}>关闭</button>
   </>}
  </ComicDialog>}
 </main>;
}
