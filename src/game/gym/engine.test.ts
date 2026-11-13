import {describe, expect, it} from 'vitest';
import {statKeys, type Stats} from '../types';
import {templateRules, grow, match} from '../contract/templates';
import {random} from '../contract/random';
import {shopCatalog} from '../contract/commerce';
import {legacyEquipmentCatalog} from './catalog';
import {
  activePlayers, advanceGym, automaticIntervalMs, autoTrainingSeconds, cooperationOffers, cooperationStatus, courseRecoveryCap, dispatchGym, effectiveTrainingBias, equipmentCapacity, equipmentCatalog, equipmentEffects, equipmentOffer, gymLevels, gymUpgrade,
  newGym, playerValue, projectCap, projectCost, projectOffer, projects, recommendation, recoverySeconds,
  experienceForLevel, playerLevelCap, requiredExperience, shotExperience, staminaMax, trainingCreditMilestones, trainingPlans, trainingStatus, type GymAction, type GymAlumnus, type GymState,
} from './engine';

const start = 1_700_000_000_000;
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const sum = (stats: Stats) => statKeys.reduce((total, key) => total + stats[key], 0);
function act(state: GymState, action: GymAction, now = state.updatedAt) {
  const result = dispatchGym(state, state.revision, action, now);
  expect(result.error).toBeUndefined();
  return result.state;
}
function nextManualShot(state: GymState): GymState {
  const player = state.player!;
  const ready = Math.max(state.updatedAt, player.nextShotAt, player.stamina >= 1 ? 0
    : state.updatedAt + recoverySeconds(state) * 1000 - player.recoveryMs);
  return act(state, {type: 'train', id: player.id}, ready);
}
function withOutcome(state: GymState, wanted: 'hold' | 'success' | 'great') {
  const next = copy(state);
  for (let seed = 0; seed < 100; seed++) {
    const stream = {state: seed};
    const roll = random(stream);
    const outcome = roll < .3 ? 'hold' : roll < .9 ? 'success' : 'great';
    if (outcome === wanted) {
      next.rng.economy = {state: seed};
      return next;
    }
  }
  throw new Error('No test RNG seed');
}
function alumni(state: GymState, tier: number, index: number): GymAlumnus {
  const player = copy(state.player!);
  player.id = `former-${index}`;
  player.stats = Object.fromEntries(statKeys.map(key => [key, player.entryStats[key] + 10])) as Stats;
  player.templateId = templateRules.find(template => template.tier === [null, 'rotation', 'starter', 'star', 'superstar', 'legend'][tier])?.id ?? null;
  const reward = recommendation(player);
  return {...player, recommendedAt: start, rewardCredits: reward.credits, rewardFame: reward.fame, finalValue: '320'};
}

describe('manual gym training and original growth', () => {
  it('starts with one free recruit, original random attributes and no automatic progression', () => {
    const gym = newGym(start, 89);
    expect(gym).toMatchObject({credits: 0, fame: 0, gymLevel: 1, revision: 0, kind: 'gym-management', balanceVersion: 3});
    expect(gym.player).toMatchObject({level: 0, templateId: null, stamina: 20, shots: 0, recoveryMs: 0});
    expect(gym.player!.entryStats).toEqual(gym.player!.stats);
    expect(statKeys.every(key => gym.player!.stats[key] >= 24 && gym.player!.stats[key] <= 48)).toBe(true);
    expect(gym.player!.height).toBeGreaterThanOrEqual(178);
    expect(gym.player!.height).toBeLessThanOrEqual(218);
    expect(newGym(start, 89)).toEqual(gym);
    const later = advanceGym(gym, start + 86_400_000);
    expect(later.player).toEqual(gym.player);
    expect(later.rng).toEqual(gym.rng);
  });

  it.each(['hold', 'success', 'great'] as const)('uses normal original growth when %s XP crosses a level boundary', outcome => {
    const gym = withOutcome(newGym(start, 40), outcome);
    gym.player!.experience = requiredExperience(0) - shotExperience(outcome);
    const original = copy(gym);
    const delta = 1;
    const attributes = {...gym.rng.attributes};
    const expectedStats = grow(gym.player!.stats, gym.player!.bias, 'success', delta, attributes);
    const expectedMatch = match({...gym.player!, stats: expectedStats, level: delta, peakLevel: delta});
    const result = dispatchGym(gym, gym.revision, {type: 'train', id: gym.player!.id}, start);
    expect(result.error).toBeUndefined();
    expect(result.events[0]).toMatchObject({type: 'trained', outcome, levelGain: delta, experienceGain: shotExperience(outcome)});
    expect(result.state.player).toMatchObject({stats: expectedStats, level: delta, peakLevel: delta,
      templateId: expectedMatch.templateId, lastStyle: expectedMatch.lastStyle, stamina: 19, shots: 1});
    expect(sum(result.state.player!.stats) - sum(gym.player!.stats)).toBe(delta * 10);
    expect(result.state.rng.attributes).toEqual(attributes);
    expect(gym).toEqual(original);
    expect(result.state.player!.experience).toBe(0);
    expect(result.state.player!.book).toEqual(gym.player!.book);
    expect(playerValue(result.state)).toBe('2560');
  });

  it('enforces each player one-second cooldown and refuses stale commands without consuming anything', () => {
    const gym = newGym(start);
    const action = {type: 'train', id: gym.player!.id} as const;
    const first = act(gym, action);
    for (const result of [dispatchGym(first, first.revision, action, start + 999), dispatchGym(first, gym.revision, action, start + 1000)]) {
      expect(result.error).toBeTruthy();
      expect(result.state).toBe(first);
      expect(result.events).toEqual([]);
    }
    expect(act(first, action, start + 1000).player!.shots).toBe(2);
    const empty = act(first, {type: 'recommend', id: first.player!.id});
    const next = act(empty, {type: 'recruit'});
    expect(dispatchGym(next, next.revision, {type: 'train', id: first.player!.id}, start + 1000).error).toBeTruthy();
    expect(dispatchGym(next, next.revision, {type: 'train', id: next.player!.id}, start + 999).state).toBe(next);
    expect(act(next, {type: 'train', id: next.player!.id}, start + 1000).player!.shots).toBe(1);
  });

  it('clamps XP at level 99 and uses a bounded cubic display value without compounding the old book', () => {
    const gym = withOutcome(newGym(start, 9), 'great');
    gym.player!.level = 98;
    gym.player!.peakLevel = 98;
    gym.player!.experience = requiredExperience(98) - 1;
    const trained = act(gym, {type: 'train', id: gym.player!.id});
    expect(trained.player!.level).toBe(99);
    expect(sum(trained.player!.stats) - sum(gym.player!.stats)).toBe(10);
    expect(trained.player!.experience).toBe(0);
    expect(playerValue(trained)).toBe('320000000');
    expect(trained.player!.book).toEqual(gym.player!.book);
    const failed = dispatchGym(trained, trained.revision, {type: 'train', id: trained.player!.id}, start + 1000);
    expect(failed.error).toContain('99');
    expect(failed.state).toBe(trained);
  });

  it('keeps the earned template appearance and records each first unlock once', () => {
    let gym = newGym(start, 4);
    gym.player!.stats = {three: 99, mid: 99, drive: 99, inside: 99, handle: 99, defense: 99};
    gym.player!.level = 18;
    gym.player!.peakLevel = 18;
    gym = withOutcome(gym, 'hold');
    const first = dispatchGym(gym, gym.revision, {type: 'train', id: gym.player!.id}, start);
    const id = first.state.player!.templateId!;
    expect(id).toBeTruthy();
    expect(first.events.filter(event => event.type === 'template-unlocked')).toHaveLength(1);
    expect(first.state.collection[id]).toMatchObject({firstAt: start, highestRating: 99});
    const second = dispatchGym(first.state, first.state.revision, {type: 'train', id: gym.player!.id}, start + 1000);
    expect(second.state.player!.templateId).toBe(id);
    expect(second.state.collection[id].firstAt).toBe(start);
    expect(second.events.some(event => event.type === 'template-unlocked')).toBe(false);
  });
});

