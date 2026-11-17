import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {cooperationOffers, cooperationStatus, newGym, type GymAction, type GymState} from '../../src/game/gym/engine';
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

it.each([0, 98, 99])('removes the main-court consumable shelf without consuming inventory at level %s', async level => {
  const initial = newGym(at, 21);
  initial.player!.level = initial.player!.peakLevel = level;
  initial.player!.stamina = 0; initial.inventory.drink = 1;
  await mount(initial);
  expect(document.querySelector('.consumable-bar')).toBeNull();
  expect(document.querySelector('[aria-label="一次性物品，固定五格"]')).toBeNull();
  expect(state().inventory.drink).toBe(1);
  expect(state().player!.stamina).toBe(0);
  expect(harness.actions.filter(action => action.type === 'use-drink')).toHaveLength(0);
});

it('continues to show the next cultivation milestone for a repeated template', async () => {
  const initial = newGym(at, 22);
  initial.gymLevel = 8; initial.postgameRecommendedTemplates = ['bryant'];
  initial.player!.templateId = 'bryant'; initial.player!.highestTier = 'legend';
  initial.player!.level = initial.player!.peakLevel = 10;
  await mount(initial);
  const course = document.querySelector('.court-equipment-status')?.textContent ?? '';
  expect(course).toContain('Lv.15');
  expect(course).not.toContain('重复模板推荐合计 1 券');
  expect(course).not.toContain('最高培养奖金已达成');
});

