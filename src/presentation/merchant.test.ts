import {it,expect} from 'vitest';
import {newContract} from '../game/contract/engine';
import {canBuyMerchantOffer} from './merchant';

it('球探提醒按当前价格、库存、信用修复条件和开放月份判断',()=>{
 const g=newContract(5);g.month=3;g.cash='299';
 const offer={id:'item_001',basePrice:'100',stock:3,purchased:1,level:0};
 expect(canBuyMerchantOffer(g,offer)).toBe(false);
 g.cash='300';expect(canBuyMerchantOffer(g,offer)).toBe(true);
 expect(canBuyMerchantOffer(g,{...offer,purchased:3})).toBe(false);
 const incense={...offer,id:'item_006',purchased:0};
 g.credit=3;expect(canBuyMerchantOffer(g,incense)).toBe(false);
 g.credit=2;expect(canBuyMerchantOffer(g,incense)).toBe(true);
 g.commerce.incenseUsed=true;expect(canBuyMerchantOffer(g,incense)).toBe(false);
 g.month=4;expect(canBuyMerchantOffer(g,offer)).toBe(false);
 g.month=3;g.status='over';expect(canBuyMerchantOffer(g,offer)).toBe(false);
});
