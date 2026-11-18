import {readFile} from 'node:fs/promises';
import {afterEach,expect,it,vi} from 'vitest';
import {audioSources} from './sampleAudio';
import {loadStaticAudio} from './staticAudioLoaders';
import {staticAudioData} from './staticAudioData';

afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.doUnmock('./staticAudioData');vi.resetModules();});

it('decodes all eight original audio files byte-for-byte without a direct request',async()=>{
 const request=vi.fn(()=>{throw Error('No direct request is allowed');});vi.stubGlobal('fetch',request);
 const files=[['severe','ball1.wav'],['minor','ball2.mp3'],['hold','ball3.wav'],['success','ball4.wav'],['great','ball5.wav'],
  ['click','optimized/click-responsive.wav'],['month','new_month.wav'],['evolution','upgrade.wav']] as const;
 for(const[cue,file]of files){
  const actual=Buffer.from(await loadStaticAudio(audioSources[cue]!));
  const original=await readFile(new URL('../videos/'+file,import.meta.url));
  expect(Buffer.compare(actual,original)).toBe(0);
 }
 expect(request).not.toHaveBeenCalled();
});

it('keeps the static data module read-only and returns independently owned buffers',async()=>{
 expect(Object.isFrozen(staticAudioData)).toBe(true);
 expect(Object.keys(staticAudioData)).toHaveLength(8);
 const source=audioSources.click!,original=await loadStaticAudio(source),copy=await loadStaticAudio(source);
 expect(original).not.toBe(copy);expect(Buffer.compare(Buffer.from(original),Buffer.from(copy))).toBe(0);
 new Uint8Array(original)[0]^=255;
 const beforeDetach=Buffer.from(copy).toString('hex');structuredClone(copy,{transfer:[copy]});
 expect(copy.byteLength).toBe(0);
 expect(Buffer.from(await loadStaticAudio(source)).toString('hex')).toBe(beforeDetach);
});

it('refuses an arbitrary or altered URL without loading another source',async()=>{
 const request=vi.fn();vi.stubGlobal('fetch',request);
 for(const source of ['https://example.test/business','/api/leaderboard',audioSources.click+'?extra=1']){
  await expect(loadStaticAudio(source)).rejects.toThrow('不是已打包');
 }
 expect(request).not.toHaveBeenCalled();
});

it('times out a pending data chunk without repeating its import and can use its later result',async()=>{
 vi.resetModules();vi.useFakeTimers();
 let release!:()=>void;
 const pendingData=new Promise<void>(resolve=>{release=resolve;}),imported=vi.fn(async()=>{
  await pendingData;return{staticAudioData:Object.freeze({click:'data:audio/wav;base64,AAECAw==',month:'data:audio/wav;base64,AAECAw=='})};
 });
 vi.doMock('./staticAudioData',imported);
 const {loadStaticAudio:load}=await import('./staticAudioLoaders');
 const first=load(audioSources.click!).catch(error=>error),second=load(audioSources.month!).catch(error=>error);
 await vi.advanceTimersByTimeAsync(10_001);
 expect(await first).toBeInstanceOf(Error);expect(await second).toBeInstanceOf(Error);
 expect(imported).toHaveBeenCalledOnce();
 release();expect([...new Uint8Array(await load(audioSources.click!))]).toEqual([0,1,2,3]);
 expect(imported).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
});

it('retries an actually rejected import once the chunk is available and retains the successful result',async()=>{
 vi.resetModules();
 const failedImport=vi.fn(()=>{throw Error('chunk temporarily unavailable');});
 vi.doMock('./staticAudioData',failedImport);
 const {loadStaticAudio:load}=await import('./staticAudioLoaders');
 await expect(load(audioSources.click!)).rejects.toThrow();
 expect(failedImport).toHaveBeenCalledOnce();
 // Make only the data module available; retain this same loader instance and
 // its dataTask state, so a permanently cached rejection would still fail.
 const recoveredImport=vi.fn(()=>({staticAudioData:Object.freeze({click:'data:audio/wav;base64,AAECAw=='})}));
 vi.doMock('./staticAudioData',recoveredImport);
 expect([...new Uint8Array(await load(audioSources.click!))]).toEqual([0,1,2,3]);
 expect([...new Uint8Array(await load(audioSources.click!))]).toEqual([0,1,2,3]);
 expect(recoveredImport).toHaveBeenCalledOnce();
});
