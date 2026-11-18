import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {GymFeatureTutorial, type GymFeatureTutorialKind} from '../../src/components/GymFeatureTutorial';
import {gymFirstVisitTutorialKey, resetGymFirstVisitTutorials, useGymFirstVisitTutorial} from '../../src/presentation/gymFeatureTutorialPreference';

let root: Root | null = null, frameId = 0;
const frames = new Map<number, FrameRequestCallback>();
beforeEach(() => {
 resetGymFirstVisitTutorials();
 vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {frames.set(++frameId, callback); return frameId;});
 vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});
afterEach(() => {if (root) act(() => root!.unmount()); root = null; frames.clear(); vi.unstubAllGlobals();});
async function press(selector: string) {
 const button = document.querySelector<HTMLButtonElement>(selector); expect(button, selector).toBeTruthy();
 await act(async () => button!.click());
}
const selectedTarget = () => document.querySelector('[aria-describedby]');
const complete = vi.fn(), action = vi.fn();
function Harness({kind, enabled = true}: {kind: GymFeatureTutorialKind; enabled?: boolean}) {
 const tutorial = useGymFirstVisitTutorial(kind, enabled);
 return <><section className="gm-training-current">当前计划与本课进度</section><section className="gm-training-directions"><h3>选择培养方向</h3><button data-play onClick={action}>选择训练方向</button></section><section className="gm-cooperation-list"><article>基础合作<button data-accept onClick={action}>接取合作</button></article><article>精英合作</article></section>{tutorial.active && <GymFeatureTutorial kind={kind} onComplete={() => {complete(); tutorial.complete();}}/>}</>;
}
async function mount(kind: GymFeatureTutorialKind, enabled = true) {
 if (!root) root = createRoot(document.getElementById('root')!);
 await act(async () => root!.render(<Harness kind={kind} enabled={enabled}/>));
}

it('starts training guidance immediately, highlights the progress card then the direction section, and never forces an action', async () => {
 complete.mockClear(); action.mockClear(); await mount('training');
 expect(document.querySelector('.gym-feature-unlock')).toBeNull(); expect(document.querySelector('.tutorial-skip')).toBeNull();
 expect(selectedTarget()?.classList.contains('gm-training-current')).toBe(true);
 expect(document.querySelector('.tutorial-instruction')?.textContent).toContain('每投 10 次球可以完成一节课，并恢复 4 点体力');
 await press('.tutorial-next');
 expect(selectedTarget()?.classList.contains('gm-training-directions')).toBe(true);
 expect(document.querySelector('.tutorial-instruction')?.textContent).toContain('选择训练方向可改变球员升级时提升的能力倾向，可用于解锁你偏向解锁的球员模板');
 await press('[data-play]'); expect(action).not.toHaveBeenCalled();
 await act(async () => document.body.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})));
 expect(complete).not.toHaveBeenCalled(); expect(document.querySelector('.tutorial-skip')).toBeNull();
 await press('.tutorial-next'); expect(complete).toHaveBeenCalledOnce(); expect(document.querySelector('.gym-tutorial-spotlight')).toBeNull();
 expect(JSON.parse(localStorage.getItem(gymFirstVisitTutorialKey)!)).toEqual(['training']);
});

it('points at all cooperation cards and completes in one mandatory step', async () => {
 complete.mockClear(); action.mockClear(); await mount('cooperation');
 expect(selectedTarget()?.classList.contains('gm-cooperation-list')).toBe(true);
 expect(document.querySelector('.tutorial-instruction')?.textContent).toContain('选择不同难度的赞助合作，达成要求后可获得额外赞助券和声望奖励');
 expect(document.querySelector('.tutorial-skip')).toBeNull();
 const listPointer = new Event('pointerdown', {bubbles: true, cancelable: true});
 document.querySelector('[data-accept]')!.dispatchEvent(listPointer); expect(listPointer.defaultPrevented).toBe(false);
 const backgroundPointer = new Event('pointerdown', {bubbles: true, cancelable: true});
 document.querySelector('.gm-training-current')!.dispatchEvent(backgroundPointer); expect(backgroundPointer.defaultPrevented).toBe(true);
 await press('[data-accept]'); expect(action).not.toHaveBeenCalled();
 await press('.tutorial-next'); expect(complete).toHaveBeenCalledOnce(); expect(document.querySelector('.gym-tutorial-spotlight')).toBeNull();
});

it('shares completed first visits across entry points and remounts while keeping the other page unseen', async () => {
 await mount('training'); await press('.tutorial-next'); await press('.tutorial-next');
 await act(async () => root!.unmount()); root = null;
 await mount('training'); expect(document.querySelector('.gym-tutorial-spotlight')).toBeNull();
 await mount('cooperation'); expect(document.querySelector('.gym-tutorial-spotlight')).not.toBeNull();
});

it('does not consume or show the first-visit tutorial when disabled for isolated practice', async () => {
 await mount('training', false); expect(document.querySelector('.gym-tutorial-spotlight')).toBeNull();
 expect(localStorage.getItem(gymFirstVisitTutorialKey)).toBeNull();
 await mount('training', true); expect(document.querySelector('.gym-tutorial-spotlight')).not.toBeNull();
});

it('does not reuse old level-up completion records', async () => {
 localStorage.setItem('legend-gym.feature-tutorial.v1.1000-1', JSON.stringify({pending: [], completed: ['training', 'cooperation']}));
 await mount('training'); expect(document.querySelector('.gym-tutorial-spotlight')).not.toBeNull();
});
