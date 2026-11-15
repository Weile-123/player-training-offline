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

it('keeps the first expansion free and explains its permanent extra training place', async () => {
  const action = await mount(eligible(1, 0));
  expect(expansion().textContent).toContain('升至球馆 Lv.2 免费');
  expect(expansion().textContent).toContain('累计声望保留');
  expect(expansion().textContent).toContain('新增 1 个训练位');
  const button = expansion().querySelector('button')!;
  expect(button.textContent).toBe('免费升级球馆');
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
  expect(action).toHaveBeenCalledExactlyOnceWith({type: 'upgrade-gym', targetLevel: 2});
});

it('shows the exact expansion price and cash gap while disabling an unfunded upgrade', async () => {
  const action = await mount(eligible(6, 139));
  expect(expansion().textContent).toContain('本次扩建花费 140 券');
  expect(expansion().textContent).toContain('成功升级后扣除');
  expect(expansion().textContent).toContain('扩建资金还差 1 券');
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
  expect(expansion().textContent).toContain('本次扩建花费 140 券');
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
