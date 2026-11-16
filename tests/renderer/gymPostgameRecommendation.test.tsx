import {afterEach, expect, it} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {useState} from 'react';
import {act} from 'preact/test-utils';
import {GymCooperationPanel, GymRecommendPanel, TrainingAdvice} from '../../src/components/GymPanels';
import {cooperationOffers, dispatchGym, newGym, recommendation, type GymResult, type GymState} from '../../src/game/gym/engine';
import {trainingGuidance} from '../../src/game/gym/guidance';
import {statKeys, type Stats} from '../../src/game/types';

let root: Root | undefined;
let result: GymResult | undefined;
const at = 1_800_000_000_000;
afterEach(() => {if (root) act(() => root!.unmount()); root = undefined; result = undefined;});
function fixture(gymLevel: number, credits: number, repeated = false) {
  const state = newGym(at, 17); state.gymLevel = gymLevel; state.credits = credits;
  const player = state.player!;
  player.level = player.peakLevel = 25; player.experience = 0;
  player.templateId = 'bryant'; player.highestTier = 'legend';
  player.stats = Object.fromEntries(statKeys.map(key => [key, 95])) as Stats;
  state.postgameRecommendedTemplates = repeated ? ['bryant'] : [];
  return state;
}
async function mount(initial: GymState) {
  function Scene() {
    const [state, setState] = useState(initial);
    return <GymRecommendPanel state={state} onAction={action => {
      result = dispatchGym(state, state.revision, action, at);
      setState(result.state);
    }}/>;
  }
  root = createRoot(document.getElementById('root')!);
  await act(async () => root!.render(<Scene/>));
}
function confirmation() {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('确认推荐'))!;
}
function button(text: string) {
  const match = [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.includes(text));
  expect(match, text).toBeTruthy(); return match!;
}
async function press(item: HTMLButtonElement) {await act(async () => item.click());}

it('quotes the first full payout above500 and explains that confirming consumes the first opportunity', async () => {
  const state = fixture(8, 720);
  const before = structuredClone(state);
  expect(recommendation(state).credits).toBe(23);
  await mount(state);
  expect(document.querySelector('.gm-recommend-player .tier-portrait-frame .album-portrait-surface')).toBeTruthy();
  expect(document.querySelector('.gm-eyebrow .tier-badge[data-tier="legend"]')?.textContent).toBe('传奇');
  expect(confirmation().textContent).toContain('+23 券');
  expect(document.body.textContent?.replace(/\s+/g, '')).toContain('首次推荐，之后同模板每次合计1券');
  expect(document.body.textContent).toContain('培养或合作提高后不补差额');
  expect(document.querySelector('.gm-reward-breakdown')).toBeNull();
  await press(button('查看结算明细'));
  expect(document.querySelectorAll('.gm-reward-breakdown')).toHaveLength(2);
  expect(document.querySelector('.gm-reward-breakdown')?.textContent).toContain('培养加奖');
  await press(button('收起结算明细'));
  expect(document.querySelector('.gm-reward-breakdown')).toBeNull();
  await press(document.querySelector<HTMLButtonElement>('[aria-label="查看推荐说明"]')!);
  const rules = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(dialog => dialog.querySelector('h2')?.textContent === '推荐说明')!;
  expect(rules).toBeTruthy();
  expect(rules.textContent).toContain('升级球馆不重置首次资格');
  expect(rules.textContent?.replace(/\s+/g, '')).toContain('Lv.25');
  expect(rules.textContent?.replace(/\s+/g, '')).toContain('+18');
  await press(rules.querySelector<HTMLButtonElement>('[aria-label="关闭面板"]')!);
  expect(document.querySelector('[aria-label="查看推荐说明"]')).toBeTruthy();
  expect(result).toBeUndefined();
  expect(state).toEqual(before);
  expect(state.postgameRecommendedTemplates).toEqual([]);
  await act(async () => confirmation().click());
  expect(result?.error).toBeUndefined();
  expect(result?.state.credits).toBe(743);
  expect(result?.state.postgameRecommendedTemplates).toEqual(['bryant']);
  expect(result?.state.alumni[0].rewardCredits).toBe(23);
});

it.each([1, 2, 3, 4, 5, 6, 7, 8])('shows only payable repeat components without subtracting first-time rewards at gym level %s', async gymLevel => {
  const state = fixture(gymLevel, 499, true);
  await mount(state);
  expect(document.querySelector('.gm-recommend-rewards')?.textContent).toContain('赞助券合计+1');
  expect(document.querySelector('.gm-reward-breakdown')).toBeNull();
  await press(button('查看结算明细'));
  const creditDetail = document.querySelector('.gm-recommend-credit-detail')!;
  expect(creditDetail.querySelectorAll('.gm-reward-breakdown > div')).toHaveLength(2);
  expect(creditDetail.textContent).toContain('重复模板推荐+1 券');
  expect(creditDetail.textContent).toContain('首次推荐加成不再发放');
  expect(creditDetail.textContent).not.toMatch(/重复模板结算调整|培养加奖|合作奖励|[−-]\d/);
  expect(creditDetail.querySelector('.gm-reward-actual')?.textContent).toBe('实际入账+1 券');
  expect(document.body.textContent?.replace(/\s+/g, '')).toContain('重复模板，本次合计1券，声望照常');
  expect(document.body.textContent).not.toContain('未匹配模板，本次0券');
  expect(confirmation().textContent).toContain('+1 券');
  await act(async () => confirmation().click());
  expect(result?.state.credits).toBe(500);
  expect(result?.state.alumni[0].rewardCredits).toBe(1);
  expect(result?.events.find(event => event.type === 'recommended')).toMatchObject({credits: 1, rawCredits: 23, withheldCredits: 22, repeatTemplate: true});
});

