import {useEffect, useRef, useState} from 'react';
import {statLabels} from '../game/config';
import {challengePower, type ChallengeFixture, type ChallengeRun, type scoreChallenge} from '../game/gym/challenge';
import {challengeCards} from '../game/gym/challengeCatalog';
import type {StatKey} from '../game/types';
import {posterPortrait} from '../presentation/posterPortrait';
import {TierBadge} from './TierBadge';
import './GymChallengeBattle.css';

const LEAD_IN_MS = 230;
const COUNT_MS = 400;
const BETWEEN_LANES_MS = 220;
const LANE_INTERVAL_MS = COUNT_MS + BETWEEN_LANES_MS;

function abilityValue(value: number) {
  return String(Number(value.toFixed(2)));
}

export function ChallengeAbility({stat, value}: {stat: StatKey; value: number}) {
  return <span className="gc-paired-ability"><span>{statLabels[stat]}</span><b>{abilityValue(value)}</b></span>;
}

export function ChallengePortrait({id, className = ''}: {id: string; className?: string}) {
  const portrait = posterPortrait(id);
  return <span className={`tier-portrait-frame gc-battle-portrait${className ? ` ${className}` : ''}`} data-tier={portrait.tier}>
    <img src={portrait.src} alt="" width="44" height="50" decoding="async"/>
  </span>;
}

export function ChallengeOpponents({fixture}: {fixture: ChallengeFixture}) {
  return <section className="gc-opponents" aria-label="赛前对阵">
    <header className="gc-opponents-heading">
      <div>
        <small>第 {fixture.stage} 关</small>
        <h2>{fixture.club}</h2>
      </div>
      <span>客队阵容</span>
    </header>
    <ul className="gc-opponent-list">
      {fixture.lanes.map(lane => {
        const opponent = challengeCards.get(lane.id)!;
        return <li key={lane.id} className="gc-opponent">
          <ChallengePortrait id={lane.id}/>
          <div className="gc-opponent-identity">
            <strong>{opponent.name}</strong>
            <TierBadge tier={opponent.tier}/>
          </div>
          <div className="gc-opponent-stat"><span>{statLabels[lane.key]}</span><b>{abilityValue(lane.power)}</b></div>
        </li>;
      })}
    </ul>
  </section>;
}

export function ChallengeMatchups({fixture, run, selected, disabled, pick}: {
  fixture: ChallengeFixture;
  run: ChallengeRun;
  selected: number | null;
  disabled: boolean;
  pick: (lane: number, button: HTMLButtonElement) => void;
}) {
  return <section className="gc-opponents gc-paired" aria-label="赛前对阵">
    <header className="gc-opponents-heading">
      <div><small>第 {fixture.stage} 关</small><h2>{fixture.club}</h2></div>
      <span>安排对位</span>
    </header>
    <div className="gc-paired-head"><span>我方出战 <small>点击下方位置选择球员</small></span><span>客队阵容</span></div>
    <ol className="gc-opponent-list">
      {fixture.lanes.map((lane, index) => {
        const player = run.team.find(entry => entry.id === run.assignments?.[index]);
        const name = player && challengeCards.get(player.id)!.name;
        return <li key={lane.key} className="gc-opponent gc-paired-row" data-selected={selected === index}>
          <button type="button" className="gc-paired-slot" data-filled={Boolean(player)} disabled={disabled} aria-pressed={selected === index}
            aria-label={`安排第 ${index+1} 项对位 · ${statLabels[lane.key]}${name ? ` · ${name}` : ''}`}
            aria-controls="gc-starters" onClick={event => pick(index, event.currentTarget)}>
            {player ? <>
              <ChallengePortrait id={player.id}/>
              <span className="gc-paired-identity"><strong>{name}</strong>
              <ChallengeAbility stat={lane.key} value={challengePower(player, lane.key, run.boosts, run.settings, run.rulesVersion)/100}/>
              </span>
            </> : <>
              <span className="gc-paired-empty" aria-hidden="true">＋</span>
              <span className="gc-paired-identity"><strong>选择首发</strong><small>{statLabels[lane.key]}对位</small></span>
            </>}
          </button>
          <div className="gc-paired-rival">
            <ChallengePortrait id={lane.id}/>
            <span className="gc-paired-identity"><strong>{challengeCards.get(lane.id)!.name}</strong>
              <ChallengeAbility stat={lane.key} value={lane.power}/>
            </span>
          </div>
        </li>;
      })}
    </ol>
  </section>;
}

