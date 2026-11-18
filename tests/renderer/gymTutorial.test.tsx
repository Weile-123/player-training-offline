import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {act} from 'preact/test-utils';
import GymTutorial from '../../src/components/GymTutorial';
import {useGym} from '../../src/gymStore';

vi.mock('../../src/components/ShotScene', () => ({ShotScene: () => <div className="tutorial-shot-scene"/>}));
vi.mock('../../src/presentation/audio', () => ({gameAudio: {play: vi.fn(async () => {}), install: vi.fn(() => () => {})}}));
vi.mock('../../src/presentation/animationConfig', () => {
 const config = {gameMaxWidthPx: 480, shootButtonScale: 1, hoopScale: 1};
 return {getAnimationConfig: () => config, subscribeAnimationConfig: () => () => {}, watchAnimationConfig: vi.fn(() => () => {})};
});

let root: Root | null = null, frameId = 0;
const frames = new Map<number, FrameRequestCallback>();
const playerInfo = vi.fn(), editor = vi.fn(), advert = vi.fn(), cloud = vi.fn(), auth = vi.fn();
beforeEach(() => {
 vi.useFakeTimers(); vi.setSystemTime(1_800_000_000_000);
 Object.defineProperty(document, 'fonts', {configurable: true, value: {ready: Promise.resolve()}});
 vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
 vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {frames.set(++frameId, callback); return frameId;});
 vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
 window.ColorboxAI = {request: {basketball: {playerInfo}, bbs: {openPostEditor: editor}}, auth: {getUserInfo: auth}, vatask: {completeRewardVideo: advert, getActivityTaskState: vi.fn()}, cloud: {request: cloud}};
 for (const mock of [playerInfo, editor, advert, cloud, auth]) mock.mockClear();
});
afterEach(() => {
 if (root) act(() => root!.unmount()); root = null; frames.clear();
 delete window.ColorboxAI; vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function mount(onComplete = vi.fn(), onSkip = vi.fn()) {
 root = createRoot(document.getElementById('root')!);
 await act(async () => root!.render(<GymTutorial onComplete={onComplete} onSkip={onSkip}/>));
 return {onComplete, onSkip};
}
async function press(selector: string) {
 const button = document.querySelector<HTMLButtonElement>(selector); expect(button, selector).toBeTruthy(); expect(button!.disabled, selector).toBe(false);
 await act(async () => {button!.click(); for (let index = 0; index < 10; index++) await Promise.resolve();});
}
async function advance(milliseconds = 500) {
 await act(async () => vi.advanceTimersByTimeAsync(milliseconds));
 const callbacks = [...frames.values()]; frames.clear();
 await act(async () => callbacks.forEach(callback => callback(Date.now())));
}
const step = () => document.querySelector('.gym-tutorial-practice[data-step]')?.getAttribute('data-step');

it('recruits, demonstrates two distinct upgrades, unlocks a real template and recommends without changing real progress or calling platform APIs', async () => {
 const actual = JSON.stringify(useGym.getState().state), saved = {...localStorage}, callbacks = await mount();
 expect(step()).toBe('intro'); expect(document.querySelector('.gym-tutorial-welcome')?.textContent).toContain('这是独立练习');
 expect(document.querySelector('.gym-tutorial-welcome .sheet-close')).toBeNull(); expect(document.querySelector('.gym-tutorial-welcome-skip')).toBeNull();
 await press('.gym-tutorial-welcome .primary'); expect(step()).toBe('recruit-open');
 await press('.dock-shoot'); expect(step()).toBe('recruit-height');
 await press('.gm-recruit-height [data-preference="forward"]'); expect(step()).toBe('recruit-confirm');
 expect(document.querySelector('.gm-recruit-height [data-preference="forward"]')?.getAttribute('aria-pressed')).toBe('true');
 await press('.gm-recruit-submit'); expect(step()).toBe('xp-first');
 expect(document.querySelector('.gym-player-share')).toBeNull(); expect(document.querySelector('.gym-local-test')).toBeNull();
 expect(document.querySelector('.gym-experience')?.textContent).toContain('Lv.0');
 await press('.tutorial-next'); expect(step()).toBe('train-first');
 expect(document.querySelectorAll('.tutorial-mask mask rect[fill="black"]')).toHaveLength(2);
 await advance(); await press('.dock-shoot'); expect(step()).toBe('growth-first');
 expect(document.querySelector('.player-value-card')?.getAttribute('data-tier')).toBe('undiscovered');
 expect(document.querySelector('.gym-experience')?.textContent).toContain('Lv.1');
 await press('.tutorial-next'); expect(step()).toBe('xp-second');
 await press('.tutorial-next'); expect(step()).toBe('train-second');
 await advance(); await press('.dock-shoot'); expect(step()).toBe('growth-template');
 expect(document.querySelector('.player-value-card')?.getAttribute('data-tier')).toBe('rotation');
 expect(document.querySelector('.gym-experience')?.textContent).toContain('Lv.2');
 await press('.tutorial-next'); expect(step()).toBe('recommend-open');
 await press('.gym-player-actions > button:first-child'); expect(step()).toBe('recommend-confirm');
 await press('.gm-recommend-panel .gm-sheet-footer .gm-primary'); expect(step()).toBe('rewards');
 expect(document.querySelector('.gm-recruitment')).toBeNull();
 await press('.tutorial-next'); expect(step()).toBe('club-open');
 await press('.gym-score-club'); expect(step()).toBe('club');
 expect(document.querySelector('.gym-tutorial-emphasis')?.textContent).toBe('多训练位、自动训练、离线训练');
 await press('.tutorial-next'); expect(callbacks.onComplete).toHaveBeenCalledOnce(); expect(callbacks.onSkip).not.toHaveBeenCalled();
 expect(step()).toBe('complete'); expect(JSON.stringify(useGym.getState().state)).toBe(actual); expect({...localStorage}).toEqual(saved);
 for (const mock of [playerInfo, editor, advert, cloud, auth]) expect(mock).not.toHaveBeenCalled();
});

it('guards unrelated controls and only skips after the requested confirmation', async () => {
 const before = JSON.stringify(useGym.getState().state), callbacks = await mount();
 await press('.gym-tutorial-welcome .primary'); expect(step()).toBe('recruit-open');
 await press('[aria-label="器材商店"]'); expect(document.querySelector('.gm-shop')).toBeNull(); expect(step()).toBe('recruit-open');
 await press('.tutorial-skip'); expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain('跳过练习后，可以在设置中重新进行引导练习');
 expect(document.querySelector('[role="alertdialog"] p strong')?.textContent).toBe('设置');
 const courtPointer = new Event('pointerdown', {bubbles: true, cancelable: true});
 document.querySelector('.dock-shoot')!.dispatchEvent(courtPointer); expect(courtPointer.defaultPrevented).toBe(true);
 await press('.tutorial-cancel-skip'); expect(step()).toBe('recruit-open'); expect(callbacks.onSkip).not.toHaveBeenCalled();
 await press('.tutorial-skip'); await press('.tutorial-confirm-skip');
 expect(callbacks.onSkip).toHaveBeenCalledOnce(); expect(callbacks.onComplete).not.toHaveBeenCalled();
 expect(JSON.stringify(useGym.getState().state)).toBe(before);
});

it('cannot skip or close the introduction and restores the document after unmounting', async () => {
 const callbacks = await mount(); expect(document.body.classList.contains('gym-tutorial-active')).toBe(true);
 expect([...document.querySelectorAll('.gym-tutorial-welcome button')].map(button => button.textContent)).toEqual(['开始练习']);
 await act(async () => document.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})));
 expect(step()).toBe('intro'); expect(callbacks.onSkip).not.toHaveBeenCalled(); expect(callbacks.onComplete).not.toHaveBeenCalled();
 act(() => root!.unmount()); root = null;
 expect(document.body.classList.contains('gym-tutorial-active')).toBe(false); expect(document.querySelector('.gym-tutorial-spotlight')).toBeNull();
});
