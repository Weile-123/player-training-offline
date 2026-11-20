import {act} from 'preact/test-utils';
import {createRoot} from 'react-dom/client';
import {expect, it, vi} from 'vitest';
import {ShootButton} from '../../src/components/ShootButton';

it('blocks shots for one second and lowers the gray mask while the cooldown elapses', async () => {
 vi.useFakeTimers();
 vi.setSystemTime(10000);
 const animationFrame = vi.fn();
 vi.stubGlobal('requestAnimationFrame', animationFrame);
 const root = createRoot(document.getElementById('root')!);
 const shoot = vi.fn();
 const step = async (milliseconds: number) => act(async () => vi.advanceTimersByTimeAsync(milliseconds));
 try {
  await act(async () => root.render(<ShootButton disabled={false} reduced={false} onShoot={shoot} cooldownUntil={11000}/>));
  const button = document.querySelector<HTMLButtonElement>('[aria-label="投篮训练"]')!;
  expect(button.disabled).toBe(true);
  const mask = document.querySelector<HTMLElement>('.dock-shoot-cooldown')!;
  expect(mask.style.getPropertyValue('--shoot-cooldown-height')).toBe('100%');
  expect(mask.style.getPropertyValue('--shoot-cooldown-duration')).toBe('1000ms');
  const timer = document.querySelector<HTMLElement>('.dock-shoot-timer')!;
  expect(timer.textContent).toBe('1.0s');
  expect(button.contains(timer)).toBe(false);
  expect(timer.previousElementSibling).toBe(button);
  await act(async () => button.click());
  expect(shoot).not.toHaveBeenCalled();
  await step(500);
  expect(button.disabled).toBe(true);
  expect(mask.style.getPropertyValue('--shoot-cooldown-height')).toBe('100%');
  expect(mask.style.height).toBe('');
  expect(timer.textContent).toBe('0.5s');
  await step(499);
  expect(button.disabled).toBe(true);
  await step(1);
  expect(button.disabled).toBe(false);
  expect(document.querySelector('.dock-shoot-cooldown')).toBeNull();
  expect(document.querySelector('.dock-shoot-timer')).toBeNull();
  await act(async () => button.click());
  expect(shoot).toHaveBeenCalledOnce();
  expect(animationFrame).not.toHaveBeenCalled();
 } finally {
  act(() => root.unmount());
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
 }
});

it('keeps the full mask until the manual interval when automatic mode leaves a longer deadline', async () => {
 vi.useFakeTimers();
 vi.setSystemTime(10000);
 const root = createRoot(document.getElementById('root')!);
 const shoot = vi.fn();
 try {
  await act(async () => root.render(<ShootButton disabled reduced={false} onShoot={shoot}/>));
  const button = document.querySelector<HTMLButtonElement>('.dock-shoot')!;
  await act(async () => root.render(<ShootButton disabled={false} reduced={false} onShoot={shoot} cooldownUntil={11200} cooldownDurationMs={500}/>));
  const mask = document.querySelector<HTMLElement>('.dock-shoot-cooldown')!;
  expect(mask.style.getPropertyValue('--shoot-cooldown-height')).toBe('100%');
  expect(mask.style.getPropertyValue('--shoot-cooldown-duration')).toBe('500ms');
  expect(mask.style.getPropertyValue('--shoot-cooldown-delay')).toBe('700ms');
  await act(async () => vi.advanceTimersByTimeAsync(700));
  expect(button.disabled).toBe(true);
  expect(document.querySelector('.dock-shoot-timer')?.textContent).toBe('0.5s');
  await act(async () => vi.advanceTimersByTimeAsync(499));
  expect(button.disabled).toBe(true);
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(button.disabled).toBe(false);
  expect(document.querySelector('.dock-shoot-cooldown')).toBeNull();
 } finally {
  act(() => root.unmount());
  vi.useRealTimers();
 }
});

it('keeps the same shot node when automatic mode removes the cooldown and when recruitment changes its artwork', async () => {
 vi.stubGlobal('cancelAnimationFrame', vi.fn());
 const root = createRoot(document.getElementById('root')!);
 const action = vi.fn();
 try {
  await act(async () => root.render(<ShootButton disabled={false} reduced onShoot={action} cooldownUntil={0}/>));
  const button = document.querySelector<HTMLButtonElement>('.dock-shoot')!;
  await act(async () => root.render(<ShootButton disabled reduced onShoot={action}/>));
  expect(document.querySelector('.dock-shoot')).toBe(button);
  expect(button.disabled).toBe(true);
  expect(document.querySelector('.dock-shoot-timer')).toBeNull();
  await act(async () => root.render(<ShootButton mode="recruit" disabled={false} reduced onShoot={action}/>));
  expect(document.querySelector('.dock-shoot')).toBe(button);
  expect(button.getAttribute('aria-label')).toBe('招募球员');
  expect(button.classList.contains('is-recruiting')).toBe(true);
  expect(button.querySelector('.dock-recruit-art text')?.textContent).toBe('招募');
  expect(button.querySelector('.dock-shoot-cooldown')).toBeNull();
  await act(async () => button.click());
  expect(action).toHaveBeenCalledOnce();
 } finally {
  act(() => root.unmount());
  vi.unstubAllGlobals();
 }
});
