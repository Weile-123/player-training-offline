import { expect, it } from 'vitest';
import { equipmentCatalog } from '../../src/game/gym/catalog';
import { equipmentSummary } from '../../src/presentation/equipmentSummary';

it('describes all fourteen equipment families using the actual effect value and relevant unit', () => {
  expect(new Set(equipmentCatalog.map(item => item.family)).size).toBe(14);
  for (const item of equipmentCatalog) {
    const text = equipmentSummary(item), e = item.effects;
    expect(text).not.toBe('收藏器材');
    if (e.stamina) expect(text).toBe(`体力上限 +${e.stamina}`);
    if (e.recovery) expect(text).toBe(`体力恢复时间 -${e.recovery}秒`);
    if (e.courseRecovery) expect(text).toBe(`完成课程额外恢复 +${e.courseRecovery}`);
    if (e.experience) expect(text).toBe(`所有投篮经验 +${e.experience}`);
    if (e.automationExperience) expect(text).toBe(`自动投篮经验 +${e.automationExperience}`);
    if (e.offlineMinutes) expect(text).toBe(`离线时长 +${e.offlineMinutes} 分钟`);
    if (e.valuePercent) expect(text).toBe(`培养品牌声望 +${e.valuePercent}%`);
    if (e.cooperationBonus) expect(text).toBe(`合作达标额外 +${e.cooperationBonus} 券`);
    if (e.focusKey) expect(text).toContain(`倾向 +${e.focusPower}`);
  }
});
