import type {CSSProperties} from 'react';
import {statLabels} from '../game/config';
import {playerLevelCap, type GymPlayer} from '../game/gym/engine';
import {overallRating} from '../game/matching';
import {templateById} from '../game/templates';
import {statKeys} from '../game/types';
import {usePlayerProfile} from '../platform/usePlayerProfile';
import {gymPlayerName} from '../presentation/gymPlayerName';
import {AlbumIcon} from './CollectionAlbum';
import {StarPortrait, templatePortrait} from './PlayerTemplatePanel';
import {TierBadge} from './TierBadge';
import './GymPlayerDetails.css';

const statColors = ['#c95029', '#c59a30', '#cd6334', '#36816c', '#377c91', '#a9473a'];

export function GymPlayerDetails({player, onTraining}: {player: GymPlayer; onTraining: () => void}) {
  const template = templateById(player.templateId);
  const profile = usePlayerProfile(player.templateId);
  const name = profile?.name ?? gymPlayerName(player);
  return <div className="gym-panel gm-player-profile" aria-label="当前球员资料">
    <header className="gm-profile-hero">
      <div className="gm-profile-portrait tier-portrait-frame" data-tier={template?.tier ?? 'undiscovered'}><StarPortrait src={profile?.avatar ?? templatePortrait(player.templateId)} fallbackSrc={templatePortrait(player.templateId)} name={name}/></div>
      <div className="gm-profile-identity"><TierBadge tier={template?.tier} className="gm-profile-tier"/><h3>{name}</h3><p>{player.height} cm</p><small>{template?.style ?? '继续训练，发掘他的球星模板'}</small></div>
      <div className="gm-profile-rating"><span>综合评分</span><b>{overallRating(player.stats).toFixed(1)}</b></div>
    </header>
    <div className="gm-profile-record" aria-label="培养记录"><span>训练等级 <b>Lv.{player.level}</b></span><span>累计投篮 <b>{player.shots}<small>次</small></b></span><span>完成课程 <b>{player.training.completedCourses}<small>课</small></b></span></div>
    <section className="gm-profile-abilities" aria-label="球员六维能力"><div className="gm-profile-section-title"><h4>六维能力</h4><span>上限 99</span></div><div className="gm-profile-stat-list">{statKeys.map((key, index) => <div className="gm-profile-stat" key={key} style={{'--ability-color': statColors[index]} as CSSProperties}><AlbumIcon name={key}/><span>{statLabels[key]}</span><div className="gm-profile-stat-track" role="meter" aria-label={statLabels[key]} aria-valuemin={0} aria-valuemax={99} aria-valuenow={player.stats[key]}><i style={{width: `${Math.min(100, player.stats[key] / 99 * 100)}%`}}/></div><b>{player.stats[key]}</b></div>)}</div></section>
    <button type="button" className="gm-button gm-profile-training" onClick={onTraining}>查看训练计划与培养记录 <span aria-hidden="true">›</span></button>
    {player.level >= playerLevelCap && <p className="gm-muted">已达到 Lv.{playerLevelCap}，可核对成果后推荐签约。</p>}
  </div>;
}
