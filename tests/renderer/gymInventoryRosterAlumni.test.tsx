import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {useState, type ComponentType} from 'react';
import {act} from 'preact/test-utils';
import {GymAlumniPanel, GymInventoryPanel, GymRosterPanel, type GymPanelProps} from '../../src/components/GymPanels';
import {ComicDialog} from '../../src/components/ComicDialog';
import {equipmentCatalog} from '../../src/game/gym/catalog';
import {dispatchGym, newGym, trainingPlans, type GymAction, type GymAlumnus, type GymState} from '../../src/game/gym/engine';
import {templateRules} from '../../src/game/contract/templates';

const at = 1_800_000_000_000;
let root: Root | null = null;
let latest: GymState;
let actions: GymAction[];
let error: string | undefined;
beforeEach(() => {actions = []; error = undefined; Object.defineProperty(document, 'fonts', {configurable: true, value: {ready: Promise.resolve()}});});
afterEach(() => {if (root) act(() => root!.unmount()); root = null;});
const equipment = (family: string, grade = 1) => equipmentCatalog.find(item => item.family === family && item.grade === grade)!;
const button = (scope: ParentNode, label: string) => {
  const found = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === label || item.getAttribute('aria-label') === label);
  expect(found, label).toBeTruthy(); return found!;
};
const card = (id: string) => document.querySelector<HTMLElement>(`.gm-warehouse-product[data-equipment-id="${id}"]`)!;
const slot = (id: string) => document.querySelector<HTMLButtonElement>(`.gm-slot[data-equipment-id="${id}"]`)!;
const press = async (item: HTMLButtonElement) => {await act(async () => item.click());};
async function mount(Panel: ComponentType<GymPanelProps>, state: GymState) {
  let time = at;
  function Scene() {
    const [current, setCurrent] = useState(state);
    latest = current;
    return <ComicDialog title="测试面板" onClose={() => {}}><Panel state={current} tutorialEnabled={false} onAction={action => {
      actions.push(action);
      const result = dispatchGym(current, current.revision, action, ++time);
      error = result.error;
      setCurrent(result.state);
    }}/></ComicDialog>;
  }
  root = createRoot(document.getElementById('root')!);
  await act(async () => root!.render(<Scene/>));
}

it('selects a left equipment slot, locks the other slots, and replaces it from the warehouse without charging', async () => {
  const state = newGym(at, 11);
  const installed = [...new Map(equipmentCatalog.filter(item => item.grade === 1).map(item => [item.family, item])).values()].slice(0, 4);
  const incoming = equipmentCatalog.find(item => !installed.some(current => current.family === item.family))!;
  state.equippedEquipment = installed.map(item => item.id);
  state.ownedEquipment = [...state.equippedEquipment, incoming.id];
  state.credits = 43;
  await mount(GymInventoryPanel, state);
  await press(slot(installed[1].id));
  expect(slot(installed[1].id).getAttribute('aria-pressed')).toBe('true');
  for (const item of installed.filter(item => item.id !== installed[1].id)) expect(slot(item.id).disabled).toBe(true);
  const replace = button(card(incoming.id), '替换');
  expect(replace.disabled).toBe(false);
  await act(async () => {replace.click(); replace.click();});
  expect(actions).toEqual([{type: 'equip', id: incoming.id, replaceId: installed[1].id}]);
  expect(error).toBeUndefined();
  expect(latest.equippedEquipment).not.toContain(installed[1].id);
  expect(latest.equippedEquipment).toContain(incoming.id);
  expect(latest.ownedEquipment).toContain(installed[1].id);
  expect(latest.credits).toBe(43);
  expect(document.querySelector('.is-selected-slot')).toBeNull();
});