describe('stamina and recovery boundaries', () => {
  it('starts at twenty, spends one per ball and refunds only each completed tenth shot', () => {
    let gym = newGym(start, 29);
    expect(staminaMax(gym)).toBe(20);
    expect(gym.player!.stamina).toBe(20);
    gym = act(gym, {type: 'train', id: gym.player!.id});
    expect(gym.player!.stamina).toBe(19);
    for (let shot = 2; shot <= 9; shot++) gym = act(gym, {type: 'train', id: gym.player!.id}, start + (shot - 1) * 1000);
    expect(gym.player).toMatchObject({stamina: 11, training: {shots: 9, completedCourses: 0}});
    const tenth = dispatchGym(gym, gym.revision, {type: 'train', id: gym.player!.id}, start + 9000);
    expect(tenth.error).toBeUndefined();
    expect(tenth.state.player).toMatchObject({stamina: 14, training: {shots: 0, completedCourses: 1}});
    expect(tenth.events.find(event => event.type === 'course-completed')!.restoredStamina).toBe(4);
    gym = tenth.state;
    for (let shot = 11; shot <= 20; shot++) gym = act(gym, {type: 'train', id: gym.player!.id}, start + (shot - 1) * 1000);
    expect(gym.player).toMatchObject({stamina: 8, recoveryMs: 19_000, training: {shots: 0, completedCourses: 2}});
    expect(act(gym, {type: 'train', id: gym.player!.id}, start + 20_000).player).toMatchObject({stamina: 8, recoveryMs: 0});
  });

  it('cannot borrow the next course refund when empty and resumes at the exact natural recovery boundary', () => {
    let gym = newGym(start, 28);
    for (let shot = 0; shot < 29; shot++) gym = act(gym, {type: 'train', id: gym.player!.id}, start + shot * 1000);
    expect(gym.player).toMatchObject({stamina: 0, shots: 29, training: {shots: 9, completedCourses: 2}});
    const tooEarly = dispatchGym(gym, gym.revision, {type: 'train', id: gym.player!.id}, start + 39_999);
    expect(tooEarly.error).toContain('体力');
    expect(tooEarly.state).toBe(gym);
    const exact = dispatchGym(gym, gym.revision, {type: 'train', id: gym.player!.id}, start + 40_000);
    expect(exact.error).toBeUndefined();
    expect(exact.state.player).toMatchObject({stamina: 4, recoveryMs: 0, shots: 30, training: {shots: 0, completedCourses: 3}});
    expect(exact.events.filter(event => event.type === 'course-completed')).toHaveLength(1);
  });

  it('adds five capacity per endurance level without a refill and gives the next recruit full twenty-five', () => {
    const gym = {...newGym(start, 63), credits: 1};
    const upgraded = act(gym, {type: 'upgrade-project', id: 'endurance'});
    expect(staminaMax(upgraded)).toBe(25);
    expect(upgraded.player!.stamina).toBe(20);
    const empty = act(upgraded, {type: 'recommend', id: upgraded.player!.id});
    const next = act(empty, {type: 'recruit'});
    expect(next.player!.stamina).toBe(25);
    expect(next.player!.nextShotAt).toBe(start + 1000);
  });

  it('recovers at the exact boundary, survives segmentation and discards time while full', () => {
    const gym = newGym(start);
    gym.player!.stamina = 10;
    gym.player!.recoveryMs = 1234;
    const finish = start + 123_456;
    const bulk = advanceGym(gym, finish);
    const split = [start + 1, start + 17_666, start + 31_000, finish].reduce(advanceGym, gym);
    expect({...bulk, revision: 0}).toEqual({...split, revision: 0});
    expect(bulk.player).toMatchObject({stamina: 16, recoveryMs: 4690});
    expect(advanceGym(gym, start + 18_765).player!.stamina).toBe(10);
    expect(advanceGym(gym, start + 18_766).player).toMatchObject({stamina: 11, recoveryMs: 0});
    const full = advanceGym(gym, start + 1_000_000);
    expect(full.player).toMatchObject({stamina: 20, recoveryMs: 0});
    const trained = act(full, {type: 'train', id: full.player!.id});
    expect(advanceGym(trained, trained.updatedAt + 19_999).player!.stamina).toBe(19);
    expect(advanceGym(trained, trained.updatedAt + 20_000).player!.stamina).toBe(20);
    expect(advanceGym(full, start)).toBe(full);
  });

  it('restores stamina before a shot at the same millisecond and keeps refused commands atomic', () => {
    const gym = newGym(start);
    gym.player!.stamina = 0;
    const action = {type: 'train', id: gym.player!.id} as const;
    const early = dispatchGym(gym, gym.revision, action, start + 19_999);
    expect(early.error).toContain('体力');
    expect(early.state).toBe(gym);
    const exact = act(gym, action, start + 20_000);
    expect(exact.player).toMatchObject({stamina: 0, recoveryMs: 0, shots: 1});
  });

  it('preserves recovery proportion on upgrades and never refills stamina by changing capacity', () => {
    let gym = newGym(start);
    gym.credits = 10;
    gym.player!.stamina = 10;
    gym.player!.recoveryMs = 10_000;
    gym = act(gym, {type: 'upgrade-project', id: 'recovery'});
    expect(recoverySeconds(gym)).toBe(19);
    expect(gym.player).toMatchObject({stamina: 10, recoveryMs: 9500});
    const endurance = act(gym, {type: 'upgrade-project', id: 'endurance'});
    expect(staminaMax(endurance)).toBe(25);
    expect(endurance.player!.stamina).toBe(10);
    expect(advanceGym(endurance, start + 9499).player!.stamina).toBe(10);
    expect(advanceGym(endurance, start + 9500).player!.stamina).toBe(11);

    const owned = {...newGym(start), ownedEquipment: ['relic_014']};
    const equipped = act(owned, {type: 'equip', id: 'relic_014'});
    expect(staminaMax(equipped)).toBe(24);
    expect(equipped.player!.stamina).toBe(20);
    equipped.player!.stamina = 24;
    const removed = act(equipped, {type: 'unequip', id: 'relic_014'});
    expect(removed.player!.stamina).toBe(20);
    expect(act(removed, {type: 'equip', id: 'relic_014'}).player!.stamina).toBe(20);
  });

  it('buys a drink for one credit, caps actual recovery and refuses a full-stamina use', () => {
    const gym = {...newGym(start), credits: 1};
    const stocked = act(gym, {type: 'buy-drink'});
    expect(stocked).toMatchObject({credits: 0, inventory: {drink: 1}});
    const action = {type: 'use-drink', id: stocked.player!.id} as const;
    expect(dispatchGym(stocked, stocked.revision, action, start).state).toBe(stocked);
    stocked.player!.stamina = 19;
    stocked.player!.recoveryMs = 500;
    const used = act(stocked, action);
    expect(used.inventory.drink).toBe(0);
    expect(used.player).toMatchObject({stamina: 20, recoveryMs: 0});
  });
});

