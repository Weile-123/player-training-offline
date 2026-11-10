import type {Athlete} from '../game/contract/engine';
/** 休息室是保留球员的独立视图；待交付仍显示在普通名单，方便撤回。 */
export function rosterPlayers(players:Athlete[],restingIds:readonly string[],lounge=false) {
 const resting=new Set(restingIds);
 return players.filter(p=>lounge?resting.has(p.id)&&!p.queued:!resting.has(p.id));
}
