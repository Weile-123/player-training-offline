import {expect,it} from 'vitest';
import {newContract,dispatch} from '../game/contract/engine';
import {monthChange,monthDigits} from './monthTransition';

it('rolls only changed places, including carries and new leading digits',()=>{
 expect(monthDigits(23,24)).toEqual([{from:'2',to:'2',changed:false},{from:'3',to:'4',changed:true}]);
 expect(monthDigits(9,10)).toEqual([{from:' ',to:'1',changed:true},{from:'9',to:'0',changed:true}]);
 expect(monthDigits(99,100).map(d=>d.to).join('')).toBe('100');
 expect(monthDigits(99,100).every(d=>d.changed)).toBe(true);
});
it('advances after settlement even if credit is lost, but never advances an ended career',()=>{
 const game=newContract(7);game.commerce.shop.giftAvailable=false;
 const next=dispatch(game,game.revision,{type:'settle'});
 expect(next.error).toBeUndefined();expect(monthChange(game.month,next.state.month,next.state.status)).toEqual({from:1,to:2});
 game.credit=1;const end=dispatch(game,game.revision,{type:'settle'});
 expect(end.state.status).toBe('over');expect(monthChange(game.month,end.state.month,end.state.status)).toBeNull();
 expect(monthChange(4,4,'playing')).toBeNull();expect(monthChange(4,1,'playing')).toBeNull();
});
it('retains the final contract month for the transition after accepting endless mode',()=>{
 const game=newContract(7);game.month=21;game.commerce.shop.giftAvailable=false;
 const settled=dispatch(game,game.revision,{type:'settle'}).state;
 expect(settled.completion?.acknowledged).toBe(false);
 const endless=dispatch(settled,settled.revision,{type:'continue-endless'}).state;
 expect(endless.completion?.acknowledged).toBe(true);
 expect(monthChange(endless.completion!.month,endless.month,endless.status)).toEqual({from:21,to:22});
});