it('updates experience without adding shot-result or click-instruction copy below its progress bar', async () => {
  const initial = newGym(at, 21);
  initial.player!.level = 10;
  initial.player!.peakLevel = 10;
  const attributes = {...initial.player!.stats};
  await mount(initial);
  expect(document.querySelector('.probability-segment')).toBeNull();
  expect(document.querySelector('[aria-label="当前球员训练经验"]')?.getAttribute('aria-valuenow')).toBe('0');
  expect(document.querySelector('[aria-label="训练经验"]')?.textContent).not.toContain('点击查看升级需求');
  await press('投篮训练');
  expect(state().player!.experience).toBeGreaterThan(0);
  expect(state().player!.level).toBe(10);
  expect(state().player!.stats).toEqual(attributes);
  const experience = document.querySelector<HTMLElement>('[aria-label="训练经验"]')!;
  expect(experience.textContent).not.toMatch(/成功|维持|经验\s*\+|点击查看/);
  expect(document.querySelector('[aria-label="当前球员训练经验"]')?.getAttribute('aria-valuenow')).toBe(String(state().player!.experience));
  expect(experience.tagName).toBe('DIV');
  expect(document.querySelector('button[aria-label="查看训练经验"]')).toBeNull();
  const before = structuredClone(state());
  await act(async () => experience.click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(state()).toEqual(before);
});

it('places fixed-label plan and cooperation tickets beside experience and keeps both panel routes usable', async () => {
  const initial = newGym(at, 26);
  await mount(initial);
  const toolbar = document.querySelector('[aria-label="训练快捷操作"]')!;
  const plan = document.querySelector<HTMLButtonElement>('[aria-label="选择训练计划"]')!;
  const cooperation = document.querySelector<HTMLButtonElement>('[aria-label="赞助合作"]')!;
  expect(toolbar).toBeTruthy();
  expect(toolbar.contains(document.querySelector('[aria-label="当前球员训练经验"]'))).toBe(true);
  expect(toolbar.contains(plan)).toBe(true);
  expect(toolbar.contains(cooperation)).toBe(true);
  expect(plan.textContent).toBe('计划');
  expect(cooperation.textContent).toBe('合作');
  expect(document.querySelector('.game-stage [aria-label="选择训练计划"]')).toBeNull();
  expect(document.querySelector('.game-stage [aria-label="赞助合作"]')).toBeNull();
  expect(document.querySelector('.gym-training-tools')).toBeNull();
  expect(document.querySelector('.game-stage [aria-label="打开图鉴"]')).toBeTruthy();
  expect(document.querySelector('[aria-label="合作已达成"]')).toBeNull();
  await press('选择训练计划');
  expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe('训练计划');
  await press('关闭面板');
  await press('赞助合作');
  expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe('赞助合作');
  expect(harness.actions).toEqual([]);
  expect(state()).toEqual(initial);
});

it.each([false, true])('keeps the cooperation ticket text stable and marks only an earned cooperation (complete %s)', async complete => {
  const initial = newGym(at, 27);
  const template = templateRules.find(item => item.tier === 'rotation')!;
  Object.assign(initial.player!, {templateId: template.id, highestTier: template.tier,
    shots: complete ? 10 : 5, level: 10, peakLevel: 10});
  initial.player!.training.completedCourses = complete ? 1 : 0;
  initial.player!.cooperation = {id: cooperationOffers(initial)[0].id,
    playerId: initial.player!.id, acceptedShots: 0, acceptedCourses: 0};
  expect(cooperationStatus(initial).complete).toBe(complete);
  await mount(initial);
  const ticket = document.querySelector<HTMLButtonElement>('[aria-label="赞助合作"]')!;
  expect(ticket.textContent).toBe('合作');
  expect(!!ticket.querySelector('[aria-label="合作已达成"]')).toBe(complete);
  await press('赞助合作');
  expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe('赞助合作');
  expect(document.querySelector('.gm-cooperation.is-active')?.textContent).toContain(complete ? '已达标' : '进行中');
  expect(harness.actions).toEqual([]);
  expect(state()).toEqual(initial);
});

it('renders an empty court with safe experience values and no earned cooperation marker', async () => {
  const initial = newGym(at, 28);
  initial.player = null;
  await mount(initial);
  const progress = document.querySelector('[aria-label="当前球员训练经验"]')!;
  expect(progress.getAttribute('aria-valuenow')).toBe('0');
  expect(Number(progress.getAttribute('aria-valuemax'))).toBeGreaterThan(0);
  expect(document.querySelector('[aria-label="训练经验"]')?.textContent).not.toMatch(/undefined|NaN|点击查看/);
  expect(document.querySelector('[aria-label="合作已达成"]')).toBeNull();
  expect(document.querySelector('.gym-empty-court')).toBeNull();
  expect(document.querySelector('.game-stage .gym-empty-recruit')).toBeNull();
  const recruitment = document.querySelector('[aria-label="新人招生"]')!;
  expect(recruitment.closest('[role="dialog"]')?.querySelector('h2')?.textContent).toBe('新人招生');
  expect(recruitment.closest('.game-stage')).toBeNull();
  expect(document.querySelector('.game-stage [aria-label="新人招生"]')).toBeNull();
  expect(document.querySelector('[aria-label="投篮训练"]')).toBeNull();
  expect(document.querySelector<HTMLButtonElement>('[aria-label="招募球员"]')?.disabled).toBe(true);
  expect(harness.actions).toEqual([]);
});

it('can dismiss and reopen global recruitment, then closes it after recruiting into the empty court', async () => {
  const initial = newGym(at, 28);
  initial.player = null;
  await mount(initial);
  await press('关闭面板');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await advance(1000);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  const recruitButton = document.querySelector<HTMLButtonElement>('[aria-label="招募球员"]')!;
  expect(recruitButton.classList.contains('is-recruiting')).toBe(true);
  expect(recruitButton.disabled).toBe(false);
  await press('招募球员');
  expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe('新人招生');
  await press('免费招募下一位');
  expect(state().player).toBeTruthy();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.querySelector('.gym-empty-court')).toBeNull();
  expect(document.querySelector('[aria-label="招募球员"]')).toBeNull();
  expect(document.querySelector('[aria-label="投篮训练"]')).toBeTruthy();
  expect(harness.actions.filter(action => action.type === 'recruit')).toHaveLength(1);
});

