import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {act} from 'preact/test-utils';
import type {UseBoundStore, StoreApi} from 'zustand';
import type {GymStore} from '../../src/gymStore';
import {dispatchGym, newGym, staminaMax, type GymState} from '../../src/game/gym/engine';
import {equipmentCatalog} from '../../src/game/gym/catalog';
import {readGym, writeGym} from '../../src/game/gym/save';
import {templateRules} from '../../src/game/contract/templates';
import {statKeys, type Stats} from '../../src/game/types';

const harness = vi.hoisted(() => ({
  values: new Map<string, string>(),
  store: null as UseBoundStore<StoreApi<GymStore>> | null,
  pending: null as Promise<unknown> | null,
}));
const storage = {getItem: (key: string) => harness.values.get(key) ?? null, setItem: (key: string, value: string) => {harness.values.set(key, value);}};
vi.mock('../../src/gymStore', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/gymStore')>();
  const memory = {getItem: (key: string) => harness.values.get(key) ?? null, setItem: (key: string, value: string) => {harness.values.set(key, value);}};
  const store = actual.createGymStore(memory, 31, () => Date.now());
  const api = store.getState();
  store.setState({
    start: () => {const work = api.start(); harness.pending = work; return work;},
    act: action => {const work = api.act(action); harness.pending = work; return work;},
    flush: () => {const work = api.flush(); harness.pending = work; return work;},
    resume: () => {const work = api.resume(); harness.pending = work; return work;},
    suspend: () => {const work = api.suspend(); harness.pending = work; return work;},
  });
  harness.store = store;
  return {...actual, useGym: store};
});
vi.mock('../../src/components/ShotScene', () => ({ShotScene: () => <div className="test-shot-scene"/>}));
vi.mock('../../src/presentation/audio', () => ({gameAudio: {play: vi.fn(async () => {}), install: vi.fn(() => () => {})}}));
vi.mock('../../src/presentation/animationConfig', () => {
  const config = {gameMaxWidthPx: 480, shootButtonScale: 1, hoopScale: 1};
  return {getAnimationConfig: () => config, subscribeAnimationConfig: () => () => {}, watchAnimationConfig: () => () => {}};
});
import GymHome from '../../src/components/GymHome';

