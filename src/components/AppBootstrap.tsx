import {useEffect,useState,type ComponentType} from 'react';
import {finishLoading,preloadAssets,subscribeLoading,type LoadingProgress} from '../presentation/preloadAssets';
import {GymHomeArt,GymHomeBackground,GymHomeFooter} from './GymHomeArt';
import './AppBootstrap.css';
import './GymHome.css';

export default function AppBootstrap(){
 const [progress,setProgress]=useState<LoadingProgress>({percent:0,completed:0,total:0,error:''});
 const [Home,setHome]=useState<ComponentType<{startupAssetsReady?:boolean}>|null>(null),[attempt,setAttempt]=useState(0);
 const [startupAssetsReady,setStartupAssetsReady]=useState(false),[moduleError,setModuleError]=useState('');
 useEffect(()=>{
  let active=true;const unsubscribe=subscribeLoading(setProgress);setStartupAssetsReady(false);
  void (async()=>{try{
   // The visible cover, court, and training controls must be usable before
   // entering the gym. Art from secondary screens loads on demand.
   const home=import('./GymEntry').catch(error=>{if(active)setModuleError('游戏模块加载失败，请重新加载。');throw error;});
   const [module]=await Promise.all([home,preloadAssets()]);
   if(!active)return;setStartupAssetsReady(true);finishLoading();
   // Paint the real 100% state once before showing the ready home screen.
   requestAnimationFrame(()=>requestAnimationFrame(()=>{if(active)setHome(()=>module.default)}));
  }catch(error){if(active)setProgress(p=>({...p,error:error instanceof Error?error.message:'加载失败，请重试。'}));}})();
  return()=>{active=false;unsubscribe()};
 },[attempt]);
 if(Home)return <Home startupAssetsReady={startupAssetsReady}/>;
 const error=moduleError||progress.error;
 return <main className="home-page gym-home gym-home-b loading-page" aria-label="游戏资源加载"><GymHomeBackground/><div className="gym-home-design"><GymHomeArt/><section className="loading-card" aria-busy={!error}>
  <div className="loading-heading"><strong>{error?'加载暂未完成':progress.percent===100?'准备就绪':'正在准备训练营'}</strong><b>{progress.percent}<small>%</small></b></div>
  <div className="loading-track" role="progressbar" aria-label="游戏资源加载进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}><span style={{width:`${progress.percent}%`}}/></div>
  <p role="status">{error||'首次加载可能需要一些时间，请耐心等待'}</p>
  {error&&<button onClick={()=>moduleError?location.reload():setAttempt(n=>n+1)}>重新加载</button>}
 </section><GymHomeFooter/></div></main>;
}
