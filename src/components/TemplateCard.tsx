import { config, statLabels } from '../game/config';
import { overallRating, styleSimilarity } from '../game/matching';
import { positionLabels, templateById } from '../game/templates';
import { statKeys, type Player } from '../game/types';
import { usePlayerProfile } from '../platform/usePlayerProfile';
import { TierBadge } from './TierBadge';

export function TemplateCard({ player, evolving=false }: { player: Player; evolving?:boolean }) {
  const template = templateById(player.templateId);
  const profile = usePlayerProfile(template?.id);
  const rating = overallRating(player.stats);
  const nextTier = config.matching.tiers.find(tier => tier.minimumRating > rating);
  return <section className={`template-card ${template?.tier ?? 'undiscovered'} ${evolving?'template-evolving':''}`} aria-label="NBA 模板匹配">
    <div className="template-caption"><span>NBA 球星模板</span><TierBadge tier={template?.tier}/></div>
    {template ? <>
      <h3>{profile?.name??template.name}</h3>
      <p className="template-meta">{template.position} · {positionLabels[template.position]} · {template.style}</p>
      <div className="template-match"><span>风格相似度 <strong>{(styleSimilarity(player.stats, template.stats) * 100).toFixed(1)}%</strong></span><span>适配 {template.height[0]}–{template.height[1]}cm</span></div>
      <details><summary>查看模板六维标准</summary><div className="template-standards">{statKeys.map(key => <span key={key}>{statLabels[key]} <b>{template.stats[key]}</b></span>)}</div><p>游戏风格配置；模板不直接修改球员属性或出售价格。</p></details>
    </> : <><h3>潜力仍在生长</h3><p className="template-meta">综合评分达到 {config.matching.tiers[0].minimumRating} 后，匹配符合身高的球星风格。</p><p className="template-meta">当前没有位置，由未来匹配的模板决定。</p></>}
    <p className="template-next">{nextTier ? `下一档：${nextTier.label} · 综合评分 ${nextTier.minimumRating}` : '已达到最高档次，属性分布仍可改变球星风格'}</p>
  </section>;
}
