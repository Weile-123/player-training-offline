import { decodeSlot, readSlots, slotIds, type SaveSlot } from './slots';
import { loadSave, type StorageLike } from './save';
import type { Game } from './types';
export const careerKey = 'player-training.career.v1';
export const careerBackupKey = 'player-training.career.backup.v1';
export function writeCareer(storage: StorageLike, game: Game, updatedAt = Date.now()): boolean {
 try {
  const previous = storage.getItem(careerKey), next = JSON.stringify({ version: 1, game, updatedAt });
  if (decodeSlot(previous)) storage.setItem(careerBackupKey, previous!);
  else if (!decodeSlot(storage.getItem(careerBackupKey))) storage.setItem(careerBackupKey, next);
  storage.setItem(careerKey, next); return true;
 } catch { return false; }
}
/** Legacy slots are migration sources only; never overwrite or remove them. */
export function loadCareer(storage: StorageLike): { save: SaveSlot | null; message: string } {
 try {
  const primary = storage.getItem(careerKey), backup = storage.getItem(careerBackupKey);
  const saved = decodeSlot(primary);
  if (saved) return { save: saved, message: '' };
  const recovered = decodeSlot(backup);
  if (recovered) return { save: recovered, message: '已从生涯备份恢复' };
  if (primary !== null || backup !== null) return { save: null, message: '生涯存档损坏，无法恢复，请开启新游戏' };
  const slots = readSlots(storage);
  const latest = slotIds.map(id => slots[id]).filter((s): s is SaveSlot => s !== null).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const legacy = latest ? null : loadSave(storage).game;
  const candidate = latest ?? (legacy ? { game: legacy, updatedAt: 0 } : null);
  if (!candidate) return { save: null, message: '' };
  const written = writeCareer(storage, candidate.game, candidate.updatedAt);
  return { save: candidate, message: written ? '已迁入最近保存的生涯，旧存档保留' : '迁移未写入，当前会话仍可继续旧生涯' };
 } catch { return { save: null, message: '存档读取受限，进度仅当前会话有效' }; }
}
