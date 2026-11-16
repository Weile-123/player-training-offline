import {expect, it} from 'vitest';
import {equipmentCatalog} from './catalog';
import {dispatchGym, equipmentEffects, newGym, type GymState} from './engine';

const at = 1_800_000_000_000;
function fixture(): GymState {
  const state = newGym(at, 18);
  state.gymLevel = 3; state.credits = 30;
  state.ownedEquipment = ['relic_014', 'relic_002', 'relic_017', 'relic_007'];
  state.equippedEquipment = [...state.ownedEquipment];
  state.purchasePrices = Object.fromEntries(state.ownedEquipment.map(id => [id, equipmentCatalog.find(item => item.id === id)!.price]));
  state.collectedEquipment = Object.fromEntries(state.ownedEquipment.map(id => [id, {firstAt: at}]));
  state.player!.stamina = 14;
  return state;
}

it('pays for warehouse stock in a full gym without changing active effects or stamina', () => {
  const state = fixture(), effects = equipmentEffects(state);
  const result = dispatchGym(state, state.revision, {type: 'buy-equipment', id: 'relic_006', destination: 'warehouse'}, at + 1);
  expect(result.error).toBeUndefined();
  expect(result.state.credits).toBe(26);
  expect(result.state.ownedEquipment).toContain('relic_006');
  expect(result.state.equippedEquipment).toEqual(state.equippedEquipment);
  expect(result.state.collectedEquipment.relic_006).toBeTruthy();
  expect(result.state.purchasePrices.relic_006).toBe(4);
  expect(result.state.player!.stamina).toBe(14);
  expect(equipmentEffects(result.state)).toEqual(effects);
  expect(result.events.some(event => event.type === 'equipped' || event.type === 'unequipped')).toBe(false);
  expect(state.credits).toBe(30);
});

it('equips a paid warehouse purchase later without a second charge and keeps displaced stock', () => {
  const state = fixture();
  const bought = dispatchGym(state, state.revision, {type: 'buy-equipment', id: 'relic_006', destination: 'warehouse'}, at + 1).state;
  const installed = dispatchGym(bought, bought.revision, {type: 'equip', id: 'relic_006', replaceId: 'relic_014'}, at + 2);
  expect(installed.error).toBeUndefined();
  expect(installed.state.credits).toBe(26);
  expect(installed.state.equippedEquipment).toEqual(['relic_002', 'relic_017', 'relic_007', 'relic_006']);
  expect(installed.state.ownedEquipment).toContain('relic_014');
  expect(installed.state.purchasePrices.relic_006).toBe(4);
});

it('allows warehouse ownership of a same-family upgrade but enforces its equip constraint', () => {
  const state = fixture(); state.equippedEquipment = ['relic_014'];
  const bought = dispatchGym(state, state.revision, {type: 'buy-equipment', id: 'relic_034', destination: 'warehouse'}, at + 1);
  expect(bought.error).toBeUndefined();
  expect(bought.state.credits).toBe(24);
  expect(bought.state.equippedEquipment).toEqual(['relic_014']);
  expect(dispatchGym(bought.state, bought.state.revision, {type: 'equip', id: 'relic_034'}, at + 2).error).toContain('同类');
  const installed = dispatchGym(bought.state, bought.state.revision, {type: 'equip', id: 'relic_034', replaceId: 'relic_014'}, at + 2);
  expect(installed.error).toBeUndefined();
  expect(installed.state.credits).toBe(24);
  expect(installed.state.equippedEquipment).toEqual(['relic_034']);
});

it('refuses a repeated warehouse purchase and never charges it twice', () => {
  const state = fixture();
  const bought = dispatchGym(state, state.revision, {type: 'buy-equipment', id: 'relic_006', destination: 'warehouse'}, at + 1).state;
  const repeated = dispatchGym(bought, bought.revision, {type: 'buy-equipment', id: 'relic_006', destination: 'warehouse'}, at + 2);
  expect(repeated.error).toBeTruthy();
  expect(repeated.state.credits).toBe(26);
  expect(repeated.state.ownedEquipment.filter(id => id === 'relic_006')).toHaveLength(1);
});

it('keeps affordability, listing and explicit installation checks on warehouse purchases', () => {
  const state = fixture();
  state.credits = 3;
  expect(dispatchGym(state, state.revision, {type: 'buy-equipment', id: 'relic_006', destination: 'warehouse'}, at + 1).error).toBe('赞助券不足');
  state.credits = 30;
  expect(dispatchGym(state, state.revision, {type: 'buy-equipment', id: 'relic_081', destination: 'warehouse'}, at + 1).error).toBeTruthy();
  expect(dispatchGym(state, state.revision, {type: 'buy-equipment', id: 'relic_006', destination: 'warehouse', replaceId: 'relic_014'}, at + 1).error).toBeTruthy();
  expect(dispatchGym(state, state.revision, {type: 'buy-equipment', id: 'relic_006'}, at + 1).error).toContain('已满');
  expect(state.credits).toBe(30);
  expect(state.ownedEquipment).not.toContain('relic_006');
});
