import {describe, expect, it} from 'vitest';
import {projects, type ProjectId} from './catalog';
import {
  dispatchGym, equipmentEffects, equipmentOffer, newGym, projectCost, projectOffer,
  recoverySeconds, trainingShotExperience, type GymAction, type GymState,
} from './engine';
import {decodeGym, encodeGym, validGym} from './save';
import {nbaTemplates} from '../templates';

const schedules: Record<ProjectId, number[]> = {
  endurance: [1, 2, 3, 5, 7, 10, 14, 20],
  recovery: [1, 2, 4, 6, 11, 19, 35, 62, 65, 69, 74, 80],
  recruitment: [2, 4, 7, 10, 14, 20, 24, 29, 35, 42, 50, 59],
  equipment: [2, 4, 7, 12],
  automation: [3, 6, 10, 18, 32],
  offline: [2, 4, 7, 12, 21, 26, 32, 40],
};

function fixture(gymLevel = 8): GymState {
  const state = {...newGym(1_000, 17), gymLevel, credits: 1_000};
  state.collection = Object.fromEntries(nbaTemplates.slice(0, 8).map(template => [template.id,
    {firstAt: 1_000, highestRating: 0, highestValue: '0'}]));
  return state;
}

function command(state: GymState, action: GymAction): GymState {
  const result = dispatchGym(state, state.revision, action, state.updatedAt);
  expect(result.error).toBeUndefined();
  return result.state;
}

function priorPriceSave(gymLevel = 6): GymState {
  const state = fixture(gymLevel);
  state.credits = 37;
  state.projects.endurance = 6;
  state.projects.recruitment = 5;
  state.ownedEquipment = ['relic_078', 'relic_085', 'relic_081'];
  state.equippedEquipment = [...state.ownedEquipment];
  state.purchasePrices = {relic_078: 20, relic_085: 24, relic_081: 20};
  state.collectedEquipment = Object.fromEntries(state.ownedEquipment.map(id => [id, {firstAt: 1_000}]));
  return state;
}

