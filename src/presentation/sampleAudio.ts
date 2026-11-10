import {decodePreferences,presentationConfig} from './feedback';
import ball1 from '../videos/ball1.wav?url';
import ball2 from '../videos/ball2.mp3?url';
import ball3 from '../videos/ball3.wav?url';
import ball4 from '../videos/ball4.wav?url';
import ball5 from '../videos/ball5.wav?url';
import click from '../videos/optimized/click-responsive.wav?url';
import month from '../videos/new_month.wav?url';
import upgrade from '../videos/upgrade.wav?url';
import losslessBall1 from '../videos/optimized/ball1.flac?url';
import losslessBall3 from '../videos/optimized/ball3.flac?url';
import losslessBall4 from '../videos/optimized/ball4.flac?url';
import losslessBall5 from '../videos/optimized/ball5.flac?url';
import losslessClick from '../videos/optimized/click-responsive.flac?url';
import losslessMonth from '../videos/optimized/new_month.flac?url';
import losslessUpgrade from '../videos/optimized/upgrade.flac?url';
import type {SoundCue} from './audio';

export const audioSources:Partial<Record<SoundCue,string>>={severe:ball1,minor:ball2,hold:ball3,success:ball4,great:ball5,click,month,evolution:upgrade,unlock:upgrade};
export const losslessSources:Partial<Record<SoundCue,string>>={severe:losslessBall1,hold:losslessBall3,success:losslessBall4,great:losslessBall5,click:losslessClick,month:losslessMonth,evolution:losslessUpgrade,unlock:losslessUpgrade};
let sessionSound:boolean|undefined;
export function soundEnabled(){
 if(sessionSound!==undefined)return sessionSound;
 try{return decodePreferences(localStorage.getItem(presentationConfig.preferenceKey)).sound;}catch{return true;}
}
export function saveSoundEnabled(enabled:boolean){
 sessionSound=enabled;
 try{const preferences=decodePreferences(localStorage.getItem(presentationConfig.preferenceKey));localStorage.setItem(presentationConfig.preferenceKey,JSON.stringify({version:1,...preferences,sound:enabled}));}catch{/* Session preference still works when storage is unavailable. */}
}
type Voice={element:HTMLAudioElement;ticket:number;used:number;fallback:string;compressed:boolean};
/** Local media only: bounded voices, no network API, and failures never gate gameplay. */
export class SampleAudio{
 private voices=new Map<string,Voice[]>();
 private serial=0;
 private primed=false;
 constructor(private create:()=>HTMLAudioElement=()=>new Audio()){}
 private pool(cue:SoundCue){
  const source=audioSources[cue];if(!source)return [];
  let pool=this.voices.get(source);
  if(!pool){pool=Array.from({length:cue==='click'?2:['month','evolution','unlock'].includes(cue)?1:3},()=>{
   const element=this.create(),compressed=!!losslessSources[cue]&&!!element.canPlayType('audio/flac');
   element.preload='auto';element.src=compressed?losslessSources[cue]!:source;
   return {element,ticket:0,used:0,fallback:source,compressed};
  });this.voices.set(source,pool);}
  return pool;
 }
 /** Called inside a user gesture so delayed month/template cues also work on iOS. */
 unlock(){
  if(this.primed||!soundEnabled())return;
  this.primed=true;
  try{for(const cue of ['month','evolution'] as const)for(const voice of this.pool(cue)){
   const ticket=++voice.ticket;voice.element.muted=true;
   Promise.resolve(voice.element.play()).then(()=>{if(voice.ticket===ticket){voice.element.pause();voice.element.currentTime=0;voice.element.muted=false;}},()=>{if(voice.ticket===ticket)voice.element.muted=false;});
  }}catch{/* Unsupported media is optional. */}
 }
 async play(cue:SoundCue,enabled:boolean):Promise<boolean>{
  if(!enabled||typeof document!=='undefined'&&document.hidden)return false;
  try{
   const pool=this.pool(cue);if(!pool.length)return false;
   const voice=pool.find(v=>v.element.paused||v.element.ended)??pool.reduce((a,b)=>a.used<b.used?a:b);
   const ticket=++voice.ticket;voice.used=++this.serial;
   // Rapid tapping stays bounded instead of accumulating dozens of loud sounds.
   const playing=[...this.voices.values()].flat().filter(v=>!v.element.paused&&v!==voice);
   if(playing.length>=6){const oldest=playing.reduce((a,b)=>a.used<b.used?a:b);oldest.ticket++;oldest.element.pause();}
   voice.element.pause();voice.element.currentTime=0;voice.element.muted=false;voice.element.volume=cue==='click'?.5:.8;
   let timer:ReturnType<typeof setTimeout>|undefined;
   const attempt=async()=>{
    try{await voice.element.play();return true;}catch(error){
     // A decoder error may fall back to the source WAV; never bypass autoplay denial.
     if(voice.ticket!==ticket||!voice.compressed||!(error instanceof Error)||error.name!=='NotSupportedError')return false;
     voice.compressed=false;voice.element.src=voice.fallback;
     try{await voice.element.play();return true;}catch{return false;}
    }
   };
   const started=await Promise.race([
    attempt(),
    new Promise<boolean>(resolve=>{timer=setTimeout(()=>resolve(false),1200);})
   ]);clearTimeout(timer);
   if(voice.ticket!==ticket)return false;
   if(!started){voice.ticket++;voice.element.pause();}
   return started;
  }catch{return false;}
 }
 mute(){for(const pool of this.voices.values())for(const voice of pool){voice.ticket++;voice.element.pause();}}
 install(root:Document){
  // Warm the short UI cue before the first interaction; media remains paused.
  try{if(soundEnabled())this.pool('click');}catch{/* Audio must never block mounting. */}
  const click=(event:Event)=>{
   const target=event.target instanceof Element?event.target:null;
   const button=target?.closest('button,[role="button"],[role="switch"]');
   if(!button||button.matches(':disabled,[aria-disabled="true"]')||button.closest('[inert]')||event.defaultPrevented)return;
   if(!button.matches('.dock-shoot,[data-audio-silent]'))void this.play('click',soundEnabled());
   this.unlock();
  };
  const hide=()=>{if(root.hidden)this.mute();};
  // Capture starts audio before synchronous game handlers/rendering. Keep click
  // semantics so scrolling/cancelled pointer gestures do not produce feedback.
  root.addEventListener('click',click,true);root.addEventListener('visibilitychange',hide);
  return()=>{root.removeEventListener('click',click,true);root.removeEventListener('visibilitychange',hide);this.mute();};
 }
}
