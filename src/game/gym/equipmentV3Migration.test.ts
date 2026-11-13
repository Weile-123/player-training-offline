import {describe, expect, it} from 'vitest';
import {hash} from '../contract/random';
import {equipmentCatalog, previousEquipmentCatalog, legacyEquipmentCatalog} from './catalog';
import {dispatchGym, finishEquipmentMigration, newGym, recoverySeconds, staminaMax, type GymState} from './engine';
import {offlineLimitMs, settleOfflineGym} from './offline';
import {decodeGym, encodeGym, validGym} from './save';

function envelope(value: unknown) {
  const payload = JSON.stringify(value);
  return JSON.stringify({format: 'gym-management-envelope-v1', payload, checksum: hash(payload)});
}

function previous(ids: string[], installed = ids) {
  const state: GymState = {...newGym(1_000, 17), equipmentCatalogVersion: 2, gymLevel: 8, credits: 10};
  state.projects.equipment = 4;
  state.ownedEquipment = [...ids];
  state.equippedEquipment = [...installed];
  state.purchasePrices = Object.fromEntries(ids.map(id => [id, previousEquipmentCatalog.find(item => item.id === id)!.price]));
  state.collectedEquipment = Object.fromEntries(ids.map((id, index) => [id, {firstAt: 100 + index * 100}]));
  const raw = JSON.parse(JSON.stringify(state));
  delete raw.player.equipmentTraining;
  return raw;
}

