import {afterEach, expect, it, vi} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {newGym} from '../../src/game/gym/engine';
import {templateRules} from '../../src/game/contract/templates';
import {GymClubPanel, GymCollectionPanel, GymRecommendPanel} from '../../src/components/GymPanels';
import {GymPlayerDetails} from '../../src/components/GymPlayerDetails';
import {ComicDialog} from '../../src/components/ComicDialog';

let root: Root | null = null;
afterEach(() => {if (root) act(() => root!.unmount()); root = null;});

async function mount(content: Parameters<Root['render']>[0]) {
  root = createRoot(document.getElementById('root')!);
  await act(async () => root!.render(content));
}

it('keeps club rules and forecasts out of the main purchase flow until requested', async () => {
  const state = newGym(1_800_000_000_000, 9), action = vi.fn(), before = structuredClone(state);
  await mount(<GymClubPanel state={state} onAction={action}/>);
  expect(document.querySelectorAll('.gm-project')).toHaveLength(0);
  const projects = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(tab => tab.textContent === '经营项目')!;
  await act(async () => projects.click());
  expect(document.querySelectorAll('.gm-project')).toHaveLength(6);
  expect(document.querySelector('[aria-label="离线升级收益预估"]')).toBeNull();
  expect(document.querySelector('[aria-label="项目培养耗时对比"]')).toBeNull();
  expect(document.body.textContent).not.toContain('每级使下一名新人出生六维各增加');
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="查看球馆说明"]')!.click());
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('球馆2级免费解锁在线自动与离线训练');
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="关闭面板"]')!.click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(action).not.toHaveBeenCalled();
  expect(state).toEqual(before);
});

it('shows the real selected player with six bounded ability meters and keeps the training entry working', async () => {
  const state = newGym(1_800_000_000_000, 11), training = vi.fn();
  state.player!.level = 7; state.player!.shots = 28; state.player!.training.completedCourses = 2;
  await mount(<GymPlayerDetails player={state.player!} onTraining={training}/>);
  expect(document.querySelector('.gm-profile-identity')?.textContent).toContain('待发掘球员');
  expect(document.querySelector('.gm-profile-identity')?.textContent).not.toContain(state.player!.name);
  expect(document.querySelector('.gm-profile-record')?.textContent).toContain('Lv.7');
  expect(document.querySelectorAll('[role="meter"]')).toHaveLength(6);
  expect([...document.querySelectorAll('[role="meter"]')].every(meter => meter.getAttribute('aria-valuemax') === '99')).toBe(true);
  expect(document.querySelector('.gm-metrics')).toBeNull();
  await act(async () => document.querySelector<HTMLButtonElement>('.gm-profile-training')!.click());
  expect(training).toHaveBeenCalledOnce();
});

it('restores original star album silhouettes and details without exposing undiscovered templates', async () => {
  const state = newGym(1_800_000_000_000, 11), template = templateRules[0], action = vi.fn();
  state.collection[template.id] = {firstAt: state.updatedAt, highestRating: 50, highestValue: '320'};
  await mount(<ComicDialog title="收藏图鉴" variant="album" onClose={() => {}}><GymCollectionPanel state={state} onAction={action}/></ComicDialog>);
  expect(document.querySelectorAll('.album-card')).toHaveLength(119);
  expect(document.querySelectorAll('.album-card.discovered')).toHaveLength(1);
  expect(document.querySelector('.collection-locked .album-unknown')).toBeTruthy();
  expect(document.querySelector<HTMLButtonElement>('.collection-locked')?.disabled).toBe(true);
  await act(async () => document.querySelector<HTMLButtonElement>('.album-card.discovered')!.click());
  expect(document.querySelector('.album-detail .album-hero')).toBeTruthy();
  expect(document.querySelector('.album-detail .album-matching')).toBeTruthy();
  expect(document.querySelectorAll('.album-detail [role="meter"]')).toHaveLength(6);
  expect(action).not.toHaveBeenCalled();
});

it('distinguishes leaving without a template from an actual alumni record in recommendation copy', async () => {
  const state = newGym(1_800_000_000_000, 11);
  await mount(<GymRecommendPanel state={state} onAction={() => {}}/>);
  expect(document.querySelector('.gm-sheet-footer')?.textContent).toContain('不进入校友档案');
  expect(document.querySelector('.gm-sheet-footer')?.textContent).not.toContain('离馆入档');
});