describe('recommendation, enrollment and gym progression', () => {
  it('uses actual template tier and net growth to reward a player exactly once', () => {
    const gym = newGym(start, 20);
    const player = gym.player!;
    player.templateId = 'curry';
    player.stats = Object.fromEntries(statKeys.map(key => [key, 90])) as Stats;
    const growth = statKeys.reduce((total, key) => total + 90 - player.entryStats[key], 0);
    expect(recommendation(gym)).toEqual(recommendation(player));
    expect(recommendation(player)).toMatchObject({tier: 5, credits: 5, fame: Math.floor(growth * 6 / 10), growth});
    const recommended = act(gym, {type: 'recommend', id: player.id});
    expect(recommended.player).toBeNull();
    expect(recommended).toMatchObject({credits: 5, fame: Math.floor(growth * 6 / 10)});
    expect(recommended.alumni[0]).toMatchObject({id: player.id, stats: player.stats, entryStats: player.entryStats, rewardCredits: 5});
    expect(dispatchGym(recommended, recommended.revision, {type: 'recommend', id: player.id}, start).state).toBe(recommended);
  });

  it('allows free zero-reward replacement and uses a continuing recruit RNG stream', () => {
    const gym = newGym(start, 89);
    const empty = act(gym, {type: 'recommend', id: gym.player!.id});
    expect(empty).toMatchObject({credits: 0, fame: 0, player: null});
    const next = act(empty, {type: 'recruit'});
    expect(next.player!.id).not.toBe(gym.player!.id);
    expect(next.player!.stats).not.toEqual(gym.player!.stats);
    expect(next.player).toMatchObject({level: 0, templateId: null, stamina: 20});
  });

  it('cannot bypass shot cooldown by recommending for zero coupons and immediately recruiting again', () => {
    const gym = act(withOutcome(newGym(start, 42), 'hold'), {type: 'train', id: 'gym-p1'});
    const empty = act(gym, {type: 'recommend', id: gym.player!.id});
    expect(empty).toMatchObject({credits: 0, fame: 0});
    const next = act(empty, {type: 'recruit'});
    expect(next.player).toMatchObject({stamina: 20, shots: 0, nextShotAt: start + 1000});
    for (const now of [start, start + 999]) {
      const denied = dispatchGym(next, next.revision, {type: 'train', id: next.player!.id}, now);
      expect(denied.error).toContain('准备');
      expect(denied.state).toBe(next);
      expect(denied.events).toEqual([]);
    }
    const firstShot = act(next, {type: 'train', id: next.player!.id}, start + 1000);
    expect(firstShot.player!.shots).toBe(1);
    const again = act(act(next, {type: 'recommend', id: next.player!.id}), {type: 'recruit'});
    expect(again.player!.nextShotAt).toBe(start + 1000);
    expect(dispatchGym(again, again.revision, {type: 'train', id: again.player!.id}, start).state).toBe(again);
  });

  it('never earns coupons, fame or valid recommendation progress by repeatedly replacing untrained recruits', () => {
    let gym = newGym(start, 71);
    for (let replacement = 0; replacement < 50; replacement++) {
      gym = act(gym, {type: 'recommend', id: gym.player!.id});
      gym = act(gym, {type: 'recruit'});
    }
    expect(gym).toMatchObject({credits: 0, fame: 0, gymLevel: 1, nextPlayer: 52});
    expect(gym.alumni).toHaveLength(50);
    expect(gymUpgrade({...gym, fame: 60}).requirements.find(requirement => requirement.label === '有效推荐')).toMatchObject({current: 0, required: 2, met: false});
  });

  it('applies enrollment training only to the next recruit and enforces height preference unlocks', () => {
    const gym = {...newGym(start, 12), gymLevel: 2, credits: 2};
    const upgraded = act(gym, {type: 'upgrade-project', id: 'recruitment'});
    expect(upgraded.player!.entryStats).toEqual(gym.player!.entryStats);
    const empty = act(upgraded, {type: 'recommend', id: upgraded.player!.id});
    const next = act(empty, {type: 'recruit', preference: 'center'});
    expect(statKeys.every(key => next.player!.stats[key] >= 25 && next.player!.stats[key] <= 49)).toBe(true);
    expect(next.player!.entryStats).toEqual(next.player!.stats);
    expect(next.player!.height).toBeGreaterThanOrEqual(206);
    expect(next.player!.height).toBeLessThanOrEqual(218);
    const initial = newGym(start);
    const firstEmpty = act(initial, {type: 'recommend', id: initial.player!.id});
    expect(dispatchGym(firstEmpty, firstEmpty.revision, {type: 'recruit', preference: 'guard'}, start).state).toBe(firstEmpty);
  });

  it('requires reputation and genuine recommended results, then upgrades without charging credits', () => {
    const gym = {...newGym(start), fame: 300};
    const untrained = {...gym.player!, recommendedAt: start, rewardCredits: 0, rewardFame: 0, finalValue: '320'};
    gym.alumni = [untrained, {...untrained, id: 'empty-2'}, {...untrained, id: 'empty-3'}];
    expect(gymUpgrade(gym).canUpgrade).toBe(false);
    gym.alumni = [1, 2, 3].map(index => alumni(gym, 1, index));
    expect(gymUpgrade(gym).canUpgrade).toBe(true);
    const upgraded = act(gym, {type: 'upgrade-gym'});
    expect(upgraded).toMatchObject({gymLevel: 2, fame: 300, credits: 0});
    const star = {...upgraded, fame: 1000, alumni: [...upgraded.alumni, alumni(gym, 5, 4)]};
    expect(gymUpgrade(star).canUpgrade).toBe(true);
    expect(act(star, {type: 'upgrade-gym'}).gymLevel).toBe(3);
    expect(gymLevels.map(level => level.fame)).toEqual([0, 60, 500, 1300, 3000, 6000, 11000, 18000]);
  });

  it('checks every reputation threshold through gym eight and refuses further upgrades without spending currency', () => {
    let gym = newGym(start, 32);
    gym.alumni = Array.from({length: 15}, (_, index) => alumni(gym, 5, index));
    gym.collection = Object.fromEntries(templateRules.slice(0, 25).map(template => [template.id, {firstAt: start, highestRating: 99, highestValue: '320000000'}]));
    for (const level of gymLevels.slice(1)) {
      gym = {...gym, fame: level.fame - 1};
      expect(dispatchGym(gym, gym.revision, {type: 'upgrade-gym'}, start).state).toBe(gym);
      gym = act({...gym, fame: level.fame}, {type: 'upgrade-gym'});
      expect(gym.gymLevel).toBe(level.level);
      expect(gym.credits).toBe(0);
      expect(activePlayers(gym)).toHaveLength(1);
    }
    const capped = dispatchGym(gym, gym.revision, {type: 'upgrade-gym'}, start);
    expect(capped.error).toContain('最高');
    expect(capped.state).toBe(gym);
  });

  it.each([[5, 6000, 3, 8], [6, 11000, 8, 15], [7, 18000, 15, 25]])(
    'requires both legendary alumni and distinct templates before leaving gym %i', (gymLevel, fame, legends, templates) => {
      const gym = {...newGym(start, 51), gymLevel, fame};
      const collection = (count: number) => Object.fromEntries(templateRules.slice(0, count).map(template => [template.id,
        {firstAt: start, highestRating: 99, highestValue: '320000000'}]));
      gym.collection = collection(templates);
      gym.alumni = Array.from({length: legends - 1}, (_, index) => alumni(gym, 5, index));
      expect(gymUpgrade(gym).canUpgrade).toBe(false);
      gym.alumni.push(alumni(gym, 5, legends));
      gym.collection = collection(templates - 1);
      expect(gymUpgrade(gym).canUpgrade).toBe(false);
      gym.collection = collection(templates);
      expect(act(gym, {type: 'upgrade-gym'}).gymLevel).toBe(gymLevel + 1);
    });
});

