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
import {loadStaticAudio} from './staticAudioLoaders';

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
type Decoded={buffer:AudioBuffer;offset:number};
type BufferVoice={source:AudioBufferSourceNode;gain:GainNode;key:string;used:number};
type AudioOptions={createContext?:()=>AudioContext|null;fetchSample?:(source:string)=>Promise<ArrayBuffer>;now?:()=>number};
const shotCues=new Set<SoundCue>(['severe','minor','hold','success','great']);
export const sampleVolume=(cue:SoundCue)=>cue==='click'?.375:shotCues.has(cue)?.6:.8;
// Source WAVs contain 139/433ms of leading quiet. The decoded path measures
// its exact attack; these measured offsets also help older media-only WebViews.
const mediaStart:Partial<Record<SoundCue,number>>={hold:.135,success:.135,great:.43};
function createInteractiveContext(){
 const Context=globalThis.AudioContext??(globalThis as typeof globalThis&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
 return Context?new Context({latencyHint:'interactive'}):null;
}
/** Keep a small attack margin instead of replaying source silence before a shot. */
export function shotStartOffset(buffer:AudioBuffer):number{
 const channels=Array.from({length:buffer.numberOfChannels},(_,channel)=>buffer.getChannelData(channel));
 let peak=0;
 for(const samples of channels)for(let i=0;i<samples.length;i++)peak=Math.max(peak,Math.abs(samples[i]));
 if(!peak)return 0;
 const threshold=Math.max(.001,peak*.02);
 for(let i=0;i<buffer.length;i++)if(channels.some(samples=>Math.abs(samples[i])>=threshold))return Math.max(0,i/buffer.sampleRate-.003);
 return 0;
}
/** Local media only: bounded voices, no network API, and failures never gate gameplay. */
export class SampleAudio{
 private voices=new Map<string,Voice[]>();
 private serial=0;
 private primed=false;
 private context:AudioContext|null=null;
 private contextUnsupported=false;
 private buffers=new Map<string,Decoded>();
 private loads=new Map<string,Promise<Decoded|null>>();
 private failed=new Set<string>();
 private bufferVoices=new Set<BufferVoice>();
 private latest=new Map<string,number>();
 private resuming:Promise<boolean>|null=null;
 private generation=0;
 private lastFailure='';
 private lastStartDelayMs=0;
 private createContext:()=>AudioContext|null;
 private fetchSample:(source:string)=>Promise<ArrayBuffer>;
 private now:()=>number;
 constructor(private create:()=>HTMLAudioElement=()=>new Audio(),options:AudioOptions={}){
  this.createContext=options.createContext??createInteractiveContext;
  this.fetchSample=options.fetchSample??loadStaticAudio;
  this.now=options.now??(()=>performance.now());
 }
 private webContext(){
  if(this.contextUnsupported)return null;
  if(this.context?.state==='closed'){this.context=null;this.resuming=null;}
  if(!this.context)try{this.context=this.createContext();if(!this.context)this.contextUnsupported=true;}
  catch{this.lastFailure='音频设备尚未就绪，请轻触页面后重试';}
  return this.context;
 }
 private load(cue:SoundCue,ctx:AudioContext):Promise<Decoded|null>{
  const key=audioSources[cue];if(!key)return Promise.resolve(null);
  const ready=this.buffers.get(key);if(ready)return Promise.resolve(ready);
  const loading=this.loads.get(key);if(loading)return loading;
  const task=(async()=>{
   try{
    const buffer=await ctx.decodeAudioData(await this.fetchSample(key));
    const decoded={buffer,offset:shotCues.has(cue)?shotStartOffset(buffer):0};
    this.buffers.set(key,decoded);this.failed.delete(key);return decoded;
   }catch{this.failed.add(key);this.lastFailure='音效加载或解码失败，可在设置中关闭后重新开启音效';return null;}
   finally{this.loads.delete(key);}
  })();
  this.loads.set(key,task);return task;
 }
 /** Fetch/decode alongside startup images, without attempting autoplay. */
 async preload():Promise<boolean>{
  if(!soundEnabled())return false;
  const ctx=this.webContext();
  const cues=Object.keys(audioSources) as SoundCue[];
  if(!ctx){try{for(const cue of cues)this.pool(cue);return true;}catch{return false;}}
  const decoded=await Promise.all(cues.map(cue=>this.load(cue,ctx)));
  return decoded.every(Boolean);
 }
 private resume(ctx:AudioContext){
  if(ctx.state==='running')return Promise.resolve(true);
  if(this.resuming)return this.resuming;
  // resume() is called synchronously by unlock(), inside the initiating gesture.
  let task:Promise<boolean>;
  try{task=Promise.resolve(ctx.resume()).then(()=>ctx.state==='running',()=>false);}catch{return Promise.resolve(false);}
  this.resuming=task;void task.then(()=>{if(this.resuming===task)this.resuming=null;});return task;
 }
 private pool(cue:SoundCue){
  const source=audioSources[cue];if(typeof source!=='string')return [];
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
  if(!soundEnabled())return;
  const ctx=this.webContext();
  if(ctx){void this.resume(ctx);void this.preload();return;}
  if(this.primed)return;
  this.primed=true;
  try{for(const cue of Object.keys(audioSources) as SoundCue[])for(const voice of this.pool(cue)){
   const ticket=++voice.ticket;voice.element.muted=true;
   Promise.resolve(voice.element.play()).then(()=>{if(voice.ticket===ticket){voice.element.pause();voice.element.currentTime=0;voice.element.muted=false;}},()=>{if(voice.ticket===ticket)voice.element.muted=false;this.primed=false;});
  }}catch{this.primed=false;}
 }
 async play(cue:SoundCue,enabled:boolean):Promise<boolean>{
  if(!enabled||typeof document!=='undefined'&&document.hidden)return false;
  const key=audioSources[cue];if(typeof key!=='string')return false;
  const ctx=this.webContext();
  if(!ctx)return this.playMedia(cue);
  const requestedAt=this.now(),generation=this.generation,ticket=++this.serial,requestKey=shotCues.has(cue)?'shot':key;this.latest.set(requestKey,ticket);
  let decoded=this.buffers.get(key);
  if(!decoded||ctx.state!=='running'){
   let timer:ReturnType<typeof setTimeout>|undefined;
   const ready=await Promise.race([
    Promise.all([this.load(cue,ctx),this.resume(ctx)]).then(([sample,running])=>running?sample:null),
    new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),120);})
   ]);clearTimeout(timer);
   if(generation!==this.generation||this.latest.get(requestKey)!==ticket||this.context!==ctx||typeof document!=='undefined'&&document.hidden)return false;
   if(!ready){this.lastFailure=ctx.state!=='running'?'音效未获播放权限，请轻触页面或在设置中重新开启':this.failed.has(key)?'音效加载或解码失败，可在设置中关闭后重新开启音效':'音效尚未准备完成，请稍后重试';return false;}
   decoded=ready;
  }
  if(generation!==this.generation||ctx.state!=='running'||this.now()-requestedAt>120)return false;
  try{
   const same=[...this.bufferVoices].filter(voice=>voice.key===key);
   const limit=cue==='click'?2:['month','evolution','unlock'].includes(cue)?1:3;
   if(same.length>=limit)this.stopBufferVoice(same.reduce((a,b)=>a.used<b.used?a:b));
   if(this.bufferVoices.size>=6)this.stopBufferVoice([...this.bufferVoices].reduce((a,b)=>a.used<b.used?a:b));
   const source=ctx.createBufferSource(),gain=ctx.createGain();
   source.buffer=decoded.buffer;gain.gain.setValueAtTime(sampleVolume(cue),ctx.currentTime);
   source.connect(gain);gain.connect(ctx.destination);
   const voice={source,gain,key,used:++this.serial};this.bufferVoices.add(voice);
   source.onended=()=>{this.bufferVoices.delete(voice);source.disconnect();gain.disconnect();};
   source.start(ctx.currentTime,decoded.offset);
   this.lastStartDelayMs=this.now()-requestedAt;this.lastFailure='';return true;
  }catch{this.lastFailure='当前设备暂无法播放音效，可在设置中重新开启';return false;}
 }
 private stopBufferVoice(voice:BufferVoice){this.bufferVoices.delete(voice);try{voice.source.stop();}catch{/* Already ended. */}voice.source.disconnect();voice.gain.disconnect();}
 private async playMedia(cue:SoundCue):Promise<boolean>{
  try{
   const pool=this.pool(cue);if(!pool.length)return false;
   const voice=pool.find(v=>v.element.paused||v.element.ended)??pool.reduce((a,b)=>a.used<b.used?a:b);
   const ticket=++voice.ticket;voice.used=++this.serial;
   // Rapid tapping stays bounded instead of accumulating dozens of loud sounds.
   const playing=[...this.voices.values()].flat().filter(v=>!v.element.paused&&v!==voice);
   if(playing.length>=6){const oldest=playing.reduce((a,b)=>a.used<b.used?a:b);oldest.ticket++;oldest.element.pause();}
   voice.element.pause();
   try{voice.element.currentTime=mediaStart[cue]??0;}catch{voice.element.currentTime=0;}
   voice.element.muted=false;voice.element.volume=sampleVolume(cue);
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
    new Promise<boolean>(resolve=>{timer=setTimeout(()=>resolve(false),cue==='click'||shotCues.has(cue)?180:1200);})
   ]);clearTimeout(timer);
   if(voice.ticket!==ticket)return false;
   if(!started){voice.ticket++;voice.element.pause();this.lastFailure='当前设备暂无法播放音效，可在设置中重新开启';}
   else this.lastFailure='';
   return started;
  }catch{return false;}
 }
 getDiagnostics(){return{engine:this.context?'web-audio':'media',prepared:this.buffers.size,failed:this.failed.size,active:this.bufferVoices.size,contextState:this.context?.state??'unavailable',lastStartDelayMs:this.lastStartDelayMs,lastFailure:this.lastFailure};}
 mute(){this.generation++;for(const voice of [...this.bufferVoices])this.stopBufferVoice(voice);for(const pool of this.voices.values())for(const voice of pool){voice.ticket++;voice.element.pause();}}
 install(root:Document){
  void this.preload();
  const actionButton=(event:Event)=>{
   const target=event.target instanceof Element?event.target:null;
   const button=target?.closest('button,[role="button"],[role="switch"]');
   return button&&!button.matches(':disabled,[aria-disabled="true"]')&&!button.closest('[inert]')&&!event.defaultPrevented?button:null;
  };
  const prime=(event:Event)=>{if(actionButton(event))this.unlock();};
  const key=(event:KeyboardEvent)=>{if(event.key==='Enter'||event.key===' ')prime(event);};
  const click=(event:Event)=>{
   const button=actionButton(event);if(!button)return;
   this.unlock();
   if(!button.matches('.dock-shoot,[data-audio-silent]'))void this.play('click',soundEnabled());
  };
  const hide=()=>{if(root.hidden)this.mute();};
  // Capture starts audio before synchronous game handlers/rendering. Keep click
  // semantics so scrolling/cancelled pointer gestures do not produce feedback.
  // Wake the shared audio device on press, while audible feedback retains click
  // semantics. Scrolling or cancelling a press never plays a button sound.
  root.addEventListener('pointerdown',prime,true);root.addEventListener('touchstart',prime,{capture:true,passive:true});root.addEventListener('keydown',key,true);
  root.addEventListener('click',click,true);root.addEventListener('visibilitychange',hide);
  return()=>{root.removeEventListener('pointerdown',prime,true);root.removeEventListener('touchstart',prime,true);root.removeEventListener('keydown',key,true);root.removeEventListener('click',click,true);root.removeEventListener('visibilitychange',hide);this.mute();};
 }
}
