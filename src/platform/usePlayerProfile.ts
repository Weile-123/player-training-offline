import { useEffect, useState } from 'react';
import { fallbackProfile, loadPlayerProfile, type PlayerProfile } from './hupuPlayers';

export function usePlayerProfile(id:string|null|undefined) {
 const [loaded,setLoaded] = useState<{id:string;profile:PlayerProfile|null}|null>(null);
 useEffect(()=>{
  if (!id) return;
  let current=true;
  void loadPlayerProfile(id).then(profile=>{if(current)setLoaded({id,profile});});
  return ()=>{current=false;};
 },[id]);
 return loaded && loaded.id===id ? loaded.profile : fallbackProfile(id);
}
