import {statKeys} from '../types';
import {templateById} from '../templates';
import {cooperationStatus, playerLevelCap, recommendationPayout, postgameRepeatTemplateCredits, trainingCreditMilestones, type GymPlayer, type GymState} from './engine';

const tierIds = [null, 'rotation', 'starter', 'star', 'superstar', 'legend'];
const tierNames = ['待发掘', '替补', '首发', '全明星', '巨星', '传奇'];
export type TrainingGuidance = {
  currentBonus: number;
  nextBonus: {level: number; tier: number; tierName: string; credits: number; additionalCredits: number; levelGap: number; tierGap: number} | null;
  maxedStats: number; allStatsMax: boolean; suggestion: string; remainingValue: string[];
};

/** Uses actual template/level milestones; never promises a template by time. */
export function trainingGuidance(state: GymState, player: GymPlayer | null = state.player): TrainingGuidance | null {
  if (!player) return null;
  const reward = recommendationPayout(state, player);
  const tier = tierIds.indexOf(templateById(player.templateId)?.tier ?? null);
  const ended = player.level >= playerLevelCap;
  const milestone = ended ? undefined : trainingCreditMilestones.find(item => item.credits > reward.trainingCredits);
  const nextBonus = milestone ? {...milestone, tierName: tierNames[milestone.tier], additionalCredits: milestone.credits - reward.trainingCredits,
    levelGap: Math.max(0, milestone.level - player.level), tierGap: Math.max(0, milestone.tier - tier)} : null;
  const maxedStats = statKeys.filter(key => player.stats[key] >= 99).length;
  const allStatsMax = maxedStats === statKeys.length;
  const cooperation = cooperationStatus(state, player);
  const remainingValue: string[] = [];
  if (reward.repeatTemplate) remainingValue.push(`重复模板基础 ${postgameRepeatTemplateCredits} 券，培养、合作与器材加奖照常叠加`);
  if (ended) remainingValue.push(`训练已结束，按当前实际模板结算培养奖金 ${reward.trainingCredits} 券，无法继续训练提升`);
  else if (nextBonus) remainingValue.push(`下一培养奖金还可增加 ${nextBonus.additionalCredits} 券，需要 Lv.${nextBonus.level} 且匹配${nextBonus.tierName}及以上`);
  else remainingValue.push('已达到最高培养奖金，继续升级不会增加培养奖金');
  if (!allStatsMax && player.level < playerLevelCap) remainingValue.push(`仍有 ${statKeys.length - maxedStats} 项属性可成长；可调整专项补强模板要求`);
  if (cooperation.offer && !cooperation.complete) remainingValue.push(ended ? '当前合作未完成，可看广告完成或按已完成成果推荐结算' : '当前合作尚未完成，达成后推荐可获得合作奖励');
  if (allStatsMax) remainingValue.push(ended ? '六维已满，本次训练已结束' : '六维已满，继续训练不会增加属性，主要提高等级与展示身价');
  else if (!ended && maxedStats > 0) remainingValue.push(`${maxedStats} 项属性已满，抽中满属性会损耗成长机会`);
  let suggestion: string;
  if (ended) suggestion = '训练已结束，可以按当前模板推荐签约，腾出位置培养下一位球员';
  else if (allStatsMax && !nextBonus && (!cooperation.offer || cooperation.complete)) suggestion = '六维与培养奖金均已完成，建议推荐签约';
  else if (!nextBonus) suggestion = '已达最高培养奖金，可推荐兑现，或为属性与模板收藏继续培养';
  else if (reward.trainingCredits > 0) suggestion = `已获培养奖金 ${reward.trainingCredits} 券，可推荐周转；${!nextBonus.levelGap && nextBonus.tierGap ? `下一档仍需匹配${nextBonus.tierName}，到等级不保证获得模板` : '接近下一节点时也可继续培养'}`;
  else if (!nextBonus.levelGap && nextBonus.tierGap) suggestion = `等级已达下一奖金门槛，仍需匹配${nextBonus.tierName}；到等级不保证获得模板`;
  else suggestion = `可将 Lv.${nextBonus.level}＋${nextBonus.tierName}作为首个培养目标，资金不足时仍可提前推荐`;
  return {currentBonus: reward.trainingCredits, nextBonus, maxedStats, allStatsMax, suggestion, remainingValue};
}
