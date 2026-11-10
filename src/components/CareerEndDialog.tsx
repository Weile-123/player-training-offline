import {RewardedAdButton} from './RewardedAdButton';
import {useState,type CSSProperties} from 'react';
import {PosterShareDialog} from './PosterShareDialog';
import {careerPosterData} from '../presentation/completionPoster';
import type {Contract,CareerBestPlayer} from '../game/contract/engine';
import {templateById} from '../game/templates';
import {overallRating} from '../game/matching';
import {statKeys} from '../game/types';
import {statLabels} from '../game/config';
import {equipmentName} from '../game/contract/catalog';
import {usePlayerProfile} from '../platform/usePlayerProfile';
import {StarPortrait,templatePortrait} from './PlayerTemplatePanel';
import {ProductImage} from './ProductImage';
import {AlbumIcon} from './CollectionAlbum';
import {money} from './ContractPanels';
import {ComicDialog} from './ComicDialog';

/** Terminal career summary with a frozen result poster and return-home action. */
export function CareerEndDialog({career,onHome,reduced=false}:{career:Contract;onHome:()=>void;reduced?:boolean}){
 const [poster,setPoster]=useState(false);
 return <ComicDialog title="本局结束" subtitle="信用已耗尽" variant="career-end" dismissible={false} onClose={onHome} className={reduced?'reduce-motion':''}>
    <div className="career-end-scroll" tabIndex={0} aria-label="本局结算记录">
     <dl className="career-end-stats"><div><dt>挑战至</dt><dd><small>第 </small>{career.month}<small> 月</small></dd></div><div><dt>累计交付</dt><dd>{money(career.delivered)}</dd></div><div><dt>训练</dt><dd>{career.totalShots.toLocaleString('en-US')}<small> 次</small></dd></div></dl>
     <section className="career-end-section"><h3>本局最高价值球员</h3>{career.bestPlayer?<BestPlayerCard player={career.bestPlayer}/>:<div className="career-best-empty"><AlbumIcon name="star"/><strong>尚未发掘球星模板</strong><p>本局暂无可展示的球星记录</p></div>}</section>
     <section className="career-end-section career-equipment"><h3>最终器械 · {career.equipment.length}/8</h3>{career.equipment.length?<div className="career-equipment-grid">{career.equipment.map(id=><div key={id}><ProductImage id={id} name={equipmentName(id)}/><strong>{equipmentName(id)}</strong></div>)}</div>:<p className="career-equipment-empty">本局未持有器械</p>}</section>
    </div>
    <footer className="career-end-actions">
     <button className="career-end-home" onClick={onHome}>返回首页</button>
     <button onClick={()=>setPoster(true)} aria-label="生成海报或发帖"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M12 7H5v21h21V17M16 4h12v12M28 4 13 19"/></svg><span>生成海报｜发帖</span></button>
     <RewardedAdButton reward="revive" label="复活·送3名新人" gold/>
    </footer>
 {poster&&<PosterShareDialog spec={{kind:'career-end',record:careerPosterData(career)}} onClose={()=>setPoster(false)}/>}
 </ComicDialog>;
}
export function BestPlayerCard({player}:{player:CareerBestPlayer}){
 const template=templateById(player.templateId),profile=usePlayerProfile(player.templateId),name=template?.name??'球星模板';
 const colors=['#c82d25','#e28b20','#c39d28','#26917c','#258eb8','#8b419e'];
 return <div className="career-best">
  <div className="career-best-hero">
   <div className="career-best-photo tier-portrait-frame" data-tier={template?.tier??'undiscovered'}><StarPortrait key={profile?.avatar} src={profile?.avatar??templatePortrait(player.templateId)} name={name}/></div>
   <div className="career-best-info"><strong>模板：{name}</strong><b className="career-best-value">{money(player.value)}</b><span className="career-best-level"><AlbumIcon name="level"/>训练 +{player.level}</span><span className="career-best-rating"><AlbumIcon name="star"/>综评 {overallRating(player.stats).toFixed(1)}</span></div>
  </div>
  <div className="career-peak-label"><span>价值巅峰记录</span></div>
  <div className="career-best-stats">{statKeys.map((key,i)=><div key={key} style={{'--stat-color':colors[i]} as CSSProperties}><span>{statLabels[key]}</span><b>{player.stats[key]}</b><div className="career-stat-track" role="meter" aria-label={statLabels[key]} aria-valuenow={player.stats[key]} aria-valuemin={0} aria-valuemax={99}><i style={{width:`${player.stats[key]/99*100}%`}}/></div></div>)}</div>
 </div>;
}
