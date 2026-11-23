import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {act} from 'preact/test-utils';
import type {UseBoundStore, StoreApi} from 'zustand';
import type {GymStore} from '../../src/gymStore';
import {challengePlayerPool, dispatchGym, newGym, staminaMax, type GymAction, type GymState} from '../../src/game/gym/engine';
import {challengeDraft, challengeFixture, challengeSeed, challengeStage, recommendedChallengeDraft, scoreChallenge} from '../../src/game/gym/challenge';
import {challengeCards,challengeEquipment} from '../../src/game/gym/challengeCatalog';
import {equipmentCatalog} from '../../src/game/gym/catalog';
import {readGym, writeGym} from '../../src/game/gym/save';
import {templateRules} from '../../src/game/contract/templates';
import {statKeys, type Stats} from '../../src/game/types';
import {completeGymTutorial} from '../../src/presentation/gymTutorialPreference';
import {resetGymFirstVisitTutorials} from '../../src/presentation/gymFeatureTutorialPreference';

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
  completeGymTutorial();
  resetGymFirstVisitTutorials();
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
  await act(async () => {await harness.store!.getState().hydrate();});
}

it('uses the upright B cover and exposes no new-gym control once a saved gym exists', async () => {
  const saved = newGym(at, 42); saved.gymLevel = 4; saved.credits = 150;
  await mount(saved);
  expect(document.querySelector('.gym-home-b .b-masthead h1')?.textContent).toBe('传奇球馆');
  expect(document.querySelector('.gym-home-background img')?.getAttribute('src')).toContain('background-b-portrait.webp');
  expect(document.querySelector('.b-save')?.textContent).toContain('150');
  expect([...document.querySelectorAll('.gym-home-b button')].map(button => button.getAttribute('aria-label'))).toEqual(['继续经营', '公告', '球星图鉴', '排行榜', '生涯', '设置']);
  expect(document.querySelector('.b-new')).toBeNull();
  // Background cropping must not define a control's layout box or z-order.
  const backdrop=document.querySelector('.gym-home-backdrop')!;
  const foreground=document.querySelector('.gym-home-design')!;
  const foregroundFrame=foreground.closest('.gym-home-fit')!;
  expect(foregroundFrame).toBeTruthy();
  expect(backdrop.parentElement).toBe(foregroundFrame.parentElement);
  expect(foregroundFrame.contains(backdrop)).toBe(false);
  expect(foreground.contains(backdrop)).toBe(false);
  expect([...foreground.children].slice(0,3).map(node=>node.className)).toEqual(['b-masthead','b-lower','b-bottom-line']);
  expect(document.querySelector('.b-actions')?.contains(document.querySelector('.b-command'))).toBe(true);
  expect(document.querySelector('.b-actions')?.contains(document.querySelector('.b-menu'))).toBe(true);
  const gear=document.querySelector('[aria-label="设置"] svg')!;
  expect(gear.querySelector('path')?.getAttribute('fill-rule')).toBe('evenodd');
  expect(gear.querySelector('circle')).toBeNull();
});

it('continues instead of resetting when a stale new-gym click observes a newly available save', async () => {
  await mount();
  const api = harness.store!.getState(), originalStart = api.start, start = vi.fn(originalStart);
  harness.store!.setState({start});
  // Model a save arriving after the button was rendered, before its event runs.
  harness.store!.getState().hasSave = true;
  try {
    await press('开设训练馆');
    expect(start).not.toHaveBeenCalled();
    expect(document.querySelector('.gym-game')).toBeTruthy();
    expect(state().seed).toBe(31);
  } finally {harness.store!.setState({start: originalStart});}
});
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
  await settlePending();
}
async function openChallengeFromHome() {
  await press('继续经营');
  await press('球馆挑战', document.querySelector('main.gym-game')!);
}
async function settlePending() {
  let completed: Promise<unknown> | null = null;
  while (harness.pending && harness.pending !== completed) {
    completed = harness.pending;
    await act(async () => {await completed;});
  }
}
async function advance(milliseconds: number) {
  await act(async () => {await vi.advanceTimersByTimeAsync(milliseconds);});
  const pending = [...frames.values()];
  frames.clear();
  await act(async () => pending.forEach(callback => callback(Date.now())));
  await settlePending();
}
function card(selector: string, heading: string) {
  const result = [...document.querySelectorAll<HTMLElement>(selector)].find(element => element.querySelector('h4')?.textContent === heading);
  expect(result, heading).toBeTruthy();
  return result!;
}

