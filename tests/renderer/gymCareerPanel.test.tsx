import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {GymCareerPanel} from '../../src/components/GymCareerPanel';
import {newGym, type GymAlumnus} from '../../src/game/gym/engine';
import {templateRules} from '../../src/game/contract/templates';
import {presentationConfig} from '../../src/presentation/feedback';
import {ComicDialog} from '../../src/components/ComicDialog';
import {equipmentCatalog} from '../../src/game/gym/catalog';

const at = 1_800_000_000_000;
let root: Root | null = null;
beforeEach(() => {localStorage.removeItem(presentationConfig.preferenceKey);});
afterEach(() => {if (root) act(() => root!.unmount()); root = null; vi.restoreAllMocks();});
async function settle() {await act(async () => {for (let turn = 0; turn < 8; turn++) await Promise.resolve();});}
async function mount(props: Parameters<typeof GymCareerPanel>[0]) {
  root = createRoot(document.getElementById('root')!);
  await act(async () => root!.render(<ComicDialog title="球馆档案" variant="album" onClose={() => {}} className="career-statistics-dialog gym-career-dialog"><GymCareerPanel {...props}/></ComicDialog>));
  await settle();
}
function alumnus(id: string, tier: string, finalValue: string, level = 25): GymAlumnus {
  const player = structuredClone(newGym(at, 17).player!);
  const template = templateRules.find(template => template.tier === tier)!;
  return {...player, id, templateId: template.id, level, peakLevel: level, shots: 20, training: {...player.training, completedCourses: 2}, recommendedAt: at + 10,
    rewardCredits: 1, rewardFame: 10, finalValue};
}

it('renders the approved archive with real resources and gives an empty record a clear next step', async () => {
  const state = newGym(at, 17), before = structuredClone(state);
  await mount({state});
  expect(document.querySelector('[aria-label="球馆经营档案"]')).toBeTruthy();
  expect(document.body.textContent).toContain('推荐成果');
  expect(document.body.textContent).toContain('训练与设施');
  expect(document.body.textContent).toContain('收藏足迹');
  expect(document.querySelector('.gm-career-empty')?.textContent).toContain('最高身价纪录');
  expect(document.querySelector('.gm-alumni-list')).toBeNull();
  expect(document.querySelector('[aria-label="最高最终身价球员"]')).toBeNull();
  expect(document.querySelector('.gm-career-facilities')?.textContent).toContain('球馆 Lv.2 开放');
  expect(state).toEqual(before);
});

it('waits for complete cold pages before presenting record totals and chooses the highest value outside the hot array', async () => {
  const state = newGym(at, 17), hot = alumnus('hot', 'starter', '1000'), cold = alumnus('cold', 'legend', '500000');
  state.alumni = [hot];
  state.alumniArchive = {id: 'older', count: 100, effectiveCount: 100, legendCount: 1, bestTier: 5};
  const records = [...Array.from({length: 100}, (_, index) => ({...hot, id: `record-${index}`})), cold];
  let release!: (page: {players: GymAlumnus[]; total: number}) => void;
  const loader = vi.fn((offset = 0, limit = 20) => offset === 0 ? Promise.resolve({players: records.slice(offset, offset + limit), total: records.length})
    : new Promise<{players: GymAlumnus[]; total: number}>(resolve => {release = resolve;}));
  await mount({state, loadAlumni: loader});
  expect(loader.mock.calls.map(call => call[0])).toEqual([0, 100]);
  expect(document.body.textContent).toContain('正在汇总完整球馆档案');
  expect(document.querySelector('.gm-career-recommendations')?.textContent).toContain('—');
  expect(document.querySelector('[aria-label="最高最终身价球员"]')).toBeNull();
  await act(async () => release({players: [cold], total: records.length}));
  await settle();
  expect(document.querySelector('.gm-career-counters')?.textContent).toContain('累计推荐101 人');
  expect(document.querySelector('[aria-label="最高最终身价球员"]')?.getAttribute('data-tier')).toBe('legend');
  expect(document.querySelector('.gm-career-best-value')?.textContent).toContain('$50.00万');
  expect(document.querySelector('.gm-career-facilities')?.textContent).toContain('2,020');
  expect(document.querySelector('.gm-alumni-list')).toBeNull();
});

