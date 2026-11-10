import type {Athlete} from './engine';
import {rules} from './rules';

/** Origin is explicit for new recruits. Only untouched legacy recruits have an
 * unambiguous base price; training/equipment can raise an ordinary player's base. */
export function isHighPotential(player:Athlete|null|undefined):boolean{
 if(!player)return false;
 if(player.highPotential!==undefined)return player.highPotential;
 return player.shots===0&&BigInt(player.book.base.n)===BigInt(rules.reference.sword_value.merchant_base)*BigInt(player.book.base.d);
}
