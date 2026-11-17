import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {cooperationOffers, cooperationStatus, gymUpgrade, newGym, staminaMax, type GymAction, type GymAlumnus, type GymState} from '../../src/game/gym/engine';
import {templateRules} from '../../src/game/contract/templates';
import {positionLabels, templateById} from '../../src/game/templates';
import type {GymStore} from '../../src/gymStore';
import type {UseBoundStore, StoreApi} from 'zustand';

const harness = vi.hoisted(() => ({store: null as UseBoundStore<StoreApi<GymStore>> | null, actions: [] as GymAction[]}));
vi.mock('../../src/gymStore', async () => {
  const {create} = await import('zustand');
  const {dispatchGym, newGym} = await import('../../src/game/gym/engine');
  const store = create<GymStore>((set, get) => ({
    state: newGym(1_800_000_000_000, 21), hasSave: true, hydrating: false, hydrate: async () => {},
    loadAlumni: async (offset = 0, limit = 20) => ({players: [...get().state.alumni].reverse().slice(offset, offset + limit), total: get().state.alumni.length}),
    actionError: '', saveMessage: '', isSuspended: false, pendingOfflineReport: null,
    start: async () => ({state: get().state, events: []}),
    act: async action => {
      harness.actions.push(action);
      const result = dispatchGym(get().state, get().state.revision, action, Date.now());
      set({state: result.state, actionError: result.error ?? ''}); return result;
    },
    tick: async () => {
      const result = dispatchGym(get().state, get().state.revision, {type: 'auto-step'}, Date.now());
      set({state: result.state}); return result;
    },
    resume: async () => {set({isSuspended: false}); return {state: get().state, events: []};},
    suspend: async () => {set({isSuspended: true});}, flush: async () => {set({isSuspended: true});},
    dismissOfflineReport: () => set({pendingOfflineReport: null}),
  }));
  harness.store = store; return {useGym: store};
});
vi.mock('../../src/components/ShotScene', () => ({ShotScene: () => <div className="test-shot-scene"/>}));
vi.mock('../../src/presentation/gymSharePoster', async () => {
 const original = await vi.importActual<typeof import('../../src/presentation/gymSharePoster')>('../../src/presentation/gymSharePoster');
 return {...original, generateGymSharePoster: vi.fn(async () => new Blob(['preview'], {type: 'image/png'}))};
});
vi.mock('../../src/presentation/audio', () => ({gameAudio: {play: vi.fn(async () => {}), install: vi.fn(() => () => {})}}));
vi.mock('../../src/presentation/animationConfig', () => {
  const config = {gameMaxWidthPx: 480, shootButtonScale: 1, hoopScale: 1};
  return {getAnimationConfig: () => config, subscribeAnimationConfig: () => () => {}, watchAnimationConfig: () => () => {}};
});
import GymGame from '../../src/components/GymGame';

