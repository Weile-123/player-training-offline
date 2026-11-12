export const playerLevelCap = 99;
export type TrainingOutcome = 'hold' | 'success' | 'great';

/** Experience needed to leave the given level; all units are integer XP. */
export function requiredExperience(level: number): number {
  if (!Number.isInteger(level) || level < 0 || level >= playerLevelCap) return 0;
  // ceil(20 + 6L + .15L²), using only integers to avoid floating-point rounding.
  return Math.floor((400 + 120 * level + 3 * level * level + 19) / 20);
}

/** Total experience from level zero to the start of targetLevel. */
export function experienceForLevel(targetLevel: number): number {
  if (!Number.isInteger(targetLevel) || targetLevel < 0 || targetLevel > playerLevelCap) throw new Error('球员等级无效');
  let experience = 0;
  for (let level = 0; level < targetLevel; level++) experience += requiredExperience(level);
  return experience;
}

export function shotExperience(outcome: TrainingOutcome): number {
  return outcome === 'great' ? 20 : outcome === 'success' ? 12 : 8;
}
