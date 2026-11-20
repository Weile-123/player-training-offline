import {useEffect, useMemo, useState} from 'react';
import {equipmentCatalog} from '../game/gym/catalog';
import {equipmentOffer, type GymState} from '../game/gym/engine';

export const shopNoticeStorageKey = (state: GymState) => `gym-shop-seen-v1:${state.createdAt}:${state.seed}`;

/** Unlock eligibility is independent of coupon balance; existing ownership is not a new offer. */
export function availableEquipmentForNotice(state: GymState): string[] {
  return equipmentCatalog.filter(item => equipmentOffer(state, item.id).price !== null).map(item => item.id);
}

function readSeen(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && equipmentCatalog.some(item => item.id === id)) : [];
  } catch { return []; }
}

export function useGymShopNotice(state: GymState, shopOpen: boolean, enabled=true): boolean {
  const key = shopNoticeStorageKey(state);
  const saved = useMemo(() => enabled?readSeen(key):[], [key,enabled]);
  const [record, setRecord] = useState({key, ids: saved});
  const seen = record.key === key ? record.ids : saved;
  // Storage returns fresh snapshots as training advances. Only changes to shop eligibility need a catalogue pass.
  const templateCount = Object.keys(state.collection).length;
  const ownership = state.ownedEquipment.join(',');
  const available = useMemo(() => enabled?availableEquipmentForNotice(state):[], [enabled,state.gymLevel,templateCount,ownership]);
  const signature = useMemo(() => available.join(','), [available]);
  useEffect(() => {
    if(!enabled)return;
    const ids = shopOpen ? [...new Set([...seen, ...available])] : seen;
    if (record.key !== key || shopOpen) setRecord({key, ids});
    if (shopOpen) {
      try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* Acknowledged in this session even if storage is unavailable. */ }
    }
  }, [key, shopOpen, signature,enabled]);
  return useMemo(() => enabled&&available.some(id => !seen.includes(id)), [enabled,available,seen]);
}
