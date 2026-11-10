import {expect,it} from 'vitest';
import {dispatch,newContract,type Contract} from './engine';
import {decodeContract,encodeContract,validContract} from './save';
const claim=(s:Contract)=>dispatch(s,s.revision,{type:'sponsor-share-reward',careerId:s.careerId!,month:s.month});
it('persists one coupon and its three-month cooldown, retaining compatibility with old saves',()=>{
 const initial={...newContract(4),careerId:'sponsor-test'};
 expect(validContract(initial)).toBe(true);
 const first=claim(initial);expect(first.error).toBeUndefined();expect(first.state.credits).toBe(1);
 const reload=decodeContract(encodeContract(first.state))!;expect(reload.sponsorShareMonth).toBe(1);
 expect(claim(reload).error).toBe('share-cooldown');
 expect(claim({...reload,month:3}).error).toBe('share-cooldown');
 const next=claim({...reload,month:4});expect(next.error).toBeUndefined();expect(next.state.credits).toBe(2);expect(next.state.sponsorShareMonth).toBe(4);
 expect(validContract({...reload,sponsorShareMonth:2})).toBe(false);
});
it('rejects results from another career or month and a finished game',()=>{
 const s={...newContract(2),careerId:'current'};
 expect(dispatch(s,s.revision,{type:'sponsor-share-reward',careerId:'old',month:1}).error).toBe('share-context-changed');
 expect(dispatch(s,s.revision,{type:'sponsor-share-reward',careerId:'current',month:2}).error).toBe('share-context-changed');
 expect(claim({...s,status:'over',credit:0}).error).toBe('game-over');
});
it('keeps undo available without undoing the coupon or cooldown',()=>{
 const before={...newContract(4),careerId:'rewind'};before.commerce.inventory.item_002=1;
 const s={...before,revision:1,undo:{playerId:'p1',before}};
 const rewarded=claim(s).state;expect(rewarded.undo).not.toBeNull();
 const rewound=dispatch(rewarded,rewarded.revision,{type:'rewind'});
 expect(rewound.error).toBeUndefined();expect(rewound.state.credits).toBe(1);expect(rewound.state.sponsorShareMonth).toBe(1);
 expect(claim(rewound.state).error).toBe('share-cooldown');expect(validContract(rewound.state)).toBe(true);
});
