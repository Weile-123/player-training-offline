import {describe, expect, it} from 'vitest';
import {forecastTraining, estimateShotTime} from './forecast';
import {trainingGuidance} from './guidance';
import {newGym} from './engine';
import {statKeys} from '../types';

describe('training forecasts and recommendation milestones', () => {
  it('computes a stopping expectation rather than dividing required XP by mean XP', () => {
    const state = newGym(1_000, 17);
    const forecast = forecastTraining(state, state.player, 1)!;
    expect(forecast.expectedShots).toBeCloseTo(1.99, 10);
    expect(forecast.minShots).toBe(1);
    expect(forecast.maxShots).toBe(3);
    expect(forecast.estimatedMs).toBe(1_000);
    expect(forecast.automatic).toBe(false);
  });

  it('waits for real stamina before completing the tenth ball of a course', () => {
    const state = newGym(1_000, 17);
    state.player!.stamina = 0;
    state.player!.recoveryMs = 8_000;
    state.player!.training.shots = 9;
    expect(estimateShotTime(state, state.player!, 1)).toBe(12_000);
    expect(estimateShotTime(state, state.player!, 2)).toBe(13_000);
  });

  it('predicts a shorter goal time with genuine automatic XP upgrades while preserving state and RNG', () => {
    const state = {...newGym(1_000, 17), gymLevel: 6};
    state.player!.autoEnabled = true;
    state.player!.nextShotAt = 3_000;
    const before = JSON.stringify(state);
    const base = forecastTraining(state)!;
    const faster = forecastTraining({...state, projects: {...state.projects, automation: 5}})!;
    expect(faster.expectedShots).toBeLessThan(base.expectedShots);
    expect(faster.estimatedMs).toBeLessThan(base.estimatedMs);
    expect(faster.withinOfflineLimit).toBe(false);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('gives a template gap rather than promising a bonus just for reaching its level', () => {
    const state = newGym(1_000, 17);
    state.player!.level = 15;
    state.player!.peakLevel = 15;
    const guidance = trainingGuidance(state)!;
    expect(guidance.currentBonus).toBe(0);
    expect(guidance.nextBonus).toMatchObject({level: 10, tierName: '首发', levelGap: 0, tierGap: 2, credits: 3});
    expect(guidance.suggestion).toContain('仍需匹配首发');
    expect(guidance.remainingValue[0]).toContain('匹配首发');
  });

  it('separates full attributes from the actual level cap', () => {
    const state = newGym(1_000, 17);
    state.player!.level = 61;
    state.player!.peakLevel = 61;
    for (const key of statKeys) state.player!.stats[key] = 99;
    const guidance = trainingGuidance(state)!;
    expect(guidance.allStatsMax).toBe(true);
    expect(guidance.remainingValue.join('')).toContain('继续训练不会增加属性');
    expect(forecastTraining(state)!.finished).toBe(false);
    state.player!.level = 99;
    state.player!.experience = 0;
    expect(forecastTraining(state)!).toMatchObject({finished: true, estimatedMs: 0});
    const ended = trainingGuidance(state)!;
    expect(ended.suggestion).toContain('训练已结束');
    expect(ended.nextBonus).toBeNull();
    expect(ended.remainingValue[0]).toContain('按当前实际模板结算');
    expect(ended.remainingValue.join('')).not.toContain('已达到最高培养奖金');
  });
});