it('does not enforce a balance cap when recommending a repeat template', async () => {
  await mount(fixture(8, 900, true));
  expect(confirmation().disabled).toBe(false);
  expect(confirmation().textContent).toContain('+1 券');
  expect(document.body.textContent).not.toContain('发券线');
  await act(async () => confirmation().click());
  expect(result?.state.credits).toBe(901);
  expect(result?.state.fame).toBeGreaterThan(0);
});

it.each([1, 7])('records a first reward before gym eight and explains that upgrading does not reset it (gym %s)', async gymLevel => {
  await mount(fixture(gymLevel, 900));
  expect(document.body.textContent?.replace(/\s+/g, '')).toContain('首次推荐，之后同模板每次合计1券');
  await press(document.querySelector<HTMLButtonElement>('[aria-label="查看推荐说明"]')!);
  const rules = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(dialog => dialog.querySelector('h2')?.textContent === '推荐说明')!;
  expect(rules.textContent).toContain('升级球馆不重置首次资格');
  await press(rules.querySelector<HTMLButtonElement>('[aria-label="关闭面板"]')!);
  expect(confirmation().textContent).toContain('+23 券');
  await act(async () => confirmation().click());
  expect(result?.state.credits).toBe(923);
  expect(result?.state.postgameRecommendedTemplates).toEqual(['bryant']);
});

it('keeps cooperation coupons out of repeat payouts while retaining fame even at gym one', async () => {
  const state = fixture(1, 100, true), player = state.player!;
  player.shots = 100; player.training.completedCourses = 10;
  player.cooperation = {id: cooperationOffers(state, player)[0].id, playerId: player.id, acceptedShots: 0, acceptedCourses: 0};
  root = createRoot(document.getElementById('root')!);
  await act(async () => root!.render(<GymCooperationPanel state={state} onAction={() => {}}/>));
  expect(document.querySelector('[aria-label="重复模板合作结算"]')?.textContent).toContain('当前模板重复，推荐合计1券');
  expect(document.querySelector('.gm-cooperation.is-active .gm-cooperation-reward')?.textContent).toContain('券不叠加');
  expect(document.querySelector('.gm-cooperation.is-active .gm-cooperation-reward')?.textContent).toContain('+10 声望');
  expect(document.querySelector('[role="status"]')?.textContent).not.toContain('推荐时额外获得');
});

it('does not promise higher coupon bonuses or cooperation payouts for a repeated template', async () => {
  const state = fixture(8, 100, true); state.player!.level = state.player!.peakLevel = 10;
  const guidance = trainingGuidance(state)!;
  expect(guidance.nextBonus).toBeNull();
  expect(guidance.remainingValue.join('')).not.toContain('下一培养奖金还可增加');
  root = createRoot(document.getElementById('root')!);
  await act(async () => root!.render(<TrainingAdvice state={state}/>));
  expect(document.body.textContent).toContain('重复模板 · 推荐合计 1 券');
  expect(document.body.textContent).not.toContain('额外奖金再增加');
  state.player!.level = state.player!.peakLevel = 99;
  expect(trainingGuidance(state)!.suggestion).toContain('训练已结束');
  expect(trainingGuidance(state)!.suggestion).not.toContain('继续培养可提高');
});

it('does not tell a max-level repeat trainee to finish an impossible cooperation', async () => {
  const state = fixture(8, 100, true), player = state.player!;
  player.level = player.peakLevel = 99;
  player.cooperation = {id: cooperationOffers(state, player)[0].id, playerId: player.id,
    acceptedShots: player.shots, acceptedCourses: player.training.completedCourses};
  const guidance = trainingGuidance(state)!;
  expect(guidance.suggestion).toContain('训练已结束');
  expect(guidance.remainingValue.join('')).toContain('已无法继续训练补足条件');
  expect(guidance.remainingValue.join('')).not.toContain('完成当前合作仍可获得');
  root = createRoot(document.getElementById('root')!);
  await act(async () => root!.render(<GymCooperationPanel state={state} onAction={() => {}}/>));
  expect(document.querySelector('[role="status"]')?.textContent).toContain('训练已结束');
  expect(document.querySelector('[role="status"]')?.textContent).not.toContain('继续培养即可推进');
});
