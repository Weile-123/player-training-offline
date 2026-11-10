import { describe, expect, it } from 'vitest';
import { newContract, dispatch, playerValue, previewShot, type Contract, type Action } from './engine';
import { add, bankGreat, fraction, ledger, quote, quota } from './money';
import { probabilities, outcomes, outcomeAt } from './probability';
import { effectsFor } from './effects';
import { grow, match, shape, templateRules } from './templates';
import { stream, random } from './random';
import { rules } from './rules';
import { statKeys, type Stats } from '../types';

const uniform = (n: number) => Object.fromEntries(statKeys.map(k => [k, n])) as Stats;
function run(s: Contract, a: Action) { const r = dispatch(s, s.revision, a); expect(r.error).toBeUndefined(); return r.state; }
function shot(s: Contract, id: string) {
  if (s.clockMs < s.nextShotAt) s = run(s, { type: 'advance', milliseconds: s.nextShotAt - s.clockMs });
  return run(s, { type: 'train', playerId: id });
}
function chooseOutcome(s: Contract, id: string, desired: string) {
  const p = s.players.find(p => p.id === id)!;
  const tickets = previewShot(s, p).tickets;
  for (let n = 0; n < 100000; n++) {
    const r = { state: n };
    if (outcomeAt(tickets, Math.floor(random(r) * 1000)) === desired) { s.rng.economy.state = n; return; }
  }
  throw new Error(`当前概率不支持 ${desired}`);
}

describe('参考概率与效果管线', () => {
  it.each([0, 10, 30])('等级%s对应输入参考样例', level => {
    const expected = rules.reference.forging_odds.distribution_examples[`level_${level}` as 'level_0'];
    expect(Object.values(probabilities(level).tickets)).toEqual([expected.break, expected.damage, expected.hold, expected.success, expected.great].map(x => Math.round(x * 10)));
  });
  it('权重增加降低重伤占比，风险倍率相乘且重新分配', () => {
    expect(probabilities(10, effectsFor(['relic_002'], 10, false).probability).tickets.severe).toBe(424);
    expect(probabilities(10, effectsFor(['relic_030'], 10, false).probability).tickets.severe).toBe(405);
    expect(probabilities(10, effectsFor(['relic_003', 'relic_060'], 10, false).probability).tickets.severe).toBe(315);
    expect(Object.values(probabilities(10, effectsFor(['relic_080'], 10, false).probability).tickets)).toEqual([338, 166, 166, 165, 165]);
  });
  it('转移不创造来源不足的权重，装备顺序不改变结果', () => {
    const ids = ['relic_080', 'relic_004', 'relic_019', 'relic_002'];
    expect(probabilities(5, effectsFor(ids, 5, false).probability)).toEqual(probabilities(5, effectsFor([...ids].reverse(), 5, false).probability));
    const result = probabilities(1, [{ id: 'x', op: 'transfer', from: 'minor', to: 'success', value: 99 }]);
    expect(result.tickets.minor).toBe(0);
  });
  it('各种等级的整数票总和1000；火热及粉末限制', () => {
    for (let level = 0; level < 150; level++) {
      const tickets = probabilities(level).tickets;
      expect(Object.values(tickets).reduce((a, b) => a + b)).toBe(1000);
      expect(outcomes.every(o => Number.isInteger(tickets[o]) && tickets[o] >= 0)).toBe(true);
      expect(probabilities(level, [], true).tickets.severe).toBe(0);
    }
    const powder = probabilities(10, [], false, true).tickets;
    expect(powder.minor + powder.hold + powder.success).toBe(0);
    expect(() => probabilities(10, [], true, true)).toThrow();
  });
  it('未实现、重复、超槽装备不静默启用', () => {
    expect(() => newContract(1, ['relic_016'])).toThrow('尚未实现');
    expect(() => newContract(1, ['relic_002', 'relic_002'])).toThrow();
  });
});

describe('精确估值、溢价与指标', () => {
  it('基础指数和大成功受损后的样例完全一致', () => {
    const book = ledger();
    expect(quote(book, 10)).toBe('18453');
    expect(quote(book, 20)).toBe('1064082');
    const great = bankGreat(book, 8);
    expect(quote(great, 10)).toBe('20503');
    expect(quote(great, 9)).toBe('13669');
    expect(quote(book, 9)).toBe('12302');
  });
  it('基础加值参与指数，固定加值不参与，倍率最后相乘', () => {
    const book = ledger(); book.base = add(book.base, fraction(80)); book.flat = fraction(100);
    expect(quote(book, 2, fraction(115, 100))).toBe('1150');
    expect(quote(ledger(true), 10)).toBe('36906');
  });
  it('高等级不受旧200万上限约束，JSON往返不丢精度', () => {
    const book = bankGreat(ledger(), 80);
    expect(BigInt(quote(book, 200))).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER));
    expect(quote(JSON.parse(JSON.stringify(book)), 200)).toBe(quote(book, 200));
    expect(quote(ledger(), 1000)).not.toMatch(/Infinity|NaN|e\+/);
  });
  it('原表直接读取，32月不对上月取整值盲目乘1.2', () => {
    expect(quota(1)).toBe('1800'); expect(quota(21)).toBe('232000'); expect(quota(32)).toBe('1723779');
    expect(quota(47)).toBe('26558307'); expect(quota(48)).toBe('31869968');
  });
});

