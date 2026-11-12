import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {newGym, type GymAction, type GymState} from '../../src/game/gym/engine';
import {templateRules} from '../../src/game/contract/templates';
import {statKeys, type Stats} from '../../src/game/types';
import type {GymStore} from '../../src/gymStore';
import type {UseBoundStore, StoreApi} from 'zustand';

const harness = vi.hoisted(() => ({store: null as UseBoundStore<StoreApi<GymStore>> | null, actions: [] as GymAction[]}));
vi.mock('../../src/gymStore', async () => {
  const {create} = await import('zustand');
  const {dispatchGym, newGym} = await import('../../src/game/gym/engine');
  const store = create<GymStore>((set, get) => ({
    state: newGym(1_800_000_000_000, 21), hasSave: true, actionError: '', saveMessage: '',
    start: async () => ({state: get().state, events: []}),
    act: async action => {
      harness.actions.push(action);
      const result = dispatchGym(get().state, get().state.revision, action, Date.now());
      set({state: result.state, actionError: result.error ?? ''});
      return result;
    },
    tick: async () => {
      const result = dispatchGym(get().state, get().state.revision, {type: 'auto-step'}, Date.now());
      set({state: result.state});
      return result;
    },
    flush: async () => {},
  }));
  harness.store = store;
  return {useGym: store};
});
vi.mock('../../src/components/ShotScene', () => ({ShotScene: () => <div className="test-shot-scene"/>}));
vi.mock('../../src/presentation/audio', () => ({gameAudio: {play: vi.fn(async () => {}), install: vi.fn(() => () => {})}}));
vi.mock('../../src/presentation/animationConfig', () => {
  const config = {gameMaxWidthPx: 480, shootButtonScale: 1, hoopScale: 1};
  return {getAnimationConfig: () => config, subscribeAnimationConfig: () => () => {}, watchAnimationConfig: () => () => {}};
});
import GymGame from '../../src/components/GymGame';

const at = 1_800_000_000_000;
let root: Root | null = null;
let frameId = 0;
let visibility: 'visible' | 'hidden';
const frames = new Map<number, FrameRequestCallback>();
const state = () => harness.store!.getState().state;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at);
  Object.defineProperty(document, 'fonts', {configurable: true, value: {ready: Promise.resolve()}});
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {frames.set(++frameId, callback); return frameId;});
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  harness.actions = [];
  harness.store!.setState({state: newGym(at, 21), actionError: ''});
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  frames.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount(initial: GymState) {
  harness.store!.setState({state: initial});
  root = createRoot(document.getElementById('root')!);
  await act(async () => root!.render(<GymGame onHome={() => {}}/>));
}
async function press(label: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.getAttribute('aria-label') === label || item.textContent?.includes(label));
  expect(button, label).toBeTruthy();
  await act(async () => button!.click());
}
async function advance(milliseconds: number) {
  await act(async () => {await vi.advanceTimersByTimeAsync(milliseconds);});
  const pending = [...frames.values()];
  frames.clear();
  await act(async () => pending.forEach(callback => callback(Date.now())));
}
function player(id: string) {
  return [state().player, ...state().bench].find(entry => entry?.id === id)!;
}
async function twoPlayers() {
  const initial = newGym(at, 22);
  initial.gymLevel = 2;
  await mount(initial);
  await press('打开球员名册');
  await press('免费招募新人');
  expect(state().bench).toHaveLength(1);
  return [state().player!.id, state().bench[0].id];
}

it('replaces the old probability row with experience and reports a shot before a level is earned', async () => {
  const initial = newGym(at, 21);
  initial.player!.level = 10;
  initial.player!.peakLevel = 10;
  const attributes = {...initial.player!.stats};
  await mount(initial);
  expect(document.querySelector('.probability-segment')).toBeNull();
  expect(document.querySelector('[aria-label="当前球员训练经验"]')?.getAttribute('aria-valuenow')).toBe('0');
  await press('投篮训练');
  expect(state().player!.experience).toBeGreaterThan(0);
  expect(state().player!.level).toBe(10);
  expect(state().player!.stats).toEqual(attributes);
  expect(document.querySelector('.gym-experience-readout')?.textContent).toContain('经验 +');
  await press('查看训练经验');
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('需要 95 经验');
});

it('locks automatic training at level one without changing the original main controls', async () => {
  await mount(newGym(at, 21));
  expect(document.querySelectorAll('.css-dock-button')).toHaveLength(4);
  await press('打开球员名册');
  const toggle = document.querySelector<HTMLButtonElement>('[role="switch"]')!;
  expect(toggle.disabled).toBe(true);
  expect(toggle.textContent).toContain('Lv.2');
  expect(document.querySelector('.roster-intro')?.textContent).toContain('1/1');
});

