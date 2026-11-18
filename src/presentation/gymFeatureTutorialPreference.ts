import {useCallback, useSyncExternalStore} from 'react';

export type GymFeatureTutorialKind = 'training' | 'cooperation';
export const gymFirstVisitTutorialKey = 'legend-gym.feature-first-visit.v1';
const kinds: GymFeatureTutorialKind[] = ['training', 'cooperation'];
const listeners = new Set<() => void>();
const fallbackCompleted = new Set<GymFeatureTutorialKind>();

function read(): GymFeatureTutorialKind[] {
 try {
  const value: unknown = JSON.parse(localStorage.getItem(gymFirstVisitTutorialKey) ?? '[]');
  return kinds.filter(kind => fallbackCompleted.has(kind) || Array.isArray(value) && value.includes(kind));
 } catch {return kinds.filter(kind => fallbackCompleted.has(kind));}
}
function notify() {listeners.forEach(listener => listener());}
function subscribe(listener: () => void) {
 listeners.add(listener);
 const storageChanged = (event: StorageEvent) => {if (event.key === gymFirstVisitTutorialKey || event.key === null) listener();};
 if (typeof window !== 'undefined') window.addEventListener('storage', storageChanged);
 return () => {listeners.delete(listener); if (typeof window !== 'undefined') window.removeEventListener('storage', storageChanged);};
}
export function completeGymFirstVisitTutorial(kind: GymFeatureTutorialKind): void {
 const completed = [...new Set([...read(), kind])];
 try {localStorage.setItem(gymFirstVisitTutorialKey, JSON.stringify(completed));}
 catch {fallbackCompleted.add(kind);}
 notify();
}
export function resetGymFirstVisitTutorials(): void {
 fallbackCompleted.clear();
 try {localStorage.removeItem(gymFirstVisitTutorialKey);} catch {/* Preferences remain usable for this session. */}
 notify();
}

/** Shared browser preference across gyms and both the roster and court entry points. */
export function useGymFirstVisitTutorial(kind: GymFeatureTutorialKind, enabled = true) {
 const completed = useSyncExternalStore(subscribe, () => read().includes(kind), () => false);
 const complete = useCallback(() => completeGymFirstVisitTutorial(kind), [kind]);
 return {active: enabled && !completed, complete};
}
