import type {CSSProperties} from 'react';
import {assetUrl} from '../presentation/assetUrls';
import './GymTrainingToolbar.css';

type Props = {
  level: number;
  experience: number;
  required: number;
  atCap: boolean;
  cooperationReady: boolean;
  onExperience: () => void;
  onTraining: () => void;
  onCooperation: () => void;
};

function ShortcutIcon({cooperation = false}: {cooperation?: boolean}) {
  return <svg viewBox="0 0 32 32" aria-hidden="true">{cooperation
    ? <path d="m3 13 7-6 7 2 6-1 6 5-6 12-4 3-8-3Z M3 13l6 5 7-7 5 5-5 6 M22 19l-6-5 M25 15l-3 4 M10 22l5 5"/>
    : <path d="M4 6h9l3 3 3-3h9v22H18l-2 2-2-2H4Z M16 10v17 M8 13h4 M8 18h4 M21 13h3 M21 18h3"/>}</svg>;
}

export function GymTrainingToolbar({level, experience, required, atCap, cooperationReady, onExperience, onTraining, onCooperation}: Props) {
  return <section className="gym-training-toolbar" aria-label="训练快捷操作" style={{'--training-ticket-paper': `url("${assetUrl('art/game/paper.png')}")`} as CSSProperties}>
    <button type="button" className="gym-experience" onClick={onExperience} aria-label="查看训练经验">
      <div className="gym-experience-upper"><strong>Lv.{level}</strong><span>训练经验</span><span className="gym-experience-readout"><b>{atCap ? '已满级' : <>{experience}<small> / {required}</small></>}</b></span></div>
      <div className="gym-experience-track" role="progressbar" aria-label="当前球员训练经验" aria-valuemin={0} aria-valuemax={atCap ? 1 : required} aria-valuenow={atCap ? 1 : experience} aria-valuetext={atCap ? '已满级' : `${experience}/${required} 经验`}><i style={{width: `${atCap ? 100 : Math.min(100, experience / required * 100)}%`}}/></div>
    </button>
    <div className="gym-training-tickets">
      <button type="button" className="gym-training-ticket" aria-label="选择训练计划" onClick={onTraining}><ShortcutIcon/><span>计划</span></button>
      <button type="button" className="gym-training-ticket gym-cooperation-ticket" aria-label="赞助合作" onClick={onCooperation}><ShortcutIcon cooperation/><span>合作</span>{cooperationReady && <i className="gym-cooperation-ready" role="img" aria-label="合作已达成"/>}</button>
    </div>
  </section>;
}
