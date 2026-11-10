import {afterEach,describe,expect,it,vi} from 'vitest';
import {SampleAudio,audioSources,losslessSources} from './sampleAudio';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
function fixture(flac=true){
 const elements:HTMLAudioElement[]=[];
 const create=vi.fn(()=>{
  const e={src:'',preload:'',paused:true,ended:false,volume:1,muted:false,currentTime:0,canPlayType:vi.fn(()=>flac?'probably':''),
   play:vi.fn(async()=>{e.paused=false;}),pause:vi.fn(()=>{e.paused=true;})};
  elements.push(e as unknown as HTMLAudioElement);return e as unknown as HTMLAudioElement;
 });
 return {audio:new SampleAudio(create),create,elements};
}
describe('provided audio files',()=>{
 it('maps five shot results and the requested UI events to the provided files',()=>{
  for(const [cue,file] of [['severe','ball1.wav'],['minor','ball2.mp3'],['hold','ball3.wav'],['success','ball4.wav'],['great','ball5.wav'],['click','click-responsive.wav'],['month','new_month.wav'],['evolution','upgrade.wav']] as const)expect(audioSources[cue]).toContain(file);
 });
 it('uses lossless assets when supported and source audio otherwise',async()=>{
  const fast=fixture(),compatible=fixture(false);
  expect(await fast.audio.play('great',true)).toBe(true);expect(fast.elements[0].src).toBe(losslessSources.great);
  expect(await compatible.audio.play('great',true)).toBe(true);expect(compatible.elements[0].src).toBe(audioSources.great);
 });
 it('falls back on decoder errors but does not retry autoplay denials',async()=>{
  const {audio,elements}=fixture();await audio.play('month',true);audio.mute();
  vi.mocked(elements[0].play).mockRejectedValueOnce(Object.assign(new Error(),{name:'NotSupportedError'}));
  expect(await audio.play('month',true)).toBe(true);expect(elements[0].src).toBe(audioSources.month);
  const blocked=fixture();await blocked.audio.play('month',true);blocked.audio.mute();
  vi.mocked(blocked.elements[0].play).mockRejectedValueOnce(Object.assign(new Error(),{name:'NotAllowedError'}));
  expect(await blocked.audio.play('month',true)).toBe(false);expect(blocked.elements[0].src).toBe(losslessSources.month);
 });
 it('does not allocate muted audio and bounds rapid shooting voices',async()=>{
  const {audio,create,elements}=fixture();expect(await audio.play('success',false)).toBe(false);expect(create).not.toHaveBeenCalled();
  for(let n=0;n<30;n++)await audio.play('success',true);
  expect(elements).toHaveLength(3);audio.mute();expect(elements.every(e=>e.paused)).toBe(true);
 });
 it('cannot play a delayed request after mute, and times out a stalled load',async()=>{
  vi.useFakeTimers();const {audio,elements}=fixture();await audio.play('month',true);audio.mute();
  let resume!:()=>void;vi.mocked(elements[0].play).mockImplementationOnce(()=>new Promise<void>(resolve=>{resume=resolve;}));
  const pending=audio.play('month',true);audio.mute();resume();expect(await pending).toBe(false);
  vi.mocked(elements[0].play).mockImplementationOnce(()=>new Promise(()=>{}));const stalled=audio.play('month',true);
  await vi.advanceTimersByTimeAsync(1201);expect(await stalled).toBe(false);expect(elements[0].paused).toBe(true);
 });
 it('fails silently on unsupported devices and never plays in the background',async()=>{
  const unsupported=new SampleAudio(()=>{throw Error('No audio');});expect(await unsupported.play('click',true)).toBe(false);
  vi.stubGlobal('document',{hidden:true});const {audio,create}=fixture();expect(await audio.play('click',true)).toBe(false);expect(create).not.toHaveBeenCalled();
 });
});
