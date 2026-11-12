import {useGym} from '../gymStore';
import {getHupuUser} from './hupuAccount';
import {ensureColorboxSdk, sdkDeadline} from './hupuSdk';
import {createTemplateUnlockReporter} from './templateUnlocks';

const queueKey = 'gym-management-v1.template-statistics';
const apiBase = import.meta.env.VITE_GYM_API_BASE ?? '';
const envId = import.meta.env.VITE_GYM_ENV_ID ?? '';

export function installGymTemplateUnlocks() {
 if (typeof window === 'undefined') return () => {};
 let storage: Pick<Storage, 'getItem' | 'setItem'>;
 try { storage = window.localStorage; }
 catch { return () => {}; }

 const configured = !import.meta.env.DEV && /^https:\/\//.test(apiBase) && !!envId
  && !['localhost', '127.0.0.1', '::1', '[::1]'].includes(location.hostname);
 const reporter = createTemplateUnlockReporter({
  storage: {getItem: () => storage.getItem(queueKey), setItem: (_key, value) => storage.setItem(queueKey, value)},
  enabled: () => configured,
  user: getHupuUser,
  send: async entries => {
   await ensureColorboxSdk();
   const cloud = window.ColorboxAI?.cloud;
   if (!cloud) throw new Error('球馆模板上报暂不可用');
   const response = await sdkDeadline(cloud.request({url: apiBase.replace(/\/$/, '') + '/statistics/template-unlocks', method: 'POST', data: {entries}, envId, auth: true}), '模板上报超时');
   if (response.statusCode < 200 || response.statusCode >= 300 || ![0, 200].includes(response.code)) throw new Error('模板上报未确认');
   return response.data;
  },
 });
 // New-mode collections contain only actual unlocks. Rebuilding from the durable
 // collection also recovers discoveries made before the reporting account resolved.
 reporter.observe(Object.keys(useGym.getState().state.collection), 'unlock');
 const unsubscribe = useGym.subscribe((next, previous) => {
  const added = Object.keys(next.state.collection).filter(id => !previous.state.collection[id]);
  if (added.length) {reporter.observe(added, 'unlock'); void reporter.flush();}
 });
 const retry = () => {if (document.visibilityState === 'visible') void reporter.flush();};
 const timer = setInterval(retry, 30000);
 window.addEventListener('online', retry);
 document.addEventListener('visibilitychange', retry);
 void reporter.flush();
 return () => {
  unsubscribe();
  clearInterval(timer);
  window.removeEventListener('online', retry);
  document.removeEventListener('visibilitychange', retry);
 };
}
