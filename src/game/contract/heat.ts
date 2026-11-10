import type {Athlete,Contract} from './engine';
import {effectsFor} from './effects';
import {rules} from './rules';

/** Legacy timers are read once; current careers spend heat only on a shot. */
export function hotCounts(game:Contract,player:Athlete){
 if(player.hotShotsRemaining!==undefined)return {remaining:player.hotShotsRemaining,total:player.hotShotsTotal??0};
 const total=effectsFor(game.equipment,player.level,true).hotShots;
 const duration=player.hotDurationMs||rules.legacyFrenzyMs+(game.equipment.includes('relic_072')?1000:0)+(game.equipment.includes('relic_095')?2000:0);
 const remaining=Math.max(0,Math.min(total,Math.ceil((player.hotUntil-game.clockMs)/duration*total)));
 return {remaining,total:remaining?total:0};
}
export function migrateHeat(game:Contract,player:Athlete){
 const counts=hotCounts(game,player);
 player.hotShotsRemaining=counts.remaining;player.hotShotsTotal=counts.total;
 player.hotUntil=0;player.hotDurationMs=0;
}