it('leaves the court open after the final trainee is recommended and recruits only after an explicit click', async () => {
  await mount(newGym(at, 29));
  await press('推荐球员签约');
  await press('确认推荐');
  expect(state().player).toBeNull();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.querySelector('[aria-label="新人招生"]')).toBeNull();
  await advance(1_000);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await press('招募球员');
  const recruitment = document.querySelector('[aria-label="新人招生"]')!;
  expect(recruitment.closest('[role="dialog"]')?.querySelector('h2')?.textContent).toBe('新人招生');
  expect(recruitment.closest('.game-stage')).toBeNull();
  await press('免费招募下一位');
  expect(state().player).toBeTruthy();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it('locks automatic training at level one without changing the original main controls', async () => {
  await mount(newGym(at, 21));
  expect(document.querySelectorAll('.css-dock-button')).toHaveLength(4);
  expect(document.querySelector('[aria-label="当前球员自动训练"]')).toBeNull();
  await press('打开球员名册');
  const toggle = document.querySelector<HTMLButtonElement>('[role="switch"]')!;
  expect(toggle.disabled).toBe(true);
  expect(toggle.textContent).toContain('Lv.2');
  expect(toggle.getAttribute('aria-checked')).toBe('false');
  expect(document.querySelector('.gm-roster-recruit')).toBeNull();
});

it('toggles only the selected athlete from the compact player-card automatic button', async () => {
  const [firstId, secondId] = await twoPlayers();
  await press('关闭面板');
  const toggle = () => document.querySelector<HTMLButtonElement>('[aria-label="当前球员自动训练"]')!;
  expect(toggle().textContent).toBe('开启自动');
  expect(toggle().getAttribute('aria-checked')).toBe('false');
  expect(document.querySelector('.gym-player-actions .red-stamp > i')).toBeNull();
  await press('当前球员自动训练');
  expect(player(firstId).autoEnabled).toBe(true);
  expect(player(secondId).autoEnabled).toBe(false);
  expect(toggle().textContent).toBe('暂停自动');
  expect(toggle().querySelector('.gm-auto-border')).toBeTruthy();
  expect(document.querySelector<HTMLButtonElement>('[aria-label="投篮训练"]')!.disabled).toBe(true);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await press('当前球员自动训练');
  expect(player(firstId).autoEnabled).toBe(false);
  expect(toggle().querySelector('.gm-auto-border')).toBeNull();
  expect(player(firstId).nextShotAt).toBeGreaterThan(Date.now());
});

it('keeps a full-level athlete from enabling automatic training on the player card', async () => {
  const initial = newGym(at, 21); initial.gymLevel = 2;
  initial.player!.level = initial.player!.peakLevel = 99;
  await mount(initial);
  const button = document.querySelector<HTMLButtonElement>('[aria-label="当前球员自动训练"]')!;
  expect(button.disabled).toBe(true);
  await act(async () => button.click());
  expect(harness.actions).toEqual([]);
  expect(state().player!.autoEnabled).toBe(false);
});

it('cycles through every trainee from the court without opening the roster or changing their automatic modes', async () => {
  const initial = newGym(at, 21); initial.gymLevel = 3;
  await mount(initial);
  await act(async () => {
    await harness.store!.getState().act({type: 'recruit'});
    await harness.store!.getState().act({type: 'recruit'});
  });
  const athletes = [state().player!, ...state().bench].sort((a, b) => a.enteredAt - b.enteredAt || a.id.localeCompare(b.id));
  const firstId = athletes[0].id;
  await act(async () => {await harness.store!.getState().act({type: 'set-auto', id: athletes[1].id, enabled: true});});
  for (const expected of [athletes[1].id, athletes[2].id, firstId]) {
    await press('切换训练球员');
    expect(state().player!.id).toBe(expected);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(player(athletes[1].id).autoEnabled).toBe(true);
    expect(player(firstId).autoEnabled).toBe(false);
  }
  expect(harness.actions.filter(action => action.type === 'select-player')).toHaveLength(3);
});

it('keeps the quick-switch control out of a single-player court', async () => {
  await mount(newGym(at, 21));
  expect(document.querySelector('[aria-label="切换训练球员"]')).toBeNull();
});

it('switches a two-position court to its empty position and recruits/selects there with the main button', async () => {
  const initial = newGym(at, 21); initial.gymLevel = 2;
  initial.player!.level = initial.player!.peakLevel = 8;
  initial.player!.experience = 42;
  initial.player!.templateId = 'bryant'; initial.player!.highestTier = 'legend';
  const firstId = initial.player!.id;
  await mount(initial);
  expect(document.querySelector('.gym-player-share')).toBeTruthy();
  expect(document.querySelector('.gym-court-switch small')?.textContent).toBe('1/2');
  await press('切换训练球员');
  expect(document.querySelector('.gym-court-switch small')?.textContent).toBe('2/2');
  expect(state().player!.id).toBe(firstId);
  expect(state().bench).toHaveLength(0);
  expect(harness.actions).toEqual([]);
  expect(document.querySelector('.gym-player-share')).toBeNull();
  expect(document.querySelector('[aria-label="当前球员自动训练"]')).toBeNull();
  expect(document.querySelector('[aria-label="当前球员训练经验"]')?.getAttribute('aria-valuetext')).toBe('空训练位，等待招募');
  expect(document.querySelector('[aria-label="训练经验"]')?.textContent).toContain('等待招募');
  expect(document.querySelector('[aria-label="训练经验"]')?.textContent).not.toContain('42');
  expect(document.querySelector<HTMLButtonElement>('[aria-label="选择训练计划"]')!.disabled).toBe(true);
  expect(document.querySelector<HTMLButtonElement>('[aria-label="推荐球员签约"]')!.disabled).toBe(true);
  await press('招募球员');
  expect(harness.actions).toEqual([{type: 'recruit', expectedNextPlayer: initial.nextPlayer, selectRecruited: true}]);
  expect(state().player!.id).not.toBe(firstId);
  expect(state().bench.map(trainee => trainee.id)).toEqual([firstId]);
  expect(state().bench[0].level).toBe(8);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.querySelector('[aria-label="招募球员"]')).toBeNull();
  expect(document.querySelector('.gym-court-switch small')?.textContent).toBe('2/2');
  expect(state().player!.nextShotAt).toBe(at + 500);
  expect(document.querySelector<HTMLButtonElement>('[aria-label="投篮训练"]')!.disabled).toBe(true);
  await advance(500);
  await press('投篮训练');
  expect(state().player!.shots).toBe(1);
  expect(state().bench[0].shots).toBe(0);
});

