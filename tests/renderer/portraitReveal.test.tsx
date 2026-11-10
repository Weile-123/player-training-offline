import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createRoot} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {TemplatePortraitReveal} from '../../src/components/PlayerTemplatePanel';
import {gameAudio} from '../../src/presentation/audio';
let root:ReturnType<typeof createRoot>;
const animate=vi.fn(()=>({cancel:vi.fn(),onfinish:null}));
beforeEach(()=>{
 vi.useFakeTimers();animate.mockClear();
 Element.prototype.animate=animate as unknown as typeof Element.prototype.animate;
 root=createRoot(document.getElementById('root')!);
});
afterEach(()=>{act(()=>root.unmount());vi.useRealTimers();vi.restoreAllMocks();});
const show=(templateId:string,reduced=false)=>act(()=>root.render(<TemplatePortraitReveal templateId={templateId} tier="rotation" src={null} fallbackSrc={null} name={templateId} reduced={reduced}/>));
it('keeps an old cover, reveals from top to bottom, then removes both cover and line',()=>{
 show('old');expect(animate).not.toHaveBeenCalled();
 show('new');expect(document.querySelector('.portrait-reveal-cover')).not.toBeNull();
 expect(animate.mock.calls[0]?.[0]).toEqual([{clipPath:'inset(0% 0 0 0)'},{clipPath:'inset(100% 0 0 0)'}]);
 act(()=>vi.advanceTimersByTime(810));
 expect(document.querySelector('.portrait-reveal-cover')).toBeNull();
 expect(document.querySelector('.portrait-reveal-line')).toBeNull();
});
it('cancels previous animations on a rapid template change and cleans up the final cover',()=>{
 show('first');show('second');const previous=animate.mock.results[0].value;
 show('third');expect(previous.cancel).toHaveBeenCalled();
 act(()=>vi.advanceTimersByTime(2500));expect(document.querySelector('.portrait-reveal-cover')).toBeNull();
});
it('switches immediately when reduced motion is enabled',()=>{
 show('first',true);show('second',true);
 expect(document.querySelector('.portrait-reveal-cover')).toBeNull();expect(animate).not.toHaveBeenCalled();
});
it('plays upgrade only on template changes, never on initial display or same-template updates',()=>{
 const play=vi.spyOn(gameAudio,'play').mockResolvedValue(true);
 show('first');expect(play).not.toHaveBeenCalled();
 show('second');expect(play).toHaveBeenCalledTimes(1);expect(play.mock.calls[0][0]).toBe('evolution');
 show('second');expect(play).toHaveBeenCalledTimes(1);
 act(()=>vi.advanceTimersByTime(810));show('third',true);expect(play).toHaveBeenCalledTimes(2);
});
