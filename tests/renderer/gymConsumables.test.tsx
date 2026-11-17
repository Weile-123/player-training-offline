import {afterEach, beforeEach, expect, it} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {GymConsumables} from '../../src/components/GymConsumables';
import {dispatchGym, newGym, type GymAction, type GymState} from '../../src/game/gym/engine';

const at = 1_800_000_000_000;
let host: HTMLDivElement, root: Root;
beforeEach(() => {host = document.createElement('div'); document.body.append(host); root = createRoot(host);});
afterEach(() => {act(() => root.unmount()); host.remove();});
const button = (label: string) => Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(node => node.getAttribute('aria-label') === label || node.textContent === label)!;
const press = async (node: HTMLButtonElement) => {await act(async () => node.click());};

it('lists three distinct items with original artwork and keeps retired stock usable without selling it', async () => {
  const state = newGym(at, 82);
  await act(async () => root.render(<GymConsumables state={state} onAction={() => {}} purchasing/>));
  const images = Array.from(host.querySelectorAll('img')).map(image => image.getAttribute('src'));
  for (const icon of ['drink', 'chalk', 'supplement']) expect(images.some(source => source?.endsWith(`/consumables/${icon}.png`))).toBe(true);
  expect(host.querySelectorAll('article')).toHaveLength(3);
  expect(button('购买应急护具')).toBeUndefined();
  expect(button('购买训练镁粉').disabled).toBe(true);
  expect(host.textContent).toContain('球馆 Lv.3 上架');
  state.inventory.brace = 1;
  state.player!.stamina = 2;
  await act(async () => root.render(<GymConsumables state={state} onAction={() => {}} purchasing/>));
  expect(button('使用应急护具').disabled).toBe(false);
  expect(button('购买应急护具')).toBeUndefined();
  expect(host.querySelector('details')?.textContent).toContain('旧版库存');
});

it('buys team supplies first, restores eligible players only when used, then blocks empty or full uses', async () => {
  let state = newGym(at, 82); state.gymLevel = 3; state.credits = 8; state.player!.stamina = 2;
  const actions: GymAction[] = [];
  const render = () => root.render(<GymConsumables state={state} onAction={onAction} purchasing/>);
  const onAction = (action: GymAction) => {
    actions.push(action);
    const result = dispatchGym(state, state.revision, action, at);
    expect(result.error).toBeUndefined(); state = result.state; render();
  };
  await act(async () => render());
  await press(button('购买团队补给'));
  expect(state.credits).toBe(5); expect(state.inventory.supplement).toBe(1); expect(state.player!.stamina).toBe(2);
  await press(button('使用团队补给'));
  expect(actions.at(-1)).toMatchObject({type: 'use-consumable', id: 'supplement', playerId: state.player!.id});
  expect(state.player!.stamina).toBe(12); expect(state.inventory.supplement).toBe(0);
  expect(button('使用团队补给').disabled).toBe(true);
});

it('keeps drink action compatibility and offers stock usage without a purchase button in the backpack', async () => {
  const state = newGym(at, 82); state.player!.stamina = 1; state.inventory.drink = 1;
  const actions: GymAction[] = [];
  await act(async () => root.render(<GymConsumables state={state} onAction={action => actions.push(action)}/>));
  expect(host.querySelector('[aria-label="购买运动饮料"]')).toBeNull();
  await press(button('使用饮料'));
  expect(actions).toEqual([{type: 'use-drink', id: state.player!.id}]);
});

it('shows the requested prices and thirty-shot chalk effect consistently when bought and used', async () => {
  let state = newGym(at, 82); state.gymLevel = 3; state.credits = 5;
  const render = () => root.render(<GymConsumables state={state} onAction={onAction} purchasing/>);
  const onAction = (action: GymAction) => {
    const result = dispatchGym(state, state.revision, action, at);
    expect(result.error).toBeUndefined(); state = result.state; render();
  };
  await act(async () => render());
  expect(button('购买运动饮料').textContent).toBe('购买 · 1 券');
  expect(button('购买训练镁粉').textContent).toBe('购买 · 2 券');
  expect(button('购买团队补给').textContent).toBe('购买 · 3 券');
  expect(host.querySelector('[aria-label="训练镁粉"] p')?.textContent).toContain('接下来30次投篮均为大成功');
  await press(button('购买训练镁粉'));
  expect(state.credits).toBe(3); expect(state.inventory.chalk).toBe(1);
  await press(button('使用训练镁粉'));
  expect(state.player!.greatShotsRemaining).toBe(30); expect(state.inventory.chalk).toBe(0);
  expect(host.textContent).toContain('镁粉生效中 · 剩余 30 球');
});

it('disables automatic timers, armed chalk, capped players and all actions while a write is pending', async () => {
  const state: GymState = newGym(at, 82); state.gymLevel = 3; state.credits = 20;
  state.inventory = {drink: 1, brace: 1, timer: 1, chalk: 2, supplement: 1};
  state.player!.autoEnabled = true; state.player!.greatShotReady = true;
  const actions: GymAction[] = [];
  await act(async () => root.render(<GymConsumables state={state} onAction={action => actions.push(action)} purchasing/>));
  expect(button('使用加练秒表').disabled).toBe(true);
  expect(button('使用训练镁粉').disabled).toBe(true);
  expect(host.textContent).toContain('镁粉生效中');
  await act(async () => root.render(<GymConsumables state={state} onAction={action => actions.push(action)} purchasing busy/>));
  expect(Array.from(host.querySelectorAll<HTMLButtonElement>('button')).every(node => node.disabled)).toBe(true);
  state.player!.level = 99; state.player!.peakLevel = 99;
  await act(async () => root.render(<GymConsumables state={state} onAction={action => actions.push(action)}/>));
  expect(Array.from(host.querySelectorAll<HTMLButtonElement>('button')).every(node => node.disabled)).toBe(true);
  expect(actions).toEqual([]);
});
