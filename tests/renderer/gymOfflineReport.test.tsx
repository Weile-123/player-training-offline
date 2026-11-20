import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {act} from 'preact/test-utils';
import type {OfflinePlayerReport, OfflineTrainingReport} from '../../src/game/gym/offline';
import {playerLevelCap} from '../../src/game/gym/progression';
import {templateById} from '../../src/game/templates';
import {GymOfflineReport, offlineExperienceAnimationMs} from '../../src/components/GymOfflineReport';
import {templateRules} from '../../src/game/contract/templates';
import {presentationConfig} from '../../src/presentation/feedback';

let root: Root | null = null;
beforeEach(() => {localStorage.removeItem(presentationConfig.preferenceKey);});
afterEach(() => {if (root) act(() => root!.unmount()); root = null; vi.restoreAllMocks(); vi.unstubAllGlobals();});

const player = (id: string): OfflinePlayerReport => ({id, name: `新秀 ${id}`, shots: 10, xpGained: 120,
  levelBefore: 4, levelAfter: 7, staminaBefore: 20, staminaAfter: 10,
  templateBefore: null, templateAfter: 'caruso', courses: 1});
const report = (players = [player('1')]): OfflineTrainingReport => ({
  from: 1_800_000_000_000, to: 1_800_007_200_000, elapsedMs: 7_200_000, creditedMs: 1_800_000,
  capMs: 1_800_000, capped: true, totalShots: players.reduce((sum, entry) => sum + entry.shots, 0),
  totalExperience: players.reduce((sum, entry) => sum + entry.xpGained, 0), players,
});

it('disables the ad when all reported players are at the level cap',async()=>{
 const onDoubleExperience=vi.fn(async()=>true);
 await mount(report([{...player('1'),levelAfter:playerLevelCap}]),vi.fn(),{onDoubleExperience});
 const button=document.querySelector<HTMLButtonElement>('.gm-offline-double-experience')!;
 expect(button.disabled).toBe(true);expect(button.textContent).toContain('已满级');
 await act(async()=>button.click());expect(onDoubleExperience).not.toHaveBeenCalled();
 expect(document.querySelector('.gm-offline-xp-total b')?.textContent).toBe('+120');
});