const at = 1_800_000_000_000;
let root: Root | null = null;
let frameId = 0;
const frames = new Map<number, FrameRequestCallback>();
const state = () => harness.store!.getState().state;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(at);
  Object.defineProperty(document, 'fonts', {configurable: true, value: {ready: Promise.resolve()}});
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {frames.set(++frameId, callback); return frameId;});
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  harness.values.clear();
  harness.pending = null;
  harness.store!.setState({state: newGym(at, 31), hasSave: false, actionError: '', saveMessage: ''});
});
afterEach(async () => {
  if (root) act(() => root!.unmount());
  root = null;
  await harness.store!.getState().flush();
  frames.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount(initial?: GymState) {
  if (initial) {
    expect(writeGym(storage, initial).ok).toBe(true);
    harness.store!.setState({state: initial, hasSave: true});
  }
  root = createRoot(document.getElementById('root')!);
  await act(async () => root!.render(<GymHome/>));
}
function buttonWithin(scope: ParentNode, label: string) {
  const buttons = [...scope.querySelectorAll<HTMLButtonElement>('button')];
  const result = buttons.find(button => button.getAttribute('aria-label') === label) ?? buttons.find(button => button.textContent?.includes(label));
  expect(result, label).toBeTruthy();
  return result!;
}
async function press(label: string, scope: ParentNode = document) {
  await act(async () => {
    harness.pending = null;
    buttonWithin(scope, label).click();
    let completed: Promise<unknown> | null = null;
    while (harness.pending && harness.pending !== completed) {
      completed = harness.pending;
      await completed;
    }
  });
}
async function advance(milliseconds: number) {
  await act(async () => {await vi.advanceTimersByTimeAsync(milliseconds);});
  const pending = [...frames.values()];
  frames.clear();
  await act(async () => pending.forEach(callback => callback(Date.now())));
}
function card(selector: string, heading: string) {
  const result = [...document.querySelectorAll<HTMLElement>(selector)].find(element => element.querySelector('h4')?.textContent === heading);
  expect(result, heading).toBeTruthy();
  return result!;
}

it('starts at home, completes a course, chooses a plan and cooperation, recommends, recruits, saves and continues the same gym', async () => {
  await mount();
  await press('设置');
  expect(document.querySelector('.gym-settings')?.textContent).toContain('完整课程提高推荐时的培养声望');
  expect(document.querySelector('.gym-settings')?.textContent).not.toContain('完整课程与达成的合作会提高签约回报');
  await press('关闭面板');
  await press('开设训练馆');
  expect(document.querySelector('[aria-label="篮球训练馆"]')).toBeTruthy();
  expect(state().player!.stamina).toBe(20);
  const firstId = state().player!.id;
  for (let shot = 0; shot < 10; shot++) {
    if (shot > 0) await advance(1_000);
    await press('投篮训练');
  }
  expect(state().player!.training.completedCourses).toBe(1);
  expect(state().player!.stamina).toBe(14);
  await press('选择训练计划');
  await press('选择此计划', card('.gm-plan-card', '持球突破'));
  expect(state().player!.training.planId).toBe('finishing');
  await press('赞助合作');
  await press('接取合作', card('.gm-cooperation', '基础培养合作'));
  expect(state().player!.cooperation?.acceptedShots).toBe(10);
  expect(state().player!.cooperation?.acceptedCourses).toBe(1);
  await press('推荐球员签约');
  await press('确认推荐');
  expect(state().player).toBeNull();
  expect(state().alumni[0].id).toBe(firstId);
  expect(document.querySelector('.gym-empty-court')).toBeTruthy();
  await press('免费招募下一位');
  const nextId = state().player!.id;
  expect(nextId).not.toBe(firstId);
  expect(state().player!.stamina).toBe(20);
  expect(document.querySelector<HTMLButtonElement>('[aria-label="投篮训练"]')!.disabled).toBe(true);
  await advance(1_000);
  expect(document.querySelector<HTMLButtonElement>('[aria-label="投篮训练"]')!.disabled).toBe(false);
  await press('打开背包');
  await press('保存并返回首页');
  expect(document.querySelector('[aria-label="王牌训练师训练馆首页"]')).toBeTruthy();
  expect(readGym(storage).state?.player?.id).toBe(nextId);
  await press('继续经营');
  expect(state().player!.id).toBe(nextId);
  expect(state().alumni).toHaveLength(1);
  await press('打开图鉴');
  expect(document.querySelector('.gm-album-progress')?.textContent).toContain('/ 119');
  await press('器材图鉴');
  expect(document.querySelector('.gm-album-progress')?.textContent).toContain('/ 35');
  await press('关闭面板');
  await press('保存并返回首页');
  await press('生涯');
  expect(document.querySelector('.gm-alumni-list')).toBeTruthy();
  await press('关闭面板');
  await press('排行榜');
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('后续版本开放');
});

it('uses shop, inventory and projects before upgrading the gym and filling its second independent training seat', async () => {
  let initial = newGym(at, 32);
  const template = templateRules.find(entry => entry.tier === 'rotation')!;
  for (let alumnus = 0; alumnus < 2; alumnus++) {
    const player = initial.player!;
    Object.assign(player, {level: 10, peakLevel: 10, templateId: template.id, highestTier: 'rotation', height: template.height[0], shots: 20});
    player.stats = Object.fromEntries(statKeys.map(key => [key, 99])) as Stats;
    player.training.completedCourses = 2;
    initial = dispatchGym(initial, initial.revision, {type: 'recommend', id: player.id}, at).state;
    initial = dispatchGym(initial, initial.revision, {type: 'recruit'}, at).state;
  }
  initial.credits = 20;
  const capacity = equipmentCatalog.find(item => item.family === 'capacity' && item.grade === 1)!;
  expect(initial.fame).toBeGreaterThanOrEqual(160);
  await mount(initial);
  await press('继续经营');
  await press('器材商店');
  await press('购买', card('.gm-product', capacity.name));
  expect(state().ownedEquipment).toContain(capacity.id);
  expect(state().equippedEquipment).toEqual([capacity.id]);
  expect(staminaMax(state())).toBe(20 + capacity.effects.stamina);
  expect(state().player!.stamina).toBe(20);
  await press('关闭面板');
  await press('打开背包');
  expect(card('.gm-product', capacity.name).textContent).toContain('馆内生效');
  await press('关闭面板');
  await press('球馆经营');
  await press('升级', card('.gm-project', '耐力训练'));
  expect(staminaMax(state())).toBe(25 + capacity.effects.stamina);
  expect(state().player!.stamina).toBe(20);
  await press('免费升级球馆');
  expect(state().gymLevel).toBe(2);
  await press('关闭面板');
  await press('打开球员名册');
  await press('免费招募新人');
  expect(state().bench).toHaveLength(1);
  expect(state().bench[0].stamina).toBe(25 + capacity.effects.stamina);
  const switches = [...document.querySelectorAll<HTMLButtonElement>('[role="switch"]')];
  expect(switches).toHaveLength(2);
  await act(async () => switches[1].click());
  expect(state().player!.autoEnabled).toBe(false);
  expect(state().bench[0].autoEnabled).toBe(true);
  await advance(2_000);
  expect(state().player!.shots).toBe(0);
  expect(state().bench[0].shots).toBe(1);
  expect(readGym(storage).state?.bench[0].shots).toBe(1);
  await press('关闭面板');
  await press('保存并返回首页');
  await press('开始新球馆');
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('背包、在训球员和校友档案将重新开始');
  await press('确认开始');
  expect(state().gymLevel).toBe(1);
  expect(state().ownedEquipment).toEqual([]);
  expect(state().alumni).toEqual([]);
  expect(state().collectedEquipment[capacity.id]).toBeTruthy();
  expect(state().player!.stamina).toBe(20);
});

it('saves a departure, advances only the automatic athlete at home and resumes once with a persisted report', async () => {
  let initial = newGym(at, 33);
  initial.gymLevel = 2;
  initial = dispatchGym(initial, initial.revision, {type: 'recruit'}, at).state;
  initial = dispatchGym(initial, initial.revision, {type: 'set-auto', id: initial.player!.id, enabled: true}, at).state;
  await mount(initial);
  await press('继续经营');
  await advance(2_000);
  const before = state().player!.shots;
  expect(before).toBe(1);
  await press('保存并返回首页');
  expect(harness.store!.getState().isSuspended).toBe(true);
  await advance(60_000);
  expect(state().player!.shots).toBe(before);
  await press('继续经营');
  expect(state().player!.shots).toBeGreaterThan(before);
  expect(state().bench[0].shots).toBe(0);
  expect(state().credits).toBe(0);
  const after = state().player!.shots;
  expect(readGym(storage).state?.player?.shots).toBe(after);
  expect(harness.store!.getState().pendingOfflineReport).toBeTruthy();
  await advance(0);
  expect(document.querySelector('.gm-offline-report')).toBeTruthy();
  expect(document.querySelector('.gm-offline-report')?.textContent).toContain('1分钟');
  await press('继续培养');
  await press('保存并返回首页');
  await press('继续经营');
  expect(state().player!.shots).toBe(after);
  expect(document.querySelector('.gm-offline-report')).toBeNull();
});

it('purchases into a full gym, returns the replaced item to the warehouse, reinstalls and sells once while retaining the album', async () => {
  const initial = newGym(at, 34);
  initial.credits = 40;
  const installed = ['brand', 'recovery', 'course', 'capacity'].map(family => equipmentCatalog.find(item => item.family === family && item.grade === 1)!);
  const outgoing = installed[0];
  const incoming = equipmentCatalog.find(item => item.family === 'experience' && item.grade === 1)!;
  initial.ownedEquipment = installed.map(item => item.id);
  initial.equippedEquipment = [...initial.ownedEquipment];
  initial.purchasePrices = Object.fromEntries(installed.map(item => [item.id, item.price]));
  initial.collectedEquipment = Object.fromEntries(initial.ownedEquipment.map(id => [id, {firstAt: at}]));
  await mount(initial);
  await press('继续经营');
  await press('器材商店');
  await press('购买', card('.gm-product', incoming.name));
  expect(state().credits).toBe(40);
  await press('取消替换');
  expect(state().ownedEquipment).not.toContain(incoming.id);
  await press('购买', card('.gm-product', incoming.name));
  const choose = async (id: string) => act(async () => {
    const select = document.querySelector<HTMLSelectElement>('[aria-label="选择替换的器材"]')!;
    select.value = id;
    select.dispatchEvent(new Event('change', {bubbles: true}));
  });
  await choose(outgoing.id);
  await press('确认购买并替换');
  expect(state().credits).toBe(40 - incoming.price);
  expect(state().equippedEquipment).toContain(incoming.id);
  expect(state().equippedEquipment).not.toContain(outgoing.id);
  expect(state().ownedEquipment).toContain(outgoing.id);
  await press('关闭面板');
  await press('打开背包');
  await press('替换馆内器材', card('.gm-product', outgoing.name));
  await choose(incoming.id);
  await press('确认替换');
  expect(state().equippedEquipment).toContain(outgoing.id);
  expect(state().equippedEquipment).not.toContain(incoming.id);
  await press('半价出售', card('.gm-product', incoming.name));
  await press('确认出售');
  const finalCredits = 40 - incoming.price + Math.floor(incoming.price / 2);
  expect(state().credits).toBe(finalCredits);
  expect(state().ownedEquipment).not.toContain(incoming.id);
  expect(state().collectedEquipment[incoming.id]).toBeTruthy();
  expect(readGym(storage).state?.credits).toBe(finalCredits);
  await press('关闭面板');
  await press('打开图鉴');
  await press('器材图鉴');
  const album = [...document.querySelectorAll<HTMLButtonElement>('.gm-album-card')].find(item => item.textContent?.includes(incoming.name))!;
  expect(album.classList.contains('is-unknown')).toBe(false);
  expect(album.textContent).toContain('已收藏');
});
