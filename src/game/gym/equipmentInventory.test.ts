import {describe, expect, it} from 'vitest';
import {equipmentCatalog, dispatchGym, equipmentSaleValue, legacyEquipmentPurchasePrice, newGym, staminaMax, warehouseEquipment, type GymAction, type GymState} from './engine';
import {decodeGym, encodeGym, gymSaveKeys, readGym, validGym, writeGym, type GymStorage} from './save';
import {hash} from '../contract/random';
import {createGymStore} from '../../gymStore';

const start = 1_000;
const price = (id: string) => equipmentCatalog.find(item => item.id === id)!.price;
const act = (state: GymState, action: GymAction) => {
  const result = dispatchGym(state, state.revision, action, state.updatedAt);
  expect(result.error).toBeUndefined();
  expect(validGym(result.state)).toBe(true);
  return result.state;
};
function filled() {
  let state = {...newGym(start, 17), gymLevel: 2, credits: 100};
  for (const id of ['relic_001', 'relic_002', 'relic_003', 'relic_004']) state = act(state, {type: 'buy-equipment', id});
  return state;
}
function envelope(value: unknown) {
  const payload = JSON.stringify(value);
  return JSON.stringify({format: 'gym-management-envelope-v1', checksum: hash(payload), payload});
}

describe('installed equipment and warehouse transactions', () => {
  it('makes a new purchase active immediately and records the paid price', () => {
    const initial = {...newGym(start, 17), gymLevel: 2, credits: 10};
    const bought = act(initial, {type: 'buy-equipment', id: 'relic_003'});
    expect(bought.credits).toBe(10 - price('relic_003'));
    expect(bought.equippedEquipment).toEqual(['relic_003']);
    expect(bought.purchasePrices).toEqual({relic_003: price('relic_003')});
    expect(staminaMax(bought)).toBe(20);
    expect(bought.player!.stamina).toBe(20);
    expect(warehouseEquipment(bought)).toEqual([]);
  });

  it('requires an explicit valid replacement before charging a full gym', () => {
    const state = filled();
    for (const replaceId of [undefined, 'relic_017', 'relic_006']) {
      const refused = dispatchGym(state, state.revision, {type: 'buy-equipment', id: 'relic_006', replaceId}, start);
      expect(refused.error).toBeTruthy();
      expect(refused.state).toBe(state);
      expect(refused.events).toEqual([]);
    }
    const bought = act(state, {type: 'buy-equipment', id: 'relic_006', replaceId: 'relic_003'});
    expect(bought.credits).toBe(state.credits - price('relic_006'));
    expect(bought.equippedEquipment).toEqual(['relic_001', 'relic_002', 'relic_004', 'relic_006']);
    expect(warehouseEquipment(bought)).toEqual(['relic_003']);
    expect(bought.collectedEquipment.relic_003).toEqual(state.collectedEquipment.relic_003);
  });

  it('reinstalls a warehouse item by replacement without refilling stamina or resetting recovery', () => {
    let state = filled();
    state.player!.stamina = 12;
    state.player!.recoveryMs = 5_000;
    state = act(state, {type: 'buy-equipment', id: 'relic_006', replaceId: 'relic_003'});
    const before = state.credits;
    const reinstalled = act(state, {type: 'equip', id: 'relic_003', replaceId: 'relic_006'});
    expect(reinstalled.credits).toBe(before);
    expect(reinstalled.player).toMatchObject({stamina: 12, recoveryMs: 5_000});
    expect(staminaMax(reinstalled)).toBe(20);
    expect(warehouseEquipment(reinstalled)).toEqual(['relic_006']);
  });

  it('rejects direct sale of installed items and refunds half the recorded odd price from the warehouse', () => {
    let state = filled();
    const installedSale = dispatchGym(state, state.revision, {type: 'sell-equipment', id: 'relic_003'}, start);
    expect(installedSale.state).toBe(state);
    expect(installedSale.error).toContain('替换');
    state = act(state, {type: 'buy-equipment', id: 'relic_006', replaceId: 'relic_003'});
    const refund = Math.floor(price('relic_003') / 2);
    expect(equipmentSaleValue(state, 'relic_003')).toBe(refund);
    const sold = act(state, {type: 'sell-equipment', id: 'relic_003'});
    expect(sold.credits).toBe(state.credits + refund);
    expect(sold.ownedEquipment).not.toContain('relic_003');
    expect(sold.purchasePrices).not.toHaveProperty('relic_003');
    expect(sold.collectedEquipment.relic_003).toEqual(state.collectedEquipment.relic_003);
    expect(dispatchGym(sold, sold.revision, {type: 'sell-equipment', id: 'relic_003'}, start).state).toBe(sold);
    expect(equipmentSaleValue(sold, 'relic_003')).toBe(0);
    const rebought = act(sold, {type: 'buy-equipment', id: 'relic_003', replaceId: 'relic_006'});
    expect(rebought.purchasePrices.relic_003).toBe(price('relic_003'));
    expect(rebought.collectedEquipment.relic_003).toEqual(state.collectedEquipment.relic_003);
    expect(rebought.credits).toBe(state.credits + refund - price('relic_003'));
  });

  it('never refunds the increased current shop price for an older cheap purchase', () => {
    let state = filled();
    state.purchasePrices.relic_002 = 1;
    state = act(state, {type: 'buy-equipment', id: 'relic_006', replaceId: 'relic_002'});
    expect(equipmentSaleValue(state, 'relic_002')).toBe(0);
    const sold = act(state, {type: 'sell-equipment', id: 'relic_002'});
    expect(sold.credits).toBe(state.credits);
  });
});