type BattleScore = ReturnType<typeof scoreChallenge>;
type BattleProps = {
  fixture: ChallengeFixture;
  score: BattleScore;
  animate: boolean;
  reduced?: boolean;
  onComplete?: () => void;
};

function MatchupPlayer({id, power}: {id: string; power: number}) {
  return <div className="gc-matchup-player">
    <ChallengePortrait id={id}/>
    <span><strong>{challengeCards.get(id)!.name}</strong><small>能力 {abilityValue(power)}</small></span>
  </div>;
}

export function ChallengeBattle({fixture, score, animate, reduced = false, onComplete}: BattleProps) {
  const [elapsed, setElapsed] = useState(0);
  const notify = useRef(onComplete);
  const completed = useRef(false);
  notify.current = onComplete;
  const finalTime = LEAD_IN_MS + (score.lanes.length - 1) * LANE_INTERVAL_MS + COUNT_MS;
  const sequenced = animate && !reduced;

  useEffect(() => {
    if (!animate) return;
    function complete() {
      if (completed.current) return;
      completed.current = true;
      notify.current?.();
    }
    if (reduced) {
      complete();
      return;
    }
    const start = performance.now();
    let frame = requestAnimationFrame(tick);
    function tick(time: number) {
      const next = Math.min(finalTime, Math.max(0, time - start));
      setElapsed(next);
      if (next < finalTime) frame = requestAnimationFrame(tick);
      else complete();
    }
    return () => cancelAnimationFrame(frame);
  }, [animate, finalTime, reduced]);

  const settled = !sequenced || elapsed >= finalTime;
  const lanes = score.lanes.map((lane, index) => {
    const time = elapsed - LEAD_IN_MS - index * LANE_INTERVAL_MS;
    const done = settled || time >= COUNT_MS;
    return {lane, time, done};
  });
  const totals = settled ? score : lanes.reduce((sum, {lane, done}) => done
    ? {home: sum.home + lane.points, away: sum.away + lane.rival.points} : sum, {home: 0, away: 0});
  const verdict = settled ? score.won ? '挑战胜利' : '挑战落败' : '对战中';

  return <section className={`gc-battle${sequenced ? ' gc-battle-sequenced' : ''}`} aria-label={settled ? '本关战报' : '挑战对战'}>
    <h2 className="gc-battle-heading">第 {fixture.stage} 关{settled ? '战报' : '对战'}</h2>
    <div className="gc-battle-total" role="status" aria-atomic="true">
      <span className="gc-battle-side"><small>我方</small><b className={settled && score.won ? 'gc-battle-winner' : ''}>{totals.home}</b></span>
      <strong className={`gc-battle-verdict${settled ? score.won ? ' is-win' : ' is-loss' : ''}`}>{verdict}</strong>
      <span className="gc-battle-side"><small>{fixture.club}</small><b className={settled && !score.won ? 'gc-battle-winner' : ''}>{totals.away}</b></span>
    </div>
    <div className="gc-matchups">
      <div className="gc-matchup-heading" aria-hidden="true"><span>我方</span><span>专项对位</span><span>{fixture.club}</span></div>
      <ol className="gc-matchup-list">
        {lanes.map(({lane, time, done}) => {
          const active = !done && time >= 0;
          const progress = done ? 1 : active ? 1 - (1 - time / COUNT_MS) ** 2 : 0;
          const homeWins = done && lane.points > lane.rival.points;
          const awayWins = done && lane.rival.points > lane.points;
          return <li key={lane.rival.key} className={`gc-matchup${active ? ' is-counting' : ''}`}>
            <MatchupPlayer id={lane.player.id} power={lane.power}/>
            <div className="gc-matchup-result">
              <strong>{statLabels[lane.rival.key]}</strong>
              {active || done ? <span className="gc-matchup-score">
                <b className={homeWins ? 'gc-battle-winner' : ''}>{Math.round(lane.points * progress)}</b>
                <span>:</span>
                <b className={awayWins ? 'gc-battle-winner' : ''}>{Math.round(lane.rival.points * progress)}</b>
              </span> : <b className="gc-matchup-score gc-matchup-dash">-</b>}
            </div>
            <MatchupPlayer id={lane.rival.id} power={lane.rival.power}/>
          </li>;
        })}
      </ol>
    </div>
  </section>;
}