it('animates and restores the actual capped bonus instead of inventing full double XP',async()=>{
 localStorage.setItem(presentationConfig.preferenceKey,JSON.stringify({version:1,sound:true,reducedMotion:true}));
 const value=report([{...player('1'),xpGained:20,levelAfter:playerLevelCap-1},{...player('2'),xpGained:120,levelAfter:playerLevelCap}]);
 value.bonusExperience={'1':10,'2':0};
 await mount(value,vi.fn(),{onDoubleExperience:vi.fn(async()=>true)});await claim();
 expect(document.querySelector('.gm-offline-xp-total b')?.textContent).toBe('+150');
 expect([...document.querySelectorAll('.athlete-xp')].map(node=>node.textContent)).toEqual(['经验 +30','经验 +120']);
 act(()=>root!.unmount());root=null;
 await mount(value,vi.fn(),{doubleExperienceClaimed:true});
 expect(document.querySelector('.gm-offline-xp-total b')?.textContent).toBe('+150');
});
async function mount(value: OfflineTrainingReport, close = vi.fn(), extra: Partial<Parameters<typeof GymOfflineReport>[0]> = {}) {
  root = createRoot(document.getElementById('root')!);
  await act(async () => root!.render(<GymOfflineReport report={value} onClose={close} {...extra}/>));
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
  expect(dialog.textContent).toContain('已保存');
  expect(dialog.querySelector('.gm-offline-saved')).toBeNull();
  expect(dialog.querySelector<HTMLButtonElement>('.gm-offline-double-experience')?.disabled).toBe(true);
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

const doubleButton = () => document.querySelector<HTMLButtonElement>('.gm-offline-double-experience')!;
const deferred = <T,>() => {let resolve!:(value:T)=>void;return {promise:new Promise<T>(done=>{resolve=done;}),resolve:(value:T)=>resolve(value)};};
async function claim() {await act(async () => {doubleButton().click(); for(let index=0;index<10;index++)await Promise.resolve();});}

it('places the gold-advertising action above Continue without the redundant saved summary', async () => {
  await mount(report(),vi.fn(),{onDoubleExperience:vi.fn(async()=>true)});
  const footer = document.querySelector('.gm-offline-footer')!;
  expect(footer.querySelectorAll('button')[0]).toBe(doubleButton());
  expect(doubleButton().textContent).toBe('领取双倍经验');
  expect(doubleButton().querySelector('.gm-offline-ad-icon')).toBeTruthy();
  expect(footer.querySelectorAll('button')[1].textContent).toBe('继续培养');
  expect(document.querySelector('.gm-offline-saved,.offline-summary')).toBeNull();
});

it('waits for committed success, blocks duplicate clicks, then tweens every XP value once and marks it gold', async () => {
  const pending=deferred<boolean>(),onDoubleExperience=vi.fn(()=>pending.promise),frames:FrameRequestCallback[]=[];
  vi.spyOn(performance,'now').mockReturnValue(1000);
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.push(callback);return frames.length;});
  vi.stubGlobal('cancelAnimationFrame',vi.fn());
  const value=report([player('1'),{...player('2'),xpGained:80}]),before=structuredClone(value);
  await mount(value,vi.fn(),{onDoubleExperience}); await claim(); await claim();
  const footerChildren=document.querySelector('.gm-offline-footer')!.children.length;
  expect(onDoubleExperience).toHaveBeenCalledOnce();expect(doubleButton().disabled).toBe(true);
  expect(document.querySelector('.gm-offline-xp-total b')?.textContent).toBe('+200');
  expect(document.querySelector('.is-double-experience')).toBeNull();expect(frames).toHaveLength(0);
  expect(document.querySelector<HTMLElement>('.gm-offline-report')!.style.getPropertyValue('--offline-gold-progress')).toBe('0');
  await act(async()=>{pending.resolve(true);for(let index=0;index<10;index++)await Promise.resolve();});
  expect(document.querySelector('.is-double-experience')).toBeTruthy();expect(frames).toHaveLength(1);
  expect(document.querySelector<HTMLElement>('.gm-offline-report')!.style.getPropertyValue('--offline-gold-progress')).toBe('0');
  await act(async()=>{frames.shift()!(1000+offlineExperienceAnimationMs/2);});
  const intermediate=Number(document.querySelector('.gm-offline-xp-total b')!.textContent!.slice(1));
  expect(intermediate).toBeGreaterThan(200);expect(intermediate).toBeLessThan(400);
  const halfway=Number(document.querySelector<HTMLElement>('.gm-offline-report')!.style.getPropertyValue('--offline-gold-progress'));
  expect(halfway).toBeGreaterThan(0);expect(halfway).toBeLessThan(1);
  expect([...document.querySelectorAll('.gm-offline-xp-value')].every(node=>node.getAttribute('data-xp-text')===node.textContent)).toBe(true);
  await act(async()=>{frames.shift()!(1000+offlineExperienceAnimationMs);});
  expect(document.querySelector('.gm-offline-xp-total b')?.textContent).toBe('+400');
  expect(document.querySelector<HTMLElement>('.gm-offline-report')!.style.getPropertyValue('--offline-gold-progress')).toBe('1');
  expect([...document.querySelectorAll('.athlete-xp')].map(node=>node.textContent)).toEqual(['经验 +240','经验 +160']);
  expect(doubleButton().textContent).toBe('已领取双倍经验');await claim();expect(onDoubleExperience).toHaveBeenCalledOnce();
  expect(document.querySelector('.gm-offline-footer')!.children.length).toBe(footerChildren);
  expect(document.body.textContent).not.toContain('双倍经验已到账');
  expect(frames).toHaveLength(0);expect(value).toEqual(before);
});

