import {automaticIntervalMs, experienceForLevel, playerLevelCap, recoverySeconds, staminaMax, trainingShotExperience, trainingStatus, type GymPlayer, type GymState} from './engine';
import {offlineLimitMs} from './offline';

export type TrainingForecast = {
  targetLevel: number; expectedShots: number; estimatedMs: number; minShots: number; maxShots: number;
  withinOfflineLimit: boolean; automatic: boolean; finished: boolean;
};

// E[r] is the exact stopping expectation for independent integer-XP outcomes.
// Cache by payout tuple; elapsed time below is a deterministic supply estimate,
// not a guarantee of the random finishing time or any particular template.
const expectations = new Map<string, Float64Array>();
function stoppingShots(required: number, payouts: readonly number[]): number {
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
  const interval = player.autoEnabled ? automaticIntervalMs(state) : 1_000;
  const courseReturn = trainingStatus(state, player).nextRecovery;
  let stamina = player.stamina;
  let remainder = player.recoveryMs;
  let course = player.training.shots;
  let nextShot = Math.max(0, player.nextShotAt - state.updatedAt);
  let at = 0;
  for (let i = 0; i < shots; i++) {
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
  }
  return at;
}

export function forecastTraining(state: GymState, player: GymPlayer | null = state.player, targetLevel = playerLevelCap): TrainingForecast | null {
  if (!player) return null;
  const target = Math.max(player.level, Math.min(playerLevelCap, Math.floor(targetLevel)));
  const remaining = Math.max(0, experienceForLevel(target) - experienceForLevel(player.level) - player.experience);
  const payouts = (['hold', 'success', 'great'] as const).map(outcome => trainingShotExperience(state, outcome, player));
  const expectedShots = remaining ? stoppingShots(remaining, payouts) : 0;
  const estimatedMs = estimateShotTime(state, player, Math.ceil(expectedShots));
  return {targetLevel: target, expectedShots, estimatedMs, minShots: Math.ceil(remaining / Math.max(...payouts)),
    maxShots: Math.ceil(remaining / Math.min(...payouts)), withinOfflineLimit: player.autoEnabled && estimatedMs <= offlineLimitMs(state),
    automatic: player.autoEnabled, finished: remaining === 0};
}
