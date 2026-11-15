import {describe, expect, it} from 'vitest';
import {equipmentCatalog} from './catalog';
import {dispatchGym, newGym, staminaMax, type GymAction, type GymState} from './engine';
import {forecastTraining} from './forecast';
import {equipmentTrainingComparison, previewEquipmentState, previewProjectState, projectTrainingComparison} from './equipmentForecast';

function command(state: GymState, action: GymAction) {
  const result = dispatchGym(state, state.revision, action, state.updatedAt);
  expect(result.error).toBeUndefined();
  return result.state;
}

describe('equipment training comparisons', () => {
  it('matches authoritative capacity removal for every trainee and never refills on reinstall', () => {
    let state = newGym(1_000, 7); state.gymLevel = 2; state.credits = 10;
    state = command(state, {type: 'buy-equipment', id: 'relic_014'});
    state = command(state, {type: 'recruit'});
    state.player!.stamina = staminaMax(state); state.bench[0].stamina = staminaMax(state);
    const before = structuredClone(state), preview = previewEquipmentState(state, 'relic_014')!;
    const actual = command(state, {type: 'unequip', id: 'relic_014'});
    expect(preview.player).toEqual(actual.player);
    expect(preview.bench).toEqual(actual.bench);
    expect(preview.equippedEquipment).toEqual(actual.equippedEquipment);
    expect(preview.player!.stamina).toBe(20);
    expect(preview.bench[0].stamina).toBe(20);
    expect(state).toEqual(before);
    const reinstall = previewEquipmentState(actual, 'relic_014')!;
    expect(staminaMax(reinstall)).toBe(24);
    expect(reinstall.player!.stamina).toBe(20);
    expect(reinstall.bench[0].stamina).toBe(20);
  });

  it('matches real recovery-progress rescaling when replacing a family member', () => {
    let state = newGym(1_000, 7); state.gymLevel = 3; state.credits = 20;
    state = command(state, {type: 'buy-equipment', id: 'relic_002'});
    state.player!.stamina = 0; state.player!.recoveryMs = 9_500;
    const before = structuredClone(state), preview = previewEquipmentState(state, 'relic_042')!;
    const actual = command(state, {type: 'buy-equipment', id: 'relic_042', replaceId: 'relic_002'});
    expect(preview.player).toEqual(actual.player);
    expect(preview.player!.recoveryMs).toBe(9_000);
    expect(preview.equippedEquipment).toEqual(actual.equippedEquipment);
    const comparison = equipmentTrainingComparison(state, 'relic_042');
    expect(comparison.status).toBe('ready');
    expect(comparison.rows[0].beforeMs).toBe(forecastTraining(state, state.player, 25)!.estimatedMs);
    expect(comparison.rows[0].afterMs).toBe(forecastTraining(actual, actual.player, 25)!.estimatedMs);
    expect(state).toEqual(before);
  });

  it('requires an actual replacement in a full gym and compares the selected complete configuration', () => {
    let state = newGym(1_000, 7); state.credits = 100;
    for (const id of ['relic_014', 'relic_002', 'relic_017', 'relic_001']) state = command(state, {type: 'buy-equipment', id});
    expect(equipmentTrainingComparison(state, 'relic_006')).toEqual({status: 'choose-replacement', rows: []});
    expect(previewEquipmentState(state, 'relic_006', 'missing')).toBeNull();
    const comparison = equipmentTrainingComparison(state, 'relic_006', 'relic_014');
    const actual = command(state, {type: 'buy-equipment', id: 'relic_006', replaceId: 'relic_014'});
    expect(comparison.rows[0].afterMs).toBe(forecastTraining(actual, actual.player, 25)!.estimatedMs);
    expect(comparison.rows[0].afterMs).toBeLessThan(comparison.rows[0].beforeMs);
  });

  it('distinguishes level-25 completion, level cap and an empty court without projecting completed goals', () => {
    const state = newGym(1_000, 7);
    state.player!.level = state.player!.peakLevel = 25;
    expect(equipmentTrainingComparison(state, 'relic_006').rows.map(row => row.level)).toEqual([99]);
    state.player!.level = state.player!.peakLevel = 99;
    expect(equipmentTrainingComparison(state, 'relic_006')).toEqual({status: 'ended', rows: []});
    state.player = null;
    expect(equipmentTrainingComparison(state, 'relic_006')).toEqual({status: 'no-player', rows: []});
  });

  it('does not pretend a non-speed effect changes level training time', () => {
    const state = newGym(1_000, 7); state.gymLevel = 2;
    for (const item of equipmentCatalog.filter(item => item.family === 'brand' || item.family === 'offline' || item.family.startsWith('focus-'))) {
      const comparison = equipmentTrainingComparison(state, item.id);
      expect(comparison.rows.every(row => row.beforeMs === row.afterMs), item.id).toBe(true);
    }
  });

  it.each(['endurance', 'recovery', 'automation'] as const)('matches a charged %s project upgrade without refilling stamina', id => {
    let state = newGym(1_000, 7); state.gymLevel = 2; state.credits = 20;
    state = command(state, {type: 'buy-equipment', id: 'relic_002'});
    state.player!.stamina = 0; state.player!.recoveryMs = 9_500;
    state.player!.autoEnabled = true; state.player!.nextShotAt = 3_000;
    const before = structuredClone(state), preview = previewProjectState(state, id)!;
    const comparison = projectTrainingComparison(state, id)!;
    const actual = command(state, {type: 'upgrade-project', id});
    expect(preview.projects).toEqual(actual.projects);
    expect(preview.player).toEqual(actual.player);
    expect(preview.player!.stamina).toBe(0);
    expect(comparison.rows[0].afterMs).toBe(forecastTraining(actual, actual.player, 25)!.estimatedMs);
    expect(state).toEqual(before);
  });

  it('does not quote level-speed improvements for indirect or locked project upgrades', () => {
    const state = newGym(1_000, 7);
    expect(projectTrainingComparison(state, 'automation')).toBeNull();
    for (const id of ['recruitment', 'equipment', 'offline'] as const) expect(projectTrainingComparison(state, id)).toBeNull();
    state.projects.endurance = 8;
    expect(projectTrainingComparison(state, 'endurance')).toBeNull();
  });
});
