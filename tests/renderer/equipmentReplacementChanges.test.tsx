import {expect, it} from 'vitest';
import {newGym, type GymState} from '../../src/game/gym/engine';
import {equipmentReplacementChanges} from '../../src/presentation/equipmentReplacementChanges';

const at = 1_800_000_000_000;
function install(state: GymState, ids: string[]) {
  state.ownedEquipment = [...ids];
  state.equippedEquipment = [...ids];
}

it('previews only actual changes including stamina loss for every affected athlete, without mutating the save', () => {
  const state = newGym(at, 18);
  state.player!.stamina = 24;
  state.bench = [{...state.player!, id: 'bench', name: '另一名球员', stamina: 22}];
  install(state, ['relic_014', 'relic_002', 'relic_017', 'relic_001']);
  const before = structuredClone(state);
  const changes = equipmentReplacementChanges(state, 'relic_006', 'relic_014')!;
  expect(changes.map(change => change.id)).toEqual(['stamina-cap', `stamina-${state.player!.id}`, 'stamina-bench', 'experience']);
  expect(changes[0]).toMatchObject({before: '24 点', after: '20 点', direction: 'down'});
  expect(changes.find(change => change.id === 'stamina-bench')).toMatchObject({label: '另一名球员体力', before: '22 点', after: '20 点', direction: 'down'});
  expect(changes.at(-1)).toMatchObject({id: 'experience', before: '0', after: '1', direction: 'up'});
  expect(state).toEqual(before);
});

it('colors numeric decreases as decreases even when a shorter recovery interval is useful', () => {
  const state = newGym(at, 19);
  state.gymLevel = 3;
  install(state, ['relic_002']);
  const changes = equipmentReplacementChanges(state, 'relic_042', 'relic_002')!;
  expect(changes).toHaveLength(1);
  expect(changes[0]).toMatchObject({id: 'recovery', before: '19 秒/点', after: '18 秒/点', direction: 'down'});
});

it('includes real automatic, offline, cooperation, brand and specialty changes but excludes unchanged values', () => {
  const state = newGym(at, 20);
  state.gymLevel = 8;
  state.projects.offline = 5;
  for (const [oldId, newId, key, before, after] of [
    ['relic_007', 'relic_087', 'automation-experience', '1', '3'],
    ['relic_028', 'relic_077', 'offline-limit', '195 分钟', '240 分钟'],
    ['relic_003', 'relic_079', 'cooperation', '1 券', '2 券'],
    ['relic_024', 'relic_096', 'focus-three', '0.4', '1.2'],
  ]) {
    install(state, [oldId]);
    expect(equipmentReplacementChanges(state, newId, oldId)).toEqual([
      expect.objectContaining({id: key, before, after, direction: 'up'}),
    ]);
  }
  install(state, ['relic_001']);
  const brand = equipmentReplacementChanges(state, 'relic_045', 'relic_001')!;
  expect(brand.map(change => change.id)).toEqual(['brand', 'value-percent', `value-${state.player!.id}`]);
  expect(brand.find(change => change.id === 'brand')).toMatchObject({before: '10%', after: '25%', direction: 'up'});
  expect(brand.find(change => change.id.startsWith('value-') && change.id !== 'value-percent')).toMatchObject({before: '$352.00', after: '$400.00', direction: 'up'});
});

it('refuses invalid and unrelated same-family replacement targets', () => {
  const state = newGym(at, 21);
  install(state, ['relic_014', 'relic_002']);
  expect(equipmentReplacementChanges(state, 'relic_034', 'relic_002')).toBeNull();
  expect(equipmentReplacementChanges(state, 'relic_006', 'missing')).toBeNull();
});
