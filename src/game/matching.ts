import { config } from './config';
import { nbaTemplates, templateById, type NbaTemplate, type TemplateTier } from './templates';
import { statKeys, type Player, type Stats } from './types';

export type TemplateMatch = { templateId: string | null; similarity: number };
export const overallRating = (stats: Stats) => statKeys.reduce((sum, key) => sum + stats[key], 0) / statKeys.length;
export const tierConfig = (tier: TemplateTier) => config.matching.tiers.find(t => t.id === tier)!;
export const fitsHeight = (height: number, template: NbaTemplate) => height >= template.height[0] && height <= template.height[1];

// 比较去均值后的六维分布，综合实力由档次门槛单独限制。
// 无方向性的全 99 属性会偏向分布均衡的全能模板。
export function styleSimilarity(stats: Stats, template: Stats): number {
  const playerMean = overallRating(stats), templateMean = overallRating(template);
  const spread = (attributes: Stats, mean: number) => Math.max(config.matching.balancedScale,
    Math.sqrt(statKeys.reduce((sum, key) => sum + (attributes[key] - mean) ** 2, 0) / statKeys.length));
  const playerSpread = spread(stats, playerMean), templateSpread = spread(template, templateMean);
  const error = Math.sqrt(statKeys.reduce((sum, key) => {
    const difference = (stats[key] - playerMean) / playerSpread - (template[key] - templateMean) / templateSpread;
    return sum + difference ** 2;
  }, 0) / statKeys.length);
  return Math.max(0, 1 - error / config.matching.similarityScale);
}

export function matchTemplate(player: Pick<Player, 'height' | 'stats'>, previousId: string | null = null): TemplateMatch {
  const rating = overallRating(player.stats);
  const previous = templateById(previousId);
  const previousValid = previous && fitsHeight(player.height, previous);
  const available = nbaTemplates.filter(template => fitsHeight(player.height, template));
  const unlockedTier = [...config.matching.tiers].reverse().find(tier =>
    rating >= tier.minimumRating && available.some(template => template.tier === tier.id));
  let tier = unlockedTier?.id;

  // 老模板允许在门槛下方小幅波动。真正跌破退出线才降档。
  if (previousValid) {
    const previousTier = tierConfig(previous.tier);
    if (rating >= previousTier.minimumRating - config.matching.downgradeBuffer &&
      (!unlockedTier || previousTier.minimumRating > unlockedTier.minimumRating)) tier = previous.tier;
  }
  if (!tier) return { templateId: null, similarity: 0 };
  const candidates = available.filter(template => template.tier === tier)
    .map(template => ({ templateId: template.id, similarity: styleSimilarity(player.stats, template.stats) }))
    .sort((a, b) => b.similarity - a.similarity || a.templateId.localeCompare(b.templateId, 'en'));
  const best = candidates[0];
  if (previousValid && previous.tier === tier) {
    const current = { templateId: previous.id, similarity: styleSimilarity(player.stats, previous.stats) };
    if (best.similarity - current.similarity <= config.matching.switchAdvantage) return current;
  }
  return best;
}

export function refreshTemplate(player: Player): Player {
  const result = matchTemplate(player, player.templateId);
  return { ...player, templateId: result.templateId };
}
