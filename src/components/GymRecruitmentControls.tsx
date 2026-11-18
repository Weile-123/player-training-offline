import {useRef, useState} from 'react';
import {statLabels} from '../game/config';
import {selectedRecruitmentPrice, selectedRecruitmentUnlockLevel} from '../game/gym/catalog';
import {selectedRecruitmentDirections, type SelectedRecruitmentDirection} from '../game/gym/selectedRecruitment';
import {activePlayers, type GymAction, type GymState, type HeightPreference} from '../game/gym/engine';
import {GameIcon} from './GameIcon';
import './GymRoster.css';

type Props = {state: GymState; onAction: (action: GymAction) => void; busy?: boolean; emptyCourt?: boolean};

export function GymRecruitmentControls({state, onAction, busy = false, emptyCourt = false}: Props) {
  const [preference, setPreference] = useState<HeightPreference>('any');
  const [direction, setDirection] = useState<SelectedRecruitmentDirection>('shooting');
  const [selectedMode, setSelectedMode] = useState(false);
  const submitted = useRef(false);
  const seats = state.gymLevel - activePlayers(state).length;
  const unlocked = state.gymLevel >= selectedRecruitmentUnlockLevel;
  const full = seats <= 0;
  const useSelected = selectedMode && unlocked;
  const begin = () => {
    if (submitted.current || busy || full || useSelected && state.credits < selectedRecruitmentPrice) return;
    submitted.current = true;
    try {
      onAction({type: 'recruit', preference, expectedNextPlayer: state.nextPlayer, ...(useSelected ? {mode: 'selected', direction} as const : {})});
    } finally {
      // Block duplicate clicks before the parent publishes busy/the new sequence.
      queueMicrotask(() => {submitted.current = false;});
    }
  };
  return <section className={`gm-recruitment gm-stack${emptyCourt ? '' : ' gm-roster-recruit'}`} aria-label="新人招生">
    <div className="gm-section-heading"><h3>{full ? '训练位已满' : `空余 ${seats} 个训练位`}</h3><span>赞助券 {state.credits}</span></div>
    {unlocked && <div className="gm-recruitment-modes" role="group" aria-label="招生方式">
      <button type="button" className={selectedMode ? 'gm-button' : 'gm-button gm-primary'} aria-pressed={!selectedMode} disabled={busy} onClick={() => setSelectedMode(false)}>免费招生</button>
      <button type="button" className={selectedMode ? 'gm-button gm-primary' : 'gm-button'} aria-pressed={selectedMode} disabled={busy || !unlocked} onClick={() => setSelectedMode(true)}>精选招生 · {selectedRecruitmentPrice}券</button>
    </div>}
    <div className="gm-recruitment-field"><span>身高偏好</span><div className="gm-recruit-height" role="group" aria-label={emptyCourt ? '新人身高偏好' : '名册新人身高偏好'}>{(['any','guard','forward','center'] as const).map(value=><button type="button" key={value} className={`gm-height-option${preference===value?' is-selected':''}`} data-preference={value} aria-pressed={preference===value} disabled={busy||full} onClick={()=>setPreference(value)}><strong>{value==='any'?'不限身高':value==='guard'?'后卫型':value==='forward'?'锋线型':'内线型'}</strong>{value!=='any'&&<small>{value==='guard'?'178–194':value==='forward'?'195–205':'206–218'} cm</small>}</button>)}</div></div>
    {useSelected && <div className="gm-recruitment-field"><span>精选方向</span><div className="gm-recruit-height gm-recruit-direction" role="group" aria-label="精选招生方向">{selectedRecruitmentDirections.map(item=><button type="button" key={item.id} className={`gm-height-option${direction===item.id?' is-selected':''}`} data-direction={item.id} aria-pressed={direction===item.id} disabled={busy||full} onClick={()=>setDirection(item.id)}><strong>{item.label}</strong><small>{item.keys.map(key=>statLabels[key]).join(' / ')}</small></button>)}</div></div>}
    {useSelected && state.credits < selectedRecruitmentPrice && <p className="gm-recommend-warning">赞助券还差 {selectedRecruitmentPrice - state.credits} 券</p>}
    <button type="button" className="primary gm-icon-button gm-recruit-submit" disabled={busy || full || useSelected && state.credits < selectedRecruitmentPrice} onClick={begin}><GameIcon name="people"/><span>{useSelected ? `精选招募 · ${selectedRecruitmentPrice}券` : emptyCourt ? '免费招募下一位' : '免费招募新人'}</span></button>
  </section>;
}
