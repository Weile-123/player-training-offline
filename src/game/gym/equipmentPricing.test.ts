import {describe, expect, it} from 'vitest';
import {equipmentCatalog, equipmentFamilyLabels} from './catalog';
import {legacyEquipmentCatalog} from './equipmentLegacy';
import {shopCatalog} from '../contract/commerce';
import {equipmentArtIds} from './equipmentArt';
import {statKeys} from '../types';

describe('explicit V3 equipment progression', () => {
  it('covers each training/business role without duplicate effects or missing art', () => {
    const art = new Set(legacyEquipmentCatalog.map(item => item.id));
    expect(equipmentCatalog).toHaveLength(35);
    expect(new Set(equipmentCatalog.map(item => item.id)).size).toBe(equipmentCatalog.length);
    expect(new Set(equipmentCatalog.map(item => item.artId)).size).toBe(equipmentCatalog.length);
    expect(Object.keys(equipmentArtIds).sort()).toEqual(equipmentCatalog.map(item => item.id).sort());
    expect(new Set(equipmentCatalog.map(item => JSON.stringify(item.effects))).size).toBe(equipmentCatalog.length);
    expect(new Set(equipmentCatalog.map(item => item.family)).size).toBe(Object.keys(equipmentFamilyLabels).length);
    for (const item of equipmentCatalog) {
      expect(art.has(item.artId), `${item.id}: reusable original art`).toBe(true);
      expect(item.name, `${item.id}: original name/image pair`).toBe(shopCatalog.find(original => original.id === item.artId)!.name);
      expect(item.price).toBeGreaterThan(0);
      expect(item.price).toBeLessThanOrEqual(36);
      expect(item.requiredTemplates).toBeLessThanOrEqual(8);
    }
  });

  it('keeps tier prices and effects increasing within each family', () => {
    const fields = ['stamina', 'recovery', 'courseRecovery', 'experience', 'automationExperience', 'offlineMinutes', 'valuePercent', 'cooperationBonus', 'focusPower'] as const;
    for (const family of Object.keys(equipmentFamilyLabels)) {
      const tiers = equipmentCatalog.filter(item => item.family === family).sort((a, b) => a.grade - b.grade);
      for (let i = 1; i < tiers.length; i++) {
        const before = tiers[i - 1], after = tiers[i];
        expect(after.price, family).toBeGreaterThan(before.price);
        expect(after.unlockLevel, family).toBeGreaterThanOrEqual(before.unlockLevel);
        expect(fields.filter(field => after.effects[field] > before.effects[field]), family).toHaveLength(1);
        expect(fields.every(field => after.effects[field] >= before.effects[field]), family).toBe(true);
      }
    }
  });

  it('charges less for automatic-only experience than the same all-mode experience', () => {
    for (const item of equipmentCatalog.filter(item => item.family === 'automation')) {
      const allMode = equipmentCatalog.find(other => other.family === 'experience' && other.grade === item.grade)!;
      expect(item.effects.automationExperience).toBe(allMode.effects.experience);
      expect(item.price).toBeLessThan(allMode.price);
    }
  });

  it('gives all six attribute directions identical access and price', () => {
    for (const grade of [1, 3]) {
      const focus = statKeys.map(key => equipmentCatalog.find(item => item.family === `focus-${key}` && item.grade === grade)!);
      expect(focus.every(Boolean)).toBe(true);
      expect(new Set(focus.map(item => [item.price, item.unlockLevel, item.requiredTemplates, item.effects.focusPower].join(':'))).size).toBe(1);
    }
  });

  it('leaves affordable entry options without separate unlock charges', () => {
    const starters = equipmentCatalog.filter(item => item.unlockLevel === 1);
    expect(starters.length).toBeGreaterThanOrEqual(4);
    expect(starters.some(item => item.price === 2)).toBe(true);
    expect(starters.every(item => item.requiredTemplates === 0)).toBe(true);
    expect(equipmentCatalog.reduce((sum, item) => sum + item.price, 0)).toBe(328);
  });
});
