import {useRef, useState} from 'react';
import {statLabels} from '../game/config';
import {selectedRecruitmentPrice, selectedRecruitmentUnlockLevel, postgameRepeatTemplateCredits} from '../game/gym/catalog';
import {selectedRecruitmentDirections, type SelectedRecruitmentDirection} from '../game/gym/selectedRecruitment';
import {activePlayers, type GymAction, type GymState, type HeightPreference} from '../game/gym/engine';
import {ComicDialog} from './ComicDialog';
import {GameIcon} from './GameIcon';
import './GymRoster.css';

type Props = {state: GymState; onAction: (action: GymAction) => void; busy?: boolean; emptyCourt?: boolean};
type Pending = {preference: HeightPreference; direction: SelectedRecruitmentDirection; expectedNextPlayer: number};
const heightPreferenceLabels: Record<HeightPreference, string> = {
  any: '不限身高 · 178–218 cm', guard: '后卫型 · 178–194 cm',
  forward: '锋线型 · 195–205 cm', center: '内线型 · 206–218 cm',
};

export function GymRecruitmentControls({state, onAction, busy = false, emptyCourt = false}: Props) {
  const [preference, setPreference] = useState<HeightPreference>('any');
  const [direction, setDirection] = useState<SelectedRecruitmentDirection>('shooting');
  const [selectedMode, setSelectedMode] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const confirmed = useRef(false);
  const seats = state.gymLevel - activePlayers(state).length;
  const unlocked = state.gymLevel >= selectedRecruitmentUnlockLevel;
  const full = seats <= 0;
  const currentDirection = selectedRecruitmentDirections.find(item => item.id === direction)!;
  const pendingDirection = selectedRecruitmentDirections.find(item => item.id === pending?.direction);
  const stale = !!pending && pending.expectedNextPlayer !== state.nextPlayer;
  const keys = (item: typeof currentDirection) => item.keys.map(key => statLabels[key]).join('、');
  const begin = () => {
    if (busy || full) return;
    if (!selectedMode) onAction({type: 'recruit', preference, expectedNextPlayer: state.nextPlayer});
    else if (unlocked && state.credits >= selectedRecruitmentPrice) {
      confirmed.current = false;
      setPending({preference, direction, expectedNextPlayer: state.nextPlayer});
    }
  };
  const confirm = () => {
    if (!pending || confirmed.current || busy || full || stale || state.credits < selectedRecruitmentPrice) return;
    confirmed.current = true;
    onAction({type: 'recruit', mode: 'selected', ...pending});
    setPending(null);
  };
  return <section className={`gm-recruitment gm-stack${emptyCourt ? '' : ' gm-roster-recruit'}`} aria-label="新人招生">
    <div className="gm-section-heading"><h3>{full ? '训练位已满' : `空余 ${seats} 个训练位`}</h3><span>赞助券 {state.credits}</span></div>
    <div className="gm-recruitment-modes" role="group" aria-label="招生方式">
      <button type="button" className={selectedMode ? 'gm-button' : 'gm-button gm-primary'} aria-pressed={!selectedMode} disabled={busy} onClick={() => setSelectedMode(false)}>免费招生</button>
      <button type="button" className={selectedMode ? 'gm-button gm-primary' : 'gm-button'} aria-pressed={selectedMode} disabled={busy || !unlocked} onClick={() => setSelectedMode(true)}>精选招生 · {selectedRecruitmentPrice}券</button>
    </div>
    {!unlocked && <p className="gm-muted">球馆 Lv.{selectedRecruitmentUnlockLevel} 开放精选招生，可用赞助券改善新人的定向基础属性。</p>}
    {state.gymLevel >= 2 && <label className="gm-recruitment-field">身高偏好<select aria-label={emptyCourt ? '新人身高偏好' : '名册新人身高偏好'} value={preference} disabled={busy || full} onChange={event => setPreference(event.target.value as HeightPreference)}><option value="any">不限身高</option><option value="guard">后卫型 178–194 cm</option><option value="forward">锋线型 195–205 cm</option><option value="center">内线型 206–218 cm</option></select></label>}
    {selectedMode ? <>
      <label className="gm-recruitment-field">精选方向<select aria-label="精选招生方向" value={direction} disabled={busy || full} onChange={event => setDirection(event.target.value as SelectedRecruitmentDirection)}>{selectedRecruitmentDirections.map(item => <option key={item.id} value={item.id}>{item.label} · {keys(item)}</option>)}</select></label>
      <p>{keys(currentDirection)}的出生基础各为46–48，招生项目另各加 {state.projects.recruitment} 点。其余出生属性、成长偏好按普通规则生成。</p>
      <p className="gm-muted">不赠送等级或经验，不保证获得指定球星。每次确认支付 {selectedRecruitmentPrice} 券，仍需实际培养。</p>
      <p className="gm-muted">适合希望减少反复筛选、提前达到专项条件的培养。较高出生属性可能跳过低档模板，不保证增加整体图鉴收集率。</p>
      <p className="gm-muted">若最终推荐本馆已推荐过的模板，总回款仅 {postgameRepeatTemplateCredits} 券；本次精选仍收费 {selectedRecruitmentPrice} 券。</p>
      {state.credits < selectedRecruitmentPrice && <p className="gm-recommend-warning">赞助券还差 {selectedRecruitmentPrice - state.credits} 券，可继续免费培养积累。</p>}
    </> : <p className="gm-muted">新人免费入馆并带满体力，可正常训练、推荐和收集球星。</p>}
    <button type="button" className="primary gm-icon-button" disabled={busy || full || selectedMode && (!unlocked || state.credits < selectedRecruitmentPrice)} onClick={begin}><GameIcon name="people"/><span>{selectedMode ? `精选招募 · ${selectedRecruitmentPrice}券` : emptyCourt ? '免费招募下一位' : '免费招募新人'}</span></button>
    {pending && pendingDirection && <ComicDialog title="确认精选招生" className="gym-management-dialog" onClose={() => setPending(null)}>
      <div className="contract-panel gym-panel gm-stack">
        <h3>{pendingDirection.label} · 一名新人</h3>
        <p>{keys(pendingDirection)}出生基础各46–48，招生项目另各加 {state.projects.recruitment} 点。</p>
        <p>身高分组：{heightPreferenceLabels[pending.preference]}，在该范围内随机生成。</p>
        <p>本次支付 <strong>{selectedRecruitmentPrice} 券</strong>，当前 {state.credits} 券，支付后 {Math.max(0, state.credits - selectedRecruitmentPrice)} 券。</p>
        <p className="gm-muted">确认后才生成新人；取消不扣券。不保证传奇或指定球星，继续培养仍按原规则结算。</p>
        <p className="gm-muted">若最终推荐本馆已推荐过的模板，回款合计 {postgameRepeatTemplateCredits} 券，不再叠加培养或合作券；所有馆级使用同一规则，升级不重置首次资格。</p>
        {stale && <p className="gm-recommend-warning" role="alert">球员名册已变化，请返回重新选择招生。</p>}
        <div className="gm-actions"><button type="button" className="gm-button" onClick={() => setPending(null)}>取消招生</button><button type="button" className="gm-button gm-primary" disabled={busy || stale || full || state.credits < selectedRecruitmentPrice} onClick={confirm}>确认支付 {selectedRecruitmentPrice} 券并招募</button></div>
      </div>
    </ComicDialog>}
  </section>;
}
