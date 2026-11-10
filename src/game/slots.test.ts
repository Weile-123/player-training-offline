import { describe,it,expect,vi,afterEach } from 'vitest';
import { newGame,seededRandom } from './engine';
import { config } from './config';
import { decodeSlot,migrateLegacySlot,readSlots,writeSlot,slotKey } from './slots';
import type { StorageLike } from './save';
const memory=()=>{const data=new Map<string,string>();const storage:StorageLike={getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);}};return {data,storage};};
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('三个独立存档',()=>{
 it('无存档时三个空位，不生成示意进度',()=>{expect(readSlots(memory().storage)).toEqual({1:null,2:null,3:null});});
 it('三个位置独立保存，读取保持真实月份和时间',()=>{const {storage}=memory();for(const id of [1,2,3] as const){const game={...newGame(seededRandom(id)),month:id+5};expect(writeSlot(storage,id,game,100+id)).toBe(true);}const slots=readSlots(storage);expect([slots[1]?.game.month,slots[2]?.game.month,slots[3]?.game.month]).toEqual([6,7,8]);expect(slots[2]?.updatedAt).toBe(102);});
 it('覆盖一个存档不影响另两个，主档损坏恢复该位置上一有效备份',()=>{const {storage,data}=memory();const first=newGame(seededRandom(1)),second={...first,month:2};writeSlot(storage,1,first,1);writeSlot(storage,2,first,1);writeSlot(storage,1,second,2);data.set(slotKey(1),'broken');expect(readSlots(storage)[1]?.game).toEqual(first);expect(readSlots(storage)[2]?.game).toEqual(first);});
 it('旧单存档迁移一次并保留原始备份，不覆盖已有第一位',()=>{const {storage,data}=memory();const g={...newGame(seededRandom(1)),cash:80000};data.set(config.saveKey,JSON.stringify(g));expect(migrateLegacySlot(storage)).toContain('01');expect(readSlots(storage)[1]?.game).toEqual(g);expect(data.get(config.saveKey)).toBe(JSON.stringify(g));data.set(config.saveKey,JSON.stringify({...g,cash:0}));migrateLegacySlot(storage);expect(readSlots(storage)[1]?.game.cash).toBe(80000);});
 it('损坏旧主档可从旧备份迁移；现有新存档不被旧存档覆盖',()=>{const {storage,data}=memory();const g=newGame(seededRandom(1));data.set(config.saveKey,'broken');data.set(config.backupKey,JSON.stringify(g));writeSlot(storage,1,{...g,month:9},1);migrateLegacySlot(storage);expect(readSlots(storage)[1]?.game.month).toBe(9);});
 it('拒绝非法时间/版本/游戏，读写受限返回可处理结果',()=>{expect(decodeSlot('{')).toBeNull();const g=newGame(seededRandom(1));for(const patch of [{version:2},{updatedAt:-1},{updatedAt:.5},{game:{...g,cash:-1}}])expect(decodeSlot(JSON.stringify({version:1,game:g,updatedAt:1,...patch}))).toBeNull();const denied={getItem:()=>{throw Error('denied');},setItem:()=>{throw Error('full');}};expect(writeSlot(denied,1,g)).toBe(false);expect(readSlots(denied)).toEqual({1:null,2:null,3:null});expect(migrateLegacySlot(denied)).toContain('受限');});
});
