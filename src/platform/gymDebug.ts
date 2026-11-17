import {useSyncExternalStore} from 'react';
type GymDebug = {skipPosting: boolean; skipAds: boolean};
const empty: GymDebug = {skipPosting: false, skipAds: false};
let current = empty;
const listeners = new Set<() => void>();
export function gymDebugAvailable() {
 return import.meta.env.DEV && typeof location !== 'undefined' && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(location.hostname);
}
export const getGymDebug = () => gymDebugAvailable() ? current : empty;
export function toggleGymDebug(key: keyof GymDebug) {
 if (!gymDebugAvailable()) return;
 current = {...current, [key]: !current[key]}; listeners.forEach(listener => listener());
}
export function useGymDebug() {return useSyncExternalStore(listener => {listeners.add(listener); return () => {listeners.delete(listener);};}, getGymDebug, () => empty);}
