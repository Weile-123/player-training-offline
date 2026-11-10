import { describe, expect, it } from 'vitest';
import { config } from './config';
import { generatePlayer, newGame, nextMonth, rest, select, seededRandom, train } from './engine';
import { fitsHeight, matchTemplate, overallRating, refreshTemplate, styleSimilarity, tierConfig } from './matching';
import { decodeSave } from './save';
import { nbaTemplates, templateById, type NbaTemplate } from './templates';
import { statKeys, type Player, type Stats } from './types';

const uniform = (value: number) => Object.fromEntries(statKeys.map(key => [key, value])) as Stats;
const player = (height: number, stats: Stats, templateId: string | null = null): Player =>
  ({ id: 'test', name: '测试球员', age: 20, height, stats, level: 10, shots: 15, templateId, heat:0, hotShots:0, iceShots:0 });
// 将球星风格缩放到对应档次，保留各项相对分布，确保属性仍在 0–99。
function archetype(template: NbaTemplate, target: number): Stats {
  const mean = overallRating(template.stats);
  const offsets = statKeys.map(key => template.stats[key] - mean);
  const scale = Math.min(1, (99 - target) / Math.max(...offsets), target / -Math.min(...offsets));
  return Object.fromEntries(statKeys.map(key => [key, target + (template.stats[key] - mean) * scale])) as Stats;
}
function midpoint(template: NbaTemplate) {
  const index = config.matching.tiers.findIndex(t => t.id === template.tier);
  return index === config.matching.tiers.length - 1 ? 90 :
    (config.matching.tiers[index].minimumRating + config.matching.tiers[index + 1].minimumRating) / 2;
}
const roll = (value: number) => { let count = 0; return () => count++ === 0 ? value : 0.5; };

describe('模板数据库', () => {
  it('至少 100 名，ID 和球员唯一，标准属性合法', () => {
    expect(nbaTemplates.length).toBeGreaterThanOrEqual(100);
    expect(new Set(nbaTemplates.map(t => t.id)).size).toBe(nbaTemplates.length);
    expect(new Set(nbaTemplates.map(t => t.englishName)).size).toBe(nbaTemplates.length);
    for (const template of nbaTemplates) {
      expect(template.height[0]).toBeLessThanOrEqual(template.height[1]);
      expect(statKeys.every(key => template.stats[key] >= 0 && template.stats[key] <= 99)).toBe(true);
      expect(tierConfig(template.tier)).toBeDefined();
    }
  });
  it('每档覆盖所有可生成身高，无匹配空洞', () => {
    for (const tier of config.matching.tiers) for (let height = 178; height <= 218; height++) {
      expect(nbaTemplates.some(t => t.tier === tier.id && fitsHeight(height, t))).toBe(true);
    }
  });
  it.each(nbaTemplates.map(t => [t.id, t] as const))('%s 可由合法属性培养出来', (_id, template) => {
    const stats = Object.fromEntries(statKeys.map(key => [key, Math.round(archetype(template, midpoint(template))[key])])) as Stats;
    expect(statKeys.every(key => stats[key] >= 0 && stats[key] <= 99)).toBe(true);
    expect(matchTemplate(player(Math.round((template.height[0] + template.height[1]) / 2), stats)).templateId).toBe(template.id);
  });
});