describe('fixed P0 equipment and project economy', () => {
  it('reuses original resource IDs with explicit positive V3 effects', () => {
    expect(legacyEquipmentCatalog.map(item => item.id)).toEqual(shopCatalog.map(item => item.id));
    expect(new Set(equipmentCatalog.map(item => item.id)).size).toBe(35);
    expect(new Set(equipmentCatalog.map(item => JSON.stringify(item.effects))).size).toBe(35);
    for (const item of equipmentCatalog) {
      expect(shopCatalog.some(original => original.id === item.id)).toBe(true);
      expect(item.price).toBeGreaterThan(0);
      expect(Object.values(item.effects).some(value => typeof value === 'number' && value > 0)).toBe(true);
    }
  });

  it('uses exact rounded 1.8 growth project prices and unlock-relative caps while keeping future projects unpurchasable', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(level => projectCost('endurance', level))).toEqual([1, 2, 4, 6, 11, 19, 35, 62]);
    expect(projectCap('recruitment', 1)).toBe(0);
    expect(projectCap('recruitment', 2)).toBe(1);
    expect(projectCap('recruitment', 8)).toBe(6);
    const gym = {...newGym(start), credits: 1000, gymLevel: 8};
    for (const project of projects.filter(project => !project.available)) {
      expect(projectOffer(gym, project.id).price).toBeNull();
      expect(dispatchGym(gym, gym.revision, {type: 'upgrade-project', id: project.id}, start).state).toBe(gym);
    }
    expect(projectOffer(newGym(start), 'endurance')).toMatchObject({level: 0, maxLevel: 1, price: 1});
  });

  it('rounds each base price independently and charges the exact changed fourth-level price atomically', () => {
    expect([1, 2, 3, 4, 5, 6].map(level => projectCost('recruitment', level))).toEqual([2, 4, 7, 12, 21, 38]);
    expect([1, 2, 3, 4, 5].map(level => projectCost('automation', level))).toEqual([3, 6, 10, 18, 32]);
    for (const project of projects) expect(projectCost(project.id, 1)).toBe(project.basePrice);
    const gym = {...newGym(start), gymLevel: 4, credits: 5};
    gym.projects.endurance = 3;
    expect(projectOffer(gym, 'endurance').price).toBe(6);
    const denied = dispatchGym(gym, gym.revision, {type: 'upgrade-project', id: 'endurance'}, start);
    expect(denied.error).toContain('赞助券');
    expect(denied.state).toBe(gym);
    const purchased = act({...gym, credits: 6}, {type: 'upgrade-project', id: 'endurance'});
    expect(purchased.credits).toBe(0);
    expect(purchased.projects.endurance).toBe(4);
    expect(purchased.player!.stamina).toBe(gym.player!.stamina);
  });

  it('deduplicates the permanent warehouse, enforces slots and preserves collections when unequipped', () => {
    let gym = {...newGym(start), credits: 1000, gymLevel: 8};
    const items = equipmentCatalog.filter(item => item.grade === 1).slice(0, 5);
    for (const item of items.slice(0, 4)) gym = act(gym, {type: 'buy-equipment', id: item.id});
    expect(gym.equippedEquipment).toEqual(items.slice(0, 4).map(item => item.id));
    expect(dispatchGym(gym, gym.revision, {type: 'buy-equipment', id: items[4].id}, start).state).toBe(gym);
    gym = act(gym, {type: 'buy-equipment', id: items[4].id, replaceId: items[0].id});
    expect(gym.ownedEquipment).toHaveLength(5);
    const duplicate = dispatchGym(gym, gym.revision, {type: 'buy-equipment', id: items[0].id}, start);
    expect(duplicate.state).toBe(gym);
    expect(equipmentOffer(gym, items[0].id)).toMatchObject({owned: true, price: null});
    expect(dispatchGym(gym, gym.revision, {type: 'equip', id: items[0].id}, start).state).toBe(gym);
    gym = act(gym, {type: 'upgrade-project', id: 'equipment'});
    expect(equipmentCapacity(gym)).toBe(5);
    gym = act(gym, {type: 'equip', id: items[0].id});
    const removed = act(gym, {type: 'unequip', id: items[0].id});
    expect(removed.ownedEquipment).toEqual(gym.ownedEquipment);
    expect(removed.collectedEquipment).toEqual(gym.collectedEquipment);
  });

  it('caps aggregate stamina and recovery while non-focus equipment preserves the original growth', () => {
    const initial = withOutcome(newGym(start, 7), 'success');
    const gym = copy(initial);
    gym.projects.endurance = 8;
    gym.projects.recovery = 8;
    gym.ownedEquipment = equipmentCatalog.map(item => item.id);
    gym.equippedEquipment = equipmentCatalog.filter(item => !item.effects.focusKey).map(item => item.id);
    expect(staminaMax(gym)).toBe(80);
    expect(recoverySeconds(gym)).toBe(8);
    expect(recommendation(gym.player)).toEqual(recommendation(initial.player));
    expect(BigInt(playerValue(gym))).toBeGreaterThan(BigInt(playerValue(initial)));
    const originalShot = act(initial, {type: 'train', id: initial.player!.id});
    const equippedShot = act(gym, {type: 'train', id: gym.player!.id});
    expect(equippedShot.player!.stats).toEqual(originalShot.player!.stats);
    expect(equippedShot.rng).toEqual(originalShot.rng);
  });
});

