import {afterEach, beforeEach, expect, it} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {useState, type ComponentType} from 'react';
import {act} from 'preact/test-utils';
import {cooperationOffers, newGym, dispatchGym, staminaMax, type GymAction, type GymState} from '../../src/game/gym/engine';
import {equipmentCatalog} from '../../src/game/gym/catalog';
import {templateRules} from '../../src/game/contract/templates';
import {ComicDialog} from '../../src/components/ComicDialog';
import {GymClubPanel, GymCollectionPanel, GymInventoryPanel, GymRecommendPanel, GymShopPanel, type GymPanelProps} from '../../src/components/GymPanels';

const at = 1_800_000_000_000;
let root: Root | null = null;
let latest: GymState;
let actions: GymAction[];
let actionError: string | undefined;

beforeEach(() => { actions = []; actionError = undefined; });
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
});

async function mount(Panel: ComponentType<GymPanelProps>, initial: GymState) {
  let time = initial.updatedAt;
  function Scene() {
    const [state, setState] = useState(initial);
    latest = state;
    const onAction = (action: GymAction) => {
      actions.push(action);
      const result = dispatchGym(state, state.revision, action, ++time);
      actionError = result.error;
      setState(result.state);
    };
    return <ComicDialog title="经营面板" onClose={() => {}}><Panel state={state} onAction={onAction} onClose={() => {}}/></ComicDialog>;
  }
  root = createRoot(document.getElementById('root')!);
  await act(async () => root!.render(<Scene/>));
}

function buttonWithin(scope: ParentNode, text: string) {
  const button = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.includes(text));
  expect(button, text).toBeTruthy();
  return button!;
}

function product(name: string) {
  const card = [...document.querySelectorAll<HTMLElement>('.gm-product')].find(item => item.querySelector('h4')?.textContent === name);
  expect(card, name).toBeTruthy();
  return card!;
}

async function press(button: HTMLButtonElement) {
  await act(async () => button.click());
}

it('buys a permanent item with coupons and requires a separate activation without refilling stamina', async () => {
  const state = newGym(at, 11);
  state.credits = 3;
  state.player!.stamina = 15;
  await mount(GymShopPanel, state);
  await press(buttonWithin(product('护膝绑带'), '购买'));
  expect(latest.credits).toBe(1);
  expect(latest.ownedEquipment).toContain('relic_003');
  expect(latest.collectedEquipment.relic_003).toBeTruthy();
  expect(latest.equippedEquipment).toEqual([]);
  await press(buttonWithin(product('护膝绑带'), '启用器材'));
  expect(latest.equippedEquipment).toEqual(['relic_003']);
  expect(latest.player!.stamina).toBe(15);
  const rules = [...document.querySelectorAll('.gm-product-copy p')].map(item => item.textContent).join(' ');
  expect(rules).not.toMatch(/轻伤|重伤|交付|信用|经费|成功权重/);
  expect(actionError).toBeUndefined();
});

it('blocks a fifth active item until a slot is freed and preserves ownership when switching', async () => {
  const state = newGym(at, 11);
  state.ownedEquipment = ['relic_001', 'relic_002', 'relic_004', 'relic_006', 'relic_003'];
  state.equippedEquipment = state.ownedEquipment.slice(0, 4);
  state.collectedEquipment = Object.fromEntries(state.ownedEquipment.map(id => [id, {firstAt: at}]));
  await mount(GymInventoryPanel, state);
  const blocked = buttonWithin(product('护膝绑带'), '启用器材');
  expect(blocked.disabled).toBe(true);
  await press(blocked);
  expect(actions).toEqual([]);
  await press(buttonWithin(product('伤病保险'), '停用器材'));
  await press(buttonWithin(product('护膝绑带'), '启用器材'));
  expect(latest.equippedEquipment).toHaveLength(4);
  expect(latest.equippedEquipment).toContain('relic_003');
  expect(latest.equippedEquipment).not.toContain('relic_001');
  expect(latest.ownedEquipment).toHaveLength(5);
  expect(latest.collectedEquipment.relic_001).toBeTruthy();
  expect(actionError).toBeUndefined();
});

it('uses one drink only for missing stamina and disables use at the cap', async () => {
  const state = newGym(at, 11);
  state.player!.stamina = 18;
  state.inventory.drink = 1;
  await mount(GymInventoryPanel, state);
  await press(buttonWithin(document, '消耗品'));
  expect(product('运动饮料').textContent).toContain('本次恢复 2 点');
  await press(buttonWithin(product('运动饮料'), '使用饮料'));
  expect(latest.player!.stamina).toBe(20);
  expect(latest.inventory.drink).toBe(0);
  expect(buttonWithin(product('运动饮料'), '使用饮料').disabled).toBe(true);
  expect(latest.player!.level).toBe(0);
  expect(actionError).toBeUndefined();
});

