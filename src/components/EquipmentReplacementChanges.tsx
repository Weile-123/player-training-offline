import {useMemo} from 'react';
import type {GymState} from '../game/gym/engine';
import {equipmentReplacementChanges} from '../presentation/equipmentReplacementChanges';
import './EquipmentReplacementChanges.css';

export function EquipmentReplacementChanges({state, itemId, replaceId}: {state: GymState; itemId: string; replaceId: string}) {
  const changes = useMemo(() => equipmentReplacementChanges(state, itemId, replaceId), [state, itemId, replaceId]);
  return <section className="gm-replacement-changes" aria-label="替换后数据变化">
    <h4>替换后变化</h4>
    {changes?.length ? <ul>{changes.map(change => <li key={change.id} data-change-id={change.id} className={`is-${change.direction}`}><span>{change.label}</span><b><span>{change.before}</span><i aria-hidden="true">→</i><strong>{change.after}</strong></b></li>)}</ul> : <p className="gm-muted">{changes ? '当前生效数值不变。' : '请重新选择当前馆内的替换器材。'}</p>}
  </section>;
}
