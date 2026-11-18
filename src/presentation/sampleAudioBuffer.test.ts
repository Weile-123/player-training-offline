import {afterEach,describe,expect,it,vi} from 'vitest';
import {SampleAudio,audioSources,saveSoundEnabled,sampleVolume,shotStartOffset} from './sampleAudio';

afterEach(()=>{saveSoundEnabled(true);vi.useRealTimers();vi.unstubAllGlobals();});
function fixture(state:AudioContextState='running'){
 const samples=new Float32Array(1_000);samples.fill(.8,100);
 const buffer={numberOfChannels:1,sampleRate:1_000,length:samples.length,duration:1,getChannelData:()=>samples} as unknown as AudioBuffer;
 const sources:{buffer:AudioBuffer|null;onended:(()=>void)|null;connect:ReturnType<typeof vi.fn>;disconnect:ReturnType<typeof vi.fn>;start:ReturnType<typeof vi.fn>;stop:ReturnType<typeof vi.fn>}[]=[];
 const gains:{gain:{setValueAtTime:ReturnType<typeof vi.fn>};connect:ReturnType<typeof vi.fn>;disconnect:ReturnType<typeof vi.fn>}[]=[];
 const ctx={state,currentTime:12,destination:{},decodeAudioData:vi.fn(async()=>buffer),resume:vi.fn(async()=>{ctx.state='running' as AudioContextState;}),
  createBufferSource:vi.fn(()=>{const source={buffer:null,onended:null,connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn()};sources.push(source);return source;}),
  createGain:vi.fn(()=>{const gain={gain:{setValueAtTime:vi.fn()},connect:vi.fn(),disconnect:vi.fn()};gains.push(gain);return gain;})};
 const media=vi.fn(()=>{throw Error('Media fallback should not be used');});
 const fetcher=vi.fn(async(_source:string)=>new ArrayBuffer(8));
 const createContext=vi.fn(()=>ctx as unknown as AudioContext);
 const audio=new SampleAudio(media,{createContext,fetchSample:source=>fetcher(source),now:()=>Date.now()});
 return{audio,buffer,samples,ctx,sources,gains,media,fetcher,createContext};
}

