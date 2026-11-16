import { afterEach, beforeEach, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { useState, type ComponentType } from 'react';
import { act } from 'preact/test-utils';
import { cooperationOffers, cooperationStatus, dispatchGym, newGym, recommendation, type GymAction, type GymState } from '../../src/game/gym/engine';
import { equipmentCatalog } from '../../src/game/gym/catalog';
import { templateRules } from '../../src/game/contract/templates';
import { ComicDialog } from '../../src/components/ComicDialog';
import { GymRecommendPanel, GymShopPanel, GymTrainingPanel, type GymPanelProps } from '../../src/components/GymPanels';
import { GymCooperationPanel } from '../../src/components/GymCooperationPanel';

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
  if (root) act(() => root!.unmount());
  function Scene() {
    const [state, setState] = useState(initial);
    latest = state;
    const onAction = (action: GymAction) => {
      actions.push(action);
      const result = dispatchGym(state, state.revision, action, state.updatedAt + 1_000);
      actionError = result.error;
      setState(result.state);
    };
    return <><button type="button" onClick={() => { if (state.player) onAction({ type: 'train', id: state.player.id }); }}>测试投篮</button><ComicDialog title="经营面板" onClose={() => { }}><Panel state={state} onAction={onAction} /></ComicDialog></>;
  }
  root = createRoot(document.getElementById('root')!);
  await act(async () => root!.render(<Scene />));
}

function buttonWithin(scope: ParentNode, text: string) {
  const buttons = [...scope.querySelectorAll<HTMLButtonElement>('button')];
  const result = buttons.find(button => button.getAttribute('aria-label') === text) ?? buttons.find(button => button.textContent?.includes(text));
  expect(result, text).toBeTruthy();
  return result!;
}

async function press(button: HTMLButtonElement) {
  await act(async () => button.click());
}

async function shoot(count: number) {
  for (let index = 0; index < count; index++) await press(buttonWithin(document, '测试投篮'));
  expect(actionError).toBeUndefined();
}

function card(selector: string, name: string) {
  const result = [...document.querySelectorAll<HTMLElement>(selector)].find(element => element.querySelector('h4')?.textContent === name);
  expect(result, name).toBeTruthy();
  return result!;
}

function trainingRules() {
  const result = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(dialog => dialog.querySelector('h2')?.textContent === '训练说明');
  expect(result, '训练说明').toBeTruthy();
  return result!;
}

it('chooses a specialization and completes a real ten-shot course with immediate stamina recovery', async () => {
  await mount(GymTrainingPanel, newGym(at, 11));
  expect(document.body.textContent).toContain('成长偏向');
  expect(document.body.textContent).not.toContain('升级总属性点数不变');
  const before = structuredClone(latest);
  await press(buttonWithin(document, '查看训练说明'));
  const rules = trainingRules();
  expect(rules.textContent).toContain('每10次投篮完成1课');
  expect(rules.textContent).toContain('基础4点+器材额外0点');
  expect(rules.textContent).not.toContain('成长抽取权重');
  await press(buttonWithin(rules, '关闭面板'));
  expect([...document.querySelectorAll('[role="dialog"] h2')].some(heading => heading.textContent === '训练说明')).toBe(false);
  expect(latest).toEqual(before);
  expect(actions).toEqual([]);
  await press(buttonWithin(card('.gm-plan-card', '投射专项'), '选用'));
  expect(latest.player!.training.planId).toBe('shooting');
  await shoot(10);
  expect(latest.player!.training.completedCourses).toBe(1);
  expect(latest.player!.training.shots).toBe(0);
  expect(latest.player!.shots).toBe(10);
  expect(latest.player!.stamina).toBe(14);
  expect(document.querySelector('.gm-plan-summary')?.textContent).toContain('已完成 1 课');
  expect(document.querySelector('.gm-plan-summary')?.textContent).toContain('完课恢复 +4 体力');
});

