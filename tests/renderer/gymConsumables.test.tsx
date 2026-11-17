import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {GymConsumables} from '../../src/components/GymConsumables';
import {GymInventoryPanel, GymShopPanel} from '../../src/components/GymPanels';
import {newGym} from '../../src/game/gym/engine';

const at = 1_800_000_000_000;
let host: HTMLDivElement, root: Root;
beforeEach(() => {host = document.createElement('div'); document.body.append(host); root = createRoot(host);});
afterEach(() => {act(() => root.unmount()); host.remove();});

it.each([
  {label: 'backpack', Panel: GymInventoryPanel},
  {label: 'shop', Panel: GymShopPanel},
])('hides all supply tabs, stock, actions and hints in the $label without changing legacy data', async ({Panel}) => {
  const state = newGym(at, 82);
  state.gymLevel = 8; state.credits = 100; state.player!.stamina = 1;
  state.inventory = {drink: 3, brace: 1, timer: 2, chalk: 4, supplement: 5};
  state.player!.greatShotsRemaining = 30;
  const before = JSON.stringify(state), onAction = vi.fn();
  await act(async () => root.render(<Panel state={state} onAction={onAction}/>));
  expect(host.querySelector('.gm-consumables,.gm-consumable-card,.gm-retired-consumables')).toBeNull();
  expect(host.querySelector('[role="tablist"]')).toBeNull();
  expect(host.textContent).not.toMatch(/消耗品|运动饮料|训练镁粉|团队补给|应急护具|加练秒表|旧版库存|镁粉生效|使用饮料/);
  expect([...host.querySelectorAll('img')].every(image => !image.src.includes('/consumables/'))).toBe(true);
  await act(async () => root.render(<Panel state={state} onAction={onAction} busy/>));
  expect(host.textContent).not.toMatch(/消耗品|使用饮料|镁粉生效/);
  expect(JSON.stringify(state)).toBe(before);
  expect(onAction).not.toHaveBeenCalled();
});

it.each([false, true])('keeps the compatibility component dormant even when purchasing=%s and old stock exists', async purchasing => {
  const state = newGym(at, 82);
  state.inventory = {drink: 3, brace: 1, timer: 2, chalk: 4, supplement: 5};
  state.player!.greatShotsRemaining = 30;
  const before = JSON.stringify(state), onAction = vi.fn();
  await act(async () => root.render(<GymConsumables state={state} onAction={onAction} purchasing={purchasing}/>));
  expect(host.childNodes).toHaveLength(0);
  expect(JSON.stringify(state)).toBe(before);
  expect(onAction).not.toHaveBeenCalled();
});
