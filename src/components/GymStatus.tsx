import type {CSSProperties} from 'react';
import {gymLevels, recoverySeconds, staminaMax, type GymState} from '../game/gym/engine';
import {DeliveryScoreboard, SponsorTicket} from './DeliveryScoreboard';
import {GameIcon} from './GameIcon';
import './ContractHeatMeter.css';
import './GymStatus.css';

const formatScore = (value: string) => BigInt(value).toLocaleString();

export function GymScoreboard({state, onClub, onPlayer}: {state: GymState; onClub: () => void; onPlayer: () => void}) {
 const next = gymLevels[state.gymLevel];
 const target = next?.fame ?? gymLevels[gymLevels.length - 1].fame;
 const remaining = Math.max(0, target - state.fame);
 return <DeliveryScoreboard
  value={String(state.fame)} required={String(target)} credits={state.credits}
  labels={{value: '累计声望', required: next ? '下级门槛' : '最高馆级', section: '球馆声望与赞助券', progress: '球馆声望进度'}}
  formatAmount={formatScore}
  progressText={<span className="gym-score-status" title={`赞助券 ${state.credits.toLocaleString()}${next ? `，距下级声望还差 ${remaining.toLocaleString()}` : '，已达最高馆级'}`}><SponsorTicket/><span>{state.credits.toLocaleString()} 券</span><span>· {next ? remaining ? `还差 ${remaining.toLocaleString()}` : '声望达标' : '最高馆级'}</span></span>}
  rosterControls={<div className="player-shortcuts">
   <button type="button" className="paper-panel" onClick={onClub} aria-label="球馆经营"><GameIcon name="assets"/><span>球馆</span><b>{state.gymLevel}</b></button>
   <button type="button" className="paper-panel" onClick={onPlayer} aria-label="打开球员名册"><GameIcon name="people"/><span>球员</span><b>{(state.player ? 1 : 0) + state.bench.length}/{state.gymLevel}</b></button>
  </div>}
 />;
}

export function GymStamina({state}: {state: GymState}) {
 const player = state.player;
 const maximum = staminaMax(state);
 const count = player?.stamina ?? 0;
 const recovery = player && count < maximum ? Math.ceil((recoverySeconds(state) * 1_000 - player.recoveryMs) / 1_000) : 0;
 const recoveryText = !player ? '待招' : count >= maximum ? '已满' : `${recovery}秒`;
 const description = !player ? '招募后获得满体力' : count >= maximum ? '体力已满' : `${recovery} 秒后恢复 1 点体力`;
 const steps = 10;
 const filled = count / maximum * steps;
 return <aside className="contract-heat energy-meter gym-stamina-meter" aria-label={`体力 ${count}/${maximum}，${description}`} title={description} style={{'--energy-steps': steps} as CSSProperties}>
  <div className="energy-housing" aria-hidden="true"/>
  <div className="energy-crest" aria-hidden="true"><span className="gym-stamina-name">体力</span></div>
  <div className="contract-heat-track" role="progressbar" aria-label="球员体力" aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={count} aria-valuetext={`${count}/${maximum}，${description}`}>
   {Array.from({length: steps}, (_, i) => {
    const fill = Math.min(1, Math.max(0, filled - i));
    return <span key={i} aria-hidden="true" className={`energy-cell${fill > 0 ? ' is-filled' : ''}${fill > 0 && fill < 1 ? ' is-partial' : ''}`} style={{'--cell-tint': `${i / (steps - 1) * 100}%`, '--stamina-fill': `${fill * 100}%`} as CSSProperties}/>;
   })}
  </div>
  <div className="energy-readout" aria-hidden="true"><b>{count}</b><small>/{maximum}</small></div>
  <span className="gym-stamina-recovery" aria-hidden="true">{recoveryText}</span>
 </aside>;
}