describe('decoded interactive sound effects',()=>{
 it('preloads each distinct sample once without resuming or playing audio',async()=>{
  const f=fixture('suspended');
  expect(await f.audio.preload()).toBe(true);
  expect(await f.audio.preload()).toBe(true);
  expect(f.fetcher).toHaveBeenCalledTimes(new Set(Object.values(audioSources)).size);
  expect(f.ctx.decodeAudioData).toHaveBeenCalledTimes(8);
  expect(f.ctx.resume).not.toHaveBeenCalled();
  expect(f.ctx.createBufferSource).not.toHaveBeenCalled();
  expect(f.media).not.toHaveBeenCalled();
 });

 it('prepares packaged audio bytes without issuing any direct network request',async()=>{
  const f=fixture(),request=vi.fn(()=>{throw Error('No direct network is expected');});
  vi.stubGlobal('fetch',request);
  const audio=new SampleAudio(f.media,{createContext:f.createContext});
  expect(await audio.preload()).toBe(true);
  expect(request).not.toHaveBeenCalled();
  expect(f.ctx.decodeAudioData).toHaveBeenCalledTimes(8);
 });

 it('resumes inside the gesture then schedules cached automatic shot sounds synchronously',async()=>{
  const f=fixture('suspended');await f.audio.preload();
  f.audio.unlock();
  expect(f.ctx.resume).toHaveBeenCalledOnce();
  await Promise.resolve();
  const playing=f.audio.play('success',true);
  expect(f.sources).toHaveLength(1);
  expect(f.sources[0].buffer).toBe(f.buffer);
  expect(f.sources[0].start).toHaveBeenCalledWith(12,.097);
  expect(await playing).toBe(true);
  expect(f.gains[0].gain.setValueAtTime).toHaveBeenCalledWith(.6,12);
  expect(f.ctx.decodeAudioData).toHaveBeenCalledTimes(8);
 });

 it('reduces only clicks and shot outcomes and retains the upgrade/month levels',()=>{
  expect(sampleVolume('click')).toBe(.375);
  for(const cue of ['severe','minor','hold','success','great'] as const)expect(sampleVolume(cue)).toBe(.6);
  for(const cue of ['month','evolution','unlock'] as const)expect(sampleVolume(cue)).toBe(.8);
 });

 it('trims only leading quiet while keeping an attack margin and leaves other cues untrimmed',async()=>{
  const f=fixture();expect(shotStartOffset(f.buffer)).toBe(.097);
  await f.audio.preload();await f.audio.play('evolution',true);
  expect(f.sources[0].start).toHaveBeenCalledWith(12,0);
  f.samples.fill(0);expect(shotStartOffset(f.buffer)).toBe(0);
 });

 it('never queues a late shot after decode times out and reports the failed start',async()=>{
  vi.useFakeTimers();const f=fixture();let resolve!:(value:ArrayBuffer)=>void;
  f.fetcher.mockImplementation(()=>new Promise<ArrayBuffer>(done=>{resolve=done;}));
  const playing=f.audio.play('success',true);
  await vi.advanceTimersByTimeAsync(121);
  expect(await playing).toBe(false);
  expect(f.audio.getDiagnostics().lastFailure).toContain('尚未准备');
  resolve(new ArrayBuffer(8));await Promise.resolve();await Promise.resolve();
  expect(f.sources).toHaveLength(0);
 });

 it('cancels pending decode on mute and keeps cached samples for the next interaction',async()=>{
  const f=fixture();let resolve!:(value:ArrayBuffer)=>void;
  f.fetcher.mockImplementation(()=>new Promise<ArrayBuffer>(done=>{resolve=done;}));
  const pending=f.audio.play('great',true);f.audio.mute();resolve(new ArrayBuffer(8));
  expect(await pending).toBe(false);expect(f.sources).toHaveLength(0);
  expect(await f.audio.play('great',true)).toBe(true);
  expect(f.sources).toHaveLength(1);
 });

 it('coalesces pending requests for one cue instead of replaying a decode backlog',async()=>{
  const f=fixture();let resolve!:(value:ArrayBuffer)=>void;
  f.fetcher.mockImplementation(()=>new Promise<ArrayBuffer>(done=>{resolve=done;}));
  const first=f.audio.play('hold',true),second=f.audio.play('hold',true);
  resolve(new ArrayBuffer(8));
  expect(await first).toBe(false);expect(await second).toBe(true);
  expect(f.sources).toHaveLength(1);
 });

 it('does not play an older unprepared result after a newer result has started',async()=>{
  const f=fixture();const releases=new Map<string,(value:ArrayBuffer)=>void>();
  f.fetcher.mockImplementation(source=>new Promise<ArrayBuffer>(resolve=>{releases.set(source,resolve);}));
  const first=f.audio.play('hold',true),second=f.audio.play('great',true);
  releases.get(audioSources.great!)!(new ArrayBuffer(8));
  expect(await second).toBe(true);
  releases.get(audioSources.hold!)!(new ArrayBuffer(8));
  expect(await first).toBe(false);expect(f.sources).toHaveLength(1);
 });

 it('bounds rapid-shot voices without refetching or decoding each playback',async()=>{
  const f=fixture();await f.audio.preload();
  for(let i=0;i<30;i++)expect(await f.audio.play('great',true)).toBe(true);
  expect(f.audio.getDiagnostics().active).toBe(3);
  expect(f.sources.filter(source=>source.stop.mock.calls.length)).toHaveLength(27);
  expect(f.ctx.decodeAudioData).toHaveBeenCalledTimes(8);
  f.audio.mute();expect(f.audio.getDiagnostics().active).toBe(0);
 });

 it('does not initialize, fetch or resume audio while sound is disabled',async()=>{
  saveSoundEnabled(false);const f=fixture('suspended');
  expect(await f.audio.preload()).toBe(false);f.audio.unlock();
  expect(await f.audio.play('click',false)).toBe(false);
  expect(f.createContext).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled();expect(f.ctx.resume).not.toHaveBeenCalled();
 });

 it('handles synchronous resume rejection without leaking an exception or scheduling output',async()=>{
  const f=fixture('suspended');await f.audio.preload();
  f.ctx.resume.mockImplementation(()=>{throw Error('blocked');});
  expect(()=>f.audio.unlock()).not.toThrow();expect(await f.audio.play('click',true)).toBe(false);
  expect(f.sources).toHaveLength(0);expect(f.audio.getDiagnostics().lastFailure).toContain('权限');
 });

 it('retries context creation in a gesture if the device refused startup creation',async()=>{
  const f=fixture('suspended');
  f.createContext.mockImplementationOnce(()=>{throw Error('gesture required');});
  expect(await f.audio.preload()).toBe(false);
  f.audio.unlock();
  expect(f.createContext).toHaveBeenCalledTimes(2);
  expect(await f.audio.preload()).toBe(true);
  expect(await f.audio.play('success',true)).toBe(true);
 });
});
