import {statKeys} from '../types';
import {templateById} from '../templates';
import {cooperationStatus, playerLevelCap, recommendation, recommendationPayout, postgameRepeatTemplateCredits, trainingCreditMilestones, type GymPlayer, type GymState} from './engine';

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
  const reward = recommendation(state, player);
  const payout = recommendationPayout(state, player);
  const tier = tierIds.indexOf(templateById(player.templateId)?.tier ?? null);
  const ended = player.level >= playerLevelCap;
  const milestone = ended || payout.repeatTemplate ? undefined : trainingCreditMilestones.find(item => item.credits > reward.trainingCredits);
  const nextBonus = milestone ? {...milestone, tierName: tierNames[milestone.tier], additionalCredits: milestone.credits - reward.trainingCredits,
    levelGap: Math.max(0, milestone.level - player.level), tierGap: Math.max(0, milestone.tier - tier)} : null;
  const maxedStats = statKeys.filter(key => player.stats[key] >= 99).length;
  const allStatsMax = maxedStats === statKeys.length;
  const cooperation = cooperationStatus(state, player);
  const remainingValue: string[] = [];
  if (payout.repeatTemplate) remainingValue.push(`当前模板在本馆已推荐过，再次推荐合计 ${postgameRepeatTemplateCredits} 券；提高等级或完成合作不会补发该模板的首次奖励差额`);
  else if (ended) remainingValue.push(`训练已结束，按当前实际模板结算培养奖金 ${reward.trainingCredits} 券，无法继续训练提升`);
  else if (nextBonus) remainingValue.push(`下一培养奖金还可增加 ${nextBonus.additionalCredits} 券，需要 Lv.${nextBonus.level} 且匹配${nextBonus.tierName}及以上`);
  else remainingValue.push('已达到最高培养奖金，继续升级不会增加培养奖金');
  if (!allStatsMax && player.level < playerLevelCap) remainingValue.push(`仍有 ${statKeys.length - maxedStats} 项属性可成长；可调整专项补强模板要求`);
  if (cooperation.offer && !cooperation.complete) remainingValue.push(ended ? '当前合作未完成，已无法继续训练补足条件，推荐按已完成成果结算' : payout.repeatTemplate ? '完成当前合作仍可获得合作声望；该模板的重复推荐券合计不变' : '当前合作尚未完成，达成后推荐可获得合作奖励');
  if (allStatsMax) remainingValue.push(ended ? '六维已满，本次训练已结束' : '六维已满，继续训练不会增加属性，主要提高等级与展示身价');
  else if (!ended && maxedStats > 0) remainingValue.push(`${maxedStats} 项属性已满，抽中满属性会损耗成长机会`);
  let suggestion: string;
  if (payout.repeatTemplate) suggestion = ended ? `训练已结束，当前重复模板推荐合计 ${postgameRepeatTemplateCredits} 券，可推荐后培养其他模板`
    : allStatsMax ? `六维已满，当前重复模板推荐合计 ${postgameRepeatTemplateCredits} 券，可核对声望后推荐`
    : `当前模板重复推荐合计 ${postgameRepeatTemplateCredits} 券；继续培养可提高声望、属性和图鉴纪录，或推荐后培养其他模板`;
  else if (ended) suggestion = '训练已结束，可以按当前模板推荐签约，腾出位置培养下一位球员';
  else if (allStatsMax && !nextBonus && (!cooperation.offer || cooperation.complete)) suggestion = '六维与培养奖金均已完成，建议推荐签约';
  else if (!nextBonus) suggestion = '已达最高培养奖金，可推荐兑现，或为属性与模板收藏继续培养';
  else if (reward.trainingCredits > 0) suggestion = `已获培养奖金 ${reward.trainingCredits} 券，可推荐周转；${!nextBonus.levelGap && nextBonus.tierGap ? `下一档仍需匹配${nextBonus.tierName}，到等级不保证获得模板` : '接近下一节点时也可继续培养'}`;
  else if (!nextBonus.levelGap && nextBonus.tierGap) suggestion = `等级已达下一奖金门槛，仍需匹配${nextBonus.tierName}；到等级不保证获得模板`;
  else suggestion = `可将 Lv.${nextBonus.level}＋${nextBonus.tierName}作为首个培养目标，资金不足时仍可提前推荐`;
  return {currentBonus: reward.trainingCredits, nextBonus, maxedStats, allStatsMax, suggestion, remainingValue};
}
