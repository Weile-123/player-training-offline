import {describe, expect, it} from 'vitest';
import {equipmentCanonicalIds, equipmentCatalog, equipmentCatalogVersion, previousEquipmentCatalog, legacyEquipmentCatalog, removedEquipmentCatalog} from './catalog';
import {dispatchGym, finishEquipmentMigration, newGym, recoverySeconds, staminaMax, type GymState} from './engine';
import {decodeGym, encodeGym, validGym} from './save';
import {hash} from '../contract/random';

const envelope = (value: unknown) => {
  const payload = JSON.stringify(value);
  return JSON.stringify({format: 'gym-management-envelope-v1', payload, checksum: hash(payload)});
};
function legacy(ids: string[], installed = ids) {
  const state: GymState = {...newGym(1_000, 17), equipmentCatalogVersion: 1, gymLevel: 8, credits: 10};
  state.ownedEquipment = [...ids];
  state.equippedEquipment = [...installed];
  state.purchasePrices = Object.fromEntries(ids.map(id => [id, legacyEquipmentCatalog.find(item => item.id === id)!.price]));
  state.collectedEquipment = Object.fromEntries(ids.map((id, index) => [id, {firstAt: 100 + index * 100}]));
  return state;
}

describe('equipment catalog deduplication', () => {
  it('freezes one earliest-accessible V2 representative of every legacy effect combination', () => {
    expect(legacyEquipmentCatalog).toHaveLength(94);
    expect(previousEquipmentCatalog).toHaveLength(44);
    expect(removedEquipmentCatalog).toHaveLength(50);
    expect(new Set(previousEquipmentCatalog.map(item => JSON.stringify(item.effects))).size).toBe(44);
    for (const previous of legacyEquipmentCatalog) {
      const canonical = previousEquipmentCatalog.find(item => item.id === equipmentCanonicalIds.get(previous.id))!;
      expect(canonical.effects).toEqual(previous.effects);
      expect(canonical.price).toBe(previous.price);
      expect(canonical.unlockLevel).toBeLessThanOrEqual(previous.unlockLevel);
      if (canonical.unlockLevel === previous.unlockLevel) expect(canonical.requiredTemplates).toBeLessThanOrEqual(previous.requiredTemplates);
    }
    expect(newGym(1_000).equipmentCatalogVersion).toBe(equipmentCatalogVersion);
  });

  it('replaces one retired item without charging or refunding its retained asset', () => {
    const removed = removedEquipmentCatalog[0];
    const state = legacy([removed.id]);
    state.purchasePrices[removed.id] = 7;
    const restored = decodeGym(envelope(state))!;
    const canonical = equipmentCanonicalIds.get(removed.id)!;
    expect(restored.ownedEquipment).toEqual([canonical]);
    expect(restored.equippedEquipment).toEqual([canonical]);
    const retainedCost = Math.min(7, equipmentCatalog.find(item => item.id === canonical)!.price);
    expect(restored.purchasePrices).toEqual({[canonical]: retainedCost});
    expect(restored.credits).toBe(10 + 7 - retainedCost);
    expect(restored.collectedEquipment).toEqual({[canonical]: {firstAt: 100}});
    expect(restored.player).toEqual(state.player);
    expect(restored.rng).toEqual(state.rng);
    expect(validGym(restored)).toBe(true);
  });

  it('keeps an installed source ahead of its warehouse representative, refunds duplicate cost exactly once, and keeps the earliest collection', () => {
    const removed = removedEquipmentCatalog[0].id;
    const canonical = equipmentCanonicalIds.get(removed)!;
    const state = legacy([canonical, removed], [removed]);
    state.purchasePrices = {[canonical]: 8, [removed]: 3};
    const restored = decodeGym(envelope(state))!;
    const retainedPrice = Math.min(3, equipmentCatalog.find(item => item.id === canonical)!.price);
    expect(restored.credits).toBe(18 + 3 - retainedPrice);
    expect(restored.ownedEquipment).toEqual([canonical]);
    expect(restored.equippedEquipment).toEqual([canonical]);
    expect(restored.purchasePrices).toEqual({[canonical]: retainedPrice});
    expect(restored.collectedEquipment).toEqual({[canonical]: {firstAt: 100}});
    expect(decodeGym(encodeGym(restored))).toEqual(restored);
    const finished = finishEquipmentMigration(restored);
    const warehouse = dispatchGym(finished, finished.revision, {type: 'unequip', id: canonical}, finished.updatedAt).state;
    const sold = dispatchGym(warehouse, warehouse.revision, {type: 'sell-equipment', id: canonical}, warehouse.updatedAt);
    expect(sold.error).toBeUndefined();
    expect(sold.state.credits).toBe(restored.credits + Math.floor(retainedPrice / 2));
  });

  it('clamps a capacity reduced by duplicate removal without granting refill or altering historical alumni', () => {
    const state = legacy(['relic_003', 'relic_015']);
    state.player!.stamina = 24;
    state.player!.recoveryMs = 10_000;
    state.alumni = [{...state.player!, id: 'old-alumnus', recommendedAt: 1_000, rewardCredits: 0, rewardFame: 0, finalValue: '320'}];
    const restored = finishEquipmentMigration(decodeGym(envelope(state))!);
    expect(restored.player).toMatchObject({stamina: staminaMax(restored), recoveryMs: 0});
    expect(restored.alumni).toEqual(state.alumni);
    const partial = legacy(['relic_003', 'relic_015']);
    partial.player!.stamina = 5;
    expect(decodeGym(envelope(partial))!.player!.stamina).toBe(5);
  });

  it('preserves proportional recovery after removing duplicate recovery items', () => {
    const state = legacy(['relic_017', 'relic_021']);
    state.player!.stamina = 0;
    state.player!.recoveryMs = 9_000;
    const restored = finishEquipmentMigration(decodeGym(envelope(state))!);
    expect(restored.player).toMatchObject({stamina: 0, recoveryMs: recoverySeconds(restored) * 500});
    expect(restored.player!.stats).toEqual(state.player!.stats);
    expect(restored.player!.experience).toBe(state.player!.experience);
  });

  it('uses conservative legacy prices only when the original cost record is absent', () => {
    const state = legacy(['relic_017', 'relic_021']);
    const old = JSON.parse(JSON.stringify(state));
    delete old.purchasePrices;
    delete old.equipmentCatalogVersion;
    const restored = decodeGym(envelope(old))!;
    expect(restored.credits).toBe(12); // both historical costs were 2, one retained
    expect(Object.values(restored.purchasePrices)).toEqual([2]);
    expect(restored.equipmentCatalogVersion).toBe(3);
  });

  it('rejects unknown IDs, invalid versions, damaged prices, current-version retired IDs and overflow refunds', () => {
    const removed = removedEquipmentCatalog[0].id;
    const canonical = equipmentCanonicalIds.get(removed)!;
    const state = legacy([removed]);
    expect(decodeGym(envelope({...state, equipmentCatalogVersion: 99}))).toBeNull();
    expect(decodeGym(envelope({...state, equipmentCatalogVersion: 2}))).toBeNull();
    expect(decodeGym(envelope({...state, purchasePrices: {[removed]: -1}}))).toBeNull();
    expect(decodeGym(envelope({...state, ownedEquipment: ['unknown']}))).toBeNull();
    const overflow = legacy([removed, canonical]);
    overflow.credits = Number.MAX_SAFE_INTEGER;
    expect(decodeGym(envelope(overflow))).toBeNull();
    const fresh = {...newGym(1_000), gymLevel: 8, credits: 100};
    expect(dispatchGym(fresh, fresh.revision, {type: 'buy-equipment', id: removed}, 1_000).error).toBeTruthy();
  });
});
