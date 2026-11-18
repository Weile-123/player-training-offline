import {describe, expect, it} from 'vitest';
import {cooperationUnlockLevel, selectedRecruitmentUnlockLevel, trainingPlanUnlockLevel} from './catalog';
import {cooperationOffers, cooperationStatus, dispatchGym, effectiveTrainingBias, equipmentOffer, newGym, recommendation,
 type GymAction, type GymState, type HeightPreference} from './engine';
import {decodeGym, encodeGym, validGym} from './save';
import {templateRules} from '../contract/templates';

const now = 1_700_000_000_000;
const act = (state: GymState, action: GymAction) => dispatchGym(state, state.revision, action, state.updatedAt);

describe('gym feature availability', () => {
 it('opens training and cooperation at 1 while selected recruitment remains at 4', () => {
  expect([trainingPlanUnlockLevel, cooperationUnlockLevel, selectedRecruitmentUnlockLevel]).toEqual([1, 1, 4]);
 });

 it('allows a plan change from Lv.1 and resets only the unfinished course', () => {
  const state = newGym(now);
  state.player!.training.shots = 7;
  const action = {type: 'set-training-plan', id: 'shooting', playerId: state.player!.id} as const;
  const unlocked = act(state, action);
  expect(unlocked.error).toBeUndefined();
  expect(unlocked.state.player!.training).toMatchObject({planId: 'shooting', shots: 0});
 });

 it('applies a saved specialization immediately from Lv.1', () => {
  const state = newGym(now);
  const natural = effectiveTrainingBias(state);
  state.player!.training.planId = 'shooting';
  expect(effectiveTrainingBias(state).three).toBeGreaterThan(natural.three);
  expect(state.player!.training.planId).toBe('shooting');
  state.gymLevel = 2;
  expect(effectiveTrainingBias(state).three).toBeGreaterThan(natural.three);
 });

 it('accrues courses and restores stamina from Lv.1 while retaining past courses', () => {
  const state = newGym(now);
  state.player!.training.shots = 9;
  state.player!.training.completedCourses = 2;
  state.player!.shots = 29;
  state.player!.stamina = 7;
  const result = act(state, {type: 'train', id: state.player!.id});
  expect(result.error).toBeUndefined();
  expect(result.state.player!.training).toMatchObject({shots: 0, completedCourses: 3});
  expect(result.state.player!.stamina).toBe(10);
  expect(result.events).toContainEqual({type: 'course-completed', playerId: state.player!.id, restoredStamina: 4});
 });

 it('preserves the same base course recovery after upgrading to Lv.2', () => {
  const state = newGym(now);
  state.gymLevel = 2;
  state.player!.training.shots = 9;
  state.player!.stamina = 7;
  const result = act(state, {type: 'train', id: state.player!.id});
  expect(result.error).toBeUndefined();
  expect(result.state.player!.training).toMatchObject({shots: 0, completedCourses: 1});
  expect(result.state.player!.stamina).toBe(10);
  expect(result.events).toContainEqual({type: 'course-completed', playerId: state.player!.id, restoredStamina: 4});
 });

 it('keeps level/template training bonuses independent of the course unlock', () => {
  const state = newGym(now);
  state.player!.level = state.player!.peakLevel = 10;
  state.player!.templateId = templateRules.find(template => template.tier === 'starter')!.id;
  expect(recommendation(state).trainingCredits).toBe(3);
 });

 it.each(['accept-cooperation', 'abandon-cooperation', 'complete-cooperation-ad'] as const)('allows %s from Lv.1', type => {
  const state = newGym(now);
  const id = cooperationOffers(state)[0].id;
  if(type === 'abandon-cooperation') state.player!.cooperation = {id, playerId: state.player!.id, acceptedShots: 0, acceptedCourses: 0, acceptedRevision: 0};
  const action: GymAction = type === 'accept-cooperation' ? {type, id, playerId: state.player!.id}
   : type === 'abandon-cooperation' ? {type, playerId: state.player!.id}
    : {type, id, playerId: state.player!.id, expectedCooperationId: null, expectedCooperationRevision: null};
  const result = act(state, action);
  expect(result.error).toBeUndefined();
  expect(result.state.player!.cooperation === null).toBe(type === 'abandon-cooperation');
  if(type === 'complete-cooperation-ad') expect(cooperationStatus(result.state).complete).toBe(true);
 });

 it('permits cooperation acceptance and rewarded completion at Lv.1', () => {
  const state = newGym(now);
  const id = cooperationOffers(state)[0].id;
  const accepted = act(state, {type: 'accept-cooperation', id, playerId: state.player!.id});
  expect(accepted.error).toBeUndefined();
  const active = accepted.state.player!.cooperation!;
  const completed = act(accepted.state, {type: 'complete-cooperation-ad', id, playerId: state.player!.id,
   expectedCooperationId: id, expectedCooperationRevision: active.acceptedRevision!});
  expect(completed.error).toBeUndefined();
  expect(cooperationStatus(completed.state).complete).toBe(true);
 });

 it('preserves a valid old cooperation and already-earned courses in a Lv.1 save', () => {
  const state = newGym(now);
  state.player!.training.completedCourses = 2;
  state.player!.shots = 20;
  state.player!.cooperation = {id: cooperationOffers(state)[0].id, playerId: state.player!.id,
   acceptedShots: 0, acceptedCourses: 0, acceptedRevision: 0, adCompleted: true};
  expect(validGym(state)).toBe(true);
  const restored = decodeGym(encodeGym(state));
  expect(restored?.player!.training.completedCourses).toBe(2);
  expect(restored?.player!.cooperation).toEqual(state.player!.cooperation);
  expect(cooperationStatus(state).complete).toBe(true);
 });

 it.each<HeightPreference>(['any', 'guard', 'forward', 'center'])('allows the %s height preference on a free Lv.1 recruit', preference => {
  const state = newGym(now);
  const empty = act(state, {type: 'recommend', id: state.player!.id}).state;
  const recruited = act(empty, {type: 'recruit', preference});
  expect(recruited.error).toBeUndefined();
  const [low, high] = {any: [178, 218], guard: [178, 194], forward: [195, 205], center: [206, 218]}[preference];
  expect(recruited.state.player!.height).toBeGreaterThanOrEqual(low);
  expect(recruited.state.player!.height).toBeLessThanOrEqual(high);
 });

 it('opens selected recruitment at Lv.4 and still charges eight coupons', () => {
  const state = newGym(now);
  state.gymLevel = 3; state.credits = 99;
  const action = {type: 'recruit', mode: 'selected', direction: 'shooting', expectedNextPlayer: state.nextPlayer} as const;
  expect(act(state, action).error).toContain('4');
  state.gymLevel = 4;
  const result = act(state, action);
  expect(result.error).toBeUndefined();
  expect(result.state.credits).toBe(91);
  expect(result.state.bench).toHaveLength(1);
 });

 it('offers the basic course recovery gear from Lv.1 at its unchanged five-coupon price', () => {
  const state = newGym(now);
  expect(equipmentOffer(state, 'relic_017').price).toBe(5);
  state.gymLevel = 2;
  expect(equipmentOffer(state, 'relic_017').price).toBe(5);
 });
});