it('cycles all eight available positions while preserving the occupied entry order', async () => {
  const initial = newGym(at, 21); initial.gymLevel = 8;
  await mount(initial);
  await act(async () => {
    await harness.store!.getState().act({type: 'recruit'});
    await harness.store!.getState().act({type: 'recruit'});
  });
  const ids = [state().player!, ...state().bench].sort((a,b) => a.enteredAt-b.enteredAt || a.id.localeCompare(b.id)).map(trainee => trainee.id);
  for (let step = 1; step <= 8; step++) {
    await press('切换训练球员');
    const position = step % 8;
    expect(document.querySelector('.gym-court-switch small')?.textContent).toBe(`${position + 1}/8`);
    expect([state().player!, ...state().bench].map(trainee => trainee.id).sort()).toEqual([...ids].sort());
    if (position < ids.length) {
      expect(state().player!.id).toBe(ids[position]);
      expect(document.querySelector('[aria-label="投篮训练"]')).toBeTruthy();
    } else expect(document.querySelector('[aria-label="招募球员"]')).toBeTruthy();
  }
  expect(harness.actions.filter(action => action.type === 'select-player')).toHaveLength(3);
  expect(harness.actions.filter(action => action.type === 'recruit')).toHaveLength(2);
});

it('keeps capacity switching and direct recruitment usable when every position is empty', async () => {
  const initial = newGym(at, 21); initial.gymLevel = 3; initial.player = null;
  await mount(initial);
  await press('关闭面板');
  for (const position of [2,3,1]) {
    await press('切换训练球员');
    expect(document.querySelector('.gym-court-switch small')?.textContent).toBe(`${position}/3`);
    expect(state().player).toBeNull();
  }
  await press('招募球员');
  expect(state().player).toBeTruthy();
  expect(state().bench).toHaveLength(0);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.querySelector('.gym-court-switch small')?.textContent).toBe('1/3');
});

it('continues real automatic training while an empty position hides all player feedback', async () => {
  const initial = newGym(at, 21); initial.gymLevel = 2;
  initial.player!.autoEnabled = true; initial.player!.nextShotAt = at + 200;
  initial.player!.shots = initial.player!.training.shots = 9;
  await mount(initial);
  await press('切换训练球员');
  await advance(200);
  expect(state().player!.shots).toBe(10);
  expect(state().player!.training.completedCourses).toBe(1);
  expect(document.querySelector('[aria-label="招募球员"]')).toBeTruthy();
  expect(document.querySelector('[aria-label="当前球员训练经验"]')?.getAttribute('aria-valuenow')).toBe('0');
  expect(document.querySelector('.contract-status')).toBeNull();
  expect(document.querySelector('[aria-label="查看当前训练课程"]')).toBeNull();
  await press('切换训练球员');
  expect(document.querySelector('[aria-label="当前球员自动训练"]')?.getAttribute('aria-checked')).toBe('true');
  expect(document.querySelector('.gym-court-switch small')?.textContent).toBe('1/2');
});

