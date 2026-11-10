import {expect,it} from 'vitest';
import {newContract,dispatch} from './engine';
import {isHighPotential} from './recruits';
import {fraction,ledger} from './money';
import {decodeContract,encodeContract} from './save';
import {newCommerce} from './commerce';

it('普通新人不会因为器械抬高底价而变成高潜力头像',()=>{
 const p=newContract(1).players[0];p.book.base=fraction(640);
 expect(isHighPotential(p)).toBe(false);
});
it('未训练的旧高潜力新人迁移来源并在训练后保留',()=>{
 const g=newContract(1),p=g.players[0];delete p.highPotential;p.book=ledger(true);
 const restored=decodeContract(encodeContract(g))!;
 expect(restored.players[0].highPotential).toBe(true);
 restored.players[0].shots=10;restored.players[0].book.base=fraction(1200);
 expect(isHighPotential(decodeContract(encodeContract(restored))!.players[0])).toBe(true);
});
it('购买高潜力新人记录明确来源，普通新人仍是普通',()=>{
 const g=newContract(1);g.month=3;g.cash='999999';
 g.commerce=newCommerce(3,[],3,g.rng.market);
 const offer=g.commerce.merchant?.offers.find(o=>o.id==='special');
 expect(offer).toBeDefined();
 const result=dispatch(g,g.revision,{type:'buy-merchant',id:'special'});
 expect(result.error).toBeUndefined();
 expect(result.state.players[result.state.players.length-1].highPotential).toBe(true);
 expect(result.state.players[0].highPotential).toBe(false);
});
