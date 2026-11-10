import { players, selectedPlayer } from '../game/engine';
import { tierConfig } from '../game/matching';
import { templateById } from '../game/templates';
import { statKeys, type Game, type Outcome, type Player } from '../game/types';
import { shotPlayback } from './shotAnimation';
export const presentationConfig = { shotDuration:shotPlayback.duration, preferenceKey:'player-training.preferences.v1', volume:.055 } as const;
export const outcomeLabels:Record<Outcome,string> = { severe:'重伤 · 强制离营', minor:'轻伤 · 属性下降', hold:'维持 · 稳住节奏', success:'成功 · 实力提升', great:'大成功 · 潜力爆发' };
export type ShotFeedback = {
 id:number; player:Player; outcome:Outcome; changes:Partial<Record<typeof statKeys[number],number>>;
 levelGain:number; heatGain:number; saleIncome:number; message:string;
 evolution:null|{from:string;to:string;kind:'首次匹配'|'实力升档'|'风格转型'|'实力降档'|'模板失去'};
};
export function shotFeedback(before:Game,after:Game):ShotFeedback|null {
 const player=selectedPlayer(before);
 if(!player||after.totalShots!==before.totalShots+1||!after.lastOutcome) return null;
 const next=players(after).find(p=>p.id===player.id);
 const oldTemplate=templateById(player.templateId),newTemplate=templateById(next?.templateId);
 const evolution=next&&player.templateId!==next.templateId ? {
  from:oldTemplate?.name??'待发掘',to:newTemplate?.name??'待发掘',
  kind:!newTemplate?'模板失去' as const:!oldTemplate?'首次匹配' as const:
   tierConfig(newTemplate.tier).minimumRating>tierConfig(oldTemplate.tier).minimumRating?'实力升档' as const:
   tierConfig(newTemplate.tier).minimumRating<tierConfig(oldTemplate.tier).minimumRating?'实力降档' as const:'风格转型' as const,
 } : null;
 return {id:after.totalShots,player:next??player,outcome:after.lastOutcome,
  changes:next?Object.fromEntries(statKeys.map(k=>[k,next.stats[k]-player.stats[k]]).filter(([,delta])=>delta!==0)):{},
  levelGain:next?next.level-player.level:0,heatGain:next?next.heat-player.heat:0,
  saleIncome:after.lastOutcome==='severe'?after.cash-before.cash:0,message:after.logs[0],evolution};
}
export type Preferences={sound:boolean;reducedMotion:boolean};
export const defaultPreferences:Preferences={sound:true,reducedMotion:false};
export function decodePreferences(raw:string|null):Preferences {
 try {const p=JSON.parse(raw??'null');return p?.version===1&&typeof p.sound==='boolean'&&typeof p.reducedMotion==='boolean'?{sound:p.sound,reducedMotion:p.reducedMotion}:{...defaultPreferences};}catch{return {...defaultPreferences};}
}
export function effectiveReducedMotion(preferences:Preferences,system:boolean) {return preferences.reducedMotion||system;}
export class TrainingGate {
 private locked=false;
 run(before:Game,commit:()=>Game):ShotFeedback|null {
  if(this.locked)return null;this.locked=true;
  // Protect only a synchronous commit against re-entry. Animation is never a CD.
  try{return shotFeedback(before,commit());}finally{this.finish();}
 }
 finish(){this.locked=false;}
}
