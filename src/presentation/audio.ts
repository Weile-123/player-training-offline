import {SampleAudio} from './sampleAudio';
import type { Outcome } from '../game/types';
import { presentationConfig } from './feedback';
export type SoundCue=Outcome|'unlock'|'evolution'|'hot'|'click'|'month';
type Tone={frequency:number;at:number;duration:number;type:OscillatorType};
// Brief synthesized cues keep the offline build independent of external media.
export const soundScore=(cue:SoundCue):Tone[] => {
 const note=(frequency:number,at=0,type:OscillatorType='sine'):Tone=>({frequency,at,duration:.13,type});
 switch(cue){
  case 'severe':return [note(170,0,'triangle'),note(95,.16,'triangle')];
  case 'minor':return [note(260),note(190,.13)];
  case 'hold':return [note(150,0,'triangle')];
  case 'success':return [note(440),note(660,.13)];
  case 'great':return [note(523),note(659,.12),note(784,.24)];
  case 'unlock':return [note(523),note(659,.12),note(784,.24),note(1047,.38)];
  case 'evolution':return [note(392),note(587,.14),note(880,.28)];
  case 'click':return [note(100,0,'triangle')];
  case 'month':return [note(440),note(660,.14)];
  case 'hot':return [note(330,0,'triangle'),note(495,.1,'triangle'),note(660,.2,'triangle')];
 }
};
export class GameAudio {
 private context:AudioContext|null=null;
 private generation=0;
 constructor(private createContext:()=>AudioContext=()=>new AudioContext()){}
 async play(cue:SoundCue,enabled:boolean):Promise<boolean> {
  if(!enabled) return false;
  const generation=this.generation;
  try {
   this.context??=this.createContext(); const ctx=this.context;
   if(ctx.state==='suspended') await ctx.resume();
   if(generation!==this.generation||ctx.state!=='running') return false;
   for(const tone of soundScore(cue)) {
    const oscillator=ctx.createOscillator(),gain=ctx.createGain(),start=ctx.currentTime+tone.at;
    oscillator.type=tone.type;oscillator.frequency.setValueAtTime(tone.frequency,start);
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(presentationConfig.volume,start+.012);
    gain.gain.exponentialRampToValueAtTime(.0001,start+tone.duration);
    oscillator.connect(gain);gain.connect(ctx.destination);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    oscillator.start(start);oscillator.stop(start+tone.duration+.01);
   }
   return true;
  }catch{return false;}
 }
 mute(){this.generation++;if(this.context){const old=this.context;this.context=null;void old.close().catch(()=>{});}}
}
export const gameAudio=new SampleAudio();