describe('November economy price and gate adjustment', () => {
  it('charges the published price for every tier through the extended project caps', () => {
    let state = {...fixture(), credits: 2_000};
    const initialCredits = state.credits;
    for (const project of projects) {
      const prices = schedules[project.id];
      expect(prices).toHaveLength(project.maxLevel);
      for (let index = 0; index < prices.length; index++) {
        expect(projectCost(project.id, index + 1)).toBe(prices[index]);
        expect(projectOffer(state, project.id).price).toBe(prices[index]);
        const previous = state;
        state = command(state, {type: 'upgrade-project', id: project.id});
        expect(previous.credits - state.credits).toBe(prices[index]);
        expect(state.projects[project.id]).toBe(index + 1);
      }
      const capped = dispatchGym(state, state.revision, {type: 'upgrade-project', id: project.id}, state.updatedAt);
      expect(capped.error).toBe('项目已达到最高等级');
      expect(capped.state).toBe(state);
    }
    expect(initialCredits - state.credits).toBe(1_024);
    expect(recoverySeconds(state)).toBe(8);
    expect(validGym(state)).toBe(true);
    expect(decodeGym(encodeGym(state))).toEqual(state);
  });

  it('does not bypass the gym cap or spend an old exponential price for a discounted endurance tier', () => {
    const locked = fixture(5);
    locked.projects.endurance = 5;
    const rejected = dispatchGym(locked, locked.revision, {type: 'upgrade-project', id: 'endurance'}, locked.updatedAt);
    expect(rejected.error).toBe('升级球馆后开放下一等级');
    expect(rejected.state).toBe(locked);
    const open = {...locked, gymLevel: 6, credits: 9};
    expect(projectOffer(open, 'endurance').price).toBe(10);
    const insufficient = dispatchGym(open, open.revision, {type: 'upgrade-project', id: 'endurance'}, open.updatedAt);
    expect(insufficient.error).toBe('赞助券不足');
    expect(insufficient.state).toBe(open);
    const paid = command({...open, credits: 10}, {type: 'upgrade-project', id: 'endurance'});
    expect(paid.credits).toBe(0);
    expect(paid.projects.endurance).toBe(6);
    expect(paid.player!.stamina).toBe(open.player!.stamina);
  });

  it.each([
    {id: 'relic_078', gym: 7, price: 30},
    {id: 'relic_085', gym: 8, price: 36},
    {id: 'relic_081', gym: 7, price: 20},
  ])('enforces the new gym gate and real purchase price for $id', ({id, gym, price}) => {
    const locked = fixture(gym - 1);
    expect(equipmentOffer(locked, id).price).toBeNull();
    const denied = dispatchGym(locked, locked.revision, {type: 'buy-equipment', id}, locked.updatedAt);
    expect(denied.error).toBe(`球馆达到 ${gym} 级后上架`);
    expect(denied.state).toBe(locked);
    const open = {...locked, gymLevel: gym};
    expect(equipmentOffer(open, id).price).toBe(price);
    const bought = command(open, {type: 'buy-equipment', id});
    expect(open.credits - bought.credits).toBe(price);
    expect(bought.purchasePrices[id]).toBe(price);
    expect(bought.equippedEquipment).toContain(id);
    expect(validGym(bought)).toBe(true);
  });

  it('continues to require actual template collection after the higher gym gate is met', () => {
    const state = fixture();
    state.collection = Object.fromEntries(Object.entries(state.collection).slice(0, 7));
    const rejected = dispatchGym(state, state.revision, {type: 'buy-equipment', id: 'relic_085'}, state.updatedAt);
    expect(rejected.error).toBe('收录 8 种模板后上架');
    expect(rejected.state).toBe(state);
  });

  it('keeps prior-price V3 ownership, installed effects, project levels and cash below the new gates', () => {
    const previous = priorPriceSave();
    expect(validGym(previous)).toBe(true);
    const restored = decodeGym(encodeGym(previous))!;
    expect(restored).toEqual(previous);
    expect(restored.equipmentCatalogVersion).toBe(3);
    expect(restored.balanceVersion).toBe(3);
    expect(restored.pendingLegacyEquipmentEffects).toBeUndefined();
    expect(equipmentEffects(restored)).toMatchObject({recovery: 4, courseRecovery: 3, experience: 3});
    expect(recoverySeconds(restored)).toBe(16);
    expect(trainingShotExperience(restored, 'success')).toBe(15);
    const trained = command(restored, {type: 'train', id: restored.player!.id});
    expect(trained.player!.shots).toBe(previous.player!.shots + 1);
    expect(trained.credits).toBe(37);
    const stored = command(trained, {type: 'unequip', id: 'relic_085'});
    const reinstalled = command(stored, {type: 'equip', id: 'relic_085'});
    expect(reinstalled.equippedEquipment).toContain('relic_085');
    expect(reinstalled.purchasePrices.relic_085).toBe(24);
    expect(decodeGym(encodeGym(reinstalled))).toEqual(reinstalled);
  });

  it.each([
    {id: 'relic_078', oldPrice: 20, price: 30},
    {id: 'relic_085', oldPrice: 24, price: 36},
  ])('sells old $id at its recorded cost and records the current cost only after a new purchase', ({id, oldPrice, price}) => {
    let state = decodeGym(encodeGym(priorPriceSave(8)))!;
    state = command(state, {type: 'unequip', id});
    const beforeSale = state.credits;
    state = command(state, {type: 'sell-equipment', id});
    expect(state.credits - beforeSale).toBe(Math.floor(oldPrice / 2));
    expect(state.collectedEquipment).toHaveProperty(id);
    expect(state.purchasePrices).not.toHaveProperty(id);
    const beforeBuy = state.credits;
    state = command(state, {type: 'buy-equipment', id});
    expect(beforeBuy - state.credits).toBe(price);
    expect(state.purchasePrices[id]).toBe(price);
    state = command(state, {type: 'unequip', id});
    const beforeNewSale = state.credits;
    state = command(state, {type: 'sell-equipment', id});
    expect(state.credits - beforeNewSale).toBe(Math.floor(price / 2));
    expect(validGym(state)).toBe(true);
  });
});