it.each(['rotation', 'starter', 'star', 'superstar', 'legend'])('uses the actual %s tier for both the final-value record and portrait', async tier => {
  const state = newGym(at, 17), record = alumnus('best', tier, '20000000');
  state.alumni = [record];
  await mount({state});
  const card = document.querySelector('[aria-label="最高最终身价球员"]')!;
  expect(card.getAttribute('data-tier')).toBe(tier);
  expect(card.querySelector('.tier-portrait-frame')?.getAttribute('data-tier')).toBe(tier);
  expect(card.querySelector('.tier-portrait-frame img')).toBeTruthy();
  expect(card.textContent).toContain('最终身价');
  expect(card.textContent).toContain('Lv.25');
});

it('keeps current resources visible through a failed history read and supports retry without showing partial records', async () => {
  const state = newGym(at, 17); state.credits = 86;
  const record = alumnus('best', 'star', '1000000');
  const loader = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue({players: [record], total: 1});
  await mount({state, loadAlumni: loader});
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('请重试');
  expect(document.querySelector('.gm-career-counters')?.textContent).toContain('86');
  expect(document.querySelector('[aria-label="最高最终身价球员"]')).toBeNull();
  const retry = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '重新读取档案')!;
  await act(async () => retry.click());
  await settle();
  expect(loader).toHaveBeenCalledTimes(2);
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(document.querySelector('[aria-label="最高最终身价球员"]')).toBeTruthy();
});

it('honors the saved reduced-motion setting on the dynamic record frames', async () => {
  localStorage.setItem(presentationConfig.preferenceKey, JSON.stringify({version: 1, sound: true, reducedMotion: true}));
  const state = newGym(at, 17); state.alumni = [alumnus('best', 'legend', '1000')];
  await mount({state});
  expect(document.querySelector('.gym-career.reduce-motion')).toBeTruthy();
  expect(document.querySelector('.gm-career-best')?.getAttribute('data-tier')).toBe('legend');
});

it('shows the final player stats and current collection totals instead of the sample design numbers', async () => {
  const state = newGym(at, 17), record = alumnus('best', 'legend', '23350000');
  record.stats = {three: 31, mid: 42, inside: 53, drive: 64, handle: 75, defense: 86};
  state.alumni = [record];
  state.collection = {[record.templateId!]: {firstAt: at, highestRating: 50, highestValue: record.finalValue},
    'removed-template': {firstAt: at, highestRating: 90, highestValue: '1'}};
  state.collectedEquipment = {[equipmentCatalog[0].id]: {firstAt: at}, 'removed-equipment': {firstAt: at}};
  await mount({state});
  const card = document.querySelector('[aria-label="最高最终身价球员"]')!;
  expect(card.querySelector('.career-best-value')?.textContent).toBe('$2,335.00万');
  expect(card.querySelector('.career-best-rating')?.textContent).toBe('★ 综评 58.5');
  expect([...card.querySelectorAll('.career-best-stats > div > b')].map(node => node.textContent)).toEqual(['31', '42', '64', '53', '75', '86']);
  expect(document.querySelector<HTMLProgressElement>('[aria-label="球星收藏进度"]')?.value).toBe(1);
  expect(document.querySelector<HTMLProgressElement>('[aria-label="球星收藏进度"]')?.max).toBe(templateRules.length);
  expect(document.querySelector<HTMLProgressElement>('[aria-label="器材收藏进度"]')?.value).toBe(1);
  expect(document.querySelector<HTMLProgressElement>('[aria-label="器材收藏进度"]')?.max).toBe(equipmentCatalog.length);
});

it('opens the selected star or equipment album from the archive collection cards', async () => {
  const onCollection = vi.fn();
  await mount({state: newGym(at, 17), onCollection});
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="查看球星模板图鉴"]')!.click());
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="查看器材收藏图鉴"]')!.click());
  expect(onCollection.mock.calls).toEqual([[0], [1]]);
});
