import {cloneData} from '../../utils/cloneData';
import {
  activePlayers, advanceGym, automaticIntervalMs, equipmentEffects, experienceForLevel, finishEquipmentMigration, playerLevelCap, recoverySeconds, trainPlayer,
  type GymEvent, type GymState,
} from './engine';

const offlineWindowsMs = [30, 45, 60, 90, 120, 180].map(minutes => minutes * 60_000);
const legacyOfflineWindowsMs = [30, 60, 120, 240, 480, 720].map(minutes => minutes * 60_000);

/** The free level-two window and its five coupon-funded upgrades. */
export function offlineLimitMs(state: GymState): number {
  return state.gymLevel < 2 ? 0 : Math.min(240, (offlineWindowsMs[state.projects.offline] ?? offlineWindowsMs[0]) / 60_000
    + equipmentEffects(state).offlineMinutes) * 60_000;
}

/** Existing v1 absences are settled with their original cap before migrating. */
export function legacyOfflineLimitMs(state: GymState): number {
  return state.gymLevel < 2 ? 0 : legacyOfflineWindowsMs[state.projects.offline] ?? legacyOfflineWindowsMs[0];
}

export type OfflinePlayerReport = {
  id: string; name: string; shots: number; xpGained: number;
  levelBefore: number; levelAfter: number; staminaBefore: number; staminaAfter: number;
  templateBefore: string | null; templateAfter: string | null; courses: number;
};
export type OfflineTrainingReport = {
  reportId?: string;
  experienceMultiplier?: 1 | 2;
  /** Actual additional XP credited per player, bounded by the level cap. */
  bonusExperience?: Record<string,number>;
  from: number; to: number; elapsedMs: number; creditedMs: number; capMs: number; capped: boolean;
  totalShots: number; totalExperience: number; players: OfflinePlayerReport[];
};

/**
 * Replays only actual automatic shot/recovery events, never polls elapsed time.
 * The caller owns the atomic storage transaction: updatedAt is the consumed
 * cursor, including discarded time beyond the cap. It must not write a report
 * or show its rewards before committing this returned state.
 */
export function settleOfflineGym(original: GymState, now: number, capMs = offlineLimitMs(original),
  collectEvents?: (events: readonly GymEvent[]) => void): {state: GymState; report?: OfflineTrainingReport} {
  if (!Number.isSafeInteger(now) || now <= original.updatedAt || now < 0) return {state: finishEquipmentMigration(original)};
  const elapsedMs = now - original.updatedAt;
  const limit = original.gymLevel < 2 || !Number.isSafeInteger(capMs) || capMs < 0 ? 0
    : Math.min(capMs, original.offlineRulesVersion === 1 ? legacyOfflineWindowsMs[5] : 240 * 60_000);
  const creditedMs = Math.min(elapsedMs, limit);
  const trainees = activePlayers(original).filter(player => player.autoEnabled && player.level < playerLevelCap);
  if (!creditedMs || !trainees.length) return {state: finishEquipmentMigration(advanceGym(original, now))};

  // Copy the persistent history once, rather than cloning the full alumni and
  // album data on every shot in a long, eight-player settlement.
  let state = cloneData(original);
  const until = original.updatedAt + creditedMs;
  const recoveryMs = recoverySeconds(state) * 1_000;
  const matched = new Set<string>();
  for (;;) {
    let nextAt = Number.POSITIVE_INFINITY;
    for (const player of activePlayers(state)) {
      if (!player.autoEnabled || player.level >= playerLevelCap) continue;
      const staminaAt = player.stamina >= 1 ? state.updatedAt : state.updatedAt + recoveryMs - player.recoveryMs;
      nextAt = Math.min(nextAt, Math.max(state.updatedAt, player.nextShotAt, staminaAt));
    }
    if (nextAt > until) break;
    state = advanceGym(state, nextAt);
    // Same timestamp and ID ordering as dispatchGym('auto-step'), independent
    // of the selected athlete or the current bench order.
    const due = activePlayers(state).filter(player => player.autoEnabled && player.level < playerLevelCap
      && player.nextShotAt <= nextAt && player.stamina >= 1)
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const events: GymEvent[] = [];
    for (const player of due) {
      trainPlayer(state, player, nextAt, events, matched.has(player.id));
      matched.add(player.id);
    }
    if (events.length) collectEvents?.(events);
  }
  // The capped part trains; the discarded remainder may only restore stamina.
  // Advancing all the way to now prevents refreshing from consuming it again.
  state = advanceGym(state, now);
  if (elapsedMs > limit) for (const player of activePlayers(state)) {
    if (player.autoEnabled) player.nextShotAt = Math.max(player.nextShotAt, now + automaticIntervalMs(state));
  }
  state.revision = original.revision + 1;
  state = finishEquipmentMigration(state);
  const players: OfflinePlayerReport[] = trainees.map(before => {
    const after = activePlayers(state).find(player => player.id === before.id)!;
    return {
      id: before.id, name: before.name, shots: after.shots - before.shots,
      xpGained: experienceForLevel(after.level) + after.experience - experienceForLevel(before.level) - before.experience,
      levelBefore: before.level, levelAfter: after.level, staminaBefore: before.stamina, staminaAfter: after.stamina,
      templateBefore: before.templateId, templateAfter: after.templateId,
      courses: after.training.completedCourses - before.training.completedCourses,
    };
  });
  const report: OfflineTrainingReport = {
    reportId: `offline_${state.seed}_${state.createdAt}_${original.updatedAt}_${now}`,
    from: original.updatedAt, to: now, elapsedMs, creditedMs, capMs: limit, capped: elapsedMs > limit,
    totalShots: players.reduce((sum, player) => sum + player.shots, 0),
    totalExperience: players.reduce((sum, player) => sum + player.xpGained, 0), players,
  };
  // Preserve an open report while native ads/background heartbeats accrue new
  // training. Its original XP is the immutable basis of the one-time bonus.
  if(elapsedMs>=5000&&report.totalShots>0&&(!state.offlineReward||state.offlineReward.dismissed)){
    state.offlineReward={report:cloneData(report),claimed:false,dismissed:false};
  }
  return {state, report};
}
