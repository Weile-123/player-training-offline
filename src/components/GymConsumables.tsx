import {gymConsumables, retiredGymConsumables, teamSupplyRecovery, type GymConsumable} from '../game/gym/consumables';
import {consumableCount, consumableUseReason, guaranteedGreatShots, playerLevelCap, staminaMax, type GymAction, type GymState} from '../game/gym/engine';
import {ProductImage} from './ProductImage';
import './GymConsumables.css';

type Props = {state: GymState; onAction: (action: GymAction) => void; purchasing?: boolean; busy?: boolean};

export function GymConsumables({state, onAction, purchasing = false, busy = false}: Props) {
  const remaining = guaranteedGreatShots(state.player);
  const retired = retiredGymConsumables.filter(item => consumableCount(state, item.id) > 0);
  const trainees = state.player ? [state.player, ...state.bench] : state.bench;
  const team = trainees.filter(player => player.level < playerLevelCap && player.stamina < staminaMax(state));
  const teamRestored = team.reduce((sum, player) => sum + Math.min(teamSupplyRecovery, staminaMax(state) - player.stamina), 0);
  const renderItem = (item: GymConsumable) => {
      const quantity = consumableCount(state, item.id);
      const reason = consumableUseReason(state, item.id);
      const locked = state.gymLevel < item.unlockLevel;
      return <article key={item.id} className="gm-consumable-card" aria-label={item.name}>
        <div className="gm-consumable-image"><ProductImage id={item.artId} name={item.name}/></div>
        <div className="gm-consumable-copy"><div className="gm-consumable-heading"><h4>{item.name}</h4><span>持有 {quantity}</span></div><p>{item.description}</p>
          {locked && purchasing && !item.retired && <small>球馆 Lv.{item.unlockLevel} 上架</small>}
          {item.id === 'supplement' && team.length > 0 && <small>当前可恢复 {team.length} 人，共 {teamRestored} 体力</small>}
          <div className="gm-consumable-actions">
            <button type="button" className="gm-button" aria-label={item.id === 'drink' ? undefined : `使用${item.name}`} title={reason || (item.id === 'supplement' ? '为全体可训练球员恢复体力' : `对当前球员使用${item.name}`)} disabled={busy || !!reason} onClick={() => {
              if (busy || reason || !state.player) return;
              onAction(item.id === 'drink' ? {type: 'use-drink', id: state.player.id} : {type: 'use-consumable', id: item.id, playerId: state.player.id});
            }}>{item.id === 'drink' ? '使用饮料' : item.action}</button>
            {purchasing && !item.retired && <button type="button" className="gm-button gm-primary" aria-label={`购买${item.name}`} disabled={busy || locked || state.credits < item.price} onClick={() => {
              if (busy || locked || state.credits < item.price) return;
              onAction(item.id === 'drink' ? {type: 'buy-drink'} : {type: 'buy-consumable', id: item.id});
            }}>购买 · {item.price} 券</button>}
          </div>
          {reason && quantity > 0 && <small className="gm-consumable-use-reason">{reason}</small>}
        </div>
      </article>;
  };
  return <div className="gm-consumables" aria-label={purchasing ? '消耗品商店' : '消耗品背包'}>
    {remaining > 0 && <p className="gm-consumable-ready" role="status">镁粉生效中 · 剩余 {remaining} 球</p>}
    {gymConsumables.map(renderItem)}
    {retired.length > 0 && <details className="gm-retired-consumables"><summary>旧版库存 · 仅可使用</summary><div>{retired.map(renderItem)}</div></details>}
    <p className="gm-consumable-note">饮料和镁粉用于当前球员；团队补给恢复全体可训练球员。购买只增加库存，使用才生效。</p>
  </div>;
}
