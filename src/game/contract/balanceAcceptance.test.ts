import {describe,expect,it} from 'vitest';
import {dispatch,newContract,previewSettlement} from './engine';
import {newCommerce} from './commerce';
import {decodeContract,encodeContract} from './save';

// Controlled E03/S01 fixtures. These are not natural-career samples.
describe('经济验收：月目标最小单位边界与重复结算',()=>{
 for(const month of [1,21,60])for(const equipment of [[],['relic_066'],['relic_066','relic_089']]){
  it.each([-1,0,1])(`第 ${month} 月，器材 ${equipment.join(',')||'无'}，目标差额 %s`,delta=>{
   const before=newContract(20261022,equipment);
   before.month=month;before.cash='1007';
   before.commerce=newCommerce(month,equipment,before.credit,before.rng.market);
   if(equipment.includes('relic_089'))before.commerce.carry='999999999';
   const required=BigInt(previewSettlement(before).required);
   before.scrap=String(required+BigInt(delta));
   const snapshot=encodeContract(before),result=dispatch(before,before.revision,{type:'settle'});
   expect(result.error).toBeUndefined();
   expect(encodeContract(before)).toBe(snapshot);
   expect(result.events.find(e=>e.type==='settlement')).toMatchObject({met:delta>=0,value:before.scrap});
   expect(result.state.cash).toBe(String(1007n+BigInt(before.scrap)));
   expect(result.state.credit).toBe(delta<0?2:3);
   expect(result.state.month).toBe(month+1);
   expect(result.state.scrap).toBe('0');
   expect(result.state.delivered).toBe(before.scrap);
   const restored=decodeContract(encodeContract(result.state));
   expect(restored).toEqual(result.state);
   const duplicate=dispatch(restored!,before.revision,{type:'settle'});
   expect(duplicate.error).toBeTruthy();
   expect(duplicate.state).toBe(restored);
   expect(duplicate.events).toEqual([]);
  });
 }
});