it('shows a full experience slot at the level cap without a zero denominator', async () => {
  const initial = newGym(at, 21);
  initial.player!.level = 99;
  initial.player!.peakLevel = 99;
  await mount(initial);
  const progress = document.querySelector<HTMLElement>('[aria-label="当前球员训练经验"]')!;
  expect(progress.getAttribute('aria-valuetext')).toBe('已满级');
  expect(progress.getAttribute('aria-valuemax')).toBe('1');
  expect(progress.querySelector('i')?.style.width).toBe('100%');
  expect(document.querySelector('[aria-label="查看当前训练课程"]')?.textContent).toContain('等级已满');
  expect(document.querySelector<HTMLButtonElement>('[aria-label="投篮训练"]')!.disabled).toBe(true);
  await press('查看训练经验');
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('已达到等级上限');
});

it('selects a bench athlete for manual training and recommends only that selected athlete', async () => {
  const [firstId, secondId] = await twoPlayers();
  const row = document.querySelector<HTMLElement>(`[data-player-id="${secondId}"]`)!;
  await act(async () => row.querySelector<HTMLButtonElement>('.primary')!.click());
  expect(state().player!.id).toBe(secondId);
  await advance(1_000);
  await press('投篮训练');
  expect(player(secondId).shots).toBe(1);
  expect(player(firstId).shots).toBe(0);
  await press('推荐球员签约');
  await press('确认推荐');
  expect(state().alumni[0].id).toBe(secondId);
  expect(state().player!.id).toBe(firstId);
  expect(state().bench).toHaveLength(0);
  expect(document.querySelector('.gym-empty-court')).toBeNull();
  await press('打开球员名册');
  expect(document.querySelector('.gm-roster-recruit')?.textContent).toContain('空余 1 个训练位');
  await press('查看校友档案');
  expect(document.querySelector('.gm-alumni-list')).toBeTruthy();
});

it('explains rating and individual stat floors even when visible core requirements are already met', async () => {
  const initial = newGym(at, 24);
  const target = templateRules.find(template => template.id === 'jordan')!;
  const previous = templateRules.find(template => template.tier === 'superstar')!;
  Object.assign(initial.player!, {level: 25, peakLevel: 99, height: target.height[0], templateId: previous.id});
  initial.player!.stats = Object.fromEntries(statKeys.map(key => [key, target.coreMinimums[key] ?? 0])) as Stats;
  await mount(initial);
  const details = document.querySelector<HTMLButtonElement>('.star-template-panel')!;
  await act(async () => details.click());
  const goal = [...document.querySelectorAll<HTMLElement>('.gym-goal-card')].find(card => card.querySelector('strong')?.textContent?.includes(target.name));
  expect(goal).toBeTruthy();
  expect(goal!.textContent).toContain('综合评分不足');
  expect(goal!.textContent).toContain(`需要 ${target.ratingFloor}`);
  expect(goal!.textContent).toContain('单项属性下限不足');
  expect(goal!.textContent).toContain(`0/${target.statFloor}`);
  expect([...goal!.querySelectorAll('span')].every(span => span.classList.contains('is-met'))).toBe(true);
});

it('restores the live course card after a short automatic course-completion notice', async () => {
  const initial = newGym(at, 25);
  initial.gymLevel = 2;
  initial.player!.autoEnabled = true;
  initial.player!.nextShotAt = at + 200;
  initial.player!.training.shots = 9;
  initial.player!.shots = 9;
  await mount(initial);
  await advance(200);
  expect(document.querySelector('.contract-status')?.textContent).toContain('训练课完成');
  expect(document.querySelector('[aria-label="查看当前训练课程"]')).toBeNull();
  await advance(4_000);
  expect(document.querySelector('[aria-label="查看当前训练课程"]')).toBeTruthy();
  expect(document.querySelector('.contract-status')).toBeNull();
});

it('runs independent automatic switches at the actual upgraded interval and pauses when hidden', async () => {
  const [firstId, secondId] = await twoPlayers();
  await act(async () => harness.store!.setState({state: {...state(), projects: {...state().projects, automation: 1}}}));
  for (const id of [firstId, secondId]) {
    const row = document.querySelector<HTMLElement>(`[data-player-id="${id}"]`)!;
    await act(async () => row.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
  }
  expect(player(firstId).autoEnabled).toBe(true);
  expect(player(secondId).autoEnabled).toBe(true);
  await press('关闭面板');
  expect(document.querySelector<HTMLButtonElement>('[aria-label="投篮训练"]')!.disabled).toBe(true);
  await advance(1800);
  expect(player(firstId).shots).toBe(1);
  expect(player(secondId).shots).toBe(1);
  await press('打开球员名册');
  const selectedRow = document.querySelector<HTMLElement>(`[data-player-id="${firstId}"]`)!;
  await act(async () => selectedRow.querySelector<HTMLButtonElement>('[role="switch"]')!.click());
  await press('关闭面板');
  await advance(1800);
  expect(player(firstId).shots).toBe(1);
  expect(player(secondId).shots).toBe(2);
  await press('投篮训练');
  expect(player(firstId).shots).toBe(2);
  expect(player(secondId).shots).toBe(2);
  visibility = 'hidden';
  await advance(20_000);
  expect(player(secondId).shots).toBe(2);
  visibility = 'visible';
  await advance(200);
  expect(player(secondId).shots).toBe(3);
});