it.each([[1, 5], [2, 5], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 7]])('applies actual course equipment recovery at gym level %s', async (gymLevel, totalRecovery) => {
  const state = newGym(at, 16);
  state.gymLevel = gymLevel;
  const equipment = equipmentCatalog.filter(item => item.effects.courseRecovery > 0 && item.unlockLevel <= gymLevel).sort((first, second) => second.effects.courseRecovery - first.effects.courseRecovery)[0];
  state.ownedEquipment = [equipment.id];
  state.equippedEquipment = [...state.ownedEquipment];
  state.purchasePrices = { [equipment.id]: equipment.price };
  state.collection = Object.fromEntries(templateRules.slice(0, equipment.requiredTemplates).map(template => [template.id, { firstAt: at, highestRating: 50, highestValue: '320' }]));
  state.player!.stamina = 10;
  state.player!.shots = 9;
  state.player!.training.shots = 9;
  await mount(GymTrainingPanel, state);
  expect(document.querySelector('.gm-plan-summary')?.textContent).toContain(`完课恢复 +${totalRecovery} 体力`);
  const before = structuredClone(latest);
  await press(buttonWithin(document, '查看训练说明'));
  expect(trainingRules().textContent).toContain(`基础4点+器材额外${totalRecovery - 4}点`);
  await press(buttonWithin(trainingRules(), '关闭面板'));
  expect(latest).toEqual(before);
  await shoot(1);
  expect(latest.player!.stamina).toBe(9 + totalRecovery);
  expect(latest.player!.training.completedCourses).toBe(1);
});

it('asks before discarding an unfinished course and keeps completed courses and growth', async () => {
  await mount(GymTrainingPanel, newGym(at, 12));
  await shoot(13);
  const stats = { ...latest.player!.stats };
  await press(buttonWithin(card('.gm-plan-card', '内线防守'), '选用'));
  expect(latest.player!.training.shots).toBe(3);
  expect(actions.filter(action => action.type === 'set-training-plan')).toHaveLength(0);
  const confirmation = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(dialog => dialog.querySelector('h2')?.textContent === '切换训练计划')!;
  expect(confirmation.textContent).toContain('3/10 球');
  await press(buttonWithin(confirmation, '确认切换'));
  expect(latest.player!.training.planId).toBe('interior');
  expect(latest.player!.training.shots).toBe(0);
  expect(latest.player!.training.completedCourses).toBe(1);
  expect(latest.player!.stats).toEqual(stats);
  expect(actionError).toBeUndefined();
});

it('keeps the compact reward at one coupon for a repeated template even in gym one and at the level cap', async () => {
  const state = newGym(at, 17);
  Object.assign(state.player!, { level: 25, peakLevel: 25, templateId: 'bryant', highestTier: 'legend' });
  state.postgameRecommendedTemplates = ['bryant'];
  expect(recommendation(state).credits).toBe(23);
  await mount(GymTrainingPanel, state);
  const payout = document.querySelector('[aria-label="当前推荐收益"]')!;
  expect(payout.querySelector('strong')?.textContent).toBe('+1 券');
  expect(payout.querySelector('small')?.textContent).toBe('重复模板');

  const capped = structuredClone(state);
  capped.player!.level = capped.player!.peakLevel = 99;
  await mount(GymTrainingPanel, capped);
  expect(document.querySelector('.gm-plan-summary')?.textContent).toContain('已满级，训练已结束');
  expect(document.querySelector('.gm-plan-summary')?.textContent).not.toContain('完课恢复');
  expect(document.querySelector('[aria-label="当前推荐收益"] strong')?.textContent).toBe('+1 券');
  expect(actions).toEqual([]);
});

it('starts cooperation at acceptance and pays the completed bonus only through recommendation', async () => {
  const state = newGym(at, 13);
  const template = templateRules.find(entry => entry.tier === 'rotation')!;
  state.player!.height = template.height[0];
  state.player!.templateId = template.id;
  state.player!.highestTier = 'rotation';
  state.player!.shots = 10;
  state.player!.training.completedCourses = 1;
  await mount(GymCooperationPanel, state);
  expect(card('.gm-cooperation', '基础培养合作').textContent).toContain('替补及以上');
  const beforeHelp = structuredClone(latest);
  await press(buttonWithin(document, '查看合作说明'));
  const help = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(dialog => dialog.querySelector('h2')?.textContent === '合作说明')!;
  expect(help.textContent).toContain('按推荐时的最终模板结算');
  expect(help.textContent).toContain('未领取奖励和器材资格');
  await press(buttonWithin(help, '返回合作'));
  expect(latest).toEqual(beforeHelp);
  expect(actions).toEqual([]);
  await press(buttonWithin(card('.gm-cooperation', '基础培养合作'), '接取合作'));
  expect(latest.player!.cooperation?.acceptedShots).toBe(10);
  expect(latest.player!.cooperation?.acceptedCourses).toBe(1);
  expect(cooperationStatus(latest).complete).toBe(false);
  expect(latest.credits).toBe(0);
  await shoot(10);
  expect(cooperationStatus(latest).complete).toBe(true);
  expect(latest.credits).toBe(0);
  const reward = recommendation(latest);
  expect(reward.cooperationCredits).toBe(1);
  expect(reward.cooperationFame).toBe(10);
  const completed = latest;
  await mount(GymRecommendPanel, completed);
  expect(document.body.textContent).toContain('合作奖励 · 已达标');
  await press(buttonWithin(document, '确认推荐'));
  expect(latest.player).toBeNull();
  expect(latest.credits).toBe(reward.credits);
  expect(latest.fame).toBe(reward.fame);
  expect(latest.alumni[0].rewardCredits).toBe(reward.credits);
  expect(actionError).toBeUndefined();
});

