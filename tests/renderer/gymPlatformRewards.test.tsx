import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {cooperationOffers, cooperationStatus, dispatchGym, experienceForLevel, gymUpgrade, newGym, playerLevelCap, staminaMax, type GymAction, type GymAlumnus, type GymState} from '../../src/game/gym/engine';
import {challengeDraft, challengeFixture, challengeRewardChoices, challengeSeed, scoreChallenge} from '../../src/game/gym/challenge';
import {challengeCards} from '../../src/game/gym/challengeCatalog';
import {settleOfflineGym} from '../../src/game/gym/offline';
import {offlineExperienceAnimationMs} from '../../src/components/GymOfflineReport';
import {templateRules} from '../../src/game/contract/templates';
import {positionLabels, templateById} from '../../src/game/templates';
import type {GymStore} from '../../src/gymStore';
import type {UseBoundStore, StoreApi} from 'zustand';
import {gymFirstVisitTutorialKey, resetGymFirstVisitTutorials} from '../../src/presentation/gymFeatureTutorialPreference';
import {getGymDebug, toggleGymDebug} from '../../src/platform/gymDebug';

const harness = vi.hoisted(() => ({store: null as UseBoundStore<StoreApi<GymStore>> | null, actions: [] as GymAction[], proofs: [] as (Parameters<GymStore['act']>[1])[], order: [] as string[]}));
vi.mock('../../src/gymStore', async () => {
  const {create} = await import('zustand');
  const {dispatchGym, newGym} = await import('../../src/game/gym/engine');
  const store = create<GymStore>((set, get) => ({
    state: newGym(1_800_000_000_000, 21), hasSave: true, hydrating: false, hydrate: async () => {},
    loadAlumni: async (offset = 0, limit = 20) => ({players: [...get().state.alumni].reverse().slice(offset, offset + limit), total: get().state.alumni.length}),
    actionError: '', saveMessage: '', isSuspended: false, pendingOfflineReport: null,
    start: async () => ({state: get().state, events: []}),
    act: async (action, proof) => {
      harness.actions.push(action);
      harness.proofs.push(proof); harness.order.push(`act:${action.type}`);
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
  resetGymFirstVisitTutorials(); localStorage.setItem(gymFirstVisitTutorialKey, JSON.stringify(['training', 'cooperation']));
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
  harness.actions = []; harness.proofs = []; harness.order = [];
  harness.store!.setState({state: newGym(at, 24), actionError: '', isSuspended: false, pendingOfflineReport: null, authorityMode:undefined,authorityMessage:'',authorityCapabilities:undefined,preparePlatformReward:undefined,debugSessionActive:false,debugForkGym:undefined});
});
afterEach(async () => {
  if (root) act(() => root!.unmount()); root = null;
  for (const key of ['skipAds','skipPosting'] as const) if(getGymDebug()[key])toggleGymDebug(key);
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
  expect(document.querySelector('.template-player-level')).toBeNull();
  expect(shareButton.closest('.template-identity-meta')?.textContent).not.toContain(positionLabels[templateById(before.templateId)!.position]);
  await press('分享·等级+3');
  expect(document.querySelector('.gym-share-dialog h2')?.textContent).toBe('发帖分享');
  expect(document.querySelector('.gym-share-reward')?.textContent).toContain('等级 +3');
  expect(state().player!.level).toBe(10);
  await press('发帖分享');
  expect(postEditor).toHaveBeenCalledTimes(1);
  expect(postEditor).toHaveBeenCalledWith(expect.objectContaining({tagId: '162117', topicId: '871', topicName: 'AI工坊', tagName: '传奇球馆'}));
  expect(state().player!.shareLevelClaimed).toBeUndefined(); expect(state().player!.level).toBe(10);
  expect(button('正在打开发帖…')?.disabled).toBe(true);
  await act(async () => {pending.resolve({code: 200}); await flushMicrotasks();});
  expect(state().player).toMatchObject({id: before.id, level: 13, peakLevel: 13, shareLevelClaimed: true, shots: before.shots, stamina: before.stamina});
  expect(button('分享·等级+3')).toBeUndefined();
  expect(document.querySelector('.gym-share-dialog')).toBeNull();
  const level = document.querySelector('.template-player-level');
  expect(level?.textContent).toBe('Lv.13');
  expect(level?.nextElementSibling?.classList.contains('tier-badge')).toBe(true);
  expect(harness.actions.filter(action => action.type === 'share-player-levels')).toHaveLength(1);
  expect(button('分享·等级+3')).toBeUndefined();
  expect(rewardVideo).not.toHaveBeenCalled();
});

it('keeps the player and share opportunity unchanged when the editor rejects opening', async () => {
  postEditor.mockResolvedValue({code: 403, message: '请登录后重试'});
  const initial = templateFixture(), before = structuredClone(initial.player!);
  await mount(initial); await press('分享·等级+3'); await press('发帖分享');
  expect(document.querySelector('.action-notice.poster-share-notice[role="alert"]')?.textContent).toBe('请登录后重试');
  expect(document.querySelector('.gym-share-dialog .poster-share-notice')).toBeNull();
  expect(state().player).toEqual(before); expect(harness.actions).toEqual([]);
  await press('关闭面板'); expect(button('分享·等级+3')).toBeTruthy();
});

it('hides sharing until a template exists and at the level cap', async () => {
  const initial = newGym(at, 24); await mount(initial);
  expect(button('分享·等级+3')).toBeUndefined();
  expect(document.querySelector('.template-player-level')?.textContent).toBe(`Lv.${initial.player!.level}`);
  const capped = templateFixture(); capped.player!.level = capped.player!.peakLevel = playerLevelCap;
  await act(async () => harness.store!.setState({state: capped}));
  expect(button('分享·等级+3')).toBeUndefined();
  expect(document.querySelector('.template-player-level')?.textContent).toBe(`Lv.${playerLevelCap}`);
  const claimed = templateFixture(); Object.assign(claimed.player!, {level: 8, peakLevel: 8, shareLevelClaimed: true});
  await act(async () => harness.store!.setState({state: claimed}));
  expect(button('分享·等级+3')).toBeUndefined();
  expect(document.querySelector('.template-player-level')?.textContent).toBe('Lv.8');
  expect(document.querySelector('.template-player-level')?.nextElementSibling?.textContent).toBe('替补');
});

it('restores zero stamina by sharing once, then uses only rewarded advertisements for later refills', async () => {
  const initial = newGym(at, 24); initial.player!.stamina = 0;
  await mount(initial);
  expect(document.querySelector('.gym-court-quick-actions [aria-label="分享发帖，体力回满"]')).toBeTruthy();
  expect(button('分享发帖，体力回满')?.textContent).toBe('体力回满');
  await press('分享发帖，体力回满'); await press('发帖分享');
  expect(state().player!.stamina).toBe(staminaMax(state())); expect(state().staminaRewardCount).toBe(1);
  expect(postEditor).toHaveBeenCalledTimes(1); expect(rewardVideo).not.toHaveBeenCalled();
  expect(document.querySelector('.gym-share-dialog')).toBeNull();
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
 expect(document.querySelector('.action-notice.contract-notice[role=alert]')?.textContent).toBe('广告未完整观看');
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

it.each(['timeflow','connecting','error'] as const)('blocks share and ad entry before platform interaction without reward verification (%s)',async authorityMode=>{
 const initial=templateFixture();initial.player!.stamina=0;
 harness.store!.setState({authorityMode,authorityCapabilities:{platformRewards:false,legacyAdoption:false}});
 await mount(initial);
 expect(button('分享奖励暂不可用')?.disabled).toBe(true);
 expect(button('体力奖励暂不可用')?.disabled).toBe(true);
 await press('分享奖励暂不可用');await press('体力奖励暂不可用');
 expect(document.querySelector('.gym-share-dialog')).toBeNull();
 await press('赞助合作');
 expect(document.body.textContent).toContain('广告奖励暂不可用');
 expect([...document.querySelectorAll<HTMLButtonElement>('.gm-cooperation-ad')].every(button=>button.disabled)).toBe(true);
 expect(postEditor).not.toHaveBeenCalled();expect(rewardVideo).not.toHaveBeenCalled();expect(harness.actions).toEqual([]);
});

it.each([['local',false],['timeflow',true]] as const)('preserves rewarded play when the current mode allows it (%s)',async(authorityMode,platformRewards)=>{
 const initial=templateFixture();initial.player!.stamina=0;initial.staminaRewardCount=1;
 harness.store!.setState({authorityMode,authorityCapabilities:{platformRewards,legacyAdoption:false}});
 await mount(initial);await press('看广告，体力回满');
 expect(rewardVideo).toHaveBeenCalledOnce();expect(state().player!.stamina).toBe(staminaMax(state()));
 expect(harness.actions.some(action=>action.type==='restore-stamina-reward')).toBe(true);
});

it('closes a share preview when the account becomes unable to verify platform rewards',async()=>{
 const initial=templateFixture();await mount(initial);await press('分享·等级+3');
 expect(document.querySelector('.gym-share-dialog')).toBeTruthy();
 await act(async()=>harness.store!.setState({authorityMode:'timeflow',authorityCapabilities:{platformRewards:false,legacyAdoption:false}}));
 expect(document.querySelector('.gym-share-dialog')).toBeNull();
 expect(postEditor).not.toHaveBeenCalled();expect(harness.actions).toEqual([]);
});

it('rechecks reward availability after an ad callback before dispatching a reward action',async()=>{
 const pending=deferred<{code:number;data:{rewarded:boolean}}>();rewardVideo.mockReturnValue(pending.promise);
 const initial=templateFixture();initial.player!.stamina=0;initial.staminaRewardCount=1;
 await mount(initial);await press('看广告，体力回满');expect(rewardVideo).toHaveBeenCalledOnce();
 await act(async()=>harness.store!.setState({authorityMode:'error',authorityCapabilities:{platformRewards:false,legacyAdoption:false}}));
 await act(async()=>{pending.resolve({code:200,data:{rewarded:true}});await flushMicrotasks();});
 expect(harness.actions).toEqual([]);expect(state().player!.stamina).toBe(0);
 expect(document.querySelector('.contract-status')?.textContent).toContain('奖励暂不可用');
});

function offlineFixture() {
 const initial = newGym(at - 60_000, 24); initial.gymLevel = 2;
 Object.assign(initial.player!, {level:4,peakLevel:4,autoEnabled:true,stamina:5});
 initial.bench=[{...structuredClone(initial.player!),id:'gym-p2',name:'第二名新秀',stamina:3}]; initial.nextPlayer=3;
 const settled=settleOfflineGym(initial,at);
 for(const player of [settled.state.player!,...settled.state.bench])player.autoEnabled=false;
 expect(settled.state.offlineReward?.report.reportId).toBeTruthy();
 return {initial:settled.state,report:settled.state.offlineReward!.report};
}

it('integrates a local offline reward: waits for native confirmation, credits each athlete once, then animates all original XP to double',async()=>{
 const native=deferred<{code:number;data:{rewarded:boolean}}>();rewardVideo.mockReturnValue(native.promise);
 const {initial,report}=offlineFixture(),before=structuredClone(initial),frames:FrameRequestCallback[]=[];
 vi.spyOn(performance,'now').mockReturnValue(2000);
 vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.push(callback);return frames.length;});
 harness.store!.setState({pendingOfflineReport:report}); await mount(initial);
 expect(document.querySelector('.gm-offline-xp-total b')?.textContent).toBe(`+${report.totalExperience}`);
 await press('领取双倍经验');await press('正在领取…');
 expect(rewardVideo).toHaveBeenCalledOnce();expect(state().offlineReward?.claimed).toBe(false);
 expect(harness.actions).toEqual([]);expect(document.querySelector('.is-double-experience')).toBeNull();
 await act(async()=>{native.resolve({code:200,data:{rewarded:true}});await flushMicrotasks();});await act(flushMicrotasks);
 expect(state().offlineReward?.claimed).toBe(true);expect(harness.actions).toEqual([{type:'double-offline-experience',reportId:report.reportId}]);
 for(const earned of report.players){
  const earlier=[before.player!,...before.bench].find(player=>player.id===earned.id)!,current=[state().player!,...state().bench].find(player=>player.id===earned.id)!;
  expect(experienceForLevel(current.level)+current.experience-experienceForLevel(earlier.level)-earlier.experience).toBe(earned.xpGained);
 }
 expect(document.querySelector('.is-double-experience')).toBeTruthy();
 const advanceFrames=async(timestamp:number)=>{const queued=frames.splice(0);await act(async()=>{queued.forEach(callback=>callback(timestamp));await flushMicrotasks();});};
 await advanceFrames(2000+offlineExperienceAnimationMs/2);
 const intermediate=Number(document.querySelector('.gm-offline-xp-total b')!.textContent!.replace(/[+,]/g,''));
 expect(intermediate).toBeGreaterThan(report.totalExperience);expect(intermediate).toBeLessThan(report.totalExperience*2);
 await advanceFrames(2000+offlineExperienceAnimationMs);
 expect(document.querySelector('.gm-offline-xp-total b')?.textContent).toBe(`+${report.totalExperience*2}`);
 expect([...document.querySelectorAll('.athlete-xp')].map(node=>node.textContent)).toEqual(report.players.map(player=>`经验 +${player.xpGained*2}`));
 const {bonusExperience,...originalReport}=state().offlineReward!.report;
 expect(originalReport).toEqual(report);expect(bonusExperience).toEqual(Object.fromEntries(report.players.map(player=>[player.id,player.xpGained])));expect(button('已领取双倍经验')?.disabled).toBe(true);
});

it('keeps a local offline report and every athlete XP unchanged when the native advertisement is cancelled',async()=>{
 const {initial,report}=offlineFixture();const before=structuredClone(initial);
 rewardVideo.mockResolvedValue({code:200,message:'广告未完整观看',data:{rewarded:false,reason:'NOT_REWARDED'}});
 harness.store!.setState({pendingOfflineReport:report});await mount(initial);await press('领取双倍经验');
 expect(state().offlineReward?.claimed).toBe(false);expect(state().player).toEqual(before.player);expect(state().bench).toEqual(before.bench);
 expect(harness.actions).toEqual([]);expect(document.querySelector('.is-double-experience')).toBeNull();
 expect(document.querySelector('.gm-offline-xp-total b')?.textContent).toBe(`+${report.totalExperience}`);
 expect(button('领取双倍经验')?.disabled).toBe(false);expect(document.querySelector('[role=alert]')?.textContent).toBe('广告未完整观看');
});

const proof={challengeId:'12345678-1234-1234-1234-123456789abc',confirmation:'native-sdk-confirmation' as const};
function enableRemote(prepare:NonNullable<GymStore['preparePlatformReward']>){
 harness.store!.setState({authorityMode:'timeflow',authorityCapabilities:{platformRewards:true,legacyAdoption:false},preparePlatformReward:prepare});
}

it('prepares an account-bound remote challenge before showing an ad and sends its proof only after native completion',async()=>{
 const initial=templateFixture();initial.player!.stamina=0;initial.staminaRewardCount=1;
 const prepare=vi.fn(async()=>{harness.order.push('prepare');return proof;});
 rewardVideo.mockImplementation(async()=>{harness.order.push('native');return{code:200,data:{rewarded:true}};});
 enableRemote(prepare);await mount(initial);await press('看广告，体力回满');
 const action={type:'restore-stamina-reward',playerId:initial.player!.id,method:'ad',expectedCount:1} as const;
 expect(prepare).toHaveBeenCalledExactlyOnceWith(action);expect(harness.order).toEqual(['prepare','native','act:restore-stamina-reward']);
 expect(harness.actions).toEqual([action]);expect(harness.proofs).toEqual([proof]);
});

it('does not show native ads or grant a remote reward if challenge preparation fails',async()=>{
 const initial=templateFixture();initial.player!.stamina=0;initial.staminaRewardCount=1;
 enableRemote(vi.fn(async()=>{throw Error('奖励准备暂不可用');}));await mount(initial);await press('看广告，体力回满');
 expect(rewardVideo).not.toHaveBeenCalled();expect(harness.actions).toEqual([]);expect(state().player!.stamina).toBe(0);
 expect(document.querySelector('.contract-status')?.textContent).toBe('奖励准备暂不可用');
});

it('binds a remote offline double-experience challenge to the displayed original report and sends its native confirmation proof',async()=>{
 const {initial,report}=offlineFixture();
 const prepare=vi.fn(async()=>{harness.order.push('prepare');return proof;});
 rewardVideo.mockImplementation(async()=>{harness.order.push('native');return{code:200,data:{rewarded:true}};});
 enableRemote(prepare);harness.store!.setState({pendingOfflineReport:report});await mount(initial);await press('领取双倍经验');
 const action={type:'double-offline-experience',reportId:report.reportId!} as const;
 expect(prepare).toHaveBeenCalledExactlyOnceWith(action);expect(harness.order).toEqual(['prepare','native','act:double-offline-experience']);
 expect(harness.actions).toEqual([action]);expect(harness.proofs).toEqual([proof]);expect(state().offlineReward?.claimed).toBe(true);
 const {bonusExperience,...originalReport}=state().offlineReward!.report;
 expect(originalReport).toEqual(report);expect(bonusExperience).toEqual(Object.fromEntries(report.players.map(player=>[player.id,player.xpGained])));expect(button('已领取双倍经验')?.disabled).toBe(true);
});

it('keeps a prepared remote challenge unused when native completion is cancelled',async()=>{
 const initial=templateFixture();initial.player!.stamina=0;initial.staminaRewardCount=1;
 const prepare=vi.fn(async()=>proof);enableRemote(prepare);
 rewardVideo.mockResolvedValue({code:200,message:'广告未看完',data:{rewarded:false}});
 await mount(initial);await press('看广告，体力回满');
 expect(prepare).toHaveBeenCalledOnce();expect(rewardVideo).toHaveBeenCalledOnce();expect(harness.actions).toEqual([]);expect(harness.proofs).toEqual([]);
});

it('prepares a remote share challenge before opening the fixed official destination and grants with that proof',async()=>{
 const initial=templateFixture(),prepare=vi.fn(async()=>{harness.order.push('prepare');return proof;});
 postEditor.mockImplementation(async()=>{harness.order.push('editor');return{code:200};});
 enableRemote(prepare);await mount(initial);await press('分享·等级+3');await press('发帖分享');
 const action={type:'share-player-levels',playerId:initial.player!.id} as const;
 expect(prepare).toHaveBeenCalledExactlyOnceWith(action);expect(harness.order).toEqual(['prepare','editor','act:share-player-levels']);
 expect(harness.proofs).toEqual([proof]);expect(state().player!.shareLevelClaimed).toBe(true);expect(document.querySelector('.gym-share-dialog')).toBeNull();
 expect(postEditor).toHaveBeenCalledWith(expect.objectContaining({topicId:'871',tagId:'162117',topicName:'AI工坊',tagName:'传奇球馆'}));
 expect(window.ColorboxAI!.bbsConfig!.get).not.toHaveBeenCalled();
});

it('keeps remote share preparation failures visible without opening an editor or awarding levels',async()=>{
 const initial=templateFixture(),before=structuredClone(initial.player!);
 enableRemote(vi.fn(async()=>{throw Error('分享奖励准备失败');}));await mount(initial);await press('分享·等级+3');await press('发帖分享');
 expect(postEditor).not.toHaveBeenCalled();expect(harness.actions).toEqual([]);expect(harness.proofs).toEqual([]);
 expect(state().player).toEqual(before);expect(document.querySelector('.action-notice.poster-share-notice[role=alert]')?.textContent).toBe('分享奖励准备失败');
});

function applyChallenge(state:GymState,action:GymAction){
 const result=dispatchGym(state,state.revision,action,at);
 expect(result.error).toBeUndefined();
 return result.state;
}

function challengeDraftFixture(seed:number){
 const initial=newGym(at,seed);
 initial.gymLevel=3;
 return applyChallenge(initial,{type:'start-challenge',attempt:0});
}

function challengeLostFixture(){
 for(let seed=1;seed<=100;seed++){
  const draft=challengeDraftFixture(seed),run=draft.challenge!.run,runSeed=challengeSeed(seed,1);
  const starters=challengeDraft(runSeed,[],run.startPoolSize,run.rulesVersion,run.settings).slice(0,3);
  const ready=applyChallenge(draft,{type:'draft-challenge',attempt:1,players:starters});
  if(scoreChallenge(ready.challenge!.run,challengeFixture(runSeed,1,run.rulesVersion),starters).won)continue;
  const assigned=starters.reduce((roster,playerId,lane)=>applyChallenge(roster,{type:'assign-challenge-matchup',attempt:1,stage:1,playerId,lane}),ready);
  return applyChallenge(assigned,{type:'play-challenge',attempt:1,stage:1});
 }
 throw Error('No reproducible challenge loss');
}

const challengeAdLabel='刷新·必定出巨星';
const challengeReviveLabel='分享·复活并获得强力援助';

it('refreshes the challenge draft only after a rewarded video, guards repeat clicks, and guarantees a superstar',async()=>{
 const pending=deferred<{code:number;data:{rewarded:boolean}}>();
 rewardVideo.mockReturnValueOnce(pending.promise);
 await mount(challengeDraftFixture(41));await press('球馆挑战');
 await press(challengeAdLabel);
 expect(button('正在加载广告…')?.disabled).toBe(true);
 await press('正在加载广告…');
 expect(rewardVideo).toHaveBeenCalledTimes(1);
 expect(state().challenge!.run.draftRefreshed).toBeUndefined();
 await act(async()=>{pending.resolve({code:200,data:{rewarded:false}});await flushMicrotasks();});
 expect(button(challengeAdLabel)?.disabled).toBe(false);
 expect(harness.actions).toEqual([]);

 await press(challengeAdLabel);
 expect(harness.actions).toEqual([{type:'refresh-challenge-draft',attempt:1}]);
 expect(state().challenge!.run.draftRefreshed).toBe(true);
 expect(button(challengeAdLabel)).toBeUndefined();
 expect(refreshTask).toHaveBeenCalledTimes(1);
 const run=state().challenge!.run;
 const players=challengeDraft(challengeSeed(state().seed,1),[],run.startPoolSize,run.rulesVersion,run.settings,run.draftRefreshed);
 expect(players).toHaveLength(5);
 expect(challengeCards.get(players[0])?.tier).toBe('superstar');
});

it('keeps the challenge lost if opening the editor fails, then revives it once after the editor acknowledges',async()=>{
 const prepare=vi.fn(async()=>proof); enableRemote(prepare);
 postEditor.mockResolvedValueOnce({code:500,message:'编辑器暂不可用'});
 await mount(challengeLostFixture());await press('球馆挑战');
 await press(challengeReviveLabel);await press('发帖分享');
 expect(state().challenge!.run.phase).toBe('lost');
 expect(harness.actions).toEqual([]);
 expect(document.querySelector('.poster-share-notice[role=alert]')?.textContent).toBe('编辑器暂不可用');
 await press('发帖分享');
 expect(postEditor).toHaveBeenLastCalledWith(expect.objectContaining({topicId:'871',tagId:'162117',topicName:'AI工坊',tagName:'传奇球馆'}));
 expect(prepare).toHaveBeenLastCalledWith({type:'revive-challenge',attempt:1,stage:1});
 expect(harness.actions).toEqual([{type:'revive-challenge',attempt:1,stage:1}]);
 expect(harness.proofs).toEqual([proof]);
 expect(document.querySelector('.gym-share-dialog')).toBeNull();
 const run=state().challenge!.run;
 expect(run).toMatchObject({phase:'reward',rewardCategory:'swap',revival:{stage:1}});
 const [first]=challengeRewardChoices(challengeSeed(state().seed,1),1,run.team,[],run.offerPoolSize!,'swap',run.rulesVersion,run.settings,true);
 expect(first.kind==='swap'&&challengeCards.get(first.id)?.tier).toBe('superstar');
});

it.each(['skipAds','skipPosting'] as const)('uses %s inside a live challenge only after switching to a disposable gym',async flag=>{
 const ads=flag==='skipAds';
 const initial=ads?challengeDraftFixture(41):challengeLostFixture();
 const fork=vi.fn(async()=>{harness.store!.setState({debugSessionActive:true,authorityCapabilities:{platformRewards:false,legacyAdoption:false}});});
 const prepare=vi.fn(async()=>proof);enableRemote(prepare);
 harness.store!.setState({debugForkGym:fork});
 toggleGymDebug(flag);
 expect(getGymDebug()[flag]).toBe(true);
 await mount(initial);await press('球馆挑战');
 await press(ads?challengeAdLabel:challengeReviveLabel);
 expect(fork).toHaveBeenCalledTimes(1);
 expect(harness.store!.getState().debugSessionActive).toBe(true);
 if(ads)await act(async()=>{await vi.advanceTimersByTimeAsync(1_000);await flushMicrotasks();});
 else await press('发帖分享');
 expect(harness.actions).toEqual([ads?{type:'refresh-challenge-draft',attempt:1}:{type:'revive-challenge',attempt:1,stage:1}]);
 expect(harness.proofs).toEqual([undefined]);
 expect(prepare).not.toHaveBeenCalled();
 expect(rewardVideo).not.toHaveBeenCalled();
 expect(postEditor).not.toHaveBeenCalled();
 expect(window.ColorboxAI!.oss!.uploadFile).not.toHaveBeenCalled();
});