describe('equipment payment provenance in saves', () => {
  it('migrates a wholly missing old purchase ledger conservatively without installing old warehouse items', () => {
    const current = filled();
    const old = JSON.parse(JSON.stringify(current));
    old.equippedEquipment = old.equippedEquipment.filter((id: string) => id !== 'relic_002');
    delete old.purchasePrices;
    delete old.equipmentCatalogVersion;
    const restored = decodeGym(envelope(old))!;
    expect(restored.purchasePrices).toEqual({relic_001: 2, relic_002: 1, relic_003: 2, relic_004: 1});
    expect(warehouseEquipment(restored)).toEqual(['relic_002']);
    expect(restored.equippedEquipment).toEqual(old.equippedEquipment);
    expect(restored.collectedEquipment).toEqual(current.collectedEquipment);
    expect(equipmentSaleValue(restored, 'relic_003')).toBe(1);
    expect(legacyEquipmentPurchasePrice('relic_037')).toBe(4);
    expect(legacyEquipmentPurchasePrice('relic_085')).toBe(8);
    expect(decodeGym(encodeGym(restored))).toEqual(restored);
  });

  it('rejects missing, extraneous, negative, fractional or zero current payment records', () => {
    const state = filled();
    for (const purchasePrices of [{}, {...state.purchasePrices, relic_099: 2}, {...state.purchasePrices, relic_001: -1},
      {...state.purchasePrices, relic_001: 1.5}, {...state.purchasePrices, relic_001: 0}]) {
      expect(validGym({...state, purchasePrices})).toBe(false);
      expect(decodeGym(envelope({...state, purchasePrices}))).toBeNull();
    }
    expect(decodeGym(envelope({...state, purchasePrices: null}))).toBeNull();
  });
});

describe('equipment sale persistence', () => {
  it('retains a warehouse item on failed save, then serializes two concurrent sales into one refund', async () => {
    const data = new Map<string, string>();
    let failMain = false;
    const storage: GymStorage = {
      getItem: key => data.get(key) ?? null,
      setItem: (key, value) => { if (failMain && key === gymSaveKeys.main) throw new Error('quota'); data.set(key, value); },
    };
    const state = act(filled(), {type: 'buy-equipment', id: 'relic_006', replaceId: 'relic_003'});
    expect(writeGym(storage, state).ok).toBe(true);
    const first = createGymStore(storage, 17, () => start);
    const second = createGymStore(storage, 17, () => start);
    failMain = true;
    expect((await first.getState().act({type: 'sell-equipment', id: 'relic_003'})).error).toBe('save-failed');
    expect(readGym(storage).state!.ownedEquipment).toContain('relic_003');
    expect(first.getState().state.credits).toBe(state.credits);
    failMain = false;
    const results = await Promise.all([first.getState().act({type: 'sell-equipment', id: 'relic_003'}), second.getState().act({type: 'sell-equipment', id: 'relic_003'})]);
    expect(results.filter(result => !result.error)).toHaveLength(1);
    const saved = readGym(storage).state!;
    expect(saved.credits).toBe(state.credits + equipmentSaleValue(state, 'relic_003'));
    expect(saved.ownedEquipment).not.toContain('relic_003');
    expect(saved.collectedEquipment.relic_003).toBeTruthy();
  });
});