it('keeps same-family rules when replacing from the left and allows cancellation without extra backpack tabs', async () => {
  const state = newGym(at, 12);
  const basic = equipmentCatalog.find(item => item.effects.stamina > 0 && item.grade === 1)!;
  const advanced = equipment(basic.family, 2);
  const other = equipmentCatalog.find(item => item.family !== basic.family && item.grade === 1)!;
  state.equippedEquipment = [basic.id, other.id];
  state.ownedEquipment = [basic.id, other.id, advanced.id];
  await mount(GymInventoryPanel, state);
  await press(slot(other.id));
  expect(button(card(advanced.id), '替换').disabled).toBe(true);
  await press(button(card(advanced.id), '替换'));
  expect(actions).toEqual([]);
  await press(button(document, '取消替换'));
  expect(slot(basic.id).disabled).toBe(false);
  expect(button(card(advanced.id), '装备').disabled).toBe(false);
  await press(slot(basic.id));
  expect(document.querySelector('[role="tablist"][aria-label="背包分类"]')).toBeNull();
  await press(button(document, '取消替换'));
  expect(document.querySelector('.is-selected-slot')).toBeNull();
  await press(slot(basic.id));
  await press(button(card(advanced.id), '替换'));
  expect(error).toBeUndefined();
  expect(latest.equippedEquipment).toEqual([other.id, advanced.id]);
});

it('opens plan and cooperation tabs for a bench player without selecting them for main-court training', async () => {
  const state = newGym(at, 13);
  state.gymLevel = 3;
  const mainId = state.player!.id;
  const bench = {...structuredClone(state.player!), id: 'bench-player', training: {...state.player!.training, shots: 4}};
  state.bench = [bench];
  await mount(GymRosterPanel, state);
  const row = document.querySelector<HTMLElement>('[data-player-id="bench-player"]')!;
  const controls = [...row.querySelectorAll<HTMLButtonElement>('.contract-roster-actions > button')];
  expect(controls.map(item => item.textContent)).toEqual(['选择训练', '训练计划', '开启自动']);
  await press(controls[1]);
  expect(actions).toEqual([]);
  const page = document.querySelector<HTMLElement>('.gm-roster-planning-dialog')!;
  expect(page.querySelector('[role="tablist"]')?.getAttribute('data-index')).toBe('0');
  const nextPlan = trainingPlans.find(plan => plan.id !== bench.training.planId)!;
  await press(button(page, `选择${nextPlan.name}`));
  expect(actions).toEqual([]);
  await press(button(document, '确认切换'));
  expect(actions.at(-1)).toEqual({type: 'set-training-plan', id: nextPlan.id, playerId: bench.id, scope: 'roster'});
  expect(latest.player!.id).toBe(mainId);
  expect(latest.player!.training.planId).toBe(state.player!.training.planId);
  expect(latest.bench[0].training).toMatchObject({planId: nextPlan.id, shots: 0});
  expect(error).toBeUndefined();
  expect(document.querySelector('.gm-roster-planning-dialog')).toBeTruthy();
  await press(button(page, '赞助合作'));
  expect(page.querySelector('[role="tablist"]')?.getAttribute('data-index')).toBe('1');
  await press([...page.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === '接取合作')!);
  expect(actions.at(-1)).toMatchObject({type: 'accept-cooperation', playerId: bench.id, scope: 'roster'});
  expect(latest.bench[0].cooperation?.playerId).toBe(bench.id);
  expect(latest.player!.cooperation).toBeNull();
  expect(latest.player!.id).toBe(mainId);
  await press(button(page, '放弃当前合作'));
  await press(button(document, '确认放弃'));
  expect(actions.at(-1)).toEqual({type: 'abandon-cooperation', playerId: bench.id, scope: 'roster'});
  expect(latest.bench[0].cooperation).toBeNull();
  expect(error).toBeUndefined();
});

it('does not bypass the original current-player confirmation guard for non-roster actions', () => {
  const state = newGym(at, 14);
  state.gymLevel = 2;
  state.bench = [{...structuredClone(state.player!), id: 'bench-player'}];
  const result = dispatchGym(state, state.revision, {type: 'set-training-plan', id: 'shooting', playerId: 'bench-player'}, at + 1);
  expect(result.error).toContain('当前球员已变化');
  expect(result.state).toEqual(state);
});