it('opens the challenge from the training court and keeps the run after returning home', async () => {
  const initial = newGym(at, 41);
  initial.gymLevel = 3;
  await mount(initial);
  await openChallengeFromHome();
  const page = () => document.querySelector<HTMLElement>('main.gym-challenge-page')!;
  expect(page().querySelector('h1')?.textContent).toBe('球馆挑战');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.querySelector('main.gym-game')?.hasAttribute('hidden')).toBe(true);
  const rules=page().querySelector('.gc-lobby-rules')!;
  expect([...rules.querySelectorAll('dt')].map(term=>term.textContent)).toEqual(['组队','对战','奖励','进度']);
  expect(rules.querySelector('strong.gc-rules-referral')?.textContent).toContain('每次成功推荐签约，对应球员模板的挑战初始等级 +1');
  await press('组建挑战队', page());
  const opened = state().challenge;
  expect(opened?.run.phase).toBe('draft');
  expect(page().querySelectorAll('.gc-draft-player')).toHaveLength(5);
  await press('返回训练场', page());
  expect(page()).toBeNull();
  expect(document.querySelector('main.gym-game')?.hasAttribute('hidden')).toBe(false);
  await press('保存并返回首页');
  expect(document.querySelector('main.gym-home')).toBeTruthy();
  await openChallengeFromHome();
  expect(state().challenge).toEqual(opened);
  await press('返回训练场', page());
  expect(page()).toBeNull();
  expect(document.querySelector('main.gym-game')?.hasAttribute('hidden')).toBe(false);
});

