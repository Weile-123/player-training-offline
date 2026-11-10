import {expect,it} from 'vitest';
import {dispatch,newContract} from './engine';
import {decodeContract,encodeContract,validContract} from './save';

function game(){const s=newContract(23);s.careerId='career-1';for(const p of s.players){p.templateId='caruso';}return s;}
it('grants a free successful shot once per player and persists the claim in saves',()=>{
 const s=game(),p=s.players[0];const result=dispatch(s,s.revision,{type:'share-reward',playerId:p.id,careerId:s.careerId!});
 expect(result.error).toBeUndefined();const next=result.state,after=next.players[0];
 expect(after.level).toBe(p.level+1);expect(after.history.successes).toBe(1);expect(after.shots).toBe(1);expect(next.totalShots).toBe(1);expect(after.shareRewardClaimed).toBe(true);expect(after.heat).toBe(1);
 expect(after.stats).not.toEqual(p.stats);expect(result.events).toContainEqual({type:'shot',playerId:p.id,outcome:'success',drawn:'success'});expect(s.players[0].shareRewardClaimed).toBeUndefined();
 const reloaded=decodeContract(encodeContract(next))!;expect(reloaded.players[0].shareRewardClaimed).toBe(true);
 const repeat=dispatch(reloaded,reloaded.revision,{type:'share-reward',playerId:p.id,careerId:s.careerId!});expect(repeat.error).toBe('share-already-rewarded');expect(repeat.state).toBe(reloaded);
 expect(dispatch(next,next.revision,{type:'share-reward',playerId:next.players[1].id,careerId:s.careerId!}).error).toBeUndefined();
});
it('does not consume armed items or hot shots, and cannot rewind the share reward',()=>{
 const s=game();s.commerce.inventory.item_002=1;const p=s.players[0];p.armed=['item_001','item_003'];p.hotShotsRemaining=3;p.hotShotsTotal=7;
 const result=dispatch(s,s.revision,{type:'share-reward',playerId:p.id,careerId:s.careerId!});
 expect(result.state.players[0].armed).toEqual(p.armed);expect(result.state.players[0].hotShotsRemaining).toBe(3);expect(result.state.undo).toBeNull();
 expect(dispatch(result.state,result.state.revision,{type:'rewind'}).error).toBe('no-rewind');
 const trained=dispatch(result.state,result.state.revision,{type:'train',playerId:p.id}).state;
 const rewound=dispatch(trained,trained.revision,{type:'rewind'}).state;
 expect(rewound.players[0].shareRewardClaimed).toBe(true);expect(dispatch(rewound,rewound.revision,{type:'share-reward',playerId:p.id,careerId:s.careerId!}).error).toBe('share-already-rewarded');
});
it('rejects stale career callbacks, departed players, queued players and level 99',()=>{
 const s=game();expect(dispatch(s,0,{type:'share-reward',playerId:'p1',careerId:'different'}).error).toBe('share-career-changed');
 expect(dispatch(s,0,{type:'share-reward',playerId:'p999',careerId:s.careerId!}).error).toBe('missing-player');
 s.players[0].queued=true;expect(dispatch(s,0,{type:'share-reward',playerId:'p1',careerId:s.careerId!}).error).toBe('withdraw-first');
 s.players[0].queued=false;s.players[0].level=99;s.players[0].peakLevel=99;
 expect(dispatch(s,0,{type:'share-reward',playerId:'p1',careerId:s.careerId!}).error).toBe('level-cap');
 s.players[0].level=98;const result=dispatch(s,0,{type:'share-reward',playerId:'p1',careerId:s.careerId!});expect(result.state.players[0].level).toBe(99);
});
it('accepts old saves with no reward flag and rejects malformed flags',()=>{
 const s=game();expect(validContract(s)).toBe(true);expect(validContract({...s,players:s.players.map(p=>({...p,shareRewardClaimed:'yes'}))})).toBe(false);
});
