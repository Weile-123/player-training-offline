import type {Athlete,Contract} from '../game/contract/engine';
import {effectsFor} from '../game/contract/effects';
import {hotCounts} from '../game/contract/heat';
import {rules} from '../game/contract/rules';

export function heatMeter(game:Contract,player?:Athlete){
 const counts=player?hotCounts(game,player):{remaining:0,total:0};
 const ready=!!player&&player.heat>=rules.heat&&counts.remaining===0;
 const remaining=ready?effectsFor(game.equipment,player!.level,true).hotShots:counts.remaining;
 const total=ready?remaining:counts.total,hot=remaining>0;
 return {hot,remaining,total,percent:Math.max(0,Math.min(100,hot?remaining/Math.max(1,total)*100:(player?.heat??0)/rules.heat*100))};
}