it('continues a saved V5 matchup reveal and lets a rewarded reserve trade places with a starter', async () => {
  const initial = newGym(at, 41);
  initial.gymLevel = 3;
  const opened=dispatchGym(initial,initial.revision,{type:'start-challenge',attempt:0},at).state;
  const draft=opened.challenge!.run,seed=challengeSeed(initial.seed,draft.attempt);
  draft.rulesVersion=5;
  draft.bench=[];
  delete draft.warehouse;
  delete draft.warehouseEnabled;
  const fixture=challengeFixture(seed,1,draft.rulesVersion);
  const offered=challengeDraft(seed,challengePlayerPool(opened,draft.rulesVersion),draft.startPoolSize,draft.rulesVersion,draft.settings);
  const starters=recommendedChallengeDraft(offered,fixture);
  const ready=dispatchGym(opened,opened.revision,{type:'draft-challenge',attempt:1,players:starters},at).state;
  const optimal=scoreChallenge(ready.challenge!.run,fixture).lanes.map(lane=>lane.player.id);
  const assignments=[optimal[1],optimal[2],optimal[0]];
  const score=scoreChallenge(ready.challenge!.run,fixture,assignments);
  expect(score.won).toBe(true);
  const animationStart=10_000;
  vi.spyOn(performance,'now').mockReturnValue(animationStart);
  await mount(ready);
  await openChallengeFromHome();
  const page=document.querySelector<HTMLElement>('main.gym-challenge-page')!;
  const profiles=page.querySelectorAll('.gc-team .gc-player-card[data-tier]');
  expect(profiles).toHaveLength(3);
  expect(page.querySelectorAll('.gc-paired-rival .tier-portrait-frame')).toHaveLength(3);
  expect(page.querySelector('.gc-paired-rival .tier-badge')).toBeNull();
  expect(page.querySelectorAll('.gc-paired-slot .gc-paired-empty')).toHaveLength(3);
  expect(page.querySelector('.gc-battle-total')).toBeNull();
  expect(page.textContent).not.toMatch(/预计比分|下关我方/);
  const name=challengeCards.get(starters[0])!.name;
  await press(`详情 ${name}`,page);
  let dialog=document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(dialog.querySelector('.tier-portrait-frame')).toBeTruthy();
  expect(dialog.textContent).toContain(name);
  await press('查看装备',dialog);
  dialog=document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(dialog.textContent).toContain('球员装备');
  await press('关闭面板',dialog);

  expect(buttonWithin(page,'开始挑战').disabled).toBe(true);
  for (const [index,id] of assignments.entries()) {
    const slot=page.querySelectorAll<HTMLButtonElement>('.gc-paired-slot')[index];
    await press(slot.getAttribute('aria-label')!,page);
    expect(page.querySelector('.gc-team-zone')?.getAttribute('data-picking')).toBe('true');
    expect(page.querySelectorAll('.gc-player-actions button')).toHaveLength(3);
    const playerName=challengeCards.get(id)!.name;
    await press(`选择 ${playerName}`,page);
    expect(slot.querySelector('strong')?.textContent).toBe(playerName);
    expect(slot.querySelector('.gc-paired-ability b')?.textContent).toBe(String(score.lanes[index].power));
    expect(page.querySelector('.gc-team-zone')?.getAttribute('data-picking')).toBe('false');
  }
  expect(state().challenge!.run.assignments).toEqual(assignments);
  expect(buttonWithin(page,'开始挑战').disabled).toBe(false);
  await press('开始挑战',page);
  expect(state().challenge!.run.phase).toBe('reward');
  const total=()=>[...page.querySelectorAll('.gc-battle-side>b')].map(item=>Number(item.textContent));
  expect(total()).toEqual([0,0]);
  expect(page.querySelectorAll('.gc-matchup .tier-portrait-frame')).toHaveLength(6);
  expect([...page.querySelectorAll('.gc-matchup-player:first-child strong')].map(node=>node.textContent)).toEqual(assignments.map(id=>challengeCards.get(id)!.name));
  expect(page.querySelectorAll('.gc-matchup-dash')).toHaveLength(3);
  expect(buttonWithin(page,'对战中').disabled).toBe(true);
  async function frame(elapsed:number) {
    const pending=[...frames.values()];
    frames.clear();
    await act(async()=>pending.forEach(callback=>callback(animationStart+elapsed)));
  }
  await frame(700);
  expect(total()).toEqual([score.lanes[0].points,score.lanes[0].rival.points]);
  expect(page.querySelectorAll('.gc-matchup-dash')).toHaveLength(2);
  await frame(2000);
  expect(total()).toEqual([score.home,score.away]);
  expect(page.querySelector('.gc-matchup-score .gc-battle-winner')).toBeTruthy();
  await press('选择奖励',page);
  dialog=document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(dialog.querySelectorAll('.gcr-category')).toHaveLength(4);
  await press('选择新球员',dialog);
  dialog=document.querySelector<HTMLElement>('[role="dialog"]')!;
  const recruit=dialog.querySelector<HTMLButtonElement>('.gcr-option')!;
  expect(dialog.querySelectorAll('.gcr-option .tier-portrait-frame')).toHaveLength(3);
  act(()=>recruit.click());
  await press('安排所选球员',dialog);
  await press('确认加入备战席',dialog);
  expect(state().challenge!.run.bench).toHaveLength(1);
  const fresh=state().challenge!.run.bench![0];
  await press('备战席',page);
  dialog=document.querySelector<HTMLElement>('[role="dialog"]')!;
  await press(`${challengeCards.get(fresh.id)!.name}调入首发`,dialog);
  await press(`换下${name}`,dialog);
  await press('确认交换',dialog);
  expect(state().challenge!.run.team[0]).toEqual(fresh);
  expect(state().challenge!.run.bench?.[0].id).toBe(starters[0]);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

function challengeStep(state:GymState,action:GymAction) {
  const result=dispatchGym(state,state.revision,action,at);
  expect(result.error).toBeUndefined();
  return result.state;
}

function currentChallengeFixture(state:GymState) {
  const run=state.challenge!.run;
  return challengeFixture(challengeSeed(state.seed,run.attempt),challengeStage(run),run.rulesVersion);
}

function startNewChallenge(seed:number,strong=false) {
  const initial=newGym(at,seed);
  initial.gymLevel=3;
  if (strong) initial.challengeProjects={conditioning:5,coaching:3,training:4};
  const opened=challengeStep(initial,{type:'start-challenge',attempt:0});
  const draft=opened.challenge!.run;
  const offered=challengeDraft(challengeSeed(seed,draft.attempt),challengePlayerPool(opened,draft.rulesVersion),draft.startPoolSize,draft.rulesVersion,draft.settings);
  return challengeStep(opened,{type:'draft-challenge',attempt:1,players:recommendedChallengeDraft(offered,currentChallengeFixture(opened))});
}

function assignChallenge(state:GymState,ids:readonly string[]) {
  const run=state.challenge!.run;
  return ids.reduce((assigned,playerId,lane)=>challengeStep(assigned,{type:'assign-challenge-matchup',attempt:run.attempt,stage:challengeStage(run),lane,playerId}),state);
}

function sixPlayerChallenge() {
  let current=startNewChallenge(41,true);
  for (let stage=1;stage<=9;stage++) {
    const run=current.challenge!.run;
    const matchup=scoreChallenge(run,currentChallengeFixture(current));
    expect(matchup.won).toBe(true);
    current=assignChallenge(current,matchup.lanes.map(lane=>lane.player.id));
    current=challengeStep(current,{type:'play-challenge',attempt:run.attempt,stage});
    const reward=current.challenge!.run;
    if (reward.phase==='reward') {
      current=challengeStep(current,{
        type:'take-challenge-reward',attempt:run.attempt,stage,offer:0,
        targetId:reward.rewardCategory==='gear'?run.team[0].id:undefined,
      });
    }
  }
  expect(current.challenge!.run.team).toHaveLength(6);
  return current;
}

it('restores an automatic win report until the player confirms the next stage, and still offers scheduled recruits', async () => {
  const ready=startNewChallenge(41);
  const run=ready.challenge!.run;
  const assigned=assignChallenge(ready,scoreChallenge(run,currentChallengeFixture(ready)).lanes.map(lane=>lane.player.id));
  const animationStart=10_000;
  vi.spyOn(performance,'now').mockReturnValue(animationStart);
  await mount(assigned);
  await openChallengeFromHome();
  let page=document.querySelector<HTMLElement>('main.gym-challenge-page')!;
  expect(page.textContent).toContain('点击下方位置选择球员');
  expect(page.textContent).toContain('再过 3 关可招募新球员');
  await press('开始挑战',page);
  expect(challengeStage(state().challenge!.run)).toBe(2);
  expect(page.querySelector('.gc-battle-heading')?.textContent).toBe('第 1 关对战');
  expect(buttonWithin(page,'对战中').disabled).toBe(true);
  expect(page.querySelector('.gc-dock')?.textContent).not.toContain('下一关');
  const nextFrame=[...frames.values()];
  frames.clear();
  await act(async()=>nextFrame.forEach(callback=>callback(animationStart+2000)));
  expect(page.querySelector('.gc-battle-heading')?.textContent).toBe('第 1 关战报');
  expect(page.querySelector('.gc-opponents-heading')).toBeNull();
  expect(buttonWithin(page,'下一关').disabled).toBe(false);
  const battle=page.querySelector('.gc-battle')?.textContent;
  const revision=state().revision;
  await act(async()=>root!.unmount());
  await mount();
  await openChallengeFromHome();
  page=document.querySelector<HTMLElement>('main.gym-challenge-page')!;
  expect(page.querySelector('.gc-battle')?.textContent).toBe(battle);
  await press('下一关',page);
  expect(state().revision).toBe(revision);
  expect(page.querySelector('.gc-opponents-heading small')?.textContent).toBe('第 2 关');
  expect(page.textContent).toContain('再过 2 关可招募新球员');
  expect(document.querySelector('[role="dialog"]')).toBeNull();

  for (const stage of [2,3]) {
    const current=state();
    const matchup=scoreChallenge(current.challenge!.run,currentChallengeFixture(current));
    expect(matchup.won).toBe(true);
    for (const [index,lane] of matchup.lanes.entries()) {
      await press(page.querySelectorAll('.gc-paired-slot')[index].getAttribute('aria-label')!,page);
      await press(`选择 ${challengeCards.get(lane.player.id)!.name}`,page);
    }
    await press('开始挑战',page);
    const pending=[...frames.values()]; frames.clear();
    await act(async()=>pending.forEach(callback=>callback(animationStart+2000)));
    expect(state().challenge!.run.phase).toBe(stage===2?'ready':'reward');
    if (stage===2) {
      expect(page.querySelector('.gc-battle-heading')?.textContent).toBe('第 2 关战报');
      await press('下一关',page);
    }
  }
  await press('选择奖励',page);
  const reward=document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(reward.querySelectorAll('.gcr-option')).toHaveLength(3);
  await act(async()=>reward.querySelector<HTMLButtonElement>('.gcr-option')!.click());
  await press('加入阵容',reward);
  expect(state().challenge!.run.team).toHaveLength(4);
  expect(page.querySelectorAll('.gc-team .gc-player-card')).toHaveLength(4);
  expect(page.querySelector('.gc-bench-link')).toBeNull();
  const newcomer=state().challenge!.run.team[3];
  await press(page.querySelector('.gc-paired-slot')!.getAttribute('aria-label')!,page);
  await press(`选择 ${challengeCards.get(newcomer.id)!.name}`,page);
  expect(state().challenge!.run.assignments?.[0]).toBe(newcomer.id);
});

it('keeps the next-stage confirmation available with reduced motion', async () => {
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}}));
  const ready=startNewChallenge(41);
  const assigned=assignChallenge(ready,scoreChallenge(ready.challenge!.run,currentChallengeFixture(ready)).lanes.map(lane=>lane.player.id));
  await mount(assigned);
  await openChallengeFromHome();
  const page=document.querySelector<HTMLElement>('main.gym-challenge-page')!;
  await press('开始挑战',page);
  expect(page.querySelector('.gc-battle-heading')?.textContent).toBe('第 1 关战报');
  await press('下一关',page);
  expect(page.querySelector('.gc-opponents-heading small')?.textContent).toBe('第 2 关');
});

