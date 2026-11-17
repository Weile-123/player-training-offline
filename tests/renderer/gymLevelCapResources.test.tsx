import {afterEach, expect, it} from 'vitest';
import {useState, type ComponentType} from 'react';
import {act} from 'preact/test-utils';
import {createRoot, type Root} from 'react-dom/client';
import {cooperationOffers, cooperationStatus, dispatchGym, newGym, recommendationPayout, requiredExperience, type GymAction, type GymState} from '../../src/game/gym/engine';
import {statKeys} from '../../src/game/types';
import {GymInventoryPanel, GymShopPanel, type GymPanelProps} from '../../src/components/GymPanels';
import {GymCooperationPanel} from '../../src/components/GymCooperationPanel';

const at = 1_800_000_000_000;
let root: Root | undefined;
let latest: GymState;
let actions: GymAction[];
let applyAction: (action: GymAction) => void;
afterEach(() => {if (root) act(() => root!.unmount()); root = undefined;});

function fixture(level: 98 | 99, complete = false) {
  let state = newGym(at, 7);
  state.gymLevel = 8; state.credits = 100; state.player = null;
  const admitted = dispatchGym(state, state.revision, {type: 'recruit', preference: 'forward'}, at);
  expect(admitted.error).toBeUndefined(); state = admitted.state;
  const player = state.player!;
  player.level = player.peakLevel = level; player.experience = 0;
  player.templateId = 'bryant'; player.highestTier = 'legend';
  for (const key of statKeys) player.stats[key] = 99;
  player.shots = 4_000; player.training.completedCourses = 400;
  player.equipmentTraining.brandShots = player.shots;
  if (complete) {
    player.cooperation = {id: cooperationOffers(state).find(offer => offer.kind === 'legend')!.id,
      playerId: player.id, acceptedShots: 0, acceptedCourses: 0};
    player.equipmentTraining.cooperationCourses = [2, 2];
  }
  return state;
}
async function mount(Panel: ComponentType<GymPanelProps>, initial: GymState) {
  actions = [];
  function Scene() {
    const [state, setState] = useState(initial);
    latest = state;
    applyAction = action => {
      actions.push(action);
      const result = dispatchGym(state, state.revision, action, state.updatedAt + 1_000);
      expect(result.error).toBeUndefined();
      setState(result.state);
    };
    return <Panel state={state} onAction={applyAction}/>;
  }
  root = createRoot(document.getElementById('root')!);
  await act(async () => root!.render(<Scene/>));
}
function button(text: string, scope: ParentNode = document) {
  const result = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.includes(text));
  expect(result, text).toBeTruthy(); return result!;
}
function card(name: string) {
  const result = [...document.querySelectorAll('.gm-cooperation')].find(item => item.querySelector('h4')?.textContent === name);
  expect(result, name).toBeTruthy(); return result!;
}
async function click(item: HTMLButtonElement) {await act(async () => item.click());}

it('disables ordinary cooperation admission at 99 and explains that existing qualifications remain', async () => {
  const state = fixture(99);
  await mount(GymCooperationPanel, state);
  const before = structuredClone(latest);
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('.gm-cooperation button:not(.gm-cooperation-ad)')];
  expect(buttons).toHaveLength(3);
  expect(buttons.every(item => item.disabled)).toBe(true);
  expect(document.querySelector('[aria-label="满级合作限制"]')?.textContent).toContain('已有合作与器材资格保留');
  for (const item of buttons) await click(item);
  expect(actions).toEqual([]);
  expect(latest).toEqual(before);
});

