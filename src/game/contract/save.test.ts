import { expect, it } from 'vitest';
import { newContract, dispatch } from './engine';
import { encodeContract, decodeContract, writeContract, readContract, contractSaveKeys, prepareNewCareer, validContract } from './save';

function memory() { const data = new Map<string, string>(); return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } }; }
it('随机流、剩余火热时钟与精确金额重载后可继续相同轨迹', () => {
  const first = newContract(13); first.players[0].heat = 10;
  const shot = dispatch(first, 0, { type: 'train', playerId: 'p1' }).state;
  const restored = decodeContract(encodeContract(shot))!;
  expect(restored).toEqual(shot);
  const action = { type: 'advance' as const, milliseconds: 640 };
  const a = dispatch(shot, shot.revision, action).state, b = dispatch(restored, restored.revision, action).state;
  expect(dispatch(a, a.revision, { type: 'train', playerId: 'p1' })).toEqual(dispatch(b, b.revision, { type: 'train', playerId: 'p1' }));
});
it('异常档案拒绝：旧版、重复ID、分母0、非法属性及校验不符', () => {
  const s = newContract(1);
  expect(decodeContract('{bad')).toBeNull(); expect(decodeContract(JSON.stringify({ version: 1 }))).toBeNull();
  const raw = JSON.parse(encodeContract(s)); raw.payload += ' '; expect(decodeContract(JSON.stringify(raw))).toBeNull();
  s.players[1].id = s.players[0].id; expect(validContract(s)).toBe(false);
  const t = newContract(1); t.players[0].book.base.d = '0'; expect(validContract(t)).toBe(false);
  const u = newContract(1); u.players[0].stats.three = NaN; expect(() => encodeContract(u)).toThrow();
});
it('损坏主档恢复备份；保存失败返回错误而不伪称成功', () => {
  const storage = memory(), s = newContract(1);
  expect(writeContract(storage, s).ok).toBe(true);
  storage.setItem(contractSaveKeys.main, 'broken');
  expect(readContract(storage).source).toBe('backup');
  const fail = { ...storage, setItem: () => { throw new Error('quota'); } };
  expect(writeContract(fail, s).ok).toBe(false);
  expect(readContract(storage).state).toEqual(s);
});
it('新合同不换算旧债务现金，旧档及旧图鉴金额独立保留', () => {
  const legacy = '{"debt":10000000,"cash":9999999}';
  const plan = prepareNewCareer(1, legacy, { curry: { firstMonth: 8, highestRating: 99, highestValue: '2000000' } });
  expect(plan.legacyArchive).toBe(legacy); expect(plan.state.cash).toBe('0'); expect(plan.state.collection).toEqual({});
  expect(plan.legacyCollection.curry.highestValue).toBe('2000000');
});
