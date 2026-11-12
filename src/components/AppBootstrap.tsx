import {useEffect,useState,type ComponentType} from 'react';
import {finishLoading,preloadAssets,subscribeLoading,type LoadingProgress} from '../presentation/preloadAssets';
import {localAsset} from '../presentation/assetUrls';
import './AppBootstrap.css';

export default function AppBootstrap(){
 const [progress,setProgress]=useState<LoadingProgress>({percent:0,completed:0,total:0,error:''});
 const [Home,setHome]=useState<ComponentType|null>(null),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let active=true;const unsubscribe=subscribeLoading(setProgress);
  void (async()=>{try{
   // Artwork/cache failure must not turn the loading screen into an entry gate.
   let preloadTimer:ReturnType<typeof setTimeout>|undefined;
   try{await Promise.race([preloadAssets(),new Promise<void>(resolve=>{preloadTimer=setTimeout(resolve,12000);})]);}
   catch{/* Individual views retain their image fallbacks. */}
   finally{clearTimeout(preloadTimer);}
   const module=await import('./GymHome');
   if(!active)return;finishLoading();
   // Paint the real 100% state once before showing the ready home screen.
   requestAnimationFrame(()=>requestAnimationFrame(()=>{if(active)setHome(()=>module.default)}));
  }catch(error){if(active)setProgress(p=>({...p,error:error instanceof Error?error.message:'加载失败，请重试。'}));}})();
  return()=>{active=false;unsubscribe()};
 },[attempt]);
 if(Home)return <Home/>;
 return <main className={`home-page contract-home loading-page ${import.meta.env.DEV?'loading-dev':''}`} aria-label="游戏资源加载"><div className="home-background"/><div className="home-frame"><header className="home-brand"><h1 className="contract-title-image"><img src={localAsset('art/home/title-comic.png')} alt="王牌训练师 · 从训练球星开始"/></h1></header><div className="home-scene-space"/><section className="loading-card" aria-busy={!progress.error}>
  <div className="loading-heading"><strong>{progress.error?'加载暂未完成':progress.percent===100?'准备就绪':'正在准备训练营'}</strong><b>{progress.percent}<small>%</small></b></div>
  <div className="loading-track" role="progressbar" aria-label="游戏资源加载进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}><span style={{width:`${progress.percent}%`}}/></div>
  <p role="status">{progress.error||'首次加载可能需要一些时间，请耐心等待'}</p>
  {progress.error&&<button onClick={()=>setAttempt(n=>n+1)}>重新加载</button>}
 </section></div></main>;
}