it('preserves a completed level-99 cooperation, its equipment eligibility and actual reward', async () => {
  const state = fixture(99, true), expected = recommendationPayout(state);
  await mount(GymCooperationPanel, state);
  expect(document.body.textContent).toContain('已有合作与器材资格保留，可照常推荐结算');
  const replacements = [...document.querySelectorAll<HTMLButtonElement>('.gm-cooperation:not(.is-active) button:not(.gm-cooperation-ad)')];
  expect(replacements).toHaveLength(2);
  for (const item of replacements) {expect(item.disabled).toBe(true); await click(item);}
  expect(actions).toEqual([]);
  expect(cooperationStatus(latest).complete).toBe(true);
  expect(latest.player!.equipmentTraining.cooperationCourses).toEqual([2, 2]);
  expect(recommendationPayout(latest)).toEqual(expected);
});

it('disables an already-open replacement confirmation when one real shot advances 98 to 99', async () => {
  const state = fixture(98, true);
  state.player!.experience = requiredExperience(98) - 1;
  await mount(GymCooperationPanel, state);
  await click(button('更换为此合作', card('基础培养合作')));
  expect(button('确认更换').disabled).toBe(false);
  const originalId = latest.player!.cooperation!.id;
  await act(async () => applyAction({type: 'train', id: latest.player!.id}));
  expect(latest.player!.level).toBe(99);
  expect(button('确认更换').disabled).toBe(true);
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('不能确认更换');
  const before = structuredClone(latest);
  await click(button('确认更换'));
  expect(actions.map(action => action.type)).toEqual(['train']);
  expect(latest).toEqual(before);
  expect(latest.player!.cooperation!.id).toBe(originalId);
  expect(latest.player!.equipmentTraining.cooperationCourses).toEqual([2, 2]);
  const bypass = dispatchGym(latest, latest.revision, {type: 'accept-cooperation', playerId: latest.player!.id,
    id: cooperationOffers(latest)[0].id}, latest.updatedAt);
  expect(bypass.error).toContain('无法新接或更换合作');
  expect(bypass.state).toBe(latest);
});

it('keeps ordinary admission and confirmed replacement usable at 98', async () => {
  await mount(GymCooperationPanel, fixture(98));
  await click(button('接取合作', card('基础培养合作')));
  const originalId = latest.player!.cooperation!.id;
  await click(button('更换为此合作', card('专项培养合作')));
  expect(latest.player!.cooperation!.id).toBe(originalId);
  expect(button('确认更换').disabled).toBe(false);
  await click(button('确认更换'));
  expect(latest.player!.cooperation!.id).not.toBe(originalId);
  expect(actions.map(action => action.type)).toEqual(['accept-cooperation', 'accept-cooperation']);
});

it('keeps the explicit abandonment confirmation and cancellation available at 99', async () => {
  await mount(GymCooperationPanel, fixture(99, true));
  const originalId = latest.player!.cooperation!.id;
  await click(button('放弃当前合作'));
  expect(button('确认放弃').disabled).toBe(false);
  await click(button('保留当前合作'));
  expect(actions).toEqual([]);
  expect(latest.player!.cooperation!.id).toBe(originalId);
  await click(button('放弃当前合作'));
  await click(button('确认放弃'));
  expect(actions.map(action => action.type)).toEqual(['abandon-cooperation']);
  expect(latest.player!.cooperation).toBeNull();
});

it.each([
  {label: 'inventory 99', Panel: GymInventoryPanel, level: 99, shop: false},
  {label: 'shop 99', Panel: GymShopPanel, level: 99, shop: true},
  {label: 'inventory 98', Panel: GymInventoryPanel, level: 98, shop: false},
  {label: 'shop 98', Panel: GymShopPanel, level: 98, shop: true},
] as const)('keeps old drink inventory hidden and untouched in $label', async ({Panel, level}) => {
  const state = fixture(level);
  state.player!.stamina = 0; state.inventory.drink = 1;
  await mount(Panel, state);
  expect(document.body.textContent).not.toMatch(/消耗品|运动饮料|使用饮料/);
  expect(latest.inventory.drink).toBe(1);
  expect(latest.player!.stamina).toBe(0);
  expect(latest.player!.level).toBe(level);
  expect(latest.credits).toBe(state.credits);
  expect(actions).toEqual([]);
});