describe('身高、档次和风格', () => {
  it('身高范围包含端点，范围外旧模板不能继续保留', () => {
    const curry = templateById('curry')!;
    expect(fitsHeight(178, curry)).toBe(true);
    expect(fitsHeight(198, curry)).toBe(true);
    expect(fitsHeight(199, curry)).toBe(false);
    expect(matchTemplate(player(218, uniform(99), 'curry'), 'curry').templateId).not.toBe('curry');
  });
  it('未达到首档时不预设模板或位置，跨越门槛立即升档', () => {
    expect(matchTemplate(player(190, uniform(44.99))).templateId).toBeNull();
    for (const tier of config.matching.tiers) {
      const result = matchTemplate(player(190, uniform(tier.minimumRating)));
      expect(templateById(result.templateId)?.tier).toBe(tier.id);
    }
  });
  it('综合评分限制上限，低实力不能仅靠偏科拿到传奇', () => {
    const p = player(190, { three: 99, mid: 5, drive: 5, inside: 5, handle: 99, defense: 5 });
    expect(matchTemplate(p).templateId).toBeNull();
  });
  it('全 99 全能球员可匹配詹姆斯，身高仍是硬条件', () => {
    expect(matchTemplate(player(203, uniform(99))).templateId).toBe('lebron');
    expect(matchTemplate(player(178, uniform(99))).templateId).not.toBe('lebron');
  });
  it('同档可以从内线转为锋线，无固定升级路线', () => {
    const gobert = templateById('gobert')!, george = templateById('paul-george')!;
    const p = player(207, archetype(gobert, 71));
    expect(matchTemplate(p).templateId).toBe('gobert');
    const changed = matchTemplate({ ...p, stats: archetype(george, 71) }, 'gobert');
    expect(changed.templateId).toBe('paul-george');
    expect(templateById(changed.templateId)?.position).toBe('SF');
  });
  it('同档小幅波动不会导致模板频繁切换', () => {
    const template = templateById('paul-george')!;
    const baseline = archetype(template, 71);
    for (const key of statKeys) for (const delta of [-1, 1]) {
      expect(matchTemplate(player(203, { ...baseline, [key]: baseline[key] + delta }), template.id).templateId).toBe(template.id);
    }
  });
  it('相似度优势不足时保留旧模板，明显优势允许切换', () => {
    const curry = templateById('curry')!, jordan = templateById('jordan')!;
    const start = archetype(curry, 90), finish = archetype(jordan, 90);
    let sawSmallAdvantage = false;
    for (let step = 0; step <= 100; step++) {
      const stats = Object.fromEntries(statKeys.map(key => [key, start[key] + (finish[key] - start[key]) * step / 100])) as Stats;
      const best = matchTemplate(player(190, stats));
      const advantage = best.similarity - styleSimilarity(stats, curry.stats);
      if (best.templateId !== 'curry' && advantage > 0 && advantage <= config.matching.switchAdvantage) {
        sawSmallAdvantage = true;
        expect(matchTemplate(player(190, stats), 'curry').templateId).toBe('curry');
      }
    }
    expect(sawSmallAdvantage).toBe(true);
    expect(matchTemplate(player(190, finish), 'curry').templateId).toBe('jordan');
  });
  it('降档缓冲保留当前档次，跌破退出线才降档或失去模板', () => {
    expect(templateById(matchTemplate(player(190, uniform(85)), 'curry').templateId)?.tier).toBe('legend');
    expect(templateById(matchTemplate(player(190, uniform(83.99)), 'curry').templateId)?.tier).toBe('superstar');
    expect(matchTemplate(player(190, uniform(42)), 'beverley').templateId).toBe('beverley');
    expect(matchTemplate(player(190, uniform(41.99)), 'beverley').templateId).toBeNull();
  });
  it('零属性、平衡属性和未知模板不会产生 NaN，重复运行确定', () => {
    for (const value of [0, 45, 70, 99]) {
      const p = player(203, uniform(value));
      const first = matchTemplate(p, 'unknown');
      expect(Number.isFinite(first.similarity)).toBe(true);
      expect(first.similarity).toBeGreaterThanOrEqual(0);
      expect(first.similarity).toBeLessThanOrEqual(1);
      expect(matchTemplate(p, 'unknown')).toEqual(first);
    }
  });
});

describe('游戏与存档集成', () => {
  it('新球员依据当前属性生成模板；首次升档写入变化日志', () => {
    const fresh = generatePlayer(1, 0, seededRandom(12));
    expect(fresh.templateId).toBe(matchTemplate(fresh).templateId);
    const game = newGame(seededRandom(123));
    game.recruits[0] = player(190, uniform(44));
    game.selectedId = 'test';
    const trained = train(game, roll(0.99));
    expect(trained.recruits[0].templateId).not.toBeNull();
    expect(trained.logs[0]).toContain('模板变化：待发掘 →');
    expect(game.recruits[0].templateId).toBeNull();
  });
  it('休息室跨月保留模板，读取新存档保留缓冲区内的旧模板', () => {
    const game = newGame(seededRandom(123));
    game.recruits[0] = player(190, uniform(85), 'curry');
    game.selectedId = 'test';
    const saved = rest(game, 'test');
    const next = nextMonth({ ...saved, cash: 500000 }, seededRandom(123));
    expect(next.lounge[0].templateId).toBe('curry');
    expect(decodeSave(JSON.stringify(next))?.lounge[0].templateId).toBe('curry');
  });
  it('旧存档迁移不丢失经济、等级和六维，错误模板按属性修复', () => {
    const game = newGame(seededRandom(123));
    game.recruits[0] = refreshTemplate(player(203, uniform(90)));
    game.selectedId = 'test';
    const raw = JSON.parse(JSON.stringify(game));
    delete raw.recruits[0].templateId;
    const restored = decodeSave(JSON.stringify(raw))!;
    expect(restored.recruits[0].templateId).toBe('lebron');
    expect(restored.recruits[0].stats).toEqual(game.recruits[0].stats);
    expect(restored.recruits[0].level).toBe(10);
    expect(restored.cash).toBe(game.cash);
    expect(restored.debt).toBe(game.debt);
    raw.recruits[0].templateId = 'deleted-template';
    expect(decodeSave(JSON.stringify(raw))?.recruits[0].templateId).toBe('lebron');
  });
  it('轻伤跌破缓冲线更新模板，重伤仍立即移除球员', () => {
    const game = newGame(seededRandom(123));
    game.recruits[0] = player(190, uniform(42), 'beverley');
    game.selectedId = 'test';
    expect(train(game, roll(0.10)).recruits[0].templateId).toBeNull();
    expect(train(select(game, 'test'), roll(0)).recruits.some(p => p.id === 'test')).toBe(false);
  });
});

