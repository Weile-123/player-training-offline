import {describe, expect, it} from 'vitest';
import {automaticIntervalMs, experienceForLevel, newGym, trainingShotExperience} from './engine';
import {settleOfflineGym} from './offline';

describe('automatic training project efficiency', () => {
  it('gives every automatic upgrade exactly one extra XP per outcome while manual shots retain their base XP', () => {
    const state = {...newGym(1_000, 17), gymLevel: 8};
    state.player!.autoEnabled = true;
    for (let level = 0; level <= 5; level++) {
      state.projects.automation = level;
      expect(['hold', 'success', 'great'].map(outcome => trainingShotExperience(state, outcome as 'hold' | 'success' | 'great')))
        .toEqual([8 + level, 12 + level, 20 + level]);
      expect(automaticIntervalMs(state)).toBe(2_000 - level * 200);
      state.player!.autoEnabled = false;
      expect(trainingShotExperience(state, 'success')).toBe(12);
      state.player!.autoEnabled = true;
    }
  });

  it('improves gained XP in a fixed supply-limited window even when no extra shots fit', () => {
    const results = Array.from({length: 6}, (_, level) => {
      const state = {...newGym(1_000, 17), gymLevel: 8};
      state.projects.automation = level;
      state.player!.autoEnabled = true;
      state.player!.nextShotAt = state.updatedAt + automaticIntervalMs(state);
      const settled = settleOfflineGym(state, state.updatedAt + 1_800_000);
      const player = settled.state.player!;
      return {shots: player.shots, xp: experienceForLevel(player.level) + player.experience};
    });
    expect(results.map(result => result.shots)).toEqual([177, 177, 177, 177, 177, 177]);
    for (let level = 1; level < 6; level++) expect(results[level].xp - results[level - 1].xp).toBe(177);
  });

  it('keeps the old experience rule when consuming a pre-upgrade offline window', () => {
    const state = {...newGym(1_000, 17), gymLevel: 8};
    state.projects.automation = 5;
    state.player!.autoEnabled = true;
    state.offlineRulesVersion = 1;
    expect(trainingShotExperience(state, 'success')).toBe(12);
    delete state.offlineRulesVersion;
    expect(trainingShotExperience(state, 'great')).toBe(20);
  });
});
