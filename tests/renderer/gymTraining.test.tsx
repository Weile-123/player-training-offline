import {afterEach, beforeEach, expect, it} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {useState, type ComponentType} from 'react';
import {act} from 'preact/test-utils';
import {cooperationOffers, cooperationStatus, dispatchGym, newGym, recommendation, type GymAction, type GymState} from '../../src/game/gym/engine';
import {equipmentCatalog} from '../../src/game/gym/catalog';
import {templateRules} from '../../src/game/contract/templates';
import {ComicDialog} from '../../src/components/ComicDialog';
import {GymCooperationPanel, GymRecommendPanel, GymShopPanel, GymTrainingPanel, type GymPanelProps} from '../../src/components/GymPanels';

const at = 1_800_000_000_000;
let root: Root | null = null;
let latest: GymState;
let actions: GymAction[];
let actionError: string | undefined;

beforeEach(() => {actions = []; actionError = undefined;});
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
    return <><button type="button" onClick={() => {if (state.player) onAction({type: 'train', id: state.player.id});}}>测试投篮</button><ComicDialog title="经营面板" onClose={() => {}}><Panel state={state} onAction={onAction}/></ComicDialog></>;
  }
  root = createRoot(document.getElementById('root')!);
  await act(async () => root!.render(<Scene/>));
}

function buttonWithin(scope: ParentNode, text: string) {
  const result = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes(text));
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

it('chooses a specialization and completes a real ten-shot course with immediate stamina recovery', async () => {
  await mount(GymTrainingPanel, newGym(at, 11));
  expect(document.body.textContent).toContain('天赋倾向');
  expect(document.body.textContent).toContain('当前成长倾向');
  await press(buttonWithin(card('.gm-plan-card', '投射专项'), '选择此计划'));
  expect(latest.player!.training.planId).toBe('shooting');
  await shoot(10);
  expect(latest.player!.training.completedCourses).toBe(1);
  expect(latest.player!.training.shots).toBe(0);
  expect(latest.player!.shots).toBe(10);
  expect(latest.player!.stamina).toBe(14);
  expect(document.querySelector('.gm-plan-summary')?.textContent).toContain('已完成 1 课');
  expect(document.querySelector('.gm-plan-summary')?.textContent).toContain('恢复 4 点体力');
  expect(document.querySelector('.gm-plan-summary')?.textContent).toContain('器材额外恢复上限 +1');
});

it.each([[1, 1, 5], [3, 2, 6], [4, 3, 7], [6, 4, 8]])('shows and applies the gym level %s course recovery limit', async (gymLevel, extraCap, totalRecovery) => {
  const state = newGym(at, 16);
  state.gymLevel = gymLevel;
  const equipment = equipmentCatalog.filter(item => item.effects.courseRecovery > 0).sort((first, second) => second.effects.courseRecovery - first.effects.courseRecovery).slice(0, 2);
  state.ownedEquipment = equipment.map(item => item.id);
  state.equippedEquipment = [...state.ownedEquipment];
  state.player!.stamina = 10;
  state.player!.shots = 9;
  state.player!.training.shots = 9;
  await mount(GymTrainingPanel, state);
  expect(document.querySelector('.gm-plan-summary')?.textContent).toContain(`器材额外恢复上限 +${extraCap}`);
  expect(document.querySelector('.gm-plan-summary')?.textContent).toContain(`恢复 ${totalRecovery} 点体力`);
  await shoot(1);
  expect(latest.player!.stamina).toBe(9 + totalRecovery);
  expect(latest.player!.training.completedCourses).toBe(1);
});

it('asks before discarding an unfinished course and keeps completed courses and growth', async () => {
  await mount(GymTrainingPanel, newGym(at, 12));
  await shoot(13);
  const stats = {...latest.player!.stats};
  await press(buttonWithin(card('.gm-plan-card', '内线防守'), '选择此计划'));
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

it('starts cooperation at acceptance and pays the completed bonus only through recommendation', async () => {
  const state = newGym(at, 13);
  const template = templateRules.find(entry => entry.tier === 'rotation')!;
  state.player!.height = template.height[0];
  state.player!.templateId = template.id;
  state.player!.highestTier = 'rotation';
  state.player!.shots = 10;
  state.player!.training.completedCourses = 1;
  await mount(GymCooperationPanel, state);
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
  expect(reward.cooperationFame).toBe(20);
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
  await press(buttonWithin(card('.gm-cooperation', '专项培养合作'), '更换为此合作'));
  expect(latest.player!.cooperation!.id).toBe(originalId);
  await press(buttonWithin(document, '确认更换'));
  expect(latest.player!.cooperation!.id).not.toBe(originalId);
  expect(latest.player!.cooperation!.acceptedShots).toBe(3);
  expect(latest.player!.cooperation!.acceptedCourses).toBe(0);
  expect(actionError).toBeUndefined();
});

it('shows new equipment purposes in real detail dialogs and exposes the expanded effect filters', async () => {
  const state = newGym(at, 15);
  state.gymLevel = 8;
  state.credits = 100;
  await mount(GymShopPanel, state);
  const filters = [...document.querySelectorAll('select option')].map(option => option.textContent);
  expect(filters).toContain('专项成长');
  expect(filters).toContain('课程恢复');
  expect(filters).toContain('合作奖励');
  expect(filters).toContain('身价与品牌');
  const item = equipmentCatalog.find(entry => entry.effects.courseRecovery > 0)!;
  await press(buttonWithin(card('.gm-product', item.name), '器材详情'));
  const detail = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(dialog => dialog.querySelector('h2')?.textContent === '器材档案')!;
  expect(detail.textContent).toContain('每完成一课额外恢复');
  expect(detail.textContent).toContain('每课恢复');
  expect(detail.textContent).toContain('球馆 Lv.8 的器材额外恢复上限 +4');
  expect(detail.textContent).not.toMatch(/推荐券数保持原档位|成功权重|交付|信用|经费/);
});
