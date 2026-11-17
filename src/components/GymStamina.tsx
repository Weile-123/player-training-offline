import {playerLevelCap, recoverySeconds, staminaMax, type GymState} from '../game/gym/engine';
import './GymStamina.css';

/** Approved A: a continuous courtside line with a separate score, without a housing. */
export function GymStamina({state, onRestore, busy = false}: {state: GymState; onRestore?: () => void; busy?: boolean}) {
  const player = state.player;
  const maximum = staminaMax(state);
  const count = player?.stamina ?? 0;
  const recovering = !!player && count < maximum;
  const recovery = recovering ? Math.ceil((recoverySeconds(state) * 1000 - player.recoveryMs) / 1000) : 0;
  const description = !player ? '招募后获得满体力' : recovering ? `${recovery} 秒后恢复 1 点体力` : '体力已满';
  return <aside className="gym-stamina-meter gym-stamina-a" aria-label={`体力 ${count}/${maximum}，${description}`} title={description}>
    <span className="gym-stamina-a-title" aria-hidden="true">体力</span>
    <div className="gym-stamina-a-body">
      <div className="gym-stamina-a-track" role="progressbar" aria-label="球员体力" aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={count} aria-valuetext={`${count}/${maximum}，${description}`}><i style={{height: `${Math.min(100, Math.max(0, count / maximum * 100))}%`}}/></div>
      <div className="gym-stamina-a-values" aria-hidden="true"><strong>{count}</strong><small>/{maximum}</small><em>{recovering ? <>恢复<br/><b>{recovery}秒</b></> : <b>{player ? '已满' : '待招'}</b>}</em></div>
    </div>
    {onRestore && player && count === 0 && player.level < playerLevelCap && <button type="button" className="gym-stamina-restore" disabled={busy} aria-label={(state.staminaRewardCount ?? 0) === 0 ? '分享发帖，体力回满' : '看广告，体力回满'} onClick={onRestore}><small>{(state.staminaRewardCount ?? 0) === 0 ? '分享' : '广告'}</small><span>体力回满</span></button>}
  </aside>;
}
