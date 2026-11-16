import {gymLevels, type GymState} from '../game/gym/engine';
import './ContractHeatMeter.css';
import './GymStatus.css';
import './GymScoreboard.css';

function ScoreArrow() {
 return <svg className="gym-score-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m5 3 5 5-5 5"/></svg>;
}

export function GymScoreboard({state, onClub, onPlayer}: {state: GymState; onClub: () => void; onPlayer: () => void}) {
 const current = gymLevels[state.gymLevel - 1];
 const next = gymLevels[state.gymLevel];
 const target = next?.fame ?? gymLevels[gymLevels.length - 1].fame;
 const remaining = Math.max(0, target - state.fame);
 return <section className="gym-scoreboard" aria-label="球馆声望与赞助券">
  <button type="button" className="gym-score-medal" onClick={onClub} aria-label="球馆经营"><span>球馆</span><b>{String(state.gymLevel).padStart(2, '0')}</b></button>
  <div className="gym-score-detail">
   <div className="gym-score-top"><div className="gym-score-identity"><small>球馆等级 {state.gymLevel}</small><strong>{current.name}</strong></div>
    <div className="gym-score-actions"><button type="button" className="gym-score-roster gym-score-club" onClick={onClub} aria-label="查看球馆"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 13 16 5l12 8v15H4Z M1 13l15-10 15 10 M11 28V17h10v11 M9 12h14"/></svg><span>查看球馆</span><ScoreArrow/></button><button type="button" className="gym-score-roster" onClick={onPlayer} aria-label="打开球员名册"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="12" cy="10" r="5"/><path d="M3 28v-6c0-5 18-5 18 0v6Z M23 6a5 5 0 0 1 0 9 M26 19c4 1 4 3 4 9h-5"/></svg><span>球员</span><b>{(state.player ? 1 : 0) + state.bench.length}/{state.gymLevel}</b><ScoreArrow/></button></div>
   </div>
   <div className="gym-score-progress"><div className="gym-score-metrics"><span>声望</span><b>{state.fame.toLocaleString()}</b><small>/ {target.toLocaleString()}</small></div><div className="gym-score-track" role="progressbar" aria-label="球馆声望进度" aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(state.fame, target)} aria-valuetext={`${state.fame}/${target}，${next ? `还差 ${remaining} 声望` : '已达最高馆级'}`}><i style={{width: `${Math.min(100, state.fame / target * 100)}%`}}/></div></div>
  </div>
 </section>;
}

export {GymStamina} from './GymStamina';