it('offers real automatic speed upgrades while keeping offline training unavailable', async () => {
  const state = newGym(at, 11);
  state.gymLevel = 8;
  state.credits = 100;
  await mount(GymClubPanel, state);
  expect(staminaMax(latest)).toBe(20);
  const future = [...document.querySelectorAll<HTMLElement>('.gm-project.is-future')];
  expect(future).toHaveLength(1);
  for (const card of future) {
    const button = buttonWithin(card, '后续开放');
    expect(button.disabled).toBe(true);
    await press(button);
  }
  expect(actions).toEqual([]);
  const endurance = [...document.querySelectorAll<HTMLElement>('.gm-project')].find(card => card.querySelector('h4')?.textContent === '耐力训练')!;
  await press(buttonWithin(endurance, '升级'));
  expect(latest.projects.endurance).toBe(1);
  expect(latest.credits).toBe(99);
  expect(latest.player!.stamina).toBe(20);
  expect(staminaMax(latest)).toBe(25);
  const automation = [...document.querySelectorAll<HTMLElement>('.gm-project')].find(card => card.querySelector('h4')?.textContent === '自动训练')!;
  expect(automation.textContent).toContain('1.8 秒/球');
  await press(buttonWithin(automation, '升级'));
  expect(latest.projects.automation).toBe(1);
  expect(automation.textContent).toContain('1.8 秒/球');
  expect(latest.projects.offline).toBe(0);
  expect(actionError).toBeUndefined();
});

it.each([false, true])('confirms the displayed recommendation reward and archives the athlete (legend %s)', async legendary => {
  const state = newGym(at, 11);
  if (legendary) {
    const template = templateRules.find(item => item.tier === 'legend')!;
    state.player!.templateId = template.id;
    state.player!.height = template.height[0];
    state.player!.stats = {...template.stats};
    state.player!.level = 18;
    state.player!.peakLevel = 18;
    state.player!.highestTier = 'legend';
  }
  const id = state.player!.id;
  await mount(GymRecommendPanel, state);
  const confirm = buttonWithin(document, '确认推荐');
  expect(confirm.textContent).toContain(legendary ? '+11 券' : '+0 券');
  expect(document.querySelector('.gym-panel')!.textContent).not.toMatch(/交付|经费|信用/);
  await press(confirm);
  expect(latest.player).toBeNull();
  expect(latest.credits).toBe(legendary ? 11 : 0);
  expect(latest.alumni).toHaveLength(1);
  expect(latest.alumni[0].id).toBe(id);
  expect(latest.alumni[0].rewardCredits).toBe(legendary ? 11 : 0);
  expect(actionError).toBeUndefined();
});

it.each([
  {level: 10, tier: 'starter', bonus: 2, total: 4},
  {level: 18, tier: 'star', bonus: 6, total: 9},
  {level: 25, tier: 'superstar', bonus: 12, total: 16},
] as const)('presents and pays the Lv.$level/$tier training milestone without requiring courses', async ({level, tier, bonus, total}) => {
  const state = newGym(at, 17);
  const template = templateRules.find(entry => entry.tier === tier)!;
  Object.assign(state.player!, {level, peakLevel: level, templateId: template.id, height: template.height[0], stats: {...template.stats}});
  await mount(GymRecommendPanel, state);
  const row = [...document.querySelectorAll<HTMLElement>('.gm-reward-breakdown > div')].find(item => item.textContent?.includes('培养加奖'))!;
  expect(row.textContent).toContain(`Lv.${level}`);
  expect(row.textContent).toContain(`+${bonus} 券`);
  expect(row.textContent).not.toContain('课');
  await press(buttonWithin(document, '确认推荐'));
  expect(latest.credits).toBe(total);
  expect(latest.alumni[0].rewardCredits).toBe(total);
  expect(actionError).toBeUndefined();
});

it('displays and pays the maximum combined recommendation of 27 credits', async () => {
  const state = newGym(at, 18);
  state.gymLevel = 5;
  const template = templateRules.find(entry => entry.tier === 'legend')!;
  Object.assign(state.player!, {level: 25, peakLevel: 25, enteredGymLevel: 5, templateId: template.id, height: template.height[0], stats: {...template.stats}, shots: 50});
  state.player!.training.completedCourses = 5;
  const offer = cooperationOffers(state).find(entry => entry.kind === 'legend')!;
  state.player!.cooperation = {id: offer.id, playerId: state.player!.id, acceptedShots: 0, acceptedCourses: 0};
  const equipment = equipmentCatalog.find(item => item.effects.cooperationBonus === 2)!;
  state.ownedEquipment = [equipment.id];
  state.equippedEquipment = [equipment.id];
  await mount(GymRecommendPanel, state);
  const confirm = buttonWithin(document, '确认推荐');
  expect(confirm.textContent).toContain('+27 券');
  await press(confirm);
  expect(latest.credits).toBe(27);
  expect(latest.alumni[0].rewardCredits).toBe(27);
  expect(actionError).toBeUndefined();
});

it('reads new-gym collection records separately from active ownership and opens the two real albums', async () => {
  const state = newGym(at, 11);
  const template = templateRules.find(item => item.tier === 'rotation')!;
  state.collection[template.id] = {firstAt: at, highestRating: 40, highestValue: '320'};
  state.collectedEquipment.relic_003 = {firstAt: at};
  await mount(GymCollectionPanel, state);
  expect(document.querySelector('.gm-album-progress')!.textContent).toContain('1 / 119');
  expect(document.querySelectorAll('.gm-album-card:not(.is-unknown)')).toHaveLength(1);
  await press(buttonWithin(document, '器材图鉴'));
  expect(document.querySelector('.gm-album-progress')!.textContent).toContain('1 / 94');
  const collected = document.querySelector<HTMLButtonElement>('.gm-album-card:not(.is-unknown)')!;
  expect(collected.textContent).toContain('护膝绑带');
  expect(collected.textContent).toContain('已收藏');
  await press(collected);
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);
  expect(document.body.textContent).toContain('体力上限 +2');
  expect(actions).toEqual([]);
});
