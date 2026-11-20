import {automaticIntervalMs, experienceForLevel, guaranteedGreatShots, playerLevelCap, recoverySeconds, shotCooldownMs, staminaMax, trainingShotExperience, trainingStatus, type GymPlayer, type GymState} from './engine';
import {offlineLimitMs} from './offline';

export type TrainingForecast = {
  targetLevel: number; expectedShots: number; estimatedMs: number; minShots: number; maxShots: number;
  withinOfflineLimit: boolean; automatic: boolean; finished: boolean;
};

// E[r] is the exact stopping expectation for independent integer-XP outcomes.
// Cache by payout tuple; elapsed time below is a deterministic supply estimate,
// not a guarantee of the random finishing time or any particular template.
const expectations = new Map<string, Float64Array>();
const exactExpectationLimit = 100_000;
function stoppingShots(required: number, payouts: readonly number[]): number {
  // At long horizons the final shot's overshoot is negligible. Divide by mean
  // XP to avoid allocating one entry for every remaining experience point.
  if (required > exactExpectationLimit) return required * 10 / (3 * payouts[0] + 6 * payouts[1] + payouts[2]);
  const key = payouts.join(':');
  let table = expectations.get(key);
  if (!table || table.length <= required) {
    const next = new Float64Array(required + 1);
    if (table) next.set(table);
    for (let r = table?.length ?? 1; r <= required; r++) {
      next[r] = 1 + .3 * next[Math.max(0, r - payouts[0])] + .6 * next[Math.max(0, r - payouts[1])] + .1 * next[Math.max(0, r - payouts[2])];
    }
    table = next;
    expectations.set(key, table);
  }
  return table[required];
}

/** Time for a number of shots with fixed settings; no RNG or persistent writes. */
export function estimateShotTime(state: GymState, player: GymPlayer, shots: number): number {
  if (shots <= 0) return 0;
  const capacity = staminaMax(state);
  const recovery = recoverySeconds(state) * 1_000;
  const interval = player.autoEnabled ? automaticIntervalMs(state) : shotCooldownMs;
  const courseReturn = trainingStatus(state, player).nextRecovery;
  let stamina = player.stamina;
  let remainder = player.recoveryMs;
  let course = player.training.shots;
  let nextShot = Math.max(0, player.nextShotAt - state.updatedAt);
  let at = 0;
  let completed = 0;
  const courseStarts = shots > 10_000 ? new Map<number, {completed: number; at: number}>() : null;
  while (completed < shots) {
    // After the first shot, cooldown is fixed. Repeating a course boundary's
    // stamina and recovery remainder repeats its shot timing exactly.
    if (courseStarts && completed > 0 && course === 0) {
      const key = stamina * recovery + remainder;
      const prior = courseStarts.get(key);
      if (prior) {
        const cycleSize = completed - prior.completed;
        const repeats = Math.floor((shots - completed) / cycleSize);
        if (repeats > 0) {
          at += repeats * (at - prior.at);
          completed += repeats * cycleSize;
          nextShot = at + interval;
          if (completed === shots) break;
        }
      } else {
        courseStarts.set(key, {completed, at});
      }
    }
    const next = Math.max(at, nextShot, stamina < 1 ? at + recovery - remainder : at);
    const elapsed = next - at;
    if (stamina >= capacity || elapsed >= (capacity - stamina) * recovery - remainder) {
      stamina = capacity;
      remainder = 0;
    } else {
      const accumulated = remainder + elapsed;
      stamina += Math.floor(accumulated / recovery);
      remainder = accumulated % recovery;
    }
    at = next;
    stamina--;
    course++;
    if (course === 10) {course = 0; stamina = Math.min(capacity, stamina + courseReturn);}
    if (stamina === capacity) remainder = 0;
    nextShot = at + interval;
    completed++;
  }
  return at;
}

export function forecastTraining(state: GymState, player: GymPlayer | null = state.player, targetLevel = playerLevelCap): TrainingForecast | null {
  if (!player) return null;
  const target = Math.max(player.level, Math.min(playerLevelCap, Math.floor(targetLevel)));
  const remaining = Math.max(0, experienceForLevel(target) - experienceForLevel(player.level) - player.experience);
  const payouts = (['hold', 'success', 'great'] as const).map(outcome => trainingShotExperience(state, outcome, player));
  const openingShots = Math.min(guaranteedGreatShots(player), Math.ceil(remaining / payouts[2]));
  const afterOpening = Math.max(0, remaining - openingShots * payouts[2]);
  const expectedShots = remaining ? openingShots + stoppingShots(afterOpening, payouts) : 0;
  const estimatedMs = estimateShotTime(state, player, Math.ceil(expectedShots));
  return {targetLevel: target, expectedShots, estimatedMs, minShots: openingShots + Math.ceil(afterOpening / Math.max(...payouts)),
    maxShots: openingShots + Math.ceil(afterOpening / Math.min(...payouts)), withinOfflineLimit: player.autoEnabled && estimatedMs <= offlineLimitMs(state),
    automatic: player.autoEnabled, finished: remaining === 0};
}
