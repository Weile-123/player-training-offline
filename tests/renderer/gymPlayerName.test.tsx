import {afterEach, beforeEach, expect, it} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {newGym} from '../../src/game/gym/engine';
import {type OfflineTrainingReport} from '../../src/game/gym/offline';
import {templateById} from '../../src/game/templates';
import {gymPlayerName} from '../../src/presentation/gymPlayerName';
import {equipmentReplacementChanges} from '../../src/presentation/equipmentReplacementChanges';
import {GymOfflineReport, GymRosterPanel, GymTrainingPanel} from '../../src/components/GymPanels';

let root: Root | null = null;
beforeEach(() => {Object.defineProperty(document, 'fonts', {configurable: true, value: {ready: Promise.resolve()}});});
afterEach(() => {if (root) act(() => root!.unmount()); root = null;});
async function mount(content: Parameters<Root['render']>[0]) {
  root = createRoot(document.getElementById('root')!);
  await act(async () => root!.render(content));
}

it.each(['新秀 5', '新秀3', ' 新秀 三 ', '新秀二十一', '新秀００５', '新秀〇六'])('hides the generated legacy name %s without changing the saved value', name => {
  const player = {name, templateId: null};
  expect(gymPlayerName(player)).toBe('待发掘球员');
  expect(player.name).toBe(name);
});

it('uses the unlocked template name and preserves genuine custom names for undiscovered players', () => {
  expect(gymPlayerName({name: '新秀 5', templateId: 'caruso'})).toBe(templateById('caruso')!.name);
  expect(gymPlayerName({name: '  林小川 ', templateId: null})).toBe('林小川');
  expect(gymPlayerName({name: '新秀队长', templateId: 'missing-template'})).toBe('新秀队长');
  expect(gymPlayerName({name: '  '})).toBe('待发掘球员');
});

it('cleans old roster labels and keeps same-name trainees distinguishable through their training positions', async () => {
  const state = newGym(1_800_000_000_000, 12);
  state.gymLevel = 2;
  state.player!.name = '新秀 5';
  state.bench = [{...structuredClone(state.player!), id: 'second', name: '新秀三'}];
  const before = structuredClone(state);
  await mount(<GymRosterPanel state={state} onAction={() => {}}/>);
  expect(document.body.textContent).not.toMatch(/新秀\s*[5三]/u);
  expect(document.body.innerHTML).not.toMatch(/新秀\s*[5三]/u);
  const labels = [...document.querySelectorAll('[role="switch"]')].map(control => control.getAttribute('aria-label'));
  expect(new Set(labels).size).toBe(2);
  expect(labels.every(label => label?.startsWith('待发掘球员'))).toBe(true);
  expect(labels[0]).toContain('训练位1');
  expect(labels[1]).toContain('训练位2');
  expect(state).toEqual(before);
});

it('renders an old offline report with actual templates and a safe undiscovered fallback', async () => {
  const report: OfflineTrainingReport = {
    from: 1, to: 10_001, elapsedMs: 10_000, creditedMs: 10_000, capMs: 1_800_000, capped: false,
    totalShots: 2, totalExperience: 24,
    players: [
      {id: 'first', name: '新秀 5', shots: 1, xpGained: 12, levelBefore: 0, levelAfter: 1, staminaBefore: 20, staminaAfter: 19, templateBefore: null, templateAfter: 'caruso', courses: 0},
      {id: 'second', name: '新秀三', shots: 1, xpGained: 12, levelBefore: 0, levelAfter: 1, staminaBefore: 20, staminaAfter: 19, templateBefore: null, templateAfter: null, courses: 0},
    ],
  };
  await mount(<GymOfflineReport report={report} onClose={() => {}}/>);
  const names = [...document.querySelectorAll('.gm-offline-players h3')].map(heading => heading.textContent);
  expect(names).toEqual([templateById('caruso')!.name, '待发掘球员']);
  expect(report.players.map(player => player.name)).toEqual(['新秀 5', '新秀三']);
});

it('does not leak a generated name through training or affected-bench change labels', async () => {
  const state = newGym(1_800_000_000_000, 13);
  state.player!.name = '新秀 5';
  state.bench = [{...structuredClone(state.player!), id: 'second', name: '新秀三', stamina: 24}];
  state.ownedEquipment = state.equippedEquipment = ['relic_014'];
  await mount(<GymTrainingPanel state={state} onAction={() => {}}/>);
  expect(document.querySelector('.gm-training-player')?.textContent).toContain('待发掘球员');
  expect(document.body.innerHTML).not.toMatch(/新秀\s*[5三]/u);
  const changes = equipmentReplacementChanges(state, 'relic_006', 'relic_014')!;
  expect(changes.find(change => change.id === 'stamina-second')?.label).toBe('待发掘球员体力');
});