describe('specialist training and courses', () => {
  it('improves each selected pair across fixed seeds without changing intrinsic bias or result RNG', () => {
    const totals = new Map(trainingPlans.filter(plan => plan.focusKeys.length).map(plan => [plan.id, {basic: 0, specialist: 0}]));
    for (let seed = 1; seed <= 40; seed++) {
      const initial = newGym(start, seed);
      let basic = initial;
      for (let shot = 0; shot < 30; shot++) basic = nextManualShot(basic);
      for (const plan of trainingPlans.filter(plan => plan.focusKeys.length)) {
        let specialised = act(initial, {type: 'set-training-plan', id: plan.id, playerId: initial.player!.id});
        for (let shot = 0; shot < 30; shot++) specialised = nextManualShot(specialised);
        expect(specialised.player!.bias).toEqual(initial.player!.bias);
        expect(specialised.rng.economy).toEqual(basic.rng.economy);
        expect(specialised.player!.level).toBe(basic.player!.level);
        const total = totals.get(plan.id)!;
        total.basic += plan.focusKeys.reduce((sum, key) => sum + basic.player!.stats[key] - initial.player!.stats[key], 0);
        total.specialist += plan.focusKeys.reduce((sum, key) => sum + specialised.player!.stats[key] - initial.player!.stats[key], 0);
      }
    }
    for (const total of totals.values()) expect(total.specialist).toBeGreaterThan(total.basic);
  }, 15_000);

  it('finishes every tenth valid shot once, including hold, and changing plans abandons only unfinished progress', () => {
    let gym = withOutcome(newGym(start, 14), 'hold');
    gym.player!.training = {planId: 'balanced', shots: 9, completedCourses: 1};
    gym.player!.shots = 19;
    gym.player!.stamina = 10;
    const action = {type: 'train', id: gym.player!.id} as const;
    const finished = dispatchGym(gym, gym.revision, action, start);
    expect(finished.state.player!.training).toEqual({planId: 'balanced', shots: 0, completedCourses: 2});
    expect(finished.state.player!.stamina).toBe(13);
    expect(finished.events.filter(event => event.type === 'course-completed')).toEqual([{type: 'course-completed', playerId: gym.player!.id, restoredStamina: 4}]);
    expect(finished.state.player!.shots).toBe(20);
    const retry = dispatchGym(finished.state, gym.revision, action, start);
    expect(retry.state).toBe(finished.state);
    expect(retry.error).toBeTruthy();

    gym = copy(finished.state);
    gym.player!.training.shots = 7;
    gym.player!.shots += 7;
    const changed = act(gym, {type: 'set-training-plan', id: 'shooting', playerId: gym.player!.id});
    expect(changed.player!.training).toEqual({planId: 'shooting', shots: 0, completedCourses: 2});
    expect(changed.player!.stamina).toBe(gym.player!.stamina);
    expect(changed.rng).toEqual(gym.rng);
    expect(changed.player!.stats).toEqual(gym.player!.stats);
    expect(dispatchGym(changed, changed.revision, {type: 'set-training-plan', id: 'shooting', playerId: gym.player!.id}, start).state).toBe(changed);

    const capped = copy(finished.state);
    capped.player!.level = 99;
    capped.player!.peakLevel = 99;
    capped.player!.training.shots = 9;
    const blocked = dispatchGym(capped, capped.revision, action, start + 1000);
    expect(blocked.state).toBe(capped);
    expect(blocked.events).toEqual([]);
  });

  it('preserves baseline bias exactly and applies capped focus, course and cooperation equipment benefits', () => {
    const gym = newGym(start);
    expect(effectiveTrainingBias(gym)).toEqual(gym.player!.bias);
    const equipped = copy(gym);
    equipped.ownedEquipment = equipmentCatalog.map(item => item.id);
    equipped.equippedEquipment = [...equipped.ownedEquipment];
    const effects = equipmentEffects(equipped);
    expect(statKeys.every(key => effects.focus[key] <= 1.5)).toBe(true);
    expect(effects.courseRecovery).toBe(1);
    expect(effects.cooperationBonus).toBe(2);
    expect(trainingStatus(equipped)).toMatchObject({shots: 0, completedCourses: 0, nextRecovery: 5});
    for (const key of statKeys) expect(effectiveTrainingBias(equipped)[key]).toBe(gym.player!.bias[key] + effects.focus[key]);
  });

  it('keeps base course recovery at four and limits equipment bonuses by gym level in actual shots', () => {
    const expectedExtra = [1, 1, 2, 2, 2, 3, 3, 3];
    const gear = equipmentCatalog.filter(item => item.family === 'course' && item.grade === 3).map(item => item.id);
    for (let gymLevel = 1; gymLevel <= 8; gymLevel++) {
      const gym = withOutcome({...newGym(start, gymLevel), gymLevel}, 'hold');
      expect(trainingStatus(gym).nextRecovery).toBe(4);
      gym.ownedEquipment = [...gear];
      gym.equippedEquipment = [...gear];
      gym.player!.shots = 9;
      gym.player!.training.shots = 9;
      gym.player!.stamina = 1;
      expect(courseRecoveryCap(gym)).toBe(expectedExtra[gymLevel - 1]);
      expect(equipmentEffects(gym).courseRecovery).toBe(expectedExtra[gymLevel - 1]);
      expect(trainingStatus(gym).nextRecovery).toBe(4 + expectedExtra[gymLevel - 1]);
      const result = dispatchGym(gym, gym.revision, {type: 'train', id: gym.player!.id}, start);
      expect(result.error).toBeUndefined();
      expect(result.state.player!.stamina).toBe(4 + expectedExtra[gymLevel - 1]);
      expect(result.state.player!.training.completedCourses).toBe(1);
      expect(result.events.find(event => event.type === 'course-completed')!.restoredStamina).toBe(4 + expectedExtra[gymLevel - 1]);
      expect(dispatchGym(result.state, result.state.revision, {type: 'train', id: gym.player!.id}, start).state).toBe(result.state);
    }
    expect(equipmentCatalog.filter(item => item.effects.courseRecovery > 0).every(item => item.description.includes('受馆级上限限制'))).toBe(true);
  });

  it('adds level-and-template training bonuses and floors the combined course and brand fame multiplier once', () => {
    const gym = newGym(start, 16);
    gym.player!.templateId = 'curry';
    gym.player!.level = gym.player!.peakLevel = 25;
    gym.player!.training.completedCourses = 6;
    gym.player!.shots = 60;
    gym.player!.equipmentTraining = {brandShots: 60, brandTotal: 3_000, cooperationCourses: [0, 0], cooperationCourseShots: [0, 0]};
    gym.player!.stats = Object.fromEntries(statKeys.map(key => [key, gym.player!.entryStats[key] + 17])) as Stats;
    gym.ownedEquipment = equipmentCatalog.filter(item => item.effects.valuePercent > 0).map(item => item.id);
    gym.equippedEquipment = [...gym.ownedEquipment];
    expect(recommendation(gym.player)).toMatchObject({credits: 23, baseCredits: 5, trainingCredits: 18, rawFame: 61, baseFame: 97});
    expect(recommendation(gym)).toMatchObject({credits: 23, fame: 128, rawFame: 61, baseFame: 128, cooperationFame: 0});
    const result = act(gym, {type: 'recommend', id: gym.player!.id});
    expect(result.credits).toBe(23);
    expect(result.fame).toBe(128);
  });

  it.each([
    [9, 5, 0], [10, 1, 0], [10, 2, 3], [14, 5, 3], [15, 2, 3],
    [15, 3, 7], [19, 5, 7], [20, 3, 7], [20, 4, 12], [24, 5, 12],
    [25, 4, 12], [25, 5, 18], [99, 5, 18],
  ])('awards only the highest qualifying actual level and tier at Lv%i, tier %i', (level, tier, expected) => {
    const gym = newGym(start, 38);
    gym.player!.level = level;
    gym.player!.peakLevel = 99;
    gym.player!.highestTier = 'legend';
    gym.player!.templateId = templateRules.find(template => template.tier === [null, 'rotation', 'starter', 'star', 'superstar', 'legend'][tier])!.id;
    expect(gym.player!.training.completedCourses).toBe(0);
    expect(recommendation(gym)).toMatchObject({baseCredits: tier, trainingCredits: expected, credits: tier + expected});
    gym.player!.training.completedCourses = 100;
    expect(recommendation(gym).trainingCredits).toBe(expected);
    expect(trainingCreditMilestones).toEqual([{level: 10, tier: 2, credits: 3}, {level: 15, tier: 3, credits: 7}, {level: 20, tier: 4, credits: 12}, {level: 25, tier: 5, credits: 18}]);
  });
});

