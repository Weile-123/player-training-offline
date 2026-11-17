import {useEffect,useState,type ComponentType} from 'react';
import {finishLoading,preloadAssets,subscribeLoading,type LoadingProgress} from '../presentation/preloadAssets';
import {GymHomeArt,GymHomeBackground,GymHomeFooter} from './GymHomeArt';
import './AppBootstrap.css';
import './GymHome.css';

export default function AppBootstrap(){
 const [progress,setProgress]=useState<LoadingProgress>({percent:0,completed:0,total:0,error:''});
 const [Home,setHome]=useState<ComponentType<{startupAssetsReady?:boolean}>|null>(null),[attempt,setAttempt]=useState(0);
 const [startupAssetsReady,setStartupAssetsReady]=useState(false);
 useEffect(()=>{
  let active=true;const unsubscribe=subscribeLoading(setProgress);setStartupAssetsReady(false);
  void (async()=>{try{
   // Readiness means every current-game image is usable, including panel art
   // and local portraits. Slow/failed downloads must never masquerade as 100%.
   const [module]=await Promise.all([import('./GymHome'),preloadAssets()]);
   if(!active)return;setStartupAssetsReady(true);finishLoading();
   // Paint the real 100% state once before showing the ready home screen.
   requestAnimationFrame(()=>requestAnimationFrame(()=>{if(active)setHome(()=>module.default)}));
  }catch(error){if(active)setProgress(p=>({...p,error:error instanceof Error?error.message:'加载失败，请重试。'}));}})();
  return()=>{active=false;unsubscribe()};
 },[attempt]);
 if(Home)return <Home startupAssetsReady={startupAssetsReady}/>;
 return <main className="home-page gym-home gym-home-b loading-page" aria-label="游戏资源加载"><GymHomeBackground/><div className="gym-home-design"><GymHomeArt/><section className="loading-card" aria-busy={!progress.error}>
  <div className="loading-heading"><strong>{progress.error?'加载暂未完成':progress.percent===100?'准备就绪':'正在准备训练营'}</strong><b>{progress.percent}<small>%</small></b></div>
  <div className="loading-track" role="progressbar" aria-label="游戏资源加载进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}><span style={{width:`${progress.percent}%`}}/></div>
  <p role="status">{progress.error||'首次加载可能需要一些时间，请耐心等待'}</p>
  {progress.error&&<button onClick={()=>setAttempt(n=>n+1)}>重新加载</button>}
 </section><GymHomeFooter/></div></main>;
}