describe('equipment catalog V3 save compatibility', () => {
  it('refunds deleted assets and historical overpayment exactly once without charging for price increases', () => {
    const old = previous(['relic_002', 'relic_006', 'relic_075']);
    old.purchasePrices.relic_002 = 1; // A historically cheaper purchase remains cheaper.
    old.purchasePrices.relic_006 = 20; // Ledger cost, not a newly computed refund baseline.
    const current006 = equipmentCatalog.find(item => item.id === 'relic_006')!;
    const restored = decodeGym(envelope(old))!;
    expect(restored).not.toBeNull();
    expect(restored.equipmentCatalogVersion).toBe(3);
    expect(restored.ownedEquipment).toEqual(['relic_002', 'relic_006']);
    expect(restored.purchasePrices).toEqual({relic_002: 1, relic_006: current006.price});
    expect(restored.credits).toBe(10 + old.purchasePrices.relic_075 + 20 - current006.price);
    expect(restored.collectedEquipment).not.toHaveProperty('relic_075');
    expect(restored.legacyEquipmentCollection).toEqual(old.collectedEquipment);
    const committed = finishEquipmentMigration(restored);
    expect(decodeGym(encodeGym(committed))).toEqual(committed);
    const warehouse = dispatchGym(committed, committed.revision, {type: 'unequip', id: 'relic_006'}, committed.updatedAt).state;
    const sold = dispatchGym(warehouse, warehouse.revision, {type: 'sell-equipment', id: 'relic_006'}, warehouse.updatedAt);
    expect(sold.error).toBeUndefined();
    expect(sold.state.credits - warehouse.credits).toBe(Math.floor(current006.price / 2));
  });

  it('keeps only the highest installed family grade active while preserving lower-grade ownership and prices', () => {
    const old = previous(['relic_017', 'relic_037', 'relic_085']);
    const restored = decodeGym(envelope(old))!;
    expect(restored.ownedEquipment).toEqual(old.ownedEquipment);
    expect(restored.equippedEquipment).toEqual(['relic_085']);
    expect(restored.collectedEquipment).toEqual(old.collectedEquipment);
    expect(Object.keys(restored.purchasePrices)).toEqual(old.ownedEquipment);
    expect(validGym(restored)).toBe(true);
    expect(validGym({...finishEquipmentMigration(restored), equippedEquipment: ['relic_017', 'relic_037']})).toBe(false);
  });

  it('archives a sold retired collection entry without refunding an item no longer owned', () => {
    const old = previous([]);
    old.collectedEquipment = {relic_075: {firstAt: 100}};
    const restored = decodeGym(envelope(old))!;
    expect(restored.credits).toBe(10);
    expect(restored.ownedEquipment).toEqual([]);
    expect(restored.collectedEquipment).toEqual({});
    expect(restored.legacyEquipmentCollection).toEqual(old.collectedEquipment);
  });

  it('initializes historical brand attribution without granting cooperation eligibility or changing posted rewards', () => {
    const old = previous(['relic_006']);
    old.player.shots = 40;
    old.player.training.completedCourses = 4;
    old.player.cooperation = {id: old.player.id + ':basic', playerId: old.player.id, acceptedShots: 0, acceptedCourses: 0};
    old.alumni = [{...old.player, id: 'old-p2', cooperation: null, recommendedAt: 1_000,
      rewardCredits: 18, rewardFame: 500, finalValue: '50000'}];
    const restored = decodeGym(envelope(old))!;
    expect(restored.player!.equipmentTraining).toEqual({brandTotal: 400, brandShots: 40, cooperationCourses: [0, 0], cooperationCourseShots: [0, 0]});
    expect(restored.alumni[0]).toMatchObject({rewardCredits: 18, rewardFame: 500, finalValue: '50000',
      equipmentTraining: {brandTotal: 400, brandShots: 40, cooperationCourses: [0, 0], cooperationCourseShots: [0, 0]}});
    expect(restored.player!.stats).toEqual(old.player.stats);
    expect(restored.rng).toEqual(old.rng);
  });

  it('finishes a no-elapsed migration without refilling stamina and preserves the fractional recovery progress', () => {
    const old = previous(['relic_002']);
    old.player.stamina = 3;
    old.player.recoveryMs = 9_500; // Half the old nineteen-second recovery interval.
    const restored = decodeGym(envelope(old))!;
    expect(restored.pendingLegacyEquipmentEffects).toMatchObject({recovery: 1, valuePercent: 10,
      experience: 0, automationExperience: 0, offlineMinutes: 0});
    const finished = settleOfflineGym(restored, restored.updatedAt).state;
    expect(finished.pendingLegacyEquipmentEffects).toBeUndefined();
    expect(finished.player!.stamina).toBe(3);
    expect(finished.player!.recoveryMs).toBe(Math.floor(recoverySeconds(finished) * 1_000 / 2));
    expect(finished.player!.stats).toEqual(old.player.stats);
    expect(restored.pendingLegacyEquipmentEffects).toBeDefined(); // Pure transition.
  });

  it('settles the old absence with old effects, then activates the new item effects only for later absences', () => {
    const old = previous(['relic_087']);
    old.player.autoEnabled = true;
    old.player.stamina = 20;
    old.player.nextShotAt = 1_000;
    const restored = decodeGym(envelope(old))!;
    // 087 used to be recovery+3/cooperation+2; V3 uses its art for automatic XP.
    expect(restored.pendingLegacyEquipmentEffects).toMatchObject({recovery: 3, cooperationBonus: 2, automationExperience: 0});
    const absent = settleOfflineGym(restored, 61_000);
    const control = JSON.parse(JSON.stringify(restored)) as GymState;
    control.ownedEquipment = [];
    control.equippedEquipment = [];
    control.purchasePrices = {};
    control.collectedEquipment = {};
    const oldControl = settleOfflineGym(control, 61_000);
    expect(absent.report!.totalShots).toBe(oldControl.report!.totalShots);
    expect(absent.report!.totalExperience).toBe(oldControl.report!.totalExperience);
    expect(absent.state.pendingLegacyEquipmentEffects).toBeUndefined();
    expect(absent.state.player!.stamina).toBeLessThanOrEqual(staminaMax(absent.state));
    const next = settleOfflineGym(absent.state, 121_000);
    const withoutNewGear = {...absent.state, ownedEquipment: [], equippedEquipment: [], purchasePrices: {}, collectedEquipment: {}};
    const nextControl = settleOfflineGym(withoutNewGear, 121_000);
    expect(next.report!.totalExperience).toBeGreaterThan(nextControl.report!.totalExperience);
  });

  it('does not extend an old absence with a newly repurposed offline item, and caps new offline equipment at four hours', () => {
    const old = previous(['relic_077']);
    old.player.autoEnabled = true;
    const restored = decodeGym(envelope(old))!;
    expect(offlineLimitMs(restored)).toBe(30 * 60_000);
    const first = settleOfflineGym(restored, 1_000 + 120 * 60_000);
    expect(first.report!.creditedMs).toBe(30 * 60_000);
    expect(offlineLimitMs(first.state)).toBe(90 * 60_000);
    first.state.projects.offline = 5;
    expect(offlineLimitMs(first.state)).toBe(240 * 60_000);
  });

  it('removes the pending snapshot in recovery-only and empty-roster branches too', () => {
    const old = previous(['relic_075']);
    old.player.stamina = 27;
    const restored = decodeGym(envelope(old))!;
    const noAuto = settleOfflineGym(restored, 2_000).state;
    expect(noAuto.pendingLegacyEquipmentEffects).toBeUndefined();
    expect(noAuto.player!.stamina).toBe(staminaMax(noAuto));
    const empty = {...restored, player: null, bench: []};
    expect(settleOfflineGym(empty, 2_000).state.pendingLegacyEquipmentEffects).toBeUndefined();
    expect(settleOfflineGym(restored, 2_000, 0).state.pendingLegacyEquipmentEffects).toBeUndefined();
  });

  it('retains the legacy94 deduplication refund before applying V3 removal and price adjustment', () => {
    const old = previous([]);
    old.equipmentCatalogVersion = 1;
    old.ownedEquipment = ['relic_017', 'relic_021'];
    old.equippedEquipment = ['relic_021'];
    old.purchasePrices = {relic_017: 8, relic_021: 3};
    old.collectedEquipment = {relic_017: {firstAt: 100}, relic_021: {firstAt: 200}};
    const restored = decodeGym(envelope(old))!;
    const currentPrice = equipmentCatalog.find(item => item.id === 'relic_017')!.price;
    expect(restored.ownedEquipment).toEqual(['relic_017']);
    expect(restored.credits).toBe(18 + Math.max(0, 3 - currentPrice));
    expect(restored.purchasePrices.relic_017).toBe(Math.min(3, currentPrice));
    expect(restored.collectedEquipment).toEqual({relic_017: {firstAt: 100}});
    expect(restored.legacyEquipmentCollection).toEqual(old.collectedEquipment);
    expect(legacyEquipmentCatalog).toHaveLength(94);
    expect(previousEquipmentCatalog).toHaveLength(44);
  });

  it('adds only the missing partial-course field to an early V3 save without awarding course qualification', () => {
    const current = JSON.parse(JSON.stringify(newGym(1_000, 17)));
    delete current.player.equipmentTraining.cooperationCourseShots;
    expect(validGym(current)).toBe(false);
    const restored = decodeGym(envelope(current))!;
    expect(restored.player!.equipmentTraining).toEqual({brandTotal: 0, brandShots: 0,
      cooperationCourses: [0, 0], cooperationCourseShots: [0, 0]});
    current.player.equipmentTraining.cooperationCourseShots = null;
    expect(decodeGym(envelope(current))).toBeNull();
  });

  it('rejects damaged attribution, unsupported markers, hidden retired IDs, and overflowing refund totals', () => {
    const current = finishEquipmentMigration(decodeGym(envelope(previous([])))!);
    expect(validGym({...current, player: {...current.player!, equipmentTraining: {brandTotal: 1, brandShots: 0, cooperationCourses: [0, 0], cooperationCourseShots: [0, 0]}}})).toBe(false);
    expect(validGym({...current, player: {...current.player!, equipmentTraining: {brandTotal: 0, brandShots: 0, cooperationCourses: [0, 1], cooperationCourseShots: [0, 0]}}})).toBe(false);
    expect(validGym({...current, player: {...current.player!, equipmentTraining: {brandTotal: 0, brandShots: 0, cooperationCourses: [0, 0], cooperationCourseShots: [1, 0]}}})).toBe(false);
    const corrupt = JSON.parse(JSON.stringify(current));
    delete corrupt.player.equipmentTraining;
    expect(decodeGym(envelope(corrupt))).toBeNull();
    const pending = decodeGym(envelope(previous([])))!;
    pending.pendingLegacyEquipmentEffects!.automationExperience = 1;
    expect(decodeGym(envelope(pending))).toBeNull();
    expect(decodeGym(envelope({...previous([]), equipmentCatalogVersion: 4}))).toBeNull();
    const retiredV2 = previous([]);
    retiredV2.ownedEquipment = ['relic_021'];
    retiredV2.purchasePrices = {relic_021: 3};
    retiredV2.collectedEquipment = {relic_021: {firstAt: 100}};
    expect(decodeGym(envelope(retiredV2))).toBeNull();
    const overflow = previous(['relic_075']);
    overflow.credits = Number.MAX_SAFE_INTEGER;
    expect(decodeGym(envelope(overflow))).toBeNull();
  });
});
