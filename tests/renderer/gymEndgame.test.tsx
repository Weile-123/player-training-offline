import {afterEach, expect, it, vi} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {useState} from 'react';
import {act} from 'preact/test-utils';
import {dispatchGym, newGym, type GymAction, type GymAlumnus, type GymState} from '../../src/game/gym/engine';
import {GymRecruitmentControls} from '../../src/components/GymRecruitmentControls';
import {GymAlumniPanel, type GymPanelProps} from '../../src/components/GymPanels';

const at = 1_800_000_000_000;
let root: Root | undefined;
let latest: GymState;
let actions: GymAction[];
let replace: (state: GymState) => void;
afterEach(() => {if (root) act(() => root!.unmount()); root = undefined;});

async function mount(initial: GymState) {
  actions = [];
  function Scene() {
    const [state, setState] = useState(initial);
    latest = state; replace = setState;
    const onAction = (action: GymAction) => {
      actions.push(action);
      const result = dispatchGym(state, state.revision, action, state.updatedAt + 1);
      expect(result.error).toBeUndefined();
      setState(result.state);
    };
    return <div className="gym-panel"><GymRecruitmentControls state={state} onAction={onAction}/></div>;
  }
  root = createRoot(document.getElementById('root')!);
  await act(async () => root!.render(<Scene/>));
}
function button(text: string) {
  const result = [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.includes(text));
  expect(result, text).toBeTruthy(); return result!;
}
async function click(text: string) {await act(async () => button(text).click()); await act(async () => {await Promise.resolve();});}
async function choose(label: string, value: string) {
  await act(async () => {
    const field = document.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;
    field.value = value; field.dispatchEvent(new Event('change', {bubbles: true}));
  });
}
function applicant(gymLevel = 6, credits = 8) {
  const state = newGym(at, 17); state.gymLevel = gymLevel; state.credits = credits; state.player = null;
  state.projects.recruitment = Math.min(2, Math.max(0, gymLevel - 2));
  return state;
}

it('quotes selected admission, cancels without generating a rookie, and confirms one paid transaction', async () => {
  const state = applicant(8, 8);
  state.collectionGoalId = 'hakeem';
  await mount(state);
  const before = JSON.stringify(latest);
  expect(document.querySelector<HTMLSelectElement>('[aria-label="名册新人身高偏好"]')?.value).toBe('any');
  expect(document.body.textContent).not.toContain('收藏目标');
  await click('精选招生');
  expect(document.querySelector<HTMLSelectElement>('[aria-label="精选招生方向"]')?.value).toBe('shooting');
  await choose('精选招生方向', 'interior');
  await choose('名册新人身高偏好', 'center');
  await click('精选招募');
  expect(document.body.textContent).toContain('身高分组：内线型 · 206–218 cm');
  expect(document.body.textContent).toContain('支付后 0 券');
  expect(document.body.textContent).toContain('不保证传奇或指定球星');
  await click('取消招生');
  expect(actions).toEqual([]); expect(JSON.stringify(latest)).toBe(before);
  await click('精选招募');
  const confirm = button('确认支付 8 券并招募');
  await act(async () => {confirm.click(); confirm.click();});
  expect(actions).toEqual([{type: 'recruit', mode: 'selected', preference: 'center', direction: 'interior', expectedNextPlayer: state.nextPlayer}]);
  expect(latest.credits).toBe(0);
  expect(latest.player!.entryStats.inside).toBeGreaterThanOrEqual(48);
  expect(latest.player!.entryStats.defense).toBeGreaterThanOrEqual(48);
  expect(latest.player!.level).toBe(0);
  expect(latest.player!.height).toBeGreaterThanOrEqual(206);
  expect(latest.player!.height).toBeLessThanOrEqual(218);
});

it('keeps free admission usable while selected admission is locked or unaffordable', async () => {
  await mount(applicant(5, 0));
  expect(button('精选招生').disabled).toBe(true);
  expect(button('免费招募新人').disabled).toBe(false);
  await click('免费招募新人');
  expect(latest.credits).toBe(0); expect(latest.player).not.toBeNull();
  expect(actions[0]).toMatchObject({type: 'recruit', expectedNextPlayer: 2});
  await act(async () => replace(applicant(6, 7)));
  await click('精选招生');
  expect(button('精选招募').disabled).toBe(true);
  expect(document.body.textContent).toContain('还差 1 券');
});

it('refuses a confirmation after the admission sequence changed in another page', async () => {
  const state = applicant(8, 100);
  await mount(state);
  await click('精选招生'); await click('精选招募');
  await act(async () => replace({...state, nextPlayer: state.nextPlayer + 1}));
  expect(button('确认支付 8 券并招募').disabled).toBe(true);
  expect(document.body.textContent).toContain('球员名册已变化');
  await click('确认支付 8 券并招募');
  expect(actions).toEqual([]); expect(latest.credits).toBe(100);
});

it.each([1, 8])('ignores a saved template goal for free admission at gym level %s', async gymLevel => {
  const state = applicant(gymLevel, 0); state.collectionGoalId = 'hakeem';
  await mount(state);
  expect(document.body.textContent).not.toContain('收藏目标');
  if (gymLevel >= 2) expect(document.querySelector<HTMLSelectElement>('[aria-label="名册新人身高偏好"]')?.value).toBe('any');
  await click('免费招募新人');
  expect(actions[0]).toMatchObject({type: 'recruit', preference: 'any'});
  expect(latest.player).not.toBeNull();
});

it('reads alumni in fixed pages and exposes a retry when archive loading fails', async () => {
  const state = newGym(at, 7);
  const row = {...state.player!, id: 'archived', recommendedAt: at, rewardCredits: 0, rewardFame: 0, finalValue: '320'} as GymAlumnus;
  state.alumniArchive = {id: 'history', count: 45, effectiveCount: 0, legendCount: 0, bestTier: 0};
  const loadAlumni = vi.fn<NonNullable<GymPanelProps['loadAlumni']>>()
    .mockRejectedValueOnce(new Error('unavailable'))
    .mockResolvedValue({players: [row], total: 45});
  root = createRoot(document.getElementById('root')!);
  await act(async () => root!.render(<GymAlumniPanel state={state} onAction={() => {}} loadAlumni={loadAlumni}/>));
  await act(async () => {await Promise.resolve();});
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('原记录已保留');
  await click('重新读取档案');
  expect(loadAlumni).toHaveBeenLastCalledWith(0, 20);
  expect(document.querySelectorAll('.gm-alumnus')).toHaveLength(1);
  await click('下一页');
  expect(loadAlumni).toHaveBeenLastCalledWith(20, 20);
  await click('上一页');
  expect(loadAlumni).toHaveBeenLastCalledWith(0, 20);
});
