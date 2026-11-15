import {equipmentCatalog, type ProjectId} from './catalog';
import {equipmentCapacity, equippedFamilyEquipment, playerLevelCap, projectOffer, recoverySeconds, staminaMax, type GymPlayer, type GymState} from './engine';
import {forecastTraining} from './forecast';

/** Read-only equipment change, including the same stamina reconciliation as dispatch. */
export function previewEquipmentState(state: GymState, itemId: string, replaceId?: string): GymState | null {
  if (!equipmentCatalog.some(item => item.id === itemId)) return null;
  const removing = state.equippedEquipment.includes(itemId);
  const sameFamily = equippedFamilyEquipment(state, itemId);
  const targetId = replaceId ?? sameFamily?.id;
  if (!removing && (targetId !== undefined && !state.equippedEquipment.includes(targetId)
    || sameFamily && targetId !== sameFamily.id
    || targetId === undefined && state.equippedEquipment.length >= equipmentCapacity(state))) return null;
  const next = {...state,
    ownedEquipment: removing || state.ownedEquipment.includes(itemId) ? state.ownedEquipment : [...state.ownedEquipment, itemId],
    equippedEquipment: removing ? state.equippedEquipment.filter(id => id !== itemId)
      : [...state.equippedEquipment.filter(id => id !== targetId), itemId],
  };
  return reconcileTrainingState(state, next);
}

function reconcileTrainingState(state: GymState, next: GymState): GymState {
  const capacity = staminaMax(next), beforeRecovery = recoverySeconds(state), afterRecovery = recoverySeconds(next);
  const reconcile = (player: GymPlayer): GymPlayer => ({...player, stamina: Math.min(player.stamina, capacity),
    recoveryMs: player.stamina >= capacity ? 0 : Math.floor(player.recoveryMs * afterRecovery / beforeRecovery)});
  return {...next, player: state.player ? reconcile(state.player) : null, bench: state.bench.map(reconcile)};
}

export type EquipmentTrainingComparison = {
  status: 'ready' | 'choose-replacement' | 'no-player' | 'ended';
  rows: {level: number; beforeMs: number; afterMs: number}[];
};

/** Only call when a detail or confirmation is open, not for every shop card. */
export function equipmentTrainingComparison(state: GymState, itemId: string, replaceId?: string): EquipmentTrainingComparison {
  return compareTraining(state, () => previewEquipmentState(state, itemId, replaceId));
}

function compareTraining(state: GymState, preview: () => GymState | null): EquipmentTrainingComparison {
  if (!state.player) return {status: 'no-player', rows: []};
  if (state.player.level >= playerLevelCap) return {status: 'ended', rows: []};
  const next = preview();
  if (!next) return {status: 'choose-replacement', rows: []};
  const rows = [25, playerLevelCap].filter(level => level > state.player!.level).map(level => ({level,
    beforeMs: forecastTraining(state, state.player, level)!.estimatedMs,
    afterMs: forecastTraining(next, next.player, level)!.estimatedMs,
  }));
  return {status: 'ready', rows};
}

/** Other projects affect recruitment, equipment slots or the offline window, not level speed directly. */
export function previewProjectState(state: GymState, id: ProjectId): GymState | null {
  if (!['endurance', 'recovery', 'automation'].includes(id) || projectOffer(state, id).price === null) return null;
  return reconcileTrainingState(state, {...state, projects: {...state.projects, [id]: state.projects[id] + 1}});
}

export function projectTrainingComparison(state: GymState, id: ProjectId): EquipmentTrainingComparison | null {
  if (!['endurance', 'recovery', 'automation'].includes(id) || projectOffer(state, id).price === null) return null;
  return compareTraining(state, () => previewProjectState(state, id));
}