describe('当前资格与永久图鉴', () => {
  const curry = templateRules.find(t => t.id === 'curry')!;
  const p = { level: 18, height: 190, stats: curry.stats, templateId: null, matchSeed: 42, lastStyle: shape(curry.stats) };
  it('首次获取受等级限制，已获得的模板不因降级退回', () => {
    expect(match(p).templateId).toBe('curry');
    expect(match({ ...p, level: 17, peakLevel:18, templateId: 'curry' }).templateId).toBe('curry');
    expect(match({ ...p, level: 3 }).tier).toBe('rotation');
    expect(match({ ...p, level: 30, stats: uniform(1) }).templateId).toBeNull();
  });
  it('已获得外观不因核心属性下降丢失，身高仍作身份校验', () => {
    const bad = { ...p, templateId: 'curry', stats: { ...p.stats, three: 1 } };
    expect(match(bad).templateId).toBe('curry');
    expect(match(bad).rows.find(r => r.id === 'curry')?.reasons).toContain('core');
    expect(match({ ...p, height: 199, templateId: 'curry' }).templateId).not.toBe('curry');
    expect(match({ ...p, height: 178 }).rows.find(r => r.id === 'curry')?.reasons).not.toContain('height');
  });
  it('偏科奥尼尔不被平均87门槛排除', () => {
    const t = templateRules.find(t => t.id === 'oneal')!;
    expect(match({ ...p, height: 210, stats: t.stats, lastStyle: shape(t.stats) }).templateId).toBe('oneal');
  });
  it('全99沿用封顶前风格，降级也保留历史外观', () => {
    expect(match({ ...p, stats: uniform(99), templateId: 'curry' }).templateId).toBe('curry');
    expect(match({ ...p, level: 17, peakLevel:18, stats: uniform(99), templateId: 'curry' }).templateId).toBe('curry');
  });
  it('每个模板有合法自身画像且匹配不依赖列表排序', () => {
    for (const t of templateRules) {
      const input = { ...p, level: t.minLevel, height: Math.round((t.height[0] + t.height[1]) / 2), stats: t.stats, lastStyle: shape(t.stats) };
      const result = match(input);
      expect(result.rows.find(r => r.id === t.id)?.eligible, t.id).toBe(true);
      expect(match(input, [...templateRules].reverse()).templateId).toBe(result.templateId);
    }
  });
  it('成长可复现、轻伤0级损失属性、边界仍合法', () => {
    const a = grow(uniform(40), uniform(1), 'great', 2, stream(1, 'stats'));
    expect(a).toEqual(grow(uniform(40), uniform(1), 'great', 2, stream(1, 'stats')));
    expect(Object.values(a).reduce((s, n) => s + n)).toBe(260);
    expect(Object.values(grow(uniform(40), uniform(1), 'minor', 0, stream(1, 'stats'))).reduce((s, n) => s + n)).toBe(230);
    expect(grow(uniform(99), uniform(1), 'great', 2, stream(1, 'stats'))).toEqual(uniform(99));
  });
});