it('returns to the real selected athlete when opening a secondary panel from an empty position', async () => {
  const initial = newGym(at, 21); initial.gymLevel = 2;
  await mount(initial);
  await press('切换训练球员');
  expect(document.querySelector('[aria-label="招募球员"]')).toBeTruthy();
  await press('打开背包');
  await act(async () => harness.store!.setState({actionError: '存档写入失败，本次操作未生效'}));
  expect(document.querySelector('.action-notice[role="alert"]')?.textContent).toContain('存档写入失败');
  await press('关闭面板');
  expect(document.querySelector('[aria-label="投篮训练"]')).toBeTruthy();
  expect(document.querySelector('.gym-court-switch small')?.textContent).toBe('1/2');
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
  expect(document.querySelector('[aria-label="训练经验"]')?.textContent).not.toMatch(/点击查看|经验\s*\+/);
  expect(document.querySelector('[aria-label="选择训练计划"]')?.textContent).toBe('计划');
  expect(document.querySelector('[aria-label="赞助合作"]')?.textContent).toBe('合作');
  expect(document.querySelector('[aria-label="查看当前训练课程"]')?.textContent).toContain('等级已满');
  expect(document.querySelector<HTMLButtonElement>('[aria-label="投篮训练"]')!.disabled).toBe(true);
  await act(async () => document.querySelector<HTMLElement>('.gym-experience')!.click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it('selects a bench athlete for manual training and recommends only that selected athlete', async () => {
  const [firstId, secondId] = await twoPlayers();
  const recruited = state().bench.find(entry => entry.id === secondId)!;
  // A matched trainee is archived; undiscovered departures are covered separately.
  recruited.templateId = 'bryant'; recruited.highestTier = 'legend';
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
  expect(profile.textContent).toContain('200 cm');
  expect(profile.textContent).not.toContain(initial.player!.name);
  expect(profile.textContent).toContain(current.name);
  expect(profile.querySelector('[aria-label="培养记录"]')?.textContent).toContain('Lv.25');
  expect([...profile.querySelectorAll('[role="meter"]')].map(item => item.getAttribute('aria-valuenow'))).toEqual(statKeys.map(key => String(initial.player!.stats[key])));
  expect(document.querySelector('.gym-goal-card')).toBeNull();
  expect(document.querySelector('[aria-label="选择收藏培养目标"]')).toBeNull();
  await press('查看训练计划与培养记录');
  expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe('训练计划');
  await press('关闭面板');
  await press('打开图鉴');
  expect(document.querySelector('[aria-label="球星收藏进度"]')).toBeTruthy();
  expect(document.querySelectorAll('.album-card')).toHaveLength(templateRules.length);
  expect(document.querySelector('[aria-label="选择收藏培养目标"]')).toBeNull();
  expect(harness.actions).toEqual([]);
  expect(state()).toEqual(initial);
});

it('keeps the live course card in place while an automatic completion notice floats above the page', async () => {
  const initial = newGym(at, 25);
  initial.gymLevel = 2;
  initial.player!.autoEnabled = true;
  initial.player!.nextShotAt = at + 200;
  initial.player!.training.shots = 9;
  initial.player!.shots = 9;
  await mount(initial);
  await advance(200);
  expect(document.querySelector('.contract-status')?.textContent).toContain('训练课完成');
  expect(document.querySelector('[aria-label="查看当前训练课程"]')).toBeTruthy();
  expect(document.querySelector('.contract-status')?.parentElement).toBe(document.body);
  await advance(4_000);
  expect(document.querySelector('[aria-label="查看当前训练课程"]')).toBeTruthy();
  expect(document.querySelector('.contract-status')).toBeNull();
});

it.each(['打开背包','器材商店','打开球员名册','查看球馆经营','打开图鉴','选择训练计划','赞助合作','推荐球员签约'])('keeps automatic course notices out of the secondary panel: %s', async label => {
  const initial = newGym(at, 25); initial.gymLevel = 2;
  initial.player!.autoEnabled = true; initial.player!.nextShotAt = at + 200;
  initial.player!.training.shots = initial.player!.shots = 9;
  await mount(initial);
  await press(label);
  await advance(200);
  expect(state().player!.training.completedCourses).toBe(1);
  expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain('训练课完成');
  expect(document.querySelector('.contract-status')).toBeNull();
  await press('关闭面板');
  expect(document.querySelector('.contract-status')).toBeNull();
  expect(document.querySelector('[aria-label="查看当前训练课程"]')).toBeTruthy();
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
