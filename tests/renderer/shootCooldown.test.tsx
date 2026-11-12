import {act} from 'preact/test-utils';
import {createRoot} from 'react-dom/client';
import {expect, it, vi} from 'vitest';
import {ShootButton} from '../../src/components/ShootButton';

it('blocks shots for one second and lowers the gray mask while the cooldown elapses', async () => {
 let now = 10000;
 let frameId = 0;
 const frames = new Map<number, FrameRequestCallback>();
 vi.spyOn(Date, 'now').mockImplementation(() => now);
 vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
  frames.set(++frameId, callback);
  return frameId;
 });
 vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
 const root = createRoot(document.getElementById('root')!);
 const shoot = vi.fn();
 const step = async (milliseconds: number) => {
  now += milliseconds;
  const callbacks = [...frames.values()];
  frames.clear();
  await act(async () => callbacks.forEach(callback => callback(now)));
 };
 try {
  await act(async () => root.render(<ShootButton disabled={false} reduced={false} onShoot={shoot} cooldownUntil={11000}/>));
  const button = document.querySelector<HTMLButtonElement>('[aria-label="投篮训练"]')!;
  expect(button.disabled).toBe(true);
  expect(document.querySelector<HTMLElement>('.dock-shoot-cooldown')!.style.height).toBe('100%');
  const timer = document.querySelector<HTMLElement>('.dock-shoot-timer')!;
  expect(timer.textContent).toBe('1.0s');
  expect(button.contains(timer)).toBe(false);
  expect(timer.previousElementSibling).toBe(button);
  await act(async () => button.click());
  expect(shoot).not.toHaveBeenCalled();
  await step(500);
  expect(button.disabled).toBe(true);
  expect(document.querySelector<HTMLElement>('.dock-shoot-cooldown')!.style.height).toBe('50%');
  expect(timer.textContent).toBe('0.5s');
  await step(499);
  expect(button.disabled).toBe(true);
  await step(1);
  expect(button.disabled).toBe(false);
  expect(document.querySelector('.dock-shoot-cooldown')).toBeNull();
  expect(document.querySelector('.dock-shoot-timer')).toBeNull();
  await act(async () => button.click());
  expect(shoot).toHaveBeenCalledOnce();
 } finally {
  act(() => root.unmount());
  expect(frames.size).toBe(0);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
 }
});
