import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {GymTrainingToolbar} from '../../src/components/GymTrainingToolbar';

let root: Root | null = null;
let frameId: number;
let frames: Map<number, FrameRequestCallback>;
const base = {playerId: 'one', level: 1, experience: 10, required: 100, atCap: false, cooperationReady: false, onTraining() {}, onCooperation() {}};
beforeEach(() => {
  vi.useFakeTimers(); frameId = 0; frames = new Map();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {frames.set(++frameId, callback); return frameId;});
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});
afterEach(() => {if (root) act(() => root!.unmount()); root = null; vi.useRealTimers();});
async function render(props: Partial<typeof base> & {reducedMotion?: boolean; empty?: boolean} = {}) {
  root ??= createRoot(document.getElementById('root')!);
  await act(async () => root!.render(<GymTrainingToolbar {...base} {...props}/>));
}
function fill() {return document.querySelector<HTMLElement>('.gym-experience-track>i')!;}
async function frame() {
  const callbacks = [...frames.values()]; frames.clear();
  await act(async () => callbacks.forEach(callback => callback(performance.now())));
}

it('keeps the same fill element and enables the transition for a normal experience gain', async () => {
  await render(); const first = fill();
  await render({experience: 35});
  expect(fill()).toBe(first);
  expect(fill().style.width).toBe('35%');
  expect(fill().classList.contains('is-instant')).toBe(false);
  expect(document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('35');
});

it('fills the old level, paints an empty track, then grows to the latest new-level remainder', async () => {
  await render({experience: 90});
  await render({level: 2, experience: 10, required: 120});
  expect(fill().style.width).toBe('100%');
  await render({level: 2, experience: 30, required: 120});
  expect(fill().style.width).toBe('100%');
  await act(async () => vi.advanceTimersByTime(280));
  expect(fill().style.width).toBe('0%');
  expect(fill().classList.contains('is-instant')).toBe(true);
  await frame(); expect(fill().style.width).toBe('0%');
  await frame(); expect(fill().style.width).toBe('25%');
  expect(fill().classList.contains('is-instant')).toBe(false);
});

it('cancels the previous player animation when the active player changes', async () => {
  await render({experience: 90});
  await render({level: 2, experience: 10, required: 120});
  const old = fill();
  await render({playerId: 'two', level: 5, experience: 30});
  expect(fill()).not.toBe(old);
  expect(fill().style.width).toBe('30%');
  await act(async () => vi.runAllTimers()); await frame(); await frame();
  expect(fill().style.width).toBe('30%');
});

it.each(['setting', 'system'] as const)('shows the final value immediately for reduced motion from %s', async source => {
  if (source === 'system') vi.stubGlobal('matchMedia', () => ({matches: true, addEventListener() {}, removeEventListener() {}}));
  const reducedMotion = source === 'setting';
  await render({reducedMotion, experience: 90});
  await render({reducedMotion, level: 2, experience: 30, required: 120});
  expect(fill().style.width).toBe('25%');
  expect(fill().classList.contains('is-instant')).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps a capped player full and an empty training slot empty', async () => {
  await render({experience: 90});
  await render({level: 2, atCap: true, experience: 0, required: 0});
  expect(fill().style.width).toBe('100%');
  expect(vi.getTimerCount()).toBe(0);
  await render({empty: true, experience: 0, required: 0});
  expect(fill().style.width).toBe('0%');
  expect(document.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('0');
});
