import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store';
import { gameAudio } from './audio';
import { decodePreferences, effectiveReducedMotion, presentationConfig, TrainingGate, type ShotFeedback } from './feedback';
export function usePresentation(){
 const [preferences,setPreferences]=useState(()=>{try{return decodePreferences(localStorage.getItem(presentationConfig.preferenceKey));}catch{return decodePreferences(null);}});
 const [preferenceMessage,setPreferenceMessage]=useState('');
 const [systemReduced,setSystemReduced]=useState(()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches);
 const [feedback,setFeedback]=useState<ShotFeedback|null>(null),[shots,setShots]=useState<ShotFeedback[]>([]),[audioMessage,setAudioMessage]=useState('');
 const gate=useRef(new TrainingGate()),pendingIds=useRef(new Set<number>());
 const reduced=effectiveReducedMotion(preferences,systemReduced);
 const busy=shots.length>0&&!reduced;
 useEffect(()=>{if(typeof matchMedia!=='function')return;const media=matchMedia('(prefers-reduced-motion: reduce)'),listener=()=>setSystemReduced(media.matches);if(media.addEventListener){media.addEventListener('change',listener);return()=>media.removeEventListener('change',listener);}media.addListener(listener);return()=>media.removeListener(listener);},[]);
 useEffect(()=>()=>{gameAudio.mute();},[]);
 useEffect(()=>{if(reduced){pendingIds.current.clear();setShots([]);}},[reduced]);
 const finish=(id?:number)=>{
  if(id===undefined)pendingIds.current.clear();else pendingIds.current.delete(id);
  setShots(previous=>id===undefined?[]:previous.filter(shot=>shot.id!==id));
 };
 const play=(cue:Parameters<typeof gameAudio.play>[0],enabled=preferences.sound)=>{
  void gameAudio.play(cue,enabled).then(ok=>{if(enabled&&!ok)setAudioMessage('此设备暂无法播放音效，训练仍可继续');});
 };
 const train=()=>{
  // Template unlocks are recorded silently and must never block shooting.
  const before=useGame.getState().game;
  const result=gate.current.run(before,()=>{useGame.getState().train();return useGame.getState().game;});
  if(!result)return;
  setFeedback(result);
  // Functional updates retain every click, including clicks batched by React.
  if(!reduced){pendingIds.current.add(result.id);setShots(previous=>[...previous,result]);}
  play(result.evolution?'evolution':result.outcome);
 };
 const toggle=(key:'sound'|'reducedMotion')=>{
  const next={...preferences,[key]:!preferences[key]};setPreferences(next);
  try{localStorage.setItem(presentationConfig.preferenceKey,JSON.stringify({version:1,...next}));setPreferenceMessage('');}catch{setPreferenceMessage('偏好仅当前会话有效');}
  if(key==='sound'){setAudioMessage('');if(next.sound)play('success',true);else gameAudio.mute();}
  if(key==='reducedMotion'&&next.reducedMotion)finish();
 };
 return {preferences,preferenceMessage,audioMessage,reduced,feedback,shots,busy,train,finish,toggle,clear:()=>{finish();setFeedback(null);},play};
}
