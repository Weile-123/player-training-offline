import {useContract} from '../contractStore';
import {getHupuUser} from './hupuAccount';
import {leaderboardConfigured,leaderboardRequest} from './leaderboard';
import {createTemplateUnlockReporter} from './templateUnlocks';

export function installUnlockStatistics(){
 if(import.meta.env.DEV||!leaderboardConfigured()||['localhost','127.0.0.1','::1','[::1]'].includes(location.hostname))return ()=>{};
 let storage:Pick<Storage,'getItem'|'setItem'>;
 try{storage=window.localStorage;}catch{storage={getItem:()=>null,setItem:()=>{}};}
 const reporter=createTemplateUnlockReporter({storage,enabled:()=>!Object.values(useContract.getState().debug).some(Boolean),user:getHupuUser,
  send:entries=>leaderboardRequest('/statistics/template-unlocks','POST',{entries},true)});
 reporter.observe(Object.keys(useContract.getState().profile.collection),'history');
 // Compare membership only: changing player ratings does not cause network requests.
 const unsubscribe=useContract.subscribe((next,previous)=>{
  const added=Object.keys(next.profile.collection).filter(id=>!previous.profile.collection[id]);
  if(!added.length)return;
  // A cloud restore resets lastEvents; imported records are historical, not today's unlocks.
  reporter.observe(added,next.lastEvents.length?'unlock':'history');
 });
 const retry=()=>{if(document.visibilityState==='visible')void reporter.flush();};
 const timer=setInterval(retry,30000);
 window.addEventListener('online',retry);document.addEventListener('visibilitychange',retry);
 void reporter.flush();
 return ()=>{unsubscribe();clearInterval(timer);window.removeEventListener('online',retry);document.removeEventListener('visibilitychange',retry);};
}
