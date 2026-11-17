/** Shared display format for training time estimates and saved offline reports. */
export function offlineDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const remainder = seconds % 60;
  return [hours ? `${hours}小时` : '', minutes ? `${minutes}分钟` : '', remainder || !hours && !minutes ? `${remainder}秒` : ''].filter(Boolean).join('');
}
