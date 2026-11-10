import {ensureColorboxSdk} from './hupuSdk';
import identities from '../data/hupu-player-ids.json';
import {posterPortrait} from '../presentation/posterPortrait';
import { templateById } from '../game/templates';

export type PlayerProfile = { name: string; englishName: string; avatar: string; source: 'hupu' | 'remote'; message: string };

const entries: Record<string,{hupuPlayerId?:string}> = identities;
const requests = new Map<string,Promise<PlayerProfile>>();
let blockedMessage = '';

export function safeAvatarUrl(value: unknown): string {
 if (typeof value !== 'string' || !value.trim()) return '';
 try {
  const url = new URL(value.startsWith('//') ? 'https:' + value : value);
  if (!['http:','https:'].includes(url.protocol)) return '';
  if(!['hupu.com','hoopchina.com.cn','static.cloudbase.net'].some(d=>url.hostname===d||url.hostname.endsWith('.'+d)))return '';
  url.protocol = 'https:';
  return url.href;
 } catch { return ''; }
}
export function fallbackProfile(id: string | null | undefined): PlayerProfile | null {
 const template = templateById(id), entry = id ? entries[id] : null;
 if (!template || !entry) return null;
 return {name:template.name,englishName:template.englishName,avatar:posterPortrait(id).src,source:'remote',message:''};
}
export async function ensureHupuSdk(): Promise<void> {
 if(typeof document==='undefined'&&!(typeof window!=='undefined'&&window.ColorboxAI?.request?.basketball?.playerInfo))throw Error('球员资料服务暂不可用');
 await ensureColorboxSdk();
 if(!window.ColorboxAI?.request?.basketball?.playerInfo)throw Error('球员资料服务初始化失败');
}

/** Known player only, cached per template. Never request the full league in H5. */
export function loadPlayerProfile(id: string): Promise<PlayerProfile | null> {
 const fallback = fallbackProfile(id), entry = entries[id];
 if (!fallback || !entry) return Promise.resolve(null);
 if (!entry.hupuPlayerId) return Promise.resolve(fallback);
 const existing = requests.get(id); if (existing) return existing;
 const promise = (async()=>{
  try {
   if (blockedMessage) throw Error(blockedMessage);
   await ensureHupuSdk();
   if (blockedMessage) throw Error(blockedMessage);
   const response = await window.ColorboxAI!.request!.basketball!.playerInfo({playerId:entry.hupuPlayerId!,leagueType:'NBA'});
   if (response.code !== 200) {
    const message = response.message || '球员资料请求失败';
    if ([408,429,503].includes(response.code)) blockedMessage = message;
    throw Error(message);
   }
   const player = response.data?.player;
   if (!player || (player.playerId && String(player.playerId)!==entry.hupuPlayerId)) throw Error('球员资料不匹配');
   const avatar = safeAvatarUrl(player.big_photo) || safeAvatarUrl(player.photo);
   if (!avatar) throw Error('该球员暂无可用头像');
   return {name:player.name?.trim() || fallback.name,englishName:player.eng_name?.trim() || fallback.englishName,avatar,source:'hupu' as const,message:''};
  } catch (error) {
   return {...fallback,message:error instanceof Error?error.message:'球员资料暂不可用'};
  }
 })();
 requests.set(id,promise);
 return promise;
}