describe('optional sponsorship cooperation', () => {
  it('offers fixed player-specific choices without consuming randomness or changing them on a gym upgrade', () => {
    const gym = newGym(start, 31);
    const randomBefore = copy(gym.rng);
    const offers = cooperationOffers(gym);
    expect(offers).toHaveLength(3);
    expect(offers.map(offer => offer.kind)).toEqual(['basic', 'specialist', 'rising']);
    expect(offers[1].focusKeys).toHaveLength(2);
    expect(cooperationOffers({...gym, gymLevel: 8})).toEqual(offers);
    expect(gym.rng).toEqual(randomBefore);
    const empty = act({...gym, gymLevel: 5}, {type: 'recommend', id: gym.player!.id});
    const next = act(empty, {type: 'recruit'});
    expect(cooperationOffers(next)[2].kind).toBe('legend');
    expect(cooperationOffers(next)[0].id).not.toBe(offers[0].id);
  });

  it('requires new shots as well as courses, then pays cooperation and qualifying equipment only on recommendation', () => {
    let gym = newGym(start, 19);
    gym.player!.shots = 9;
    gym.player!.training.shots = 9;
    gym.player!.level = 20;
    gym.player!.peakLevel = 20;
    gym.player!.templateId = templateRules.find(template => template.tier === 'starter')!.id;
    gym.player!.stats = Object.fromEntries(statKeys.map(key => [key, 60])) as Stats;
    gym.ownedEquipment = ['relic_079'];
    gym.equippedEquipment = [...gym.ownedEquipment];
    const offer = cooperationOffers(gym)[0];
    gym = act(gym, {type: 'accept-cooperation', id: offer.id, playerId: gym.player!.id});
    for (let shot = 0; shot < 10; shot++) {
      gym = withOutcome(gym, 'hold');
      const result = dispatchGym(gym, gym.revision, {type: 'train', id: gym.player!.id}, start + shot * 1000);
      expect(result.error).toBeUndefined();
      gym = result.state;
      if (shot === 0) expect(cooperationStatus(gym).complete).toBe(false);
      expect(result.events.some(event => event.type === 'cooperation-ready')).toBe(shot === 9);
    }
    expect(cooperationStatus(gym)).toMatchObject({complete: true, equipmentCredits: 0, rewardCredits: 1, rewardFame: 10});
    let another = act(withOutcome(gym, 'hold'), {type: 'train', id: gym.player!.id}, start + 10_000);
    expect(cooperationStatus(another).equipmentCredits).toBe(0); // The course already at 9/10 when accepted was not a full equipped course.
    for (let shot = 11; shot <= 20; shot++) another = act(withOutcome(another, 'hold'), {type: 'train', id: another.player!.id}, start + shot * 1000);
    expect(cooperationStatus(another)).toMatchObject({complete: true, equipmentCredits: 2, rewardCredits: 3});
    const preview = recommendation(another);
    expect(preview.cooperationCredits).toBe(3);
    expect(preview.credits).toBeLessThan(18);
    const recommended = act(another, {type: 'recommend', id: another.player!.id});
    expect(recommended.credits).toBe(preview.credits);
    expect(recommended.fame).toBe(preview.fame);
    expect(recommended.player).toBeNull();
    expect(dispatchGym(recommended, recommended.revision, {type: 'recommend', id: another.player!.id}, recommended.updatedAt).state).toBe(recommended);
  });

  it('checks both specialist abilities and resets only acceptance progress when switching cooperation', () => {
    let gym = newGym(start, 25);
    const offers = cooperationOffers(gym);
    gym = act(gym, {type: 'accept-cooperation', id: offers[0].id, playerId: gym.player!.id});
    gym.player!.shots = 12;
    gym.player!.training.completedCourses = 1;
    const changed = act(gym, {type: 'accept-cooperation', id: offers[1].id, playerId: gym.player!.id});
    expect(changed.player!.cooperation).toMatchObject({acceptedShots: 12, acceptedCourses: 1});
    expect(cooperationStatus(changed).complete).toBe(false);
    changed.player!.shots += 20;
    changed.player!.training.completedCourses += 2;
    changed.player!.templateId = templateRules.find(template => template.tier === 'starter')!.id;
    changed.player!.stats[offers[1].focusKeys[0]] = 65;
    changed.player!.stats[offers[1].focusKeys[1]] = 64;
    expect(cooperationStatus(changed).complete).toBe(false);
    changed.player!.stats[offers[1].focusKeys[1]] = 65;
    expect(cooperationStatus(changed)).toMatchObject({complete: true, rewardCredits: 3, rewardFame: 55});
    expect(dispatchGym(changed, changed.revision, {type: 'abandon-cooperation', playerId: 'wrong'}, start).state).toBe(changed);
    const abandoned = act(changed, {type: 'abandon-cooperation', playerId: changed.player!.id});
    expect(cooperationStatus(abandoned)).toMatchObject({offer: null, complete: false, requirements: []});
    expect(abandoned.player).toEqual({...changed.player, cooperation: null});
  });

  it('allows ordinary recommendation without penalty for an incomplete optional cooperation', () => {
    let gym = newGym(start, 37);
    const offer = cooperationOffers(gym)[2];
    gym = act(gym, {type: 'accept-cooperation', id: offer.id, playerId: gym.player!.id});
    const preview = recommendation(gym);
    expect(preview).toMatchObject({credits: 0, fame: 0, cooperationCredits: 0, cooperationFame: 0});
    const result = act(gym, {type: 'recommend', id: gym.player!.id});
    expect(result).toMatchObject({credits: 0, fame: 0, player: null});
    const next = act(result, {type: 'recruit'});
    expect(dispatchGym(next, next.revision, {type: 'accept-cooperation', id: offer.id, playerId: gym.player!.id}, start).state).toBe(next);
  });

  it('caps the largest combined coupon payout at thirty-three with earned cooperation equipment eligibility', () => {
    const gym = newGym(start, 22);
    gym.gymLevel = 5;
    gym.player!.enteredGymLevel = 5;
    gym.player!.templateId = 'curry';
    gym.player!.level = gym.player!.peakLevel = 25;
    gym.player!.stats = Object.fromEntries(statKeys.map(key => [key, 99])) as Stats;
    gym.player!.training.completedCourses = 6;
    gym.player!.shots = 60;
    gym.ownedEquipment = ['relic_079'];
    gym.equippedEquipment = [...gym.ownedEquipment];
    gym.player!.cooperation = {id: cooperationOffers(gym)[2].id, playerId: gym.player!.id, acceptedShots: 0, acceptedCourses: 0};
    gym.player!.equipmentTraining.cooperationCourses = [2, 2];
    expect(cooperationStatus(gym)).toMatchObject({complete: true, rewardCredits: 10, equipmentCredits: 2});
    expect(recommendation(gym)).toMatchObject({credits: 33, baseCredits: 5, trainingCredits: 18, cooperationCredits: 10});
    const result = act(gym, {type: 'recommend', id: gym.player!.id});
    expect(result.credits).toBe(33);
    expect(result.alumni[0].rewardCredits).toBe(33);
  });
});

