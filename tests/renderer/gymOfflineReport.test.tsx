import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {act} from 'preact/test-utils';
import type {OfflinePlayerReport, OfflineTrainingReport} from '../../src/game/gym/offline';
import {templateById} from '../../src/game/templates';
import {GymOfflineReport} from '../../src/components/GymOfflineReport';
import {templateRules} from '../../src/game/contract/templates';
import {presentationConfig} from '../../src/presentation/feedback';

let root: Root | null = null;
beforeEach(() => {localStorage.removeItem(presentationConfig.preferenceKey);});
afterEach(() => {if (root) act(() => root!.unmount()); root = null;});

const player = (id: string): OfflinePlayerReport => ({id, name: `新秀 ${id}`, shots: 10, xpGained: 120,
  levelBefore: 4, levelAfter: 7, staminaBefore: 20, staminaAfter: 10,
  templateBefore: null, templateAfter: 'caruso', courses: 1});
const report = (players = [player('1')]): OfflineTrainingReport => ({
  from: 1_800_000_000_000, to: 1_800_007_200_000, elapsedMs: 7_200_000, creditedMs: 1_800_000,
  capMs: 1_800_000, capped: true, totalShots: players.reduce((sum, entry) => sum + entry.shots, 0),
  totalExperience: players.reduce((sum, entry) => sum + entry.xpGained, 0), players,
});
async function mount(value: OfflineTrainingReport, close = vi.fn()) {
  root = createRoot(document.getElementById('root')!);
  await act(async () => root!.render(<GymOfflineReport report={value} onClose={close}/>));
  return close;
}

it('shows every athlete in one focusable horizontal results region and removes stamina changes', async () => {
  const value = report(Array.from({length: 8}, (_, index) => player(String(index + 1))));
  const before = structuredClone(value);
  await mount(value);
  const region = document.querySelector<HTMLElement>('[aria-label="球员离线成果，可左右滑动"]')!;
  expect(region.getAttribute('role')).toBe('region');
  expect(region.tabIndex).toBe(0);
  expect(region.children).toHaveLength(8);
  expect([...region.children].every(card => card.classList.contains('gm-offline-athlete'))).toBe(true);
  expect(region.textContent).not.toContain('体力');
  expect(region.querySelector('.athlete-level > span')?.textContent).toBe('Lv.4');
  expect(region.querySelector('.athlete-level > strong')?.textContent).toBe('7');
  expect(region.textContent).toContain('经验 +120');
  expect(document.querySelector('.gm-offline-scoreboard')!.textContent).toContain('+960');
  expect(document.querySelector('.gm-offline-metrics')!.textContent).toContain('80球');
  expect(value).toEqual(before);
});

it('separates the original template from the newly matched template while showing real names', async () => {
  const entry = {...player('1'), templateBefore: 'seth-curry', templateAfter: 'jason-terry'};
  await mount(report([entry]));
  const change = document.querySelector('.gm-offline-template-change')!;
  expect(change.querySelector('.gm-offline-template-before')?.tagName).toBe('SPAN');
  expect(change.querySelector('.gm-offline-template-before')?.textContent).toBe(templateById(entry.templateBefore)!.name);
  expect(change.querySelector('.gm-offline-template-after')?.tagName).toBe('SPAN');
  expect(change.querySelector('.gm-offline-template-after')?.textContent).toBe(templateById(entry.templateAfter)!.name);
  expect(change.textContent).toBe(`${templateById(entry.templateBefore)!.name} → ${templateById(entry.templateAfter)!.name}`);
  expect(document.querySelector('.gm-offline-athlete h3')?.textContent).toBe(templateById(entry.templateAfter)!.name);
});

it('shows an unchanged or undiscovered template without inventing a new match', async () => {
  const first = {...player('1'), templateBefore: 'caruso'};
  const second = {...player('2'), templateBefore: null, templateAfter: null};
  await mount(report([first, second]));
  expect(document.querySelectorAll('.gm-offline-template-after')).toHaveLength(0);
  expect(document.querySelectorAll('.gm-offline-template-unchanged')).toHaveLength(2);
  expect(document.querySelectorAll('.gm-offline-athlete h3')[1].textContent).toBe('待发掘球员');
  expect(document.querySelector('.gm-offline-players')!.textContent).not.toContain('新秀');
});

