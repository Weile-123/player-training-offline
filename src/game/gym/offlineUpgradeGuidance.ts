import {activePlayers, equipmentEffects, playerLevelCap, projectOffer, type GymState} from './engine';
import {forecastTraining} from './forecast';
import {offlineLimitMs} from './offline';

export type OfflineUpgradeGuidance = {
  price: number;
  currentLimitMs: number;
  nextLimitMs: number;
  automaticPlayers: number;
  predictedFinishedWithinCurrent: number;
  predictedFinishedWithinNext: number;
  hasExtensionEquipment: boolean;
};

/** A forecast for the current automatic roster, never an offline settlement.
 * Each athlete has independent stamina and cooldown; extending only the window
 * does not change their XP/supply settings. The result is advisory, not a
 * guarantee that random XP outcomes will finish every athlete at this time. */
export function offlineUpgradeGuidance(state: GymState): OfflineUpgradeGuidance | null {
  const offer = projectOffer(state, 'offline');
  if (offer.price === null) return null;
  const currentLimitMs = offlineLimitMs(state);
  const nextLimitMs = offlineLimitMs({...state, projects: {...state.projects, offline: offer.level + 1}});
  const players = activePlayers(state).filter(player => player.autoEnabled);
  const forecasts = players.map(player => forecastTraining(state, player, playerLevelCap)!);
  return {
    price: offer.price,
    currentLimitMs,
    nextLimitMs,
    automaticPlayers: players.length,
    predictedFinishedWithinCurrent: forecasts.filter(forecast => forecast.estimatedMs <= currentLimitMs).length,
    predictedFinishedWithinNext: forecasts.filter(forecast => forecast.estimatedMs <= nextLimitMs).length,
    hasExtensionEquipment: equipmentEffects(state).offlineMinutes > 0,
  };
}
