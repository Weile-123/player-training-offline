import {describe, expect, it} from 'vitest';
import {hash} from './game/contract/random';
import {newGym} from './game/gym/engine';
import {gymSaveKeys, readGym, type GymStorage} from './game/gym/save';
import {createGymStore} from './gymStore';

function oldPort(offlineSupported = true) {
  const state = JSON.parse(JSON.stringify(newGym(1_000, 17)));
  state.equipmentCatalogVersion = 2;
  state.gymLevel = 2;
  state.ownedEquipment = ['relic_028'];
  state.equippedEquipment = ['relic_028'];
  state.purchasePrices = {relic_028: 2};
  state.collectedEquipment = {relic_028: {firstAt: 1_000}};
  state.player.stamina = 22;
  state.player.autoEnabled = true;
  state.player.nextShotAt = 1_000;
  delete state.player.equipmentTraining;
  if (!offlineSupported) delete state.offlineRulesVersion;
  const payload = JSON.stringify(state);
  const data = new Map([[gymSaveKeys.main, JSON.stringify({format: 'gym-management-envelope-v1', payload, checksum: hash(payload)})]]);
  const port: GymStorage = {getItem: key => data.get(key) ?? null, setItem: (key, value) => {data.set(key, value);}};
  return {port, data};
}

describe('equipment migration store commit', () => {
  it('does not extend an existing absence with a newly changed offline item and does not replay it after reload', async () => {
    const {port} = oldPort();
    const now = 1_000 + 40 * 60_000;
    const store = createGymStore(port, 17, () => now);
    expect(store.getState().state.pendingLegacyEquipmentEffects).toBeDefined();
    const result = await store.getState().resume();
    expect(result.error).toBeUndefined();
    expect(store.getState().pendingOfflineReport!.creditedMs).toBe(30 * 60_000);
    expect(result.state.pendingLegacyEquipmentEffects).toBeUndefined();
    expect(readGym(port).state).toEqual(result.state);
    const reloaded = createGymStore(port, 17, () => now);
    await reloaded.getState().resume();
    expect(reloaded.getState().state.player!.shots).toBe(result.state.player!.shots);
    expect(reloaded.getState().pendingOfflineReport).toBeNull();
  });

  it('consumes the migration before the online idle throttle can skip it', async () => {
    const {port} = oldPort();
    const store = createGymStore(port, 17, () => 1_200);
    store.setState({isSuspended: false});
    const result = await store.getState().tick();
    expect(result.error).toBeUndefined();
    expect(result.state.pendingLegacyEquipmentEffects).toBeUndefined();
    expect(readGym(port).state!.pendingLegacyEquipmentEffects).toBeUndefined();
    expect(result.state.player!.shots).toBe(1);
  });

  it('preserves the no-retroactive-training boundary for saves from before offline support', async () => {
    const {port} = oldPort(false);
    const store = createGymStore(port, 17, () => 1_000 + 30 * 60_000);
    const result = await store.getState().resume();
    expect(result.error).toBeUndefined();
    expect(result.state.pendingLegacyEquipmentEffects).toBeUndefined();
    expect(result.state.offlineRulesVersion).toBe(2);
    expect(result.state.player!.shots).toBe(0);
    expect(store.getState().pendingOfflineReport).toBeNull();
  });
});