it('keeps replacing a cooperation optional until confirmation and starts the new baseline then', async () => {
  const state = newGym(at, 14);
  await mount(GymCooperationPanel, state);
  const specialist = cooperationOffers(state).find(offer => offer.kind === 'specialist')!;
  for (const key of specialist.focusKeys) expect(card('.gm-cooperation', '专项培养合作').textContent).toContain(`${state.player!.stats[key]} / ${specialist.requiredAttribute}`);
  await press(buttonWithin(card('.gm-cooperation', '基础培养合作'), '接取合作'));
  await shoot(3);
  const originalId = latest.player!.cooperation!.id;
  const beforeSwitch = structuredClone(latest);
  await press(buttonWithin(card('.gm-cooperation', '专项培养合作'), '更换为此合作'));
  expect(latest.player!.cooperation!.id).toBe(originalId);
  const confirmation = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(dialog => dialog.querySelector('h2')?.textContent === '更换赞助合作')!;
  expect(confirmation.textContent).toContain('当前合作进度、未领取奖励和器材资格将清空');
  await press(buttonWithin(confirmation, '保留当前合作'));
  expect(latest).toEqual(beforeSwitch);
  await press(buttonWithin(card('.gm-cooperation', '专项培养合作'), '更换为此合作'));
  await press(buttonWithin(document, '确认更换'));
  expect(latest.player!.cooperation!.id).not.toBe(originalId);
  expect(latest.player!.cooperation!.acceptedShots).toBe(3);
  expect(latest.player!.cooperation!.acceptedCourses).toBe(0);
  expect(actionError).toBeUndefined();
});

it('shows brief equipment effects without filters and keeps complete effects in details', async () => {
  const state = newGym(at, 15);
  state.gymLevel = 8;
  state.credits = 100;
  await mount(GymShopPanel, state);
  expect(document.querySelector('.gm-shop-filters')).toBeNull();
  expect(document.querySelectorAll('.gm-shop-page select')).toHaveLength(0);
  expect(document.querySelectorAll('.gm-equipment-summary')).toHaveLength(equipmentCatalog.length);
  const item = equipmentCatalog.find(entry => entry.effects.courseRecovery > 0)!;
  const summary = card('.gm-product', item.name).querySelector('.gm-equipment-summary')!;
  expect(summary.textContent).toBe(`完成课程额外恢复 +${item.effects.courseRecovery}`);
  expect(summary.getAttribute('title')).toBe(item.description);
  await press(buttonWithin(card('.gm-product', item.name), `器材详情：${item.name}`));
  const detail = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(dialog => dialog.querySelector('h2')?.textContent === '器材档案')!;
  expect(detail.querySelector('.equipment-effect')?.textContent).toContain(item.description);
  expect(detail.textContent).toContain('完成课程额外恢复');
  expect(detail.querySelector('.gm-equipment-extra')).toBeNull();
  expect(detail.querySelector('[aria-label="器材培养耗时对比"]')).toBeNull();
  expect(detail.querySelector('.equipment-collected')).toBeNull();
  expect(detail.textContent).not.toMatch(/取得条件|球馆 Lv.8 的器材额外恢复上限|入馆后/);
  expect(detail.textContent).not.toMatch(/推荐券数保持原档位|成功权重|交付|信用|经费/);
});
