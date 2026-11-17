import {useSyncExternalStore} from 'react';
type GymDebug = {skipPosting: boolean; skipAds: boolean};
const empty: GymDebug = {skipPosting: false, skipAds: false};
export const gymDebugStorageKey = 'legend-gym.local-debug.v1';
function restoreGymDebug(): GymDebug {
 if (!gymDebugAvailable()) return empty;
 try {
  const saved: unknown = JSON.parse(localStorage.getItem(gymDebugStorageKey) ?? 'null');
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return empty;
  const flags = saved as Record<string, unknown>;
  return {skipPosting: flags.skipPosting === true, skipAds: flags.skipAds === true};
 } catch {return empty;}
}
let current = restoreGymDebug();
const listeners = new Set<() => void>();
export function gymDebugAvailable() {
 return import.meta.env.DEV && typeof location !== 'undefined' && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(location.hostname);
}
export const getGymDebug = () => gymDebugAvailable() ? current : empty;
export function toggleGymDebug(key: keyof GymDebug) {
 if (!gymDebugAvailable()) return;
 current = {...current, [key]: !current[key]};
 try {localStorage.setItem(gymDebugStorageKey, JSON.stringify(current));} catch {/* Storage restrictions must not interrupt local play. */}
 listeners.forEach(listener => listener());
}
export function useGymDebug() {return useSyncExternalStore(listener => {listeners.add(listener); return () => {listeners.delete(listener);};}, getGymDebug, () => empty);}
