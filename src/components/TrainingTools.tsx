import { config } from '../game/config';
import type { Player } from '../game/types';
import { useGame } from '../store';

export function TrainingTools({ player }: { player: Player }) {
  const store = useGame(), closed = store.game.status === 'over';
  return <section className={`feel-panel ${player.hotShots > 0 ? 'hot' : ''}`} aria-label="训练手感与消耗品">
    <div className="flex items-center justify-between"><h3>训练手感 <strong>{player.hotShots>0?`${player.hotShots} 次保护`:`${player.heat}/${config.feel.maximum}`}</strong></h3><span>{player.hotShots > 0 ? '免疫重伤' : '满格自动进入火热'}</span></div>
    <div className="heat-dots" aria-label={player.hotShots>0?`火热保护 ${player.hotShots} 次`:`手感 ${player.heat} 点`}>{Array.from({ length: player.hotShots>0?config.feel.hotShots:config.feel.maximum }, (_, index) => <i key={index} className={index < (player.hotShots>0?player.hotShots:player.heat) ? 'filled' : ''}/>)}</div>
    <p>成功 +1，大成功 +2，轻伤 -1。满 6 点自动进入火热，接下来 2 次训练免疫重伤。</p>
    <div className="grid grid-cols-2 gap-2 mt-3"><button className="secondary" disabled={closed || store.game.consumables.drink <= 0 || player.heat >= config.feel.maximum||player.hotShots>0} onClick={() => store.useConsumable('drink')}>饮料 +2 手感 · {store.game.consumables.drink}</button><button className="secondary" disabled={closed || store.game.consumables.ice <= 0 || player.iceShots > 0} onClick={() => store.useConsumable('ice')}>{player.iceShots > 0 ? '冰敷保护 · 剩余 1 次' : `冰敷免轻伤 · ${store.game.consumables.ice}`}</button></div>
    <p>消耗品作用于当前球员，保护次数仅在投篮时消耗。</p>
  </section>;
}