describe('完整领域循环', () => {
  it('维持、轻伤和两种成功各得1基础手感，未命中不扣手感', () => {
    for (const result of ['hold', 'minor', 'success', 'great']) {
      let s = newContract(1); chooseOutcome(s, 'p1', result); s = shot(s, 'p1');
      expect(s.players[0].heat, result).toBe(1);
    }
  });
  it('图鉴即时解锁，降档、离营与失败均不清空', () => {
    let s = newContract(1);
    const curry = templateRules.find(t => t.id === 'curry')!;
    const p = s.players[0]; p.height = 190; p.level = 18; p.stats = { ...curry.stats }; p.lastStyle = shape(p.stats);
    chooseOutcome(s, 'p1', 'hold'); s = shot(s, 'p1');
    expect(s.players[0].templateId).toBe('curry'); expect(s.collection.curry.firstMonth).toBe(1);
    chooseOutcome(s, 'p1', 'minor'); s = shot(s, 'p1');
    expect(s.players[0].level).toBe(17); expect(s.players[0].templateId).toBe('curry');
    expect(s.collection.curry).toBeDefined();
    chooseOutcome(s, 'p1', 'severe'); s = shot(s, 'p1');
    expect(s.players.some(a => a.id === 'p1')).toBe(false); expect(s.collection.curry).toBeDefined();
    s = run(s, { type: 'settle' }); s = run(s, { type: 'settle' }); s = run(s, { type: 'settle' });
    expect(s.status).toBe('over'); expect(newContract(2, [], s.collection).collection.curry).toEqual(s.collection.curry);
  });
  it('非重伤均积累手感，满10后的出手进入7次火热', () => {
    let s = newContract(1); const id = s.players[0].id;
    s.players[0].heat = 10;
    expect(previewShot(s, s.players[0]).tickets.severe).toBe(0);
    s = shot(s, id);
    expect(s.players[0].hotShotsRemaining).toBe(6); expect(s.players[0].heat).toBe(0);
    for (let i = 0; i < 6; i++) s = shot(s, id);
    expect(s.players[0].hotShotsRemaining).toBe(0); expect(s.players[0].heat).toBe(0);
    s = shot(s, id);
    expect(s.clockMs).toBe(0);
    const player = s.players.find(p => p.id === id); if (player) expect(player.heat).toBe(1);
  });
  it('原速度器材改为次数和手感加成；不依赖动画时长', () => {
    expect(effectsFor(['relic_057', 'relic_088'], 0, true).hotShots).toBe(10);
    expect(effectsFor(['relic_011'], 0, false).normalHeatEvery).toBe(5);
  });
  it('无CD可连续投篮，过期请求和待交付训练不消耗状态', () => {
    let s = newContract(1); const id = s.players[0].id;
    const snapshot = JSON.stringify(s);
    const next = shot(s, id); expect(JSON.stringify(s)).toBe(snapshot);
    expect(dispatch(next, s.revision, { type: 'train', playerId: id }).error).toBe('stale-revision');
    expect(dispatch(next, next.revision, { type: 'train', playerId: id }).state.totalShots).toBe(next.totalShots+1);
    s = run(next, { type: 'queue', playerId: id, queued: true });
    expect(dispatch(s, s.revision, { type: 'exchange', playerId: id }).error).toBe('withdraw-first');
    expect(dispatch(s, s.revision, { type: 'train', playerId: id }).error).toBe('withdraw-first');
  });
  it('失败也发全部经费，现金不能代替交付，未交付球员跨月保留', () => {
    let s = newContract(4); s.cash = '100000';
    const id = s.players[0].id, retained = s.players[1];
    s = run(s, { type: 'queue', playerId: id, queued: true });
    s = run(s, { type: 'settle' });
    expect(s.cash).toBe('100320'); expect(s.credit).toBe(2); expect(s.credits).toBe(0);
    expect(s.players).toHaveLength(5); expect(s.players.find(p => p.id === retained.id)).toEqual(retained);
    expect(s.players.some(p => p.id === id)).toBe(false);
  });
  it('交付达标不再扣指标，兑换只给积分且不能重复使用', () => {
    let s = newContract(9); s.players[0].level = 5;
    s = run(s, { type: 'queue', playerId: s.players[0].id, queued: true });
    s = run(s, { type: 'settle' }); expect(s.cash).toBe('2430'); expect(s.credit).toBe(3);
    const id = s.players[0].id;
    s = run(s, { type: 'exchange', playerId: id }); expect(s.credits).toBe(1); expect(s.cash).toBe('2430');
    expect(dispatch(s, s.revision, { type: 'exchange', playerId: id }).error).toBe('missing-player');
  });
  it('三次失败结束；第21月末存活即完成合同但继续指标', () => {
    let s = newContract(1); s = run(s, { type: 'settle' }); s = run(s, { type: 'settle' }); s = run(s, { type: 'settle' });
    expect(s.status).toBe('over'); expect(s.credit).toBe(0);
    expect(dispatch(s, s.revision, { type: 'settle' }).error).toBe('game-over');
    s = newContract(1); s.month = 21; s = run(s, { type: 'settle' });
    expect(s.completed).toBe(true); expect(s.month).toBe(22); expect(s.credit).toBe(2);
  });
  it('属性成长和模板库变化不扰动经济抽签和报价', () => {
    let a = newContract(123), b = newContract(123);
    for (let i = 0; i < 100; i++) {
      const id = a.players[0]?.id; if (!id) break;
      if (a.clockMs < a.nextShotAt) {
        const action = { type: 'advance' as const, milliseconds: a.nextShotAt - a.clockMs };
        a = run(a, action); b = run(b, action);
      }
      const action = { type: 'train' as const, playerId: id };
      const x = dispatch(a, a.revision, action), y = dispatch(b, b.revision, action, { catalog: [], gain: 6, loss: 14 });
      expect(x.events.filter(e => e.type === 'shot')).toEqual(y.events.filter(e => e.type === 'shot'));
      a = x.state; b = y.state;
      expect(a.rng.economy).toEqual(b.rng.economy);
      expect(a.cash).toBe(b.cash);
      expect(a.players.map(p => playerValue(a, p))).toEqual(b.players.map(p => playerValue(b, p)));
    }
  });
  it('重伤无保底，保险现金和交付残值分账', () => {
    let a = newContract(6), b = newContract(6, ['relic_001', 'relic_020']);
    a.players[0].level = b.players[0].level = 30;
    for (let n = 0; n < 30 && a.players.some(p => p.id === 'p1'); n++) { a = shot(a, 'p1'); b = shot(b, 'p1'); }
    expect(a.players.some(p => p.id === 'p1')).toBe(false);
    expect(a.cash).toBe('0'); expect(a.scrap).toBe('0');
    expect(b.cash).toBe('500'); expect(BigInt(b.scrap)).toBeGreaterThan(0n);
    expect(b.credits).toBe(0);
  });
});
