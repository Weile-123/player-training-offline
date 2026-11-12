import {describe, expect, it} from 'vitest';
import {dispatchGym, newGym} from './engine';
import {decodeGym, encodeGym, gymSaveKeys, readGym, validGym, writeGym, type GymStorage} from './save';
import {hash} from '../contract/random';

function envelope(value: unknown): string {
  const payload = JSON.stringify(value);
  return JSON.stringify({format: 'gym-management-envelope-v1', checksum: hash(payload), payload});
}

function storage() {
  const data = new Map<string, string>();
  const port: GymStorage = {getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }};
  return {data, port};
}

describe('gym save boundaries', () => {
  it('roundtrips the independent namespace and restores the latest backup', () => {
    const {port, data} = storage();
    data.set('player-training.contract.v2', 'old-contract');
    const state = newGym(1_000, 17);
    expect(writeGym(port, state)).toEqual({ok: true, backupOk: true});
    expect(readGym(port).state).toEqual(state);
    data.set(gymSaveKeys.main, 'corrupt');
    expect(readGym(port)).toEqual({state, source: 'backup'});
    expect(data.get('player-training.contract.v2')).toBe('old-contract');
  });

  it('rejects tampering and invalid inventory, progression, or player data', () => {
    const state = newGym(1_000, 17);
    const envelope = JSON.parse(encodeGym(state));
    envelope.payload = envelope.payload.replace('"credits":0', '"credits":999');
    expect(decodeGym(JSON.stringify(envelope))).toBeNull();
    expect(validGym({...state, credits: -1})).toBe(false);
    expect(validGym({...state, projects: {...state.projects, endurance: 8}})).toBe(false);
    expect(validGym({...state, equippedEquipment: ['relic_002']})).toBe(false);
    expect(validGym({...state, player: {...state.player!, stats: {...state.player!.stats, three: 100}}})).toBe(false);
  });

  it('never exposes an uncommitted reward in the backup when the main write fails', () => {
    const {port, data} = storage();
    const state = newGym(1_000, 17);
    writeGym(port, state);
    const failing: GymStorage = {getItem: port.getItem, setItem: (key, value) => {
      if (key === gymSaveKeys.main) throw new Error('quota');
      port.setItem(key, value);
    }};
    expect(writeGym(failing, {...state, credits: 5})).toMatchObject({ok: false});
    data.set(gymSaveKeys.main, 'corrupt');
    expect(readGym(port).state?.credits).toBe(0);
  });

  it('commits a valid main save even when the backup slot is unavailable', () => {
    const {port} = storage();
    const failing: GymStorage = {getItem: port.getItem, setItem: (key, value) => {
      if (key === gymSaveKeys.backup) throw new Error('quota');
      port.setItem(key, value);
    }};
    const state = newGym(1_000, 17);
    expect(writeGym(failing, state)).toEqual({ok: true, backupOk: false});
    expect(readGym(port).state).toEqual(state);
  });

  it('adds only missing feature defaults to old active players and alumni without replaying rewards', () => {
    const state = newGym(1_000, 17);
    const legacy = JSON.parse(JSON.stringify(state));
    legacy.gymLevel = 3;
    legacy.credits = 27;
    legacy.fame = 1_300;
    legacy.player.shots = 27;
    delete legacy.player.training;
    delete legacy.player.enteredGymLevel;
    delete legacy.player.experience;
    delete legacy.player.nextShotAt;
    delete legacy.player.autoEnabled;
    delete legacy.player.cooperation;
    delete legacy.bench;
    delete legacy.balanceVersion;
    legacy.nextShotAt = 1_600;
    legacy.alumni = [{...legacy.player, id: 'gym-p99', recommendedAt: 1_000, rewardCredits: 5, rewardFame: 100, finalValue: '5000'}];
    delete legacy.cooperation;
    const restored = decodeGym(envelope(legacy))!;
    expect(restored.player!.training).toEqual({planId: 'balanced', shots: 0, completedCourses: 0});
    expect(restored.player!.enteredGymLevel).toBe(3);
    expect(restored.alumni[0].training).toEqual(restored.player!.training);
    expect(restored.alumni[0].enteredGymLevel).toBe(3);
    expect(restored.player!.cooperation).toBeNull();
    expect(restored.player).toMatchObject({experience: 0, nextShotAt: 1_600, autoEnabled: false});
    expect(restored.bench).toEqual([]);
    expect(restored.cooperation).toBeUndefined();
    expect(restored.credits).toBe(27);
    expect(restored.fame).toBe(1_300);
    expect(restored.createdAt).toBe(state.createdAt);
    expect(restored.rng).toEqual(state.rng);
    expect(restored.player!.stats).toEqual(state.player!.stats);
    expect(restored.player!.shots).toBe(27);
    expect(decodeGym(encodeGym(restored))).toEqual(restored);
  });

  it('migrates a legacy active cooperation and cooldown without retroactive XP', () => {
    const current = newGym(1_000, 23);
    const legacy = JSON.parse(JSON.stringify(current));
    const athlete = legacy.player;
    delete legacy.bench;
    delete legacy.balanceVersion;
    for (const field of ['experience', 'autoEnabled', 'nextShotAt', 'cooperation']) delete athlete[field];
    legacy.nextShotAt = 2_000;
    legacy.cooperation = {id: athlete.id + ':basic', playerId: athlete.id, acceptedShots: 0, acceptedCourses: 0};
    const restored = decodeGym(envelope(legacy))!;
    expect(restored.player).toMatchObject({experience: 0, nextShotAt: 2_000, autoEnabled: false, cooperation: legacy.cooperation});
    expect(restored.rng).toEqual(current.rng);
    expect(restored.player!.level).toBe(current.player!.level);
  });

  it('roundtrips independent multi-player progress and rejects duplicate or over-capacity rosters', () => {
    const gym = {...newGym(1_000, 23), gymLevel: 2};
    const recruited = dispatchGym(gym, gym.revision, {type: 'recruit'}, 1_000).state;
    expect(recruited.bench).toHaveLength(1);
    recruited.player!.experience = 12;
    recruited.bench[0].experience = 8;
    recruited.bench[0].autoEnabled = true;
    expect(decodeGym(encodeGym(recruited))).toEqual(recruited);
    expect(validGym({...recruited, bench: [recruited.player!]})).toBe(false);
    expect(validGym({...recruited, gymLevel: 1})).toBe(false);
    expect(validGym({...recruited, player: null})).toBe(false);
    expect(validGym({...recruited, player: {...recruited.player!, experience: 20}})).toBe(false);
    expect(validGym({...recruited, player: {...recruited.player!, autoEnabled: 'yes'}})).toBe(false);
    const damaged = JSON.parse(JSON.stringify(recruited));
    delete damaged.bench[0].experience;
    expect(decodeGym(envelope(damaged))).toBeNull();
  });

  it('migrates heavy-curve XP by completion ratio once without granting levels, attributes, or rewards', () => {
    const previous = JSON.parse(JSON.stringify(newGym(1_000, 23)));
    delete previous.balanceVersion;
    previous.player.level = previous.player.peakLevel = 30;
    previous.player.experience = 1_000;
    const restored = decodeGym(envelope(previous))!;
    expect(restored.balanceVersion).toBe(3);
    expect(restored.player).toMatchObject({level: 30, peakLevel: 30, experience: Math.floor(1_000 * 335 / 1_100)});
    expect(restored.player!.stats).toEqual(previous.player.stats);
    expect(restored.rng).toEqual(previous.rng);
    expect(restored.credits).toBe(previous.credits);
    expect(restored.collection).toEqual(previous.collection);
    expect(decodeGym(encodeGym(restored))).toEqual(restored);
    expect(decodeGym(envelope({...previous, balanceVersion: 99}))).toBeNull();
    expect(decodeGym(envelope({...previous, player: {...previous.player, experience: 1_100}}))).toBeNull();
    expect(decodeGym(envelope({...previous, balanceVersion: 2}))).toBeNull();
  });

  it('migrates thirty-base rosters to twenty-base caps without resetting player progress or history', () => {
    const initial = {...newGym(1_000, 23), gymLevel: 2};
    initial.projects.endurance = 1;
    const previous = JSON.parse(JSON.stringify(dispatchGym(initial, initial.revision, {type: 'recruit'}, 1_000).state));
    previous.balanceVersion = 2;
    previous.player.stamina = 35;
    previous.player.recoveryMs = 7_000;
    previous.player.experience = 12;
    previous.bench[0].stamina = 17;
    previous.bench[0].recoveryMs = 1_200;
    previous.alumni = [{...previous.player, id: 'history-p1', recommendedAt: 1_000, rewardCredits: 0, rewardFame: 0, finalValue: '320'}];
    const restored = decodeGym(envelope(previous))!;
    expect(restored.balanceVersion).toBe(3);
    expect(restored.player).toMatchObject({stamina: 25, recoveryMs: 0, experience: 12});
    expect(restored.bench[0]).toMatchObject({stamina: 17, recoveryMs: 1_200});
    expect(restored.alumni[0].stamina).toBe(35);
    expect(restored.player!.stats).toEqual(previous.player.stats);
    expect(restored.rng).toEqual(previous.rng);
    expect(restored.projects).toEqual(previous.projects);
    expect(decodeGym(encodeGym(restored))).toEqual(restored);
    expect(decodeGym(envelope({...previous, balanceVersion: 3}))).toBeNull();
    expect(validGym({...restored, player: {...restored.player!, stamina: 26}})).toBe(false);
  });

  it('rejects explicitly invalid new feature data instead of replacing it with defaults', () => {
    const state = newGym(1_000, 17);
    for (const training of [null, {}, {planId: 'unknown', shots: 0, completedCourses: 0},
      {planId: 'balanced', shots: 10, completedCourses: 0}, {planId: 'balanced', shots: 0, completedCourses: 1}]) {
      expect(decodeGym(envelope({...state, player: {...state.player!, training}}))).toBeNull();
    }
    expect(decodeGym(envelope({...state, player: {...state.player!, enteredGymLevel: 0}}))).toBeNull();
    expect(decodeGym(envelope({...state, cooperation: {id: 'unknown', playerId: state.player!.id, acceptedShots: 0, acceptedCourses: 0}}))).toBeNull();
  });

  it('validates cooperation ownership and accepted progress while retaining new total awards', () => {
    const state = newGym(1_000, 17);
    const cooperation = {id: `${state.player!.id}:basic`, playerId: state.player!.id, acceptedShots: 0, acceptedCourses: 0};
    expect(decodeGym(envelope({...state, player: {...state.player!, cooperation}}))?.player!.cooperation).toEqual(cooperation);
    expect(decodeGym(envelope({...state, player: {...state.player!, cooperation: {...cooperation, playerId: 'other'}}}))).toBeNull();
    expect(decodeGym(envelope({...state, player: {...state.player!, cooperation: {...cooperation, acceptedShots: 1}}}))).toBeNull();
    expect(decodeGym(envelope({...state, player: {...state.player!, cooperation: {...cooperation, acceptedCourses: 1}}}))).toBeNull();
    const alumnus = {...state.player!, recommendedAt: 1_000, rewardCredits: 18, rewardFame: 300, finalValue: '5000'};
    expect(decodeGym(envelope({...state, player: null, alumni: [alumnus]}))?.alumni[0].rewardCredits).toBe(18);
    expect(decodeGym(envelope({...state, player: null, alumni: [{...alumnus, rewardCredits: 27}]}))?.alumni[0].rewardCredits).toBe(27);
    expect(decodeGym(envelope({...state, player: null, alumni: [{...alumnus, rewardCredits: 28}]}))).toBeNull();
  });
});
