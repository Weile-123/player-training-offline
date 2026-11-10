import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createRoot} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {MonthTransitionDialog} from '../../src/components/MonthTransitionDialog';
import {gameAudio} from '../../src/presentation/audio';
import {monthTransitionTiming} from '../../src/presentation/monthTransition';
import {SampleAudio,saveSoundEnabled} from '../../src/presentation/sampleAudio';
vi.mock('../../src/presentation/audio',()=>({gameAudio:{play:vi.fn().mockResolvedValue(true)}}));
let root:ReturnType<typeof createRoot>|undefined;
beforeEach(()=>{vi.useFakeTimers();vi.mocked(gameAudio.play).mockClear();saveSoundEnabled(true);});
afterEach(()=>{if(root)act(()=>root!.unmount());root=undefined;vi.useRealTimers();vi.restoreAllMocks();});
it('plays the month cue once when the digit roll begins, not during rerenders',()=>{
 root=createRoot(document.getElementById('root')!);
 const render=()=>act(()=>root!.render(<MonthTransitionDialog change={{from:2,to:3}} reduced={false} onComplete={()=>{}}/>));
 render();act(()=>vi.advanceTimersByTime(monthTransitionTiming.delay-1));expect(gameAudio.play).not.toHaveBeenCalled();
 act(()=>vi.advanceTimersByTime(1));expect(gameAudio.play).toHaveBeenCalledWith('month',true);
 render();act(()=>vi.advanceTimersByTime(100));expect(gameAudio.play).toHaveBeenCalledTimes(1);
});
it('routes enabled buttons to click audio, without adding a click over shooting or disabled controls',()=>{
 const audio=new SampleAudio(),play=vi.spyOn(audio,'play').mockResolvedValue(true),unlock=vi.spyOn(audio,'unlock').mockImplementation(()=>{});
 const remove=audio.install(document);
 const button=document.createElement('button');document.body.append(button);button.click();expect(play).toHaveBeenCalledWith('click',true);expect(unlock).toHaveBeenCalled();
 play.mockClear();button.className='dock-shoot';button.click();expect(play).not.toHaveBeenCalled();
 button.className='';button.disabled=true;button.click();expect(play).not.toHaveBeenCalled();
 button.disabled=false;button.setAttribute('data-audio-silent','');button.click();expect(play).not.toHaveBeenCalled();
 remove();button.remove();
});
it('preloads click audio and starts it before button business handlers',()=>{
 const create=vi.fn(()=>new Audio());const audio=new SampleAudio(create);
 const order:string[]=[];
 vi.spyOn(audio,'play').mockImplementation(async()=>{order.push('sound');return true;});
 vi.spyOn(audio,'unlock').mockImplementation(()=>{});
 const remove=audio.install(document);
 expect(create).toHaveBeenCalledTimes(2);
 const button=document.createElement('button');document.body.append(button);
 button.addEventListener('click',()=>order.push('action'));button.click();
 expect(order).toEqual(['sound','action']);
 remove();button.click();expect(order).toEqual(['sound','action','action']);button.remove();
});
