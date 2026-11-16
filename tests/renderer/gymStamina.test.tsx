import {afterEach, beforeEach, expect, it} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {newGym, type GymState} from '../../src/game/gym/engine';
import {GymStamina} from '../../src/components/GymStamina';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {host = document.createElement('div'); document.body.append(host); root = createRoot(host);});
afterEach(() => {act(() => root.unmount()); host.remove();});
const mount = async (state: GymState) => {await act(async () => root.render(<GymStamina state={state}/>));};
const meter = () => host.querySelector<HTMLElement>('[aria-label="球员体力"]')!;

it('displays real stamina as one continuous fill with the approved separate score and no cells or housing', async () => {
  const state = newGym(1800000000000, 51);
  state.player!.stamina = 16;
  await mount(state);
  expect(meter().getAttribute('aria-valuenow')).toBe('16');
  expect(meter().getAttribute('aria-valuemax')).toBe('20');
  expect(meter().children).toHaveLength(1);
  expect(meter().querySelector('i')?.style.height).toBe('80%');
  expect(host.querySelector('.gym-stamina-a-values>strong')?.textContent).toBe('16');
  expect(host.querySelector('.gym-stamina-a-values>small')?.textContent).toBe('/20');
  expect(host.querySelector('.energy-cell,.energy-housing,.energy-crest')).toBeNull();
});

it('uses the current shared stamina capacity and rounds the remaining recovery time upward', async () => {
  const state = newGym(1800000000000, 52);
  state.projects.endurance = 1;
  state.player!.stamina = 16;
  state.player!.recoveryMs = 19001;
  await mount(state);
  expect(meter().getAttribute('aria-valuemax')).toBe('25');
  expect(meter().querySelector('i')?.style.height).toBe('64%');
  expect(host.querySelector('.gym-stamina-a-values>em')?.textContent).toBe('恢复1秒');
  expect(meter().getAttribute('aria-valuetext')).toBe('16/25，1 秒后恢复 1 点体力');
});

it('shows a full continuous line without a recovery countdown at full stamina', async () => {
  const state = newGym(1800000000000, 53);
  await mount(state);
  expect(meter().querySelector('i')?.style.height).toBe('100%');
  expect(host.querySelector('.gym-stamina-a-values>em')?.textContent).toBe('已满');
  expect(meter().getAttribute('aria-valuetext')).toContain('体力已满');
});

it('keeps the empty court readable without implying training or a running recovery countdown', async () => {
  const state = newGym(1800000000000, 54);
  state.player = null;
  await mount(state);
  expect(meter().getAttribute('aria-valuenow')).toBe('0');
  expect(meter().querySelector('i')?.style.height).toBe('0%');
  expect(host.querySelector('.gym-stamina-a-values>em')?.textContent).toBe('待招');
  expect(meter().getAttribute('aria-valuetext')).toContain('招募后获得满体力');
});
