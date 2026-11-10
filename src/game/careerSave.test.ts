import { afterEach, describe, expect, it, vi } from 'vitest';
import { newGame, seededRandom } from './engine';
import { config } from './config';
import { slotKey, writeSlot } from './slots';
import { careerBackupKey, careerKey, loadCareer, writeCareer } from './careerSave';
import type { StorageLike } from './save';
const memory = () => {
 const data = new Map<string,string>();
 const storage: StorageLike = { getItem: k => data.get(k) ?? null, setItem: (k,v) => { data.set(k,v); } };
 return { data, storage };
};
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('single career persistence', () => {
 it('does not create a career just by loading an empty home', () => {
  const { data, storage } = memory(); expect(loadCareer(storage).save).toBeNull(); expect(data.size).toBe(0);
 });
 it('migrates newest of three slots without touching legacy data', () => {
  const {data,storage}=memory();
  for (const id of [1,2,3] as const) writeSlot(storage,id,{...newGame(seededRandom(id)),month:id+2},id===2?100:10);
  const originals=[1,2,3].map(id=>data.get(slotKey(id as 1|2|3)));
  expect(loadCareer(storage).save?.game.month).toBe(4);
  expect([1,2,3].map(id=>data.get(slotKey(id as 1|2|3)))).toEqual(originals);
  writeSlot(storage,3,{...newGame(),month:20},200);
  expect(loadCareer(storage).save?.game.month).toBe(4);
 });
 it('recovers legacy backup and original single-save format', () => {
  const {data,storage}=memory(),game={...newGame(),month:6};
  data.set(config.saveKey,'broken'); data.set(config.backupKey,JSON.stringify(game));
  expect(loadCareer(storage).save?.game.month).toBe(6);
 });
 it('recovers a damaged main career from its backup', () => {
  const {data,storage}=memory(),game=newGame();
  writeCareer(storage,game,1); writeCareer(storage,{...game,month:2},2); data.set(careerKey,'broken');
  expect(loadCareer(storage).save?.game.month).toBe(1);
  expect(loadCareer(storage).message).toContain('备份');
 });
 it('does not resurrect a retired slot if both new career copies are damaged', () => {
  const {data,storage}=memory();writeSlot(storage,1,newGame(),1);
  data.set(careerKey,'broken');data.set(careerBackupKey,'broken');
  expect(loadCareer(storage).save).toBeNull();expect(loadCareer(storage).message).toContain('损坏');
 });
 it('retains migration candidate in memory when storage is full', () => {
  const {storage}=memory();writeSlot(storage,3,{...newGame(),month:8},8);
  const full={getItem:storage.getItem,setItem:()=>{throw Error('full');}};
  expect(loadCareer(full).save?.game.month).toBe(8);expect(loadCareer(full).message).toContain('未写入');
 });
 it('starts, trains, reloads and overwrites only the single career', async () => {
  vi.resetModules();const {storage}=memory();vi.stubGlobal('window',{localStorage:storage});vi.spyOn(Math,'random').mockReturnValue(.5);
  const {useGame}=await import('../store');expect(useGame.getState().hasSave).toBe(false);
  expect(useGame.getState().continueGame()).toBe(false);useGame.getState().startNewGame();useGame.getState().train();
  expect(useGame.getState().hasSave).toBe(true);expect(loadCareer(storage).save?.game.totalShots).toBe(1);
  vi.resetModules();const again=await import('../store');expect(again.useGame.getState().continueGame()).toBe(true);
  expect(again.useGame.getState().game.totalShots).toBe(1);again.useGame.getState().startNewGame();
  expect(loadCareer(storage).save?.game.totalShots).toBe(0);
 });
 it('preserves session play and warning if writing is unavailable', async () => {
  vi.resetModules();vi.stubGlobal('window',{localStorage:{getItem:()=>null,setItem:()=>{throw Error('full');}}});
  const {useGame}=await import('../store');useGame.getState().startNewGame();
  expect(useGame.getState().continueGame()).toBe(true);expect(useGame.getState().saveMessage).toContain('写入失败');
 });
});