it('groups the same template across all archive pages and opens its highest-value representative record', async () => {
  const state = newGym(at, 15);
  const [first, second] = templateRules.filter(item => item.tier === 'starter');
  const records: GymAlumnus[] = Array.from({length: 122}, (_, index) => ({...structuredClone(state.player!), id: `alumnus-${index}`, templateId: index === 121 ? second.id : first.id, recommendedAt: at + index, rewardCredits: index, rewardFame: index, finalValue: '320'})).reverse();
  state.alumni = records.slice(0, 10);
  state.alumniArchive = {id: 'older', count: 112, effectiveCount: 112, legendCount: 0, bestTier: 2};
  const loader = vi.fn(async (offset = 0, limit = 20) => ({players: records.slice(offset, offset + limit), total: records.length}));
  root = createRoot(document.getElementById('root')!);
  await act(async () => root!.render(<GymAlumniPanel state={state} onAction={() => {}} loadAlumni={loader}/>));
  await act(async () => {await Promise.resolve();});
  expect(loader.mock.calls).toEqual([[0, 100], [100, 100]]);
  const cards = [...document.querySelectorAll<HTMLButtonElement>('.gm-alumnus')];
  expect(cards).toHaveLength(2);
  expect(cards.map(item => item.querySelector('strong')?.textContent)).toEqual([second.name, `${first.name}(121)`]);
  expect(document.querySelector('[aria-label="校友档案分页"]')).toBeNull();
  await press(cards[1]);
  const detail = document.querySelector('.gm-detail-dialog')!;
  expect(detail.textContent).toContain('同模板共 121 份，当前展示最高身价记录');
  expect(detail.textContent).toContain('赞助券 +120');
  expect(actions).toEqual([]);
});

it('puts identity and a fixed portrait together, with the highest template value on a separate full-width row', async () => {
  const state = newGym(at, 15), template = templateRules.find(item => item.tier === 'legend')!;
  const record: GymAlumnus = {...structuredClone(state.player!), id: 'expensive-alumnus', templateId: template.id,
    level: 32, peakLevel: 32, recommendedAt: at, rewardCredits: 27, rewardFame: 150, finalValue: '12649800'};
  const later: GymAlumnus = {...structuredClone(record), id: 'recent-cheaper-alumnus', level: 2, peakLevel: 2,
    recommendedAt: at + 1, finalValue: '9504', rewardCredits: 1};
  state.alumni = [record, later];
  await mount(GymAlumniPanel, state);
  const entry = document.querySelector<HTMLButtonElement>('.gm-alumnus')!;
  const top = entry.querySelector('.gm-alumnus-top')!, price = entry.querySelector('.gm-alumnus-value')!;
  expect(top.querySelector('.gm-alumnus-image')?.getAttribute('data-tier')).toBe('legend');
  expect(top.querySelector('.gm-alumnus-copy')?.textContent).toContain(`${template.name}(2)`);
  expect(top.querySelector('.gm-alumnus-copy')?.textContent).toContain('Lv.32');
  expect(top.querySelector('.fitted-amount')).toBeNull();
  expect(price.parentElement).toBe(entry);
  expect(price.querySelector('small')?.textContent).toBe('最高身价');
  expect(price.querySelector('.fitted-amount')?.getAttribute('title')).toBe('$1,264.98万');
  expect(top.nextElementSibling).toBe(price);
  await press(entry);
  const detail = document.querySelector('.gm-detail-dialog')!;
  expect(detail.textContent).toContain('最高身价记录');
  expect(detail.textContent).toContain('赞助券 +27');
  expect(detail.textContent).not.toContain('最近一次推荐记录');
});

it('shows a retry instead of an incomplete archive count if a later page cannot be loaded', async () => {
  const state = newGym(at, 16);
  const record: GymAlumnus = {...state.player!, templateId: templateRules[0].id, recommendedAt: at, rewardCredits: 1, rewardFame: 1, finalValue: '320'};
  state.alumni = [record];
  const loader = vi.fn(async (offset = 0) => {
    if (offset) throw new Error('unavailable');
    return {players: Array.from({length: 100}, (_, index) => ({...record, id: `a-${index}`})), total: 101};
  });
  root = createRoot(document.getElementById('root')!);
  await act(async () => root!.render(<GymAlumniPanel state={state} onAction={() => {}} loadAlumni={loader}/>));
  await act(async () => {await Promise.resolve();});
  expect(document.querySelectorAll('.gm-alumnus')).toHaveLength(0);
  await vi.waitFor(async () => {
    await act(async () => {await Promise.resolve();});
    expect(document.querySelector('[role="alert"]')).toBeTruthy();
  });
  expect(button(document, '重新读取档案')).toBeTruthy();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('暂时无法读取');
});
