import {describe, expect, it} from 'vitest';
import {playerValue, requiredExperience, shotCooldownMs, type GymAction, type HeightPreference} from '../game/gym/engine';
import {templateRules} from '../game/contract/templates';
import {validGym} from '../game/gym/save';
import {createGymStore} from '../gymStore';
import {createGymTutorialState, createGymTutorialStore, gymTutorialAfterAction, gymTutorialAfterPanel, gymTutorialGuide, prepareGymTutorialSecondUpgrade, type GymTutorialStep} from './gymTutorial';

const at = 1_800_000_000_000;
describe('independent gym practice', () => {
 it('starts in a valid empty Lv.1 gym, ready for real recruitment', () => {
  const state = createGymTutorialState(at);
  expect(validGym(state)).toBe(true);
  expect(state).toMatchObject({player: null, bench: [], gymLevel: 1, credits: 0, fame: 0, alumni: [], collection: {}});
 });

 it.each<HeightPreference>(['any', 'guard', 'forward', 'center'])('demonstrates two separate real upgrades and template acquisition for %s recruitment', async preference => {
  let now = at, step: GymTutorialStep = 'recruit-confirm';
  const practice = createGymTutorialStore(() => now);
  const command = async (action: GymAction) => {
   now += shotCooldownMs;
   const result = await practice.getState().act(action);
   expect(result.error).toBeUndefined(); expect(validGym(result.state)).toBe(true);
   step = gymTutorialAfterAction(step, action, result); return result;
  };
  await command({type: 'recruit', preference}); expect(step).toBe('xp-first');
  const recruited = structuredClone(practice.getState().state), id = recruited.player!.id;
  const threshold = Math.min(...templateRules.map(template => template.minLevel));
  expect(recruited.player).toMatchObject({level: threshold - 2, templateId: null, experience: requiredExperience(threshold - 2) - 1});
  step = 'train-first'; const first = await command({type: 'train', id}); expect(step).toBe('growth-first');
  expect(first.state.player).toMatchObject({level: threshold - 1, templateId: null});
  expect(first.events).not.toContainEqual(expect.objectContaining({type: 'template-unlocked'}));
  expect(Object.values(first.state.player!.stats).reduce((a, b) => a + b)).toBeGreaterThan(Object.values(recruited.player!.stats).reduce((a, b) => a + b));
  expect(Number(playerValue(first.state))).toBeGreaterThan(Number(playerValue(recruited)));
  const beforePreparation = structuredClone(first.state);
  prepareGymTutorialSecondUpgrade(practice);
  expect(practice.getState().state).toEqual({...beforePreparation, player: {...beforePreparation.player!, experience: requiredExperience(threshold - 1) - 1}});
  step = 'train-second'; const second = await command({type: 'train', id}); expect(step).toBe('growth-template');
  expect(second.state.player!.level).toBe(threshold); expect(second.state.player!.templateId).toBeTruthy();
  expect(second.events).toContainEqual(expect.objectContaining({type: 'template-unlocked'}));
  expect(second.state.player!.training.completedCourses).toBe(0);
  step = gymTutorialAfterPanel('recommend-open', 'recommend'); expect(step).toBe('recommend-confirm');
  const result = await command({type: 'recommend', id}); expect(step).toBe('rewards');
  expect(result.state.player).toBeNull(); expect(result.state.alumni).toHaveLength(1);
  expect(result.state.credits).toBeGreaterThan(0); expect(result.state.fame).toBeGreaterThan(0);
  expect(gymTutorialGuide(step, result.state)?.description).toContain(`${result.state.alumni[0].rewardCredits} 张赞助券`);
  expect(gymTutorialAfterPanel('club-open', 'club')).toBe('club');
 });

 it('rejects platform rewards, automation, plans, cooperation and construction in practice', async () => {
  const practice = createGymTutorialStore(() => at), before = structuredClone(practice.getState().state);
  for (const action of [{type: 'share-player-levels', playerId: 'gym-p1'}, {type: 'set-auto', id: 'gym-p1', enabled: true}, {type: 'upgrade-gym'}, {type: 'set-training-plan', id: 'shooting', playerId: 'gym-p1'}, {type: 'accept-cooperation', id: 'basic', playerId: 'gym-p1'}] as GymAction[]) expect((await practice.getState().act(action)).error).toBeTruthy();
  await practice.getState().hydrate(); await practice.getState().resume(); await practice.getState().tick(); await practice.getState().flush(); await practice.getState().suspend();
  expect(practice.getState().state).toEqual(before); expect(practice.getState().pendingOfflineReport).toBeNull();
 });

 it('does not change a real gym, its random stream, storage or alumni history', async () => {
  const values = new Map<string, string>(), storage = {getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => {values.set(key, value);}};
  const real = createGymStore(storage, 99, () => at); await real.getState().start();
  const before = structuredClone(real.getState().state), saved = [...values.entries()];
  let now = at; const practice = createGymTutorialStore(() => now);
  await practice.getState().act({type: 'recruit'});
  for (let shot = 0; shot < 3; shot++) {now += shotCooldownMs; await practice.getState().act({type: 'train', id: practice.getState().state.player!.id});}
  expect(real.getState().state).toEqual(before); expect([...values.entries()]).toEqual(saved);
  expect(await real.getState().loadAlumni()).toEqual({players: [], total: 0});
 });

 it('keeps invalid, premature and failed actions from advancing the lesson', async () => {
  const practice = createGymTutorialStore(() => at), state = practice.getState().state;
  const result = await practice.getState().act({type: 'train', id: 'wrong-player'});
  expect(result.error).toBeTruthy(); expect(gymTutorialAfterAction('train-first', {type: 'train', id: 'wrong-player'}, result)).toBe('train-first');
  expect(gymTutorialAfterAction('train-second', {type: 'train', id: 'gym-p1'}, {state, events: [{type: 'trained', levelGain: 1}]})).toBe('train-second');
  expect(gymTutorialAfterPanel('recruit-open', 'training')).toBe('recruit-open');
  expect(gymTutorialAfterPanel('recruit-open', 'recruit')).toBe('recruit-height');
 });
});