describe('increasing experience progression', () => {
  it('uses exact integer level requirements and a cumulative sum through the 99 cap', () => {
    expect([0, 1, 2, 5, 10, 50, 98].map(requiredExperience)).toEqual([20, 27, 33, 54, 95, 695, 2049]);
    expect(['hold', 'success', 'great'].map(outcome => shotExperience(outcome as 'hold' | 'success' | 'great'))).toEqual([8, 12, 20]);
    expect(playerLevelCap).toBe(99);
    let cumulative = 0;
    for (let level = 0; level < playerLevelCap; level++) {
      expect(requiredExperience(level)).toBe(Math.ceil(20 + 6 * level + .15 * level * level));
      expect(experienceForLevel(level)).toBe(cumulative);
      cumulative += requiredExperience(level);
      expect(requiredExperience(level + 1) || Infinity).toBeGreaterThan(requiredExperience(level));
    }
    expect(experienceForLevel(99)).toBe(cumulative);
    expect([1, 5, 10, 18, 30, 99].map(experienceForLevel)).toEqual([20, 167, 518, 1555, 4509, 78920]);
    expect(requiredExperience(99)).toBe(0);
    expect(() => experienceForLevel(100)).toThrow();
  });

  it('banks partial XP without spending attribute randomness and carries excess across a level', () => {
    let gym = withOutcome(newGym(start, 47), 'success');
    const attributes = copy(gym.rng.attributes);
    const stats = copy(gym.player!.stats);
    gym = act(gym, {type: 'train', id: gym.player!.id});
    expect(gym.player).toMatchObject({level: 0, experience: 12, stats});
    expect(gym.rng.attributes).toEqual(attributes);
    gym = withOutcome(gym, 'success');
    const expectedStats = grow(stats, gym.player!.bias, 'success', 1, copy(attributes));
    gym = act(gym, {type: 'train', id: gym.player!.id}, start + 1000);
    expect(gym.player).toMatchObject({level: 1, experience: 4, stats: expectedStats});
    expect(experienceForLevel(gym.player!.level) + gym.player!.experience).toBe(24);
  });

  it('gives identical growth for the same total levels regardless of hold or great finishing the threshold', () => {
    const first = newGym(start, 73);
    const hold = withOutcome(first, 'hold');
    const great = withOutcome(first, 'great');
    hold.player!.experience = 12;
    const fromHold = act(hold, {type: 'train', id: hold.player!.id});
    const fromGreat = act(great, {type: 'train', id: great.player!.id});
    expect(fromHold.player!.stats).toEqual(fromGreat.player!.stats);
    expect(fromHold.rng.attributes).toEqual(fromGreat.rng.attributes);
    expect(fromHold.player!.level).toBe(1);
    expect(fromHold.player!.experience).toBe(0);
    expect(playerValue(fromHold)).toBe(playerValue(fromGreat));
  });
});

