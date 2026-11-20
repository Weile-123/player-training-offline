/** Shared display format for training time estimates and saved offline reports. */
export function offlineDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const remainder = seconds % 60;
  return [hours ? `${hours}小时` : '', minutes ? `${minutes}分钟` : '', remainder || !hours && !minutes ? `${remainder}秒` : ''].filter(Boolean).join('');
}

export function trainingDuration(milliseconds: number): string {
  const hours = Math.floor(milliseconds / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days < 1) return offlineDuration(milliseconds);
  const remainingHours = hours % 24;
  return `${days.toLocaleString('zh-CN')}天${remainingHours ? `${remainingHours}小时` : ''}`;
}
