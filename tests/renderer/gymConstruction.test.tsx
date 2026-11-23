import {afterEach, expect, it, vi} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {GymClubPanel} from '../../src/components/GymPanels';
import {dispatchGym, newGym, type GymAlumnus, type GymState} from '../../src/game/gym/engine';
import {nbaTemplates} from '../../src/game/templates';
import {statKeys} from '../../src/game/types';

const at = 1_800_000_000_000;
let root: Root | null = null;
afterEach(() => {if (root) act(() => root!.unmount()); root = null;});

function eligible(gymLevel: number, credits: number): GymState {
  const state = {...newGym(at, 19), gymLevel, credits, fame: 18_000};
  const legend = nbaTemplates.find(template => template.tier === 'legend')!;
  state.collection = Object.fromEntries(nbaTemplates.slice(0, 25).map(template => [template.id,
    {firstAt: at, highestRating: 0, highestValue: '0'}]));
  state.alumni = Array.from({length: 15}, (_, index) => {
    const player = structuredClone(state.player!);
    for (const key of statKeys) player.stats[key]++;
    return {...player, id: `construction-render-alumnus-${index}`, level: 25, peakLevel: 25,
      templateId: legend.id, highestTier: 'legend', recommendedAt: at,
      rewardCredits: 33, rewardFame: 100, finalValue: '5624320'} as GymAlumnus;
  });
  return state;
}
async function mount(state: GymState) {
  const action = vi.fn();
  root = createRoot(document.getElementById('root')!);
  await act(async () => root!.render(<GymClubPanel state={state} onAction={action}/>));
  return action;
}
function expansion() {return document.querySelector('[aria-label="下一球馆升级条件"]')!;}

it('separates expansion and business projects and skips the locked challenge tab', async () => {
  const state = eligible(2, 100), before = structuredClone(state);
  const action = await mount(state);
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role="tablist"][aria-label="球馆经营分类"] [role="tab"]')];
  expect(tabs.map(tab => tab.getAttribute('aria-label'))).toEqual(['球馆升级', '经营项目', '挑战项目']);
  expect(tabs[2].disabled).toBe(true);
  expect(tabs[2].textContent).toContain('球馆 3 级解锁');
  expect(tabs[0].getAttribute('aria-selected')).toBe('true');
  expect(expansion()).toBeTruthy();
  expect(document.querySelectorAll('.gm-project')).toHaveLength(0);
  await act(async () => tabs[1].click());
  expect(tabs[1].getAttribute('aria-selected')).toBe('true');
  expect(document.querySelector('.leaderboard-tabs')?.getAttribute('data-index')).toBe('1');
  expect(expansion()).toBeNull();
  expect(document.querySelectorAll('.gm-project')).toHaveLength(6);
  await act(async () => tabs[2].click());
  expect(tabs[1].getAttribute('aria-selected')).toBe('true');
  await act(async () => tabs[1].dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true})));
  expect(document.querySelector('.leaderboard-tabs')?.getAttribute('data-index')).toBe('0');
  expect(expansion()).toBeTruthy();
  expect(document.querySelectorAll('.gm-project')).toHaveLength(0);
  expect(state).toEqual(before);
  expect(action).not.toHaveBeenCalled();
});

it('unlocks challenge projects at level three and buys the first scouting upgrade for 12 coupons', async () => {
  const state = eligible(3, 12);
  const action = await mount(state);
  const tab = document.querySelector<HTMLButtonElement>('[role="tab"][aria-label="挑战项目"]')!;
  expect(tab.disabled).toBe(false);
  await act(async () => tab.click());
  expect(tab.getAttribute('aria-selected')).toBe('true');
  expect(document.querySelectorAll('[data-challenge-project-id]')).toHaveLength(5);
  expect(document.querySelector('[data-project-id]')).toBeNull();
  const scouting = document.querySelector('[data-challenge-project-id="scouting"]')!;
  expect(scouting.textContent).toContain('Lv.1 / 3');
  expect(scouting.textContent).toContain('首发 10%');
  const buy = scouting.querySelector<HTMLButtonElement>('.gm-project-upgrade')!;
  expect(buy.textContent).toBe('升级12券');
  await act(async () => buy.click());
  expect(action).toHaveBeenCalledExactlyOnceWith({type: 'upgrade-challenge-project', projectId: 'scouting'});
  const result = dispatchGym(state, state.revision, action.mock.calls[0][0], at);
  expect(result.error).toBeUndefined();
  expect(result.state.credits).toBe(0);
  expect(result.state.challengeProjects).toEqual({scouting: 1});
  expect(result.state.projects).toEqual(state.projects);
});

it('keeps the first expansion free and explains its permanent extra training place', async () => {
  const state = eligible(1, 0);
  const action = await mount(state);
  expect(expansion().querySelector('.gm-expansion-unlocks')?.textContent).toContain('下一级新增+1 训练位');
  expect(expansion().textContent).toContain('自动训练');
  expect(expansion().querySelector('footer')?.textContent).not.toContain('尚未');
  const button = expansion().querySelector('button')!;
  expect(button.textContent).toBe('免费');
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
  expect(action).toHaveBeenCalledExactlyOnceWith({type: 'upgrade-gym', targetLevel: 2});
  const result = dispatchGym(state, state.revision, action.mock.calls[0][0], at);
  expect(result.error).toBeUndefined();
  expect(result.state.credits).toBe(0);
  expect(result.state.fame).toBe(state.fame);
});

it('shows the exact expansion price and cash gap while disabling an unfunded upgrade', async () => {
  const action = await mount(eligible(6, 139));
  expect(expansion().textContent).toContain('扩建赞助券139 / 140');
  const budget = expansion().querySelector('[aria-label="扩建赞助券"]')!;
  expect(budget.getAttribute('aria-valuenow')).toBe('139');
  expect(budget.getAttribute('aria-valuemax')).toBe('140');
  expect(expansion().textContent).not.toContain('扩建资金还差');
  const button = expansion().querySelector('button')!;
  expect(button.textContent).toBe('升级 · 140 券');
  expect(button.disabled).toBe(true);
  await act(async () => button.click());
  expect(action).not.toHaveBeenCalled();
  expect(expansion().textContent).not.toContain('晋级免费');
});

it('executes a funded expansion with the displayed coupon charge while retaining fame', async () => {
  const state = eligible(6, 140);
  const action = await mount(state);
  const button = expansion().querySelector('button')!;
  expect(button.textContent).toBe('升级 · 140 券');
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
  expect(action).toHaveBeenCalledExactlyOnceWith({type: 'upgrade-gym', targetLevel: 7});
  const result = dispatchGym(state, state.revision, action.mock.calls[0][0], at);
  expect(result.error).toBeUndefined();
  expect(result.state.gymLevel).toBe(7);
  expect(result.state.credits).toBe(0);
  expect(result.state.fame).toBe(18_000);
});

it('still requires cultivation achievements even when construction is fully funded', async () => {
  const state = eligible(6, 140);
  state.fame = 10_999;
  const action = await mount(state);
  expect(expansion().querySelector('button')?.textContent).toBe('升级 · 140 券');
  expect(expansion().textContent).not.toContain('扩建资金还差');
  expect(expansion().querySelector('button')!.disabled).toBe(true);
  expect(action).not.toHaveBeenCalled();
});

it('does not present another purchase or unpaid historic fees for an existing maximum-level gym', async () => {
  await mount(eligible(8, 0));
  expect(expansion()).toBeNull();
  expect(document.body.textContent).toContain('已达到当前最高馆级');
  expect(document.body.textContent).not.toContain('本次扩建花费');
});
