import { createContext, useContext, useEffect, useState } from 'react';
import { fallbackProfile, loadPlayerProfile, type PlayerProfile } from './hupuPlayers';

/** An isolated practice view uses packaged portraits without platform requests. */
export const PlayerProfileNetworkContext = createContext(true);
export function usePlayerProfile(id:string|null|undefined) {
 const networkEnabled = useContext(PlayerProfileNetworkContext);
 const [loaded,setLoaded] = useState<{id:string;profile:PlayerProfile|null}|null>(null);
 useEffect(()=>{
  if (!id || !networkEnabled) return;
  let current=true;
  void loadPlayerProfile(id).then(profile=>{if(current)setLoaded({id,profile});});
  return ()=>{current=false;};
 },[id, networkEnabled]);
 return networkEnabled && loaded && loaded.id===id ? loaded.profile : fallbackProfile(id);
}