it.each(['cancelled','failed'])('does not animate or change original totals on %s reward', async result => {
  const onDoubleExperience=vi.fn(async()=>{if(result==='failed')throw Error('广告未看完');return false;});
  const requestFrame=vi.fn();vi.stubGlobal('requestAnimationFrame',requestFrame);
  await mount(report(),vi.fn(),{onDoubleExperience});await claim();
  expect(document.querySelector('.gm-offline-xp-total b')?.textContent).toBe('+120');
  expect(document.querySelector('.is-double-experience')).toBeNull();expect(requestFrame).not.toHaveBeenCalled();
  expect(document.querySelector('[role=alert]')?.textContent).toBeTruthy();expect(doubleButton().disabled).toBe(false);
});

it('shows a persisted claimed report at double XP immediately without replaying its animation', async () => {
  const requestFrame=vi.fn(),onDoubleExperience=vi.fn(async()=>true);vi.stubGlobal('requestAnimationFrame',requestFrame);
  await mount(report(),vi.fn(),{onDoubleExperience,doubleExperienceClaimed:true});
  expect(document.querySelector('.gm-offline-xp-total b')?.textContent).toBe('+240');
  expect(document.querySelector('.athlete-xp')?.textContent).toBe('经验 +240');
  expect(document.querySelector('.is-double-experience')).toBeTruthy();expect(doubleButton().disabled).toBe(true);
  expect(document.querySelector<HTMLElement>('.gm-offline-report')!.style.getPropertyValue('--offline-gold-progress')).toBe('1');
  expect(requestFrame).not.toHaveBeenCalled();await claim();expect(onDoubleExperience).not.toHaveBeenCalled();
});

it('honors reduced motion for successful doubling without animation frames', async () => {
  localStorage.setItem(presentationConfig.preferenceKey,JSON.stringify({version:1,sound:true,reducedMotion:true}));
  const requestFrame=vi.fn();vi.stubGlobal('requestAnimationFrame',requestFrame);
  await mount(report(),vi.fn(),{onDoubleExperience:vi.fn(async()=>true)});await claim();
  expect(document.querySelector('.gm-offline-xp-total b')?.textContent).toBe('+240');expect(requestFrame).not.toHaveBeenCalled();
});

it('does not animate a completion returned after the report was dismissed', async () => {
  const pending=deferred<boolean>(),requestFrame=vi.fn();vi.stubGlobal('requestAnimationFrame',requestFrame);
  await mount(report(),vi.fn(),{onDoubleExperience:()=>pending.promise});await claim();
  act(()=>root!.unmount());root=null;
  await act(async()=>{pending.resolve(true);for(let index=0;index<10;index++)await Promise.resolve();});
  expect(requestFrame).not.toHaveBeenCalled();
});

it('keeps the report open through pending ad/commit work, including an immediate close click before rendering busy state',async()=>{
 const pending=deferred<boolean>(),closed=vi.fn();
 await mount(report(),closed,{onDoubleExperience:()=>pending.promise});
 const originalClose=document.querySelector<HTMLButtonElement>('[aria-label="关闭面板"]')!,continueButton=[...document.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='继续培养')!;
 await act(async()=>{doubleButton().click();originalClose.click();continueButton.click();for(let index=0;index<10;index++)await Promise.resolve();});
 expect(closed).not.toHaveBeenCalled();expect(continueButton.disabled).toBe(true);
 expect(document.querySelector('[aria-label="关闭面板"]')).toBeNull();
 await act(async()=>{document.querySelector('[role=dialog]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));});
 expect(closed).not.toHaveBeenCalled();
 await act(async()=>{pending.resolve(false);for(let index=0;index<10;index++)await Promise.resolve();});
 expect(continueButton.disabled).toBe(false);expect(document.querySelector('[aria-label="关闭面板"]')).toBeTruthy();
 expect(doubleButton().disabled).toBe(false);
 await act(async()=>continueButton.click());expect(closed).toHaveBeenCalledOnce();
});

it('also blocks dismissal while an externally managed reward commit is pending',async()=>{
 const closed=vi.fn();await mount(report(),closed,{doubleExperiencePending:true,onDoubleExperience:vi.fn(async()=>true)});
 const continueButton=[...document.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='继续培养')!;
 expect(continueButton.disabled).toBe(true);expect(document.querySelector('[aria-label="关闭面板"]')).toBeNull();
 await act(async()=>continueButton.click());expect(closed).not.toHaveBeenCalled();
});
