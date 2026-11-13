import {describe, expect, it} from 'vitest';
import {templateRules} from '../contract/templates';
import {statKeys} from '../types';
import {equipmentCatalog} from './catalog';
import {cooperationOffers, cooperationStatus, dispatchGym, newGym, recommendation, staminaMax, type GymAction} from './engine';

const at = 1_800_000_000_000;

function fixture(bonus: 1 | 2 = 1, accept = true) {
  let state = newGym(at, 7);
  let now = at;
  state.gymLevel = 5;
  state.projects.endurance = 5;
  state.credits = 100;
  state.collection = Object.fromEntries(templateRules.slice(0, 8).map(template => [template.id, {firstAt: at, highestRating: 50, highestValue: '320'}]));
  const rotation = templateRules.find(template => template.tier === 'rotation')!;
  const player = state.player!;
  Object.assign(player, {height: rotation.height[0], templateId: rotation.id, highestTier: 'rotation', level: 10, peakLevel: 10});
  for (const key of statKeys) player.stats[key] = Math.max(player.entryStats[key], rotation.stats[key]);
  player.stamina = staminaMax(state);
  const item = equipmentCatalog.find(item => item.effects.cooperationBonus === bonus)!;
  const step = (action: GymAction) => {
    const result = dispatchGym(state, state.revision, action, now);
    expect(result.error, action.type).toBeUndefined();
    state = result.state;
  };
  const shoot = (count: number) => {
    for (let shot = 0; shot < count; shot++) {
      now += 1_000;
      step({type: 'train', id: state.player!.id});
    }
  };
  const acceptCooperation = () => step({type: 'accept-cooperation', id: cooperationOffers(state).find(offer => offer.kind === 'basic')!.id, playerId: state.player!.id});
  step({type: 'buy-equipment', id: item.id});
  if (accept) acceptCooperation();
  return {get state() {return state;}, step, shoot, acceptCooperation, item};
}

describe('cooperation equipment requires entire courses after acceptance', () => {
  it('does not award a two-course bonus for equipping only the final shot of each course', () => {
    const run = fixture();
    run.step({type: 'unequip', id: run.item.id});
    for (let course = 0; course < 2; course++) {
      run.shoot(9);
      run.step({type: 'equip', id: run.item.id});
      run.shoot(1);
      run.step({type: 'unequip', id: run.item.id});
    }
    expect(run.state.player!.shots).toBe(20);
    expect(run.state.player!.training.completedCourses).toBe(2);
    expect(cooperationStatus(run.state).complete).toBe(true);
    expect(run.state.player!.equipmentTraining.cooperationCourses).toEqual([0, 0]);
    expect(cooperationStatus(run.state).equipmentCredits).toBe(0);
  });

  it.each([1, 2] as const)('earns the +%s tier only after two complete courses with that tier active', bonus => {
    const run = fixture(bonus);
    run.shoot(10);
    expect(run.state.player!.equipmentTraining.cooperationCourses).toEqual(bonus === 1 ? [1, 0] : [1, 1]);
    expect(cooperationStatus(run.state).equipmentCredits).toBe(0);
    run.shoot(10);
    expect(run.state.player!.equipmentTraining.cooperationCourses).toEqual(bonus === 1 ? [2, 0] : [2, 2]);
    expect(run.state.player!.equipmentTraining.cooperationCourseShots).toEqual([0, 0]);
    expect(cooperationStatus(run.state).equipmentCredits).toBe(bonus);
  });

  it('retains the earned bonus after removing the equipment and pays it once through recommendation', () => {
    const run = fixture(2);
    run.shoot(20);
    const earned = recommendation(run.state);
    expect(cooperationStatus(run.state).equipmentCredits).toBe(2);
    run.step({type: 'unequip', id: run.item.id});
    expect(cooperationStatus(run.state).equipmentCredits).toBe(2);
    expect(recommendation(run.state)).toEqual(earned);
    const credits = run.state.credits;
    run.step({type: 'recommend', id: run.state.player!.id});
    expect(run.state.credits).toBe(credits + earned.credits);
    expect(run.state.alumni).toHaveLength(1);
    expect(run.state.alumni[0].rewardCredits).toBe(earned.credits);
  });

  it('does not credit the earlier nine shots when a cooperation is accepted during a partial course', () => {
    const run = fixture(1, false);
    run.shoot(9);
    run.acceptCooperation();
    expect(run.state.player!.equipmentTraining.cooperationCourseShots).toEqual([0, 0]);
    run.shoot(1);
    expect(run.state.player!.equipmentTraining.cooperationCourses).toEqual([0, 0]);
    run.shoot(19);
    expect(cooperationStatus(run.state).complete).toBe(true);
    expect(run.state.player!.equipmentTraining.cooperationCourses).toEqual([1, 0]);
    expect(cooperationStatus(run.state).equipmentCredits).toBe(0);
    run.shoot(1);
    expect(run.state.player!.equipmentTraining.cooperationCourses).toEqual([2, 0]);
    expect(cooperationStatus(run.state).equipmentCredits).toBe(1);
  });

  it('does not join equipped shots from a discarded course to a later half-equipped course', () => {
    const run = fixture();
    run.shoot(5);
    expect(run.state.player!.equipmentTraining.cooperationCourseShots).toEqual([5, 0]);
    run.step({type: 'set-training-plan', id: 'shooting', playerId: run.state.player!.id});
    expect(run.state.player!.training.shots).toBe(0);
    expect(run.state.player!.equipmentTraining.cooperationCourseShots).toEqual([0, 0]);
    run.step({type: 'unequip', id: run.item.id});
    run.shoot(5);
    run.step({type: 'equip', id: run.item.id});
    run.shoot(5);
    expect(run.state.player!.training.completedCourses).toBe(1);
    expect(run.state.player!.equipmentTraining.cooperationCourses).toEqual([0, 0]);
    expect(run.state.player!.equipmentTraining.cooperationCourseShots).toEqual([0, 0]);
  });

  it('preserves lower-tier credit without treating one stronger course as two stronger courses', () => {
    const run = fixture();
    run.shoot(10);
    const stronger = equipmentCatalog.find(item => item.effects.cooperationBonus === 2)!;
    run.step({type: 'buy-equipment', id: stronger.id, replaceId: run.item.id});
    run.shoot(10);
    expect(run.state.player!.equipmentTraining.cooperationCourses).toEqual([2, 1]);
    expect(cooperationStatus(run.state).equipmentCredits).toBe(1);
    run.shoot(10);
    expect(run.state.player!.equipmentTraining.cooperationCourses).toEqual([2, 2]);
    expect(cooperationStatus(run.state).equipmentCredits).toBe(2);
  });
});
