import {templateById} from '../game/templates';
import {PosterShareDialog} from './PosterShareDialog';
import {useState} from 'react';
import type {Athlete,Contract} from '../game/contract/engine';
import {statKeys} from '../game/types';
import {statLabels} from '../game/config';
import {isHighPotential} from '../game/contract/recruits';
import {playerPosterData} from '../presentation/completionPoster';
import {money} from '../presentation/money';
import {StarPortrait} from './PlayerTemplatePanel';
import {ComicDialog} from './ComicDialog';
import '../completion.css';
import './TrainingCapDialog.css';

export function TrainingCapDialog({game,player,onClose,onQueue,onRest}:{game:Contract;player:Athlete;onClose:()=>void;onQueue:()=>void;onRest:()=>void}){
 const data=playerPosterData(game,player),[poster,setPoster]=useState(false);
 return <ComicDialog title="训练满级！" className="training-cap-dialog" onClose={onClose}>
 <div className="training-cap-player"><div className="training-cap-portrait tier-portrait-frame" data-tier={templateById(player.templateId)?.tier??'undiscovered'}><StarPortrait src={data.portrait} name={data.name} highPotential={isHighPotential(player)}/></div><div><h3>{data.name}</h3><span className="training-cap-level">训练 <b>99</b> 级</span><small>当前估值</small><strong title={money(data.value)}>{money(data.value)}</strong></div></div>
 <div className="training-cap-stats">{statKeys.map(key=><div key={key}><small>{statLabels[key]}</small><b>{data.stats[key]}</b></div>)}</div>
 <p className="training-cap-copy">已达到训练等级上限！可以加入本月交付，或进入休息室留存这名球员。</p>
 <div className="training-cap-actions"><button className="primary" onClick={onQueue}>加入交付</button><button className="secondary" onClick={onRest}>进入休息室</button><button className="secondary training-cap-share" onClick={()=>setPoster(true)}>分享海报</button></div>
 {poster&&<PosterShareDialog spec={{kind:'cap',player:data}} onClose={()=>setPoster(false)}/>}
 </ComicDialog>;
}