it('shows all six challenge players with their levels and separate detail and equipment actions', async () => {
  const ready=sixPlayerChallenge();
  await mount(ready);
  await openChallengeFromHome();
  const page=document.querySelector<HTMLElement>('main.gym-challenge-page')!;
  const cards=page.querySelectorAll('.gc-team .gc-player-card');
  expect(cards).toHaveLength(6);
  expect(page.querySelector('.gc-team-scroll')).toBeNull();
  for (const [index,card] of cards.entries()) {
    const player=ready.challenge!.run.team[index];
    expect(card.querySelector('.gc-starter-photo')).toBe(card.firstElementChild);
    const level=card.querySelector('.gc-player-level')!;
    expect(level.previousElementSibling?.getAttribute('data-tier')).toBe(challengeCards.get(player.id)!.tier);
    expect(level.textContent).toBe(`Lv.${player.level}`);
    expect(level.parentElement?.nextElementSibling?.textContent).toBe(`装备 ${player.gear.length}/3`);
    expect([...card.querySelectorAll(':scope > .gc-player-actions button')].map(button=>button.textContent)).toEqual(['详情','装备']);
  }
  expect(buttonWithin(page,'器材仓库').disabled).toBe(false);
  const title=page.querySelector('.gc-team-title')!;
  expect(title.querySelector('h2')?.textContent).toBe('首发阵容');
  expect(page.querySelector('.gym-challenge-banner [aria-label="玩法说明"]')).toBeNull();
  await press('玩法说明',title);
  expect([...document.querySelectorAll('.gc-rules-sheet > div > dt')].map(title=>title.textContent))
    .toEqual(['组队','对战','奖励','进度']);
});