it.each(['rotation', 'starter', 'star', 'superstar', 'legend'])('frames a %s portrait using its final template tier', async tier => {
  const final = templateRules.find(template => template.tier === tier)!;
  const entry = {...player('1'), templateBefore: null, templateAfter: final.id};
  await mount(report([entry]));
  const portrait = document.querySelector('.gm-offline-portrait.tier-portrait-frame')!;
  expect(portrait.getAttribute('data-tier')).toBe(tier);
  expect(portrait.querySelector('.album-portrait-surface > img')?.getAttribute('alt')).toBe(`${final.name}模板头像`);
  expect(document.querySelector('.gm-offline-athlete h3')?.textContent).toBe(final.name);
});

it('uses an undiscovered portrait frame before a template is matched', async () => {
  await mount(report([{...player('1'), templateAfter: null}]));
  expect(document.querySelector('.gm-offline-portrait')?.getAttribute('data-tier')).toBe('undiscovered');
  expect(document.querySelector('.gm-offline-portrait .rookie-portrait')).toBeTruthy();
});

it('honors the saved reduced-motion setting for legendary portrait frames', async () => {
  localStorage.setItem(presentationConfig.preferenceKey, JSON.stringify({version: 1, sound: true, reducedMotion: true}));
  const final = templateRules.find(template => template.tier === 'legend')!;
  await mount(report([{...player('1'), templateAfter: final.id}]));
  expect(document.querySelector('.gm-offline-report.reduce-motion')).toBeTruthy();
  expect(document.querySelector('.gm-offline-portrait[data-tier="legend"]')).toBeTruthy();
});

it('dismisses an already-saved report without claiming rewards or mutating its totals', async () => {
  const value = report();
  const before = structuredClone(value);
  const close = await mount(value);
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain('30分钟');
  expect(dialog.textContent).toContain('2小时');
  expect(dialog.textContent).toContain('超出时长仅恢复体力');
  expect(dialog.textContent).toContain('已保存，无需领取');
  expect([...dialog.querySelectorAll('button')].some(button => button.textContent?.includes('领取'))).toBe(false);
  const continueButton = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '继续培养')!;
  await act(async () => continueButton.click());
  expect(close).toHaveBeenCalledTimes(1);
  expect(value).toEqual(before);
});

it('uses the selected design number-and-unit structure for compact duration metrics', async () => {
  await mount({...report(), creditedMs: 45 * 60_000, elapsedMs: 2 * 3_600_000 + 4 * 60_000});
  const metrics = document.querySelector('.report-dashboard-metrics')!;
  expect(metrics.querySelector('div:nth-child(1) > b')?.textContent).toBe('45分钟');
  expect(metrics.querySelector('div:nth-child(1) > b > small')?.textContent).toBe('分钟');
  expect(metrics.querySelector('.duration')?.textContent).toBe('2小时4分钟');
  expect(metrics.querySelectorAll('.duration > small')).toHaveLength(2);
  expect(document.querySelector('.offline-b')?.classList.contains('gym-design-surface')).toBe(true);
  expect(document.querySelector('.athlete-cover .tier-badge')).toBeNull();
});

it('omits a cap warning when uncapped and renders an honest empty report', async () => {
  const value = {...report([]), capped: false, creditedMs: 60_000, elapsedMs: 60_000, totalShots: 0, totalExperience: 0};
  await mount(value);
  expect(document.querySelector('.gm-offline-cap-note')).toBeNull();
  expect(document.querySelector('.gm-offline-xp-total')?.textContent).toContain('+0');
  expect(document.querySelector('.gm-offline-empty')?.textContent).toBe('本次没有产生有效训练。');
  expect(document.querySelectorAll('.gm-offline-athlete')).toHaveLength(0);
});