describe('multiple training positions and online automatic training', () => {
  function twoPlayers(seed = 83) {
    return act({...newGym(start, seed), gymLevel: 2}, {type: 'recruit'});
  }

  it('limits active recruits to gym level and preserves selected player when filling a position', () => {
    const first = newGym(start, 81);
    expect(dispatchGym(first, first.revision, {type: 'recruit'}, start).state).toBe(first);
    let gym = {...first, gymLevel: 8};
    for (let count = 1; count < 8; count++) gym = act(gym, {type: 'recruit'});
    expect(gym.player!.id).toBe(first.player!.id);
    expect(gym.bench).toHaveLength(7);
    expect(new Set(activePlayers(gym).map(player => player.id)).size).toBe(8);
    expect(dispatchGym(gym, gym.revision, {type: 'recruit'}, start).state).toBe(gym);
    const selectedId = gym.player!.id;
    const nextId = gym.bench[0].id;
    const recommended = act(gym, {type: 'recommend', id: selectedId});
    expect(recommended.player!.id).toBe(nextId);
    expect(activePlayers(recommended)).toHaveLength(7);
    expect(recommended.alumni.map(player => player.id)).toEqual([selectedId]);
  });

  it('keeps manual cooldowns independent and switching selection cannot clear a player cooldown', () => {
    let gym = twoPlayers();
    const firstId = gym.player!.id;
    const secondId = gym.bench[0].id;
    gym = act(gym, {type: 'train', id: firstId}, start + 1000);
    gym = act(gym, {type: 'select-player', id: secondId});
    gym = act(gym, {type: 'train', id: secondId});
    expect(gym.player!.shots).toBe(1);
    gym = act(gym, {type: 'select-player', id: firstId});
    expect(gym.player).toMatchObject({shots: 1, nextShotAt: start + 2000});
    expect(dispatchGym(gym, gym.revision, {type: 'train', id: firstId}, start + 1999).state).toBe(gym);
    expect(act(gym, {type: 'train', id: firstId}, start + 2000).player!.shots).toBe(2);
    expect(dispatchGym(gym, gym.revision, {type: 'train', id: secondId}, start + 2000).state).toBe(gym);
  });

  it('recovers every position exactly, including segmented time and capacity changes', () => {
    const gym = twoPlayers();
    gym.player!.stamina = 10;
    gym.player!.recoveryMs = 1234;
    gym.bench[0].stamina = 15;
    gym.bench[0].recoveryMs = 4567;
    const bulk = advanceGym(gym, start + 123_456);
    const split = [start + 100, start + 15_555, start + 100_000, start + 123_456].reduce(advanceGym, gym);
    expect({...bulk, revision: 0}).toEqual({...split, revision: 0});
    expect(bulk.bench[0]).toMatchObject({stamina: 20, recoveryMs: 0});
    const upgraded = act({...gym, credits: 10}, {type: 'upgrade-project', id: 'recovery'});
    expect(upgraded.player!.recoveryMs).toBe(Math.floor(1234 * 19 / 20));
    expect(upgraded.bench[0].recoveryMs).toBe(Math.floor(4567 * 19 / 20));
    expect(activePlayers(advanceGym(upgraded, start + 1_000_000)).every(player => player.stamina === 20 && player.recoveryMs === 0)).toBe(true);
  });

  it('unlocks automatic training freely at gym level two and caps upgrades at one-second intervals', () => {
    const first = newGym(start);
    expect(dispatchGym(first, first.revision, {type: 'set-auto', id: first.player!.id, enabled: true}, start).state).toBe(first);
    let gym = {...first, gymLevel: 2, credits: 1000};
    expect(automaticIntervalMs(gym)).toBe(2000);
    expect(autoTrainingSeconds(gym)).toBe(2);
    expect(projectOffer(gym, 'automation')).toMatchObject({level: 0, maxLevel: 1, price: 3});
    gym = act(gym, {type: 'set-auto', id: gym.player!.id, enabled: true});
    expect(gym.player).toMatchObject({autoEnabled: true, nextShotAt: start + 2000});
    gym = {...gym, gymLevel: 8};
    const intervals = [automaticIntervalMs(gym)];
    for (let level = 0; level < 5; level++) {
      gym = act(gym, {type: 'upgrade-project', id: 'automation'});
      intervals.push(automaticIntervalMs(gym));
    }
    expect(intervals).toEqual([2000, 1800, 1600, 1400, 1200, 1000]);
    expect(projectOffer(gym, 'automation').price).toBeNull();
  });

  it('takes at most one due shot per player without offline catch-up or repeated shots in the same tick', () => {
    let gym = twoPlayers();
    for (const player of activePlayers(gym)) gym = act(gym, {type: 'set-auto', id: player.id, enabled: true});
    const action = {type: 'auto-step'} as const;
    const initialRng = copy(gym.rng);
    const early = dispatchGym(gym, gym.revision, action, start + 1999);
    expect(early.error).toBeUndefined();
    expect(early.events).toEqual([]);
    expect(early.state.rng).toEqual(initialRng);
    const exact = dispatchGym(early.state, early.state.revision, action, start + 2000);
    expect(exact.events.filter(event => event.type === 'trained')).toHaveLength(2);
    expect(activePlayers(exact.state).every(player => player.shots === 1 && player.nextShotAt === start + 4000)).toBe(true);
    const repeated = dispatchGym(exact.state, exact.state.revision, action, start + 2000);
    expect(repeated.state).toBe(exact.state);
    expect(repeated.events).toEqual([]);
    const restored = advanceGym(exact.state, start + 86_400_000);
    expect(activePlayers(restored).every(player => player.shots === 1 && player.stamina === 20)).toBe(true);
    expect(restored.rng).toEqual(exact.state.rng);
    const reopened = act(restored, action);
    expect(activePlayers(reopened).every(player => player.shots === 2 && player.nextShotAt === reopened.updatedAt + 2000)).toBe(true);
  });

  it('turns automatic training off at level ninety-nine while other positions continue training', () => {
    let gym = twoPlayers(59);
    const cappedId = gym.player!.id;
    const continuingId = gym.bench[0].id;
    gym.player!.level = gym.player!.peakLevel = 98;
    gym.player!.experience = requiredExperience(98) - 1;
    for (const player of activePlayers(gym)) gym = act(gym, {type: 'set-auto', id: player.id, enabled: true});
    const first = dispatchGym(gym, gym.revision, {type: 'auto-step'}, start + 2000);
    expect(first.error).toBeUndefined();
    expect(first.state.player).toMatchObject({id: cappedId, level: 99, experience: 0, autoEnabled: false, shots: 1});
    expect(first.state.bench[0]).toMatchObject({id: continuingId, autoEnabled: true, shots: 1});
    const expectedEconomy = copy(first.state.rng.economy);
    random(expectedEconomy);
    const second = dispatchGym(first.state, first.state.revision, {type: 'auto-step'}, start + 4000);
    expect(second.events.filter(event => event.type === 'trained').map(event => event.playerId)).toEqual([continuingId]);
    expect(second.state.player).toMatchObject({level: 99, experience: 0, autoEnabled: false, shots: 1, stats: first.state.player!.stats});
    expect(second.state.bench[0]).toMatchObject({autoEnabled: true, shots: 2});
    expect(second.state.rng.economy).toEqual(expectedEconomy);
    expect(dispatchGym(second.state, second.state.revision, {type: 'set-auto', id: cappedId, enabled: true}, start + 4000).state).toBe(second.state);
    expect(dispatchGym(second.state, second.state.revision, {type: 'train', id: cappedId}, start + 4000).state).toBe(second.state);
    const recommended = act(second.state, {type: 'recommend', id: cappedId});
    expect(recommended.player).toMatchObject({id: continuingId, autoEnabled: true});
    expect(dispatchGym(recommended, recommended.revision, {type: 'recommend', id: cappedId}, start + 4000).state).toBe(recommended);
  });

  it('keeps manual and automatic modes mutually exclusive without toggle-generated shots', () => {
    let gym = {...newGym(start, 67), gymLevel: 2};
    const id = gym.player!.id;
    gym = act(gym, {type: 'train', id});
    const afterManual = copy(gym.rng);
    gym = act(gym, {type: 'set-auto', id, enabled: true});
    expect(dispatchGym(gym, gym.revision, {type: 'train', id}, start + 2000).state).toBe(gym);
    gym = act(gym, {type: 'set-auto', id, enabled: false}, start + 500);
    expect(gym.player!.nextShotAt).toBe(start + 2000);
    expect(dispatchGym(gym, gym.revision, {type: 'train', id}, start + 1999).state).toBe(gym);
    expect(gym.rng).toEqual(afterManual);
    expect(act(gym, {type: 'auto-step'}, start + 2000).player!.shots).toBe(1);
    expect(act(gym, {type: 'train', id}, start + 2000).player!.shots).toBe(2);
  });

  it('does not bypass a fresh recruit preparation time by enabling and disabling automatic training', () => {
    let gym = {...newGym(start, 52), gymLevel: 2};
    gym = act(act(gym, {type: 'recommend', id: gym.player!.id}), {type: 'recruit'});
    const id = gym.player!.id;
    expect(gym.player!.nextShotAt).toBe(start + 1000);
    gym = act(gym, {type: 'set-auto', id, enabled: true});
    expect(gym.player!.nextShotAt).toBe(start + 2000);
    expect(act(gym, {type: 'auto-step'}, start + 1000).player!.shots).toBe(0);
    expect(dispatchGym(gym, gym.revision, {type: 'train', id}, start + 1000).state).toBe(gym);
    gym = act(gym, {type: 'set-auto', id, enabled: false}, start + 1000);
    expect(dispatchGym(gym, gym.revision, {type: 'train', id}, start + 1999).state).toBe(gym);
    expect(act(gym, {type: 'train', id}, start + 2000).player!.shots).toBe(1);
  });

  it('keeps per-player cooperation, XP and cooldown with the person across selection and recommendation', () => {
    let gym = twoPlayers(91);
    const firstId = gym.player!.id;
    const secondId = gym.bench[0].id;
    gym = act(gym, {type: 'accept-cooperation', id: cooperationOffers(gym)[0].id, playerId: firstId});
    gym = act(withOutcome(gym, 'hold'), {type: 'train', id: firstId});
    const first = copy(gym.player!);
    gym = act(gym, {type: 'select-player', id: secondId});
    expect(cooperationStatus(gym).offer).toBeNull();
    expect(cooperationStatus(gym, gym.bench[0]).offer!.id).toBe(first.cooperation!.id);
    expect(trainingStatus(gym, gym.bench[0]).shots).toBe(1);
    gym = act(gym, {type: 'accept-cooperation', id: cooperationOffers(gym)[1].id, playerId: secondId});
    const secondCooperation = copy(gym.player!.cooperation);
    gym = act(gym, {type: 'select-player', id: firstId});
    expect(gym.player).toEqual(first);
    gym = act(gym, {type: 'recommend', id: firstId});
    expect(gym.player!.id).toBe(secondId);
    expect(gym.player!.cooperation).toEqual(secondCooperation);
    expect(gym.alumni[0].cooperation).toEqual(first.cooperation);
    expect(cooperationStatus(gym).offer!.id).toBe(secondCooperation!.id);
  });

  it('assigns automatic RNG in stable player order, regardless of current selection', () => {
    let gym = twoPlayers(101);
    for (const player of activePlayers(gym)) gym = act(gym, {type: 'set-auto', id: player.id, enabled: true});
    const otherSelection = act(gym, {type: 'select-player', id: gym.bench[0].id});
    const first = act(gym, {type: 'auto-step'}, start + 2000);
    const second = act(otherSelection, {type: 'auto-step'}, start + 2000);
    const playersById = (state: GymState) => Object.fromEntries(activePlayers(state).map(player => [player.id, player]));
    expect(playersById(first)).toEqual(playersById(second));
    expect(first.rng).toEqual(second.rng);
    expect(first.collection).toEqual(second.collection);
  });

  it('uses identical XP, attributes, course progress and matching for manual and online automatic shots', () => {
    let manual = {...newGym(start, 54), gymLevel: 2};
    let automatic = act(manual, {type: 'set-auto', id: manual.player!.id, enabled: true});
    for (let shot = 1; shot <= 25; shot++) {
      manual = act(manual, {type: 'train', id: manual.player!.id}, start + shot * 2000);
      automatic = act(automatic, {type: 'auto-step'}, start + shot * 2000);
    }
    const {autoEnabled: _manualAuto, nextShotAt: _manualNext, ...manualPlayer} = manual.player!;
    const {autoEnabled: _automaticAuto, nextShotAt: _automaticNext, ...automaticPlayer} = automatic.player!;
    expect(automaticPlayer).toEqual(manualPlayer);
    expect(automatic.rng).toEqual(manual.rng);
    expect(automatic.collection).toEqual(manual.collection);
  });
});
