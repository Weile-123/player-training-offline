import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {newGym, type GymAction, type GymState} from '../../src/game/gym/engine';
import {templateRules} from '../../src/game/contract/templates';
import {statKeys} from '../../src/game/types';
import type {GymStore} from '../../src/gymStore';
import type {UseBoundStore, StoreApi} from 'zustand';

const harness = vi.hoisted(() => ({store: null as UseBoundStore<StoreApi<GymStore>> | null, actions: [] as GymAction[]}));
vi.mock('../../src/gymStore', async () => {
  const {create} = await import('zustand');
  const {dispatchGym, newGym} = await import('../../src/game/gym/engine');
  const {settleOfflineGym} = await import('../../src/game/gym/offline');
  const store = create<GymStore>((set, get) => ({
    state: newGym(1_800_000_000_000, 21), hasSave: true, hydrating: false, hydrate: async () => {},
    loadAlumni: async (offset = 0, limit = 20) => ({players: [...get().state.alumni].reverse().slice(offset, offset + limit), total: get().state.alumni.length}), actionError: '', saveMessage: '',
    isSuspended: false, pendingOfflineReport: null,
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
    resume: async () => {
      if (!get().isSuspended) return {state: get().state, events: []};
      const result = settleOfflineGym(get().state, Date.now());
      set({state: result.state, isSuspended: false, pendingOfflineReport: result.report && result.report.totalShots > 0 && result.report.elapsedMs >= 5000 ? result.report : null});
      return {state: result.state, events: []};
    },
    suspend: async () => {set({isSuspended: true});},
    flush: async () => {set({isSuspended: true});},
    dismissOfflineReport: () => set({pendingOfflineReport: null}),
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
  harness.store!.setState({state: newGym(at, 21), actionError: '', isSuspended: false, pendingOfflineReport: null});
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

it.each([98, 99])('protects the main-court drink at level %s without blocking a trainable player', async level => {
  const initial = newGym(at, 21);
  initial.player!.level = initial.player!.peakLevel = level;
  initial.player!.stamina = 0; initial.inventory.drink = 1;
  await mount(initial);
  const drink = document.querySelector<HTMLButtonElement>('.consumable-slot[aria-label^="使用运动饮料"]')!;
  expect(drink.disabled).toBe(level === 99);
  if (level === 99) expect(drink.title).toContain('球员已满级');
  await act(async () => drink.click());
  expect(state().inventory.drink).toBe(level === 99 ? 1 : 0);
  expect(state().player!.stamina).toBe(level === 99 ? 0 : 10);
  expect(harness.actions.filter(action => action.type === 'use-drink')).toHaveLength(level === 99 ? 0 : 1);
});

it('shows the repeated-template payout on court rather than claiming the highest bonus was achieved', async () => {
  const initial = newGym(at, 22);
  initial.gymLevel = 8; initial.postgameRecommendedTemplates = ['bryant'];
  initial.player!.templateId = 'bryant'; initial.player!.highestTier = 'legend';
  initial.player!.level = initial.player!.peakLevel = 10;
  await mount(initial);
  const course = document.querySelector('.court-equipment-status')?.textContent ?? '';
  expect(course).toContain('重复模板推荐合计 1 券');
  expect(course).not.toContain('最高培养奖金已达成');
});

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

it('keeps player records, training access and the album usable after template suggestions are removed', async () => {
  const initial = newGym(at, 24);
  const current = templateRules.find(template => template.id === 'bryant')!;
  initial.collectionGoalId = 'jordan';
  Object.assign(initial.player!, {level: 25, peakLevel: 25, height: 200, templateId: current.id});
  await mount(initial);
  const details = document.querySelector<HTMLButtonElement>('.star-template-panel')!;
  await act(async () => details.click());
  const profile = document.querySelector('[aria-label="当前球员资料"]')!;
  expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe('球员资料');
  expect(profile.textContent).toContain(`${initial.player!.name} · 200 cm`);
  expect(profile.textContent).toContain(`训练 Lv.25 · 已投篮 0 次 · 当前模板 ${current.name}`);
  expect([...profile.querySelectorAll('dd')].map(item => item.textContent)).toEqual(statKeys.map(key => String(initial.player!.stats[key])));
  expect(document.querySelector('.gym-goal-card')).toBeNull();
  expect(document.querySelector('[aria-label="选择收藏培养目标"]')).toBeNull();
  await press('查看训练计划与培养记录');
  expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe('训练计划');
  await press('关闭面板');
  await press('打开图鉴');
  expect(document.querySelector('[aria-label="球星收藏进度"]')).toBeTruthy();
  expect(document.querySelectorAll('.gm-album-card')).toHaveLength(templateRules.length);
  expect(document.querySelector('[aria-label="选择收藏培养目标"]')).toBeNull();
  expect(harness.actions).toEqual([]);
  expect(state()).toEqual(initial);
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

it('runs independent automatic switches and settles the enabled athlete once after returning from the background', async () => {
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
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  await advance(20_000);
  expect(player(secondId).shots).toBe(2);
  visibility = 'visible';
  await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(player(firstId).shots).toBe(2);
  expect(player(secondId).shots).toBe(13);
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('离线训练报告');
  expect(document.querySelector('.gm-offline-report')?.textContent).toContain('11 球');
  const settled = player(secondId).shots;
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(player(secondId).shots).toBe(settled);
  await press('继续培养');
  expect(harness.store!.getState().pendingOfflineReport).toBeNull();
  expect(document.querySelector('.gm-offline-report')).toBeNull();
});
