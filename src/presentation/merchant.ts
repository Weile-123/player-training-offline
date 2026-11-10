import type {Contract} from '../game/contract/engine';
import {purchasePrice} from '../game/contract/commerce';

/** The entry reminder and buy buttons share exactly the same availability rule. */
export function canBuyMerchantOffer(g:Contract,o:Contract['commerce']['merchant']['offers'][number]){
 return g.status==='playing'&&g.month>=3&&g.month%3===0&&
  o.purchased<o.stock&&BigInt(g.cash)>=BigInt(purchasePrice(o))&&
  !(o.id==='item_006'&&(g.credit>=3||g.commerce.incenseUsed));
}