const at = 1_800_000_000_000;
let root: Root | null = null;
let postEditor: ReturnType<typeof vi.fn>, rewardVideo: ReturnType<typeof vi.fn>, refreshTask: ReturnType<typeof vi.fn>;
const state = () => harness.store!.getState().state;
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(node => node.getAttribute('aria-label') === label || node.textContent === label);
async function flushMicrotasks() {for (let index = 0; index < 30; index++) await Promise.resolve();}
async function press(label: string) {
  const node = button(label); expect(node, label).toBeTruthy(); await act(async () => {node!.click(); await flushMicrotasks();});
  await act(flushMicrotasks);
}
async function pressContaining(text: string) {
  const node = [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.includes(text));
  expect(node, text).toBeTruthy(); await act(async () => {node!.click(); await flushMicrotasks();});
}
async function mount(initial: GymState) {
  harness.store!.setState({state: initial});
  root = createRoot(document.getElementById('root')!);
  await act(async () => {root!.render(<GymGame onHome={() => {}}/>); await flushMicrotasks();});
}
function templateFixture() {
  const initial = newGym(at, 24), template = templateRules.find(item => item.tier === 'rotation')!;
  Object.assign(initial.player!, {templateId: template.id, highestTier: template.tier, height: template.height[0], level: 10, peakLevel: 10});
  return initial;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  return {promise: new Promise<T>(accept => {resolve = accept;}), resolve: (value: T) => resolve(value)};
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(at);
  Object.defineProperty(document, 'fonts', {configurable: true, value: {ready: Promise.resolve()}});
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.stubGlobal('requestAnimationFrame', () => 1); vi.stubGlobal('cancelAnimationFrame', () => {});
  postEditor = vi.fn().mockResolvedValue({code: 200});
  rewardVideo = vi.fn().mockResolvedValue({code: 200, data: {rewarded: true}});
  refreshTask = vi.fn().mockResolvedValue({code: 200});
  delete window.__COLORBOX_AI_CONFIG__;
  window.ColorboxAI = {
    oss: {uploadFile: vi.fn(async () => ({downloadUrl: 'https://i2.hoopchina.com.cn/gym-test-poster.png'}))},
    bbsConfig: {get: vi.fn().mockResolvedValue({bbsTagId: 'project-tag', bbsTopicId: 'project-topic'})},
    request: {bbs: {openPostEditor: postEditor}},
    vatask: {completeRewardVideo: rewardVideo, getActivityTaskState: refreshTask},
  };
  vi.stubGlobal('URL', class extends URL {static createObjectURL = vi.fn(() => 'blob:gym-share-preview'); static revokeObjectURL = vi.fn();});
  harness.actions = [];
  harness.store!.setState({state: newGym(at, 24), actionError: '', isSuspended: false, pendingOfflineReport: null});
});
afterEach(async () => {
  if (root) act(() => root!.unmount()); root = null;
  await act(async () => {await vi.advanceTimersByTimeAsync(120_001);});
  delete window.ColorboxAI; delete window.__COLORBOX_AI_CONFIG__;
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it('places a once-per-player +3 share button beside the tier and awards only after the editor acknowledges opening', async () => {
  const pending = deferred<{code: number}>(); postEditor.mockReturnValue(pending.promise);
  const initial = templateFixture(), before = structuredClone(initial.player!);
  await mount(initial);
  const shareButton = button('分享·等级+3')!;
  expect(shareButton.closest('.template-identity-meta')).toBeTruthy();
  expect(shareButton.closest('.template-identity-meta')?.textContent).not.toContain(positionLabels[templateById(before.templateId)!.position]);
  await press('分享·等级+3');
  expect(document.querySelector('.gym-share-dialog h2')?.textContent).toBe('发帖分享');
  expect(document.querySelector('.gym-share-reward')?.textContent).toContain('等级 +3');
  expect(state().player!.level).toBe(10);
  await press('发帖分享');
  expect(postEditor).toHaveBeenCalledTimes(1);
  expect(postEditor).toHaveBeenCalledWith(expect.objectContaining({tagId: 'project-tag', topicId: 'project-topic'}));
  expect(state().player!.shareLevelClaimed).toBeUndefined(); expect(state().player!.level).toBe(10);
  expect(button('正在打开发帖…')?.disabled).toBe(true);
  await act(async () => {pending.resolve({code: 200}); await flushMicrotasks();});
  expect(state().player).toMatchObject({id: before.id, level: 13, peakLevel: 13, shareLevelClaimed: true, shots: before.shots, stamina: before.stamina});
  expect(button('分享·等级+3')).toBeUndefined();
  expect(button('已领取')?.disabled).toBe(true);
  expect(harness.actions.filter(action => action.type === 'share-player-levels')).toHaveLength(1);
  await press('关闭面板');
  expect(button('分享·等级+3')).toBeUndefined();
  expect(rewardVideo).not.toHaveBeenCalled();
});

it('keeps the player and share opportunity unchanged when the editor rejects opening', async () => {
  postEditor.mockResolvedValue({code: 403, message: '请登录后重试'});
  const initial = templateFixture(), before = structuredClone(initial.player!);
  await mount(initial); await press('分享·等级+3'); await press('发帖分享');
  expect(document.querySelector('.gym-share-dialog [role="status"]')?.textContent).toBe('请登录后重试');
  expect(state().player).toEqual(before); expect(harness.actions).toEqual([]);
  await press('关闭面板'); expect(button('分享·等级+3')).toBeTruthy();
});

it('hides sharing until a template exists and at the level cap', async () => {
  const initial = newGym(at, 24); await mount(initial);
  expect(button('分享·等级+3')).toBeUndefined();
  const capped = templateFixture(); capped.player!.level = capped.player!.peakLevel = 99;
  await act(async () => harness.store!.setState({state: capped}));
  expect(button('分享·等级+3')).toBeUndefined();
});

it('restores zero stamina by sharing once, then uses only rewarded advertisements for later refills', async () => {
  const initial = newGym(at, 24); initial.player!.stamina = 0;
  await mount(initial);
  expect(document.querySelector('.gym-court-quick-actions [aria-label="分享发帖，体力回满"]')).toBeTruthy();
  expect(button('分享发帖，体力回满')?.textContent).toBe('体力回满');
  await press('分享发帖，体力回满'); await press('发帖分享');
  expect(state().player!.stamina).toBe(staminaMax(state())); expect(state().staminaRewardCount).toBe(1);
  expect(postEditor).toHaveBeenCalledTimes(1); expect(rewardVideo).not.toHaveBeenCalled();
  await press('关闭面板');
  await act(async () => harness.store!.setState({state: {...state(), player: {...state().player!, stamina: 0}}}));
  expect(button('分享发帖，体力回满')).toBeUndefined(); expect(button('看广告，体力回满')).toBeTruthy();
  const pending = deferred<{code: number; data: {rewarded: boolean}}>(); rewardVideo.mockReturnValue(pending.promise);
  const restore = button('看广告，体力回满')!;
  await act(async () => {restore.click(); restore.click(); await flushMicrotasks();});
  expect(restore.disabled).toBe(true); expect(restore.getAttribute('aria-busy')).toBe('true');
  expect(restore.textContent).toBe('加载中…'); expect(restore.querySelector('.gym-button-spinner')).toBeTruthy();
  expect(rewardVideo).toHaveBeenCalledTimes(1); expect(refreshTask).not.toHaveBeenCalled();
  expect(state().player!.stamina).toBe(0); expect(state().staminaRewardCount).toBe(1);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.querySelector('.gym-reward-wait')).toBeNull();
  await act(async () => {pending.resolve({code: 200, data: {rewarded: true}}); await flushMicrotasks();});
  expect(rewardVideo).toHaveBeenCalledTimes(1); expect(refreshTask).toHaveBeenCalledTimes(1);
  expect(state().player!.stamina).toBe(staminaMax(state())); expect(state().staminaRewardCount).toBe(2);
  expect(postEditor).toHaveBeenCalledTimes(1);
  expect(document.querySelector('.gym-stamina-restore')).toBeNull();
});

it.each([false, true])('keeps the refill action in the bottom-right quick actions, after switching when another trainee exists (%s)', async withBench => {
 const initial = newGym(at, 24); initial.player!.stamina = 0;
 if (withBench) {initial.gymLevel = 2; initial.bench = [{...structuredClone(initial.player!), id: 'second-trainee', stamina: 5}];}
 await mount(initial);
 const actions = document.querySelector('.gym-court-quick-actions')!;
 const restore = actions.querySelector<HTMLButtonElement>('.gym-stamina-restore')!;
 expect(restore).toBeTruthy(); expect(restore.textContent).toBe('体力回满');
 expect(restore.querySelector('small')).toBeNull();
 expect(document.querySelector('.gym-stamina-meter .gym-stamina-restore')).toBeNull();
 expect(actions.children).toHaveLength(withBench ? 2 : 1);
 if (withBench) {expect(restore.previousElementSibling?.classList.contains('gym-court-switch')).toBe(true);}
 else {expect(restore.previousElementSibling).toBeNull();}
 expect(restore).toBe(actions.lastElementChild);
 expect(postEditor).not.toHaveBeenCalled(); expect(rewardVideo).not.toHaveBeenCalled();
});

it('does not restore stamina or advance its reward count when an advertisement is cancelled', async () => {
  rewardVideo.mockResolvedValue({code: 200, message: '广告未看完', data: {rewarded: false}});
  const initial = newGym(at, 24); initial.player!.stamina = 0; initial.staminaRewardCount = 1;
  await mount(initial); await press('看广告，体力回满');
  expect(state().player!.stamina).toBe(0); expect(state().staminaRewardCount).toBe(1);
  expect(harness.actions).toEqual([]); expect(refreshTask).not.toHaveBeenCalled();
  expect(document.querySelector('.contract-status')?.textContent).toBe('广告未看完');
  expect(document.querySelector('.gym-reward-wait')).toBeNull();
  expect(button('看广告，体力回满')?.disabled).toBe(false);
  expect(button('看广告，体力回满')?.getAttribute('aria-busy')).toBe('false');
  expect(button('看广告，体力回满')?.textContent).toBe('体力回满');
});

it('places cooperation advertisements before accept and completes only the selected cooperation after rewarded confirmation', async () => {
  const pending = deferred<{code: number; data: {rewarded: boolean}}>(); rewardVideo.mockReturnValue(pending.promise);
  const initial = templateFixture(), before = structuredClone(initial.player!), offer = cooperationOffers(initial)[1];
  await mount(initial); await press('赞助合作');
  const ad = button(`看广告一键完成${offer.name}`)!;
  expect(ad.querySelector('svg')).toBeTruthy(); expect(ad.nextElementSibling?.textContent).toBe('接取合作');
  await act(async () => {ad.click(); ad.click(); await flushMicrotasks();});
  expect(ad.disabled).toBe(true); expect(ad.getAttribute('aria-busy')).toBe('true'); expect(ad.textContent).toBe('加载中…');
  expect(ad.querySelector('.gym-button-spinner')).toBeTruthy();
  expect(document.querySelector('.gym-reward-wait')).toBeNull(); expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe('赞助合作');
  expect(rewardVideo).toHaveBeenCalledTimes(1); expect(refreshTask).not.toHaveBeenCalled(); expect(state().player!.cooperation).toBeNull();
  expect(harness.actions).toEqual([]);
  await act(async () => {pending.resolve({code: 200, data: {rewarded: true}}); await flushMicrotasks();});
  expect(cooperationStatus(state()).complete).toBe(true); expect(cooperationStatus(state()).offer!.id).toBe(offer.id);
  expect(state().player).toMatchObject({stats: before.stats, level: before.level, shots: before.shots, stamina: before.stamina,
    training: before.training, equipmentTraining: before.equipmentTraining});
  expect(state().credits).toBe(0); expect(state().fame).toBe(0);
  expect(document.querySelector('.gm-cooperation.is-active .gm-cooperation-title')?.textContent).toContain('广告已完成');
  expect(button(`看广告一键完成${offer.name}`)?.disabled).toBe(true);
  expect(harness.actions.filter(action => action.type === 'complete-cooperation-ad')).toHaveLength(1);
  expect(button(`看广告一键完成${offer.name}`)?.getAttribute('aria-busy')).toBe('false');
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
});

it('releases the original cooperation button without completing anything when the ad is not rewarded', async () => {
 const pending = deferred<{code: number; message: string; data: {rewarded: boolean}}>(); rewardVideo.mockReturnValue(pending.promise);
 const initial = templateFixture(), before = structuredClone(initial.player!), offer = cooperationOffers(initial)[0];
 await mount(initial); await press('赞助合作'); await press(`看广告一键完成${offer.name}`);
 const ad = button(`看广告一键完成${offer.name}`)!;
 expect(ad.getAttribute('aria-busy')).toBe('true'); expect(ad.disabled).toBe(true);
 expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
 await act(async () => {pending.resolve({code: 200, message: '广告未完整观看', data: {rewarded: false}}); await flushMicrotasks();});
 expect(state().player).toEqual(before); expect(harness.actions).toEqual([]); expect(refreshTask).not.toHaveBeenCalled();
 expect(ad.disabled).toBe(false); expect(ad.getAttribute('aria-busy')).toBe('false'); expect(ad.textContent).toBe('一键完成');
 expect(document.querySelector('.contract-panel .contract-notice')?.textContent).toBe('广告未完整观看');
 expect(document.querySelector('.gym-reward-wait')).toBeNull();
});

it('opens gym upgrade when requirements become satisfied, keeps its dot after closing, and clears it after upgrading', async () => {
  const initial = templateFixture(); initial.gymLevel = 1; initial.fame = 59;
  initial.alumni = [0, 1].map(index => ({...structuredClone(initial.player!), stats: {...initial.player!.stats, three: initial.player!.stats.three + 1}, id: `former-${index}`, recommendedAt: at,
    rewardCredits: 1, rewardFame: 30, finalValue: '1000'} satisfies GymAlumnus));
  expect(gymUpgrade(initial).canUpgrade).toBe(false);
  await mount(initial); expect(document.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => harness.store!.setState({state: {...state(), fame: 60, revision: state().revision + 1}}));
  await act(async () => {await flushMicrotasks();});
  expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe('球馆经营');
  expect(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('球馆升级');
  expect(document.querySelector('[aria-label="查看球馆"] .gym-upgrade-dot')).toBeTruthy();
  await press('关闭面板');
  await act(async () => {await vi.advanceTimersByTimeAsync(10_000);});
  expect(document.querySelector('[role="dialog"]')).toBeNull(); expect(document.querySelector('.gym-upgrade-dot')).toBeTruthy();
  await press('查看球馆'); await press('免费');
  expect(state().gymLevel).toBe(2); expect(document.querySelector('.gym-upgrade-dot')).toBeNull();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it('returns to the empty court after recommending the last player without opening recruitment', async () => {
  await mount(newGym(at, 24)); await press('推荐球员签约'); await pressContaining('确认推荐');
  expect(state().player).toBeNull(); expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.querySelector('[aria-label="新人招生"]')).toBeNull();
  expect(harness.actions.filter(action => action.type === 'recruit')).toHaveLength(0);
  expect(button('招募球员')).toBeTruthy();
});