it('confirms before abandoning a run, returns to training and retains the best record', async () => {
  const ready=sixPlayerChallenge();
  await mount(ready);
  await openChallengeFromHome();
  const page=document.querySelector<HTMLElement>('main.gym-challenge-page')!;
  const banner=page.querySelector('.gym-challenge-banner')!;
  const dialog=()=>document.querySelector('[role="dialog"]')!;

  await press('放弃挑战',banner);
  expect(dialog().textContent).toContain('放弃本轮挑战');
  await press('继续挑战',dialog());
  expect(state().challenge).toEqual(ready.challenge);

  await press('放弃挑战',banner);
  await press('确认放弃',dialog());
  expect(document.querySelector('main.gym-challenge-page')).toBeNull();
  expect(document.querySelector('main.gym-game')?.hasAttribute('hidden')).toBe(false);
  const saved=readGym(storage).state!;
  expect(saved.challenge!.run.retired).toBe(true);
  expect(saved.challenge!.record).toEqual(ready.challenge!.record);
  expect(saved.fame).toBe(ready.fame);

  await press('球馆挑战');
  await press('组建挑战队');
  expect(state().challenge!.run).toMatchObject({attempt:2,phase:'draft'});
  expect(state().challenge!.run.retired).toBeUndefined();
});

it('locks the defeat dialog until returning to training and then offers a fresh draft', async () => {
  let lost:GymState|undefined;
  for(let seed=1;seed<=100&&!lost;seed++) {
    const ready=startNewChallenge(seed),run=ready.challenge!.run;
    const order=run.team.map(player=>player.id);
    if (!scoreChallenge(run,currentChallengeFixture(ready),order).won) {
      lost=challengeStep(assignChallenge(ready,order),{type:'play-challenge',attempt:1,stage:1});
    }
  }
  expect(lost?.challenge!.run.phase).toBe('lost');
  await mount(lost);
  await openChallengeFromHome();
  const dialog=document.querySelector<HTMLElement>('.gc-defeat-dialog')!;
  expect(dialog.textContent).toContain('止步第 1 关');
  expect(dialog.querySelectorAll('.gc-defeat-roster li')).toHaveLength(3);
  expect(dialog.querySelector('.sheet-close')).toBeNull();
  await act(async()=>buttonWithin(dialog,'返回球馆').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(document.querySelector('.gc-defeat-dialog')).toBe(dialog);
  await press('返回球馆',dialog);
  expect(state().challenge!.run.retired).toBe(true);
  expect(document.querySelector('main.gym-game')?.hasAttribute('hidden')).toBe(false);
  await press('球馆挑战');
  await press('组建挑战队');
  expect(state().challenge!.run).toMatchObject({attempt:2,phase:'draft'});
});

it('keeps the tenth-gate dialog open between gear assignment and choosing two distinct upgrades', async () => {
  let prepared=startNewChallenge(41,true);
  for (let stage=1;stage<=10;stage++) {
    const run=prepared.challenge!.run;
    const score=scoreChallenge(run,currentChallengeFixture(prepared));
    expect(score.won).toBe(true);
    prepared=challengeStep(assignChallenge(prepared,score.lanes.map(lane=>lane.player.id)),{type:'play-challenge',attempt:1,stage});
    const pending=prepared.challenge!.run;
    if (stage===10) break;
    if (pending.rewardCategory==='swap') prepared=challengeStep(prepared,{type:'take-challenge-reward',attempt:1,stage,offer:0});
    if (pending.rewardCategory==='gear') prepared=challengeStep(prepared,{type:'take-challenge-reward',attempt:1,stage,offer:0,targetId:pending.team[0].id});
  }
  expect(prepared.challenge?.run.rewardCategory).toBe('gear');
  await mount(prepared);
  await openChallengeFromHome();
  await press('选择奖励');
  const reward=()=>document.querySelector<HTMLElement>('.gc-reward-dialog')!;
  await act(async()=>reward().querySelector<HTMLButtonElement>('.gcr-option')!.click());
  await press('分配所选装备',reward());
  await act(async()=>reward().querySelector<HTMLButtonElement>('.gcr-target')!.click());
  await press('确认装备',reward());
  expect(reward().querySelector('h2')?.textContent).toBe('提高等级');
  expect(state().challenge!.run.rewardCategory).toBe('level');
  const before=state().challenge!.run.team;
  const targets=reward().querySelectorAll<HTMLButtonElement>('.gcr-target');
  await act(async()=>targets[0].click());
  expect(buttonWithin(reward(),'确认升级').disabled).toBe(true);
  await act(async()=>targets[1].click());
  expect(buttonWithin(reward(),'确认升级').disabled).toBe(false);
  await press('确认升级',reward());
  expect(document.querySelector('.gc-reward-dialog')).toBeNull();
  const after=state().challenge!.run.team;
  expect(challengeStage(state().challenge!.run)).toBe(11);
  expect(after.slice(0,2).map(player=>player.level)).toEqual(before.slice(0,2).map(player=>player.level+1));
  expect(after[0].gear).toHaveLength(before[0].gear.length+1);
});

it('starts at home, completes a course, chooses a plan and cooperation, recommends, recruits, saves and continues the same gym', async () => {
  await mount();
  await press('设置');
  expect(document.querySelector('.home-settings-dialog')).toBeTruthy();
  expect(document.querySelector('.home-settings')?.textContent).toContain('游戏音效');
  expect(document.querySelector('.settings-cloud')).toBeTruthy();
  expect(document.querySelector('.home-settings')?.textContent).not.toContain('减少动态效果');
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
  expect(document.querySelector('.gym-tutorial-spotlight')?.getAttribute('data-step')).toBe('feature-training-1');
  await press('下一步');
  await press('知道了');
  await press('选用', card('.gm-plan-card', '持球突破'));
  expect(state().player!.training.planId).toBe('finishing');
  await press('赞助合作');
  expect(document.querySelector('.gym-tutorial-spotlight')?.getAttribute('data-step')).toBe('feature-cooperation-1');
  await press('知道了');
  await press('接取合作', card('.gm-cooperation', '基础培养合作'));
  expect(state().player!.cooperation?.acceptedShots).toBe(10);
  expect(state().player!.cooperation?.acceptedCourses).toBe(1);
  await press('推荐球员签约');
  expect(state().player!.templateId).toBeNull();
  await press('确认推荐');
  expect(state().player).toBeNull();
  expect(state().alumni).toHaveLength(0);
  expect(document.querySelector('.gym-empty-court')).toBeNull();
  expect(document.querySelector('.dock-shoot.is-recruiting')).toBeTruthy();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await press('招募球员');
  await press('免费招募下一位');
  const nextId = state().player!.id;
  expect(nextId).not.toBe(firstId);
  expect(state().player!.stamina).toBe(20);
  expect(document.querySelector<HTMLButtonElement>('[aria-label="投篮训练"]')!.disabled).toBe(true);
  await advance(1_000);
  expect(document.querySelector<HTMLButtonElement>('[aria-label="投篮训练"]')!.disabled).toBe(false);
  await press('打开背包');
  await press('保存并返回首页');
  expect(document.querySelector('[aria-label="传奇球馆首页"]')).toBeTruthy();
  expect(readGym(storage).state?.player?.id).toBe(nextId);
  await press('继续经营');
  expect(state().player!.id).toBe(nextId);
  expect(state().alumni).toHaveLength(0);
  await press('打开图鉴');
  expect(document.querySelector('.album-progress')?.textContent).toContain('/ 119');
  await press('器材图鉴');
  expect(document.querySelector('.album-progress')?.textContent).toContain('/ 35');
  await press('关闭面板');
  await press('保存并返回首页');
  await press('生涯');
  expect(document.querySelector('.gm-alumni-list')).toBeNull();
  expect(document.querySelector('[aria-label="球馆经营档案"]')).toBeTruthy();
  expect(document.body.textContent).toContain('最高身价纪录');
  await press('关闭面板');
  await press('排行榜');
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('球员榜');
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('声望榜');
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
  expect(document.querySelector('[role="dialog"] h2')?.textContent).toBe('球馆经营');
  await press('关闭面板');
  await press('器材商店');
  await press('购买', card('.gm-product', capacity.name));
  expect(state().ownedEquipment).toContain(capacity.id);
  expect(state().equippedEquipment).toEqual([capacity.id]);
  expect(staminaMax(state())).toBe(20 + capacity.effects.stamina);
  expect(state().player!.stamina).toBe(20);
  await press('关闭面板');
  await press('打开背包');
  expect(card('.gm-product', capacity.name).textContent).toContain('已装备');
  await press('关闭面板');
  await press('球馆经营');
  await press('经营项目');
  await press('升级', card('.gm-project', '耐力训练'));
  expect(staminaMax(state())).toBe(25 + capacity.effects.stamina);
  expect(state().player!.stamina).toBe(20);
  await press('球馆升级');
  await press('免费');
  expect(state().gymLevel).toBe(2);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await press('打开球员名册');
  await press('免费招募新人');
  expect(state().bench).toHaveLength(1);
  expect(state().bench[0].stamina).toBe(25 + capacity.effects.stamina);
  const switches = [...document.querySelectorAll<HTMLButtonElement>('.gm-roster [role="switch"]')];
  expect(switches).toHaveLength(2);
  await act(async () => switches[1].click());
  await settlePending();
  expect(state().player!.autoEnabled).toBe(false);
  expect(state().bench[0].autoEnabled).toBe(true);
  await advance(2_000);
  expect(state().player!.shots).toBe(0);
  expect(state().bench[0].shots).toBe(1);
  expect(readGym(storage).state?.bench[0].shots).toBe(1);
  await press('关闭面板');
  await press('保存并返回首页');
  expect(document.querySelector('[aria-label="开始新球馆"]')).toBeNull();
  expect(document.querySelector('[aria-label="开设训练馆"]')).toBeNull();
  await press('继续经营');
  expect(state().gymLevel).toBe(2);
  expect(state().ownedEquipment).toContain(capacity.id);
  expect(state().collectedEquipment[capacity.id]).toBeTruthy();
  expect(state().bench).toHaveLength(1);
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
  expect(state().credits).toBe(40 - incoming.price);
  expect(state().ownedEquipment).toContain(incoming.id);
  expect(state().equippedEquipment).not.toContain(incoming.id);
  const choose = async (id: string) => act(async () => {
    document.querySelector<HTMLButtonElement>(`.gm-replacement-option[data-equipment-id="${id}"]`)!.click();
  });
  await choose(outgoing.id);
  await press('确认替换');
  expect(state().credits).toBe(40 - incoming.price);
  expect(state().equippedEquipment).toContain(incoming.id);
  expect(state().equippedEquipment).not.toContain(outgoing.id);
  expect(state().ownedEquipment).toContain(outgoing.id);
  await press('关闭面板');
  await press('打开背包');
  await press('装备', card('.gm-product', outgoing.name));
  await press(`用${outgoing.name}替换${incoming.name}`);
  expect(state().equippedEquipment).toContain(outgoing.id);
  expect(state().equippedEquipment).not.toContain(incoming.id);
  await press('详情', card('.gm-product', incoming.name));
  await press('半价出售', document.querySelector('.equipment-detail')!);
  await press('确认出售');
  const finalCredits = 40 - incoming.price + Math.floor(incoming.price / 2);
  expect(state().credits).toBe(finalCredits);
  expect(state().ownedEquipment).not.toContain(incoming.id);
  expect(state().collectedEquipment[incoming.id]).toBeTruthy();
  expect(readGym(storage).state?.credits).toBe(finalCredits);
  await press('关闭面板');
  await press('打开图鉴');
  await press('器材图鉴');
  const album = [...document.querySelectorAll<HTMLButtonElement>('.equipment-album-card')].find(item => item.textContent?.includes(incoming.name))!;
  expect(album.classList.contains('is-unknown')).toBe(false);
  expect(album.classList.contains('is-unlocked')).toBe(true);
});

it('moves one earned challenge item through the warehouse to another player and persists only the new owner', async () => {
  const initial=sixPlayerChallenge();
  const [source,target]=initial.challenge!.run.team;
  const gear=source.gear[0];
  const itemName=challengeEquipment.get(gear.id)!.name;
  const playerName=(id:string)=>challengeCards.get(id)!.name;
  const dialog=()=>document.querySelector('[role="dialog"]')!;

  await mount(initial);
  await openChallengeFromHome();
  const page=document.querySelector('main.gym-challenge-page')!;
  await press(`查看装备 ${playerName(source.id)}`,page);
  expect(dialog().textContent).toContain(itemName);
  await press(`卸下${itemName}`,dialog());
  expect(state().challenge!.run.team[0].gear).toHaveLength(0);
  expect(readGym(storage).state?.challenge?.run.warehouse).toEqual([gear]);
  await press('关闭面板',dialog());
  await press('器材仓库',page);
  await press(`为${itemName}选择球员`,dialog());
  await press(`${playerName(target.id)}装备此器材`,dialog());
  expect(dialog().textContent).toContain('仓库暂无器材');
  const saved=readGym(storage).state!;
  expect(saved.challenge!.run.team[0].gear).toHaveLength(0);
  expect(saved.challenge!.run.team[1].gear).toEqual([gear]);
  expect(saved.challenge!.run.warehouse??[]).toHaveLength(0);
  expect(saved.ownedEquipment).toEqual(initial.ownedEquipment);
});
