import {useEffect, useLayoutEffect, useRef, useState, type CSSProperties} from 'react';
import {assetUrl} from '../presentation/assetUrls';
import './GymTrainingToolbar.css';

type Props = {
  playerId?: string;
  level: number;
  experience: number;
  required: number;
  atCap: boolean;
  cooperationReady: boolean;
  empty?: boolean;
  reducedMotion?: boolean;
  onTraining: () => void;
  onCooperation: () => void;
};

const experienceTransitionMs = 280;

function ExperienceFill({level, percent, atCap, reducedMotion}: {level: number; percent: number; atCap: boolean; reducedMotion: boolean}) {
  const [systemReduced, setSystemReduced] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [display, setDisplay] = useState({percent, instant: true});
  const previousLevel = useRef(level);
  const latest = useRef(percent);
  const crossingLevel = useRef(false);
  const pending = useRef<{timer?: ReturnType<typeof setTimeout>; frames: number[]}>({frames: []});
  latest.current = percent;
  const cancel = () => {
    clearTimeout(pending.current.timer);
    pending.current.frames.forEach(cancelAnimationFrame);
    pending.current = {frames: []};
    crossingLevel.current = false;
  };
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => setSystemReduced(media.matches);
    media.addEventListener?.('change', changed);
    return () => media.removeEventListener?.('change', changed);
  }, []);
  useLayoutEffect(() => () => cancel(), []);
  useLayoutEffect(() => {
    const oldLevel = previousLevel.current;
    previousLevel.current = level;
    if (reducedMotion || systemReduced || level < oldLevel) {
      cancel();
      setDisplay({percent, instant: true});
      return;
    }
    if (level > oldLevel && !atCap) {
      cancel();
      crossingLevel.current = true;
      setDisplay({percent: 100, instant: false});
      pending.current.timer = setTimeout(() => {
        setDisplay({percent: 0, instant: true});
        // Paint the empty new-level track before growing its remaining XP.
        pending.current.frames.push(requestAnimationFrame(() => {
          pending.current.frames.push(requestAnimationFrame(() => {
            crossingLevel.current = false;
            setDisplay({percent: latest.current, instant: false});
          }));
        }));
      }, experienceTransitionMs);
    } else if (!crossingLevel.current) setDisplay({percent, instant: false});
  }, [level, percent, atCap, reducedMotion, systemReduced]);
  return <i className={display.instant ? 'is-instant' : undefined} style={{width: `${display.percent}%`, '--experience-transition-ms': `${experienceTransitionMs}ms`} as CSSProperties}/>;
}

function ShortcutIcon({cooperation = false}: {cooperation?: boolean}) {
  return <svg viewBox="0 0 32 32" aria-hidden="true">{cooperation
    ? <path d="m3 13 7-6 7 2 6-1 6 5-6 12-4 3-8-3Z M3 13l6 5 7-7 5 5-5 6 M22 19l-6-5 M25 15l-3 4 M10 22l5 5"/>
    : <path d="M4 6h9l3 3 3-3h9v22H18l-2 2-2-2H4Z M16 10v17 M8 13h4 M8 18h4 M21 13h3 M21 18h3"/>}</svg>;
}

export function GymTrainingToolbar({playerId, level, experience, required, atCap, cooperationReady, empty = false, reducedMotion = false, onTraining, onCooperation}: Props) {
  const percent = empty ? 0 : atCap ? 100 : Math.min(100, Math.max(0, experience / Math.max(1, required) * 100));
  return <section className="gym-training-toolbar" aria-label="训练快捷操作" style={{'--training-ticket-paper': `url("${assetUrl('art/game/paper.png')}")`} as CSSProperties}>
    <div className="gym-experience" aria-label="训练经验">
      <div className="gym-experience-upper"><strong>{empty ? '空训练位' : `Lv.${level}`}</strong><span>{empty ? '等待招募' : '训练经验'}</span><span className="gym-experience-readout"><b>{empty ? '—' : atCap ? '已满级' : <>{experience}<small> / {required}</small></>}</b></span></div>
      <div className="gym-experience-track" role="progressbar" aria-label="当前球员训练经验" aria-valuemin={0} aria-valuemax={empty || atCap ? 1 : required} aria-valuenow={empty ? 0 : atCap ? 1 : experience} aria-valuetext={empty ? '空训练位，等待招募' : atCap ? '已满级' : `${experience}/${required} 经验`}><ExperienceFill key={empty ? 'empty' : playerId ?? 'active'} level={level} percent={percent} atCap={atCap} reducedMotion={reducedMotion}/></div>
    </div>
    <div className="gym-training-tickets">
      <button type="button" className="gym-training-ticket" aria-label="选择训练计划" disabled={empty} onClick={onTraining}><ShortcutIcon/><span>计划</span></button>
      <button type="button" className="gym-training-ticket gym-cooperation-ticket" aria-label="赞助合作" disabled={empty} onClick={onCooperation}><ShortcutIcon cooperation/><span>合作</span>{!empty && cooperationReady && <i className="gym-cooperation-ready" role="img" aria-label="合作已达成"/>}</button>
    </div>
  </section>;
}
