import {expect,it} from 'vitest';
import {dispatch,newContract,type Contract,type Action} from './engine';
import {effectsFor} from './effects';
import {decodeContract,encodeContract} from './save';

const act=(g:Contract,a:Action)=>{const r=dispatch(g,g.revision,a,{noSevere:true});expect(r.error).toBeUndefined();return r.state;};
it('七次火热可在同一逻辑时刻连投，其他球员的次数独立',()=>{
 let g=newContract(10);g.players[0].heat=10;g.players[1].heat=10;
 g=act(g,{type:'train',playerId:'p1'});g=act(g,{type:'train',playerId:'p2'});
 for(let i=0;i<6;i++)g=act(g,{type:'train',playerId:'p1'});
 expect(g.totalShots).toBe(8);expect(g.clockMs).toBe(0);expect(g.nextShotAt).toBe(0);
 expect(g.players[0].hotShotsRemaining).toBe(0);expect(g.players[1].hotShotsRemaining).toBe(6);
 g=act(g,{type:'queue',playerId:'p2',queued:true});g=act(g,{type:'advance',milliseconds:86400000});
 expect(g.players[1].hotShotsRemaining).toBe(6);
 g=decodeContract(encodeContract(g))!;expect(g.players[1].hotShotsRemaining).toBe(6);
});
it('原秒数和速度加成全部按固定次数相加',()=>{
 expect(effectsFor(['relic_072'],0,true).hotShots).toBe(9);
 expect(effectsFor(['relic_095'],0,true).hotShots).toBe(11);
 let g=newContract(10,['relic_072','relic_095','relic_057','relic_088']);g.players[0].heat=10;
 g=act(g,{type:'train',playerId:'p1'});expect(g.players[0].hotShotsTotal).toBe(16);expect(g.players[0].hotShotsRemaining).toBe(15);
 g=act(g,{type:'discard-equipment',id:'relic_095'});expect(g.players[0].hotShotsRemaining).toBe(15);
});
it('原普通加速每五次未重伤普通投篮额外给手感，火热投篮不计入',()=>{
 let g=newContract(10,['relic_011']);g.players[0].heat=10;
 for(let i=0;i<7;i++)g=act(g,{type:'train',playerId:'p1'});
 expect(g.players[0].normalShots).toBe(0);
 for(let i=0;i<5;i++)g=act(g,{type:'train',playerId:'p1'});
 expect(g.players[0].normalShots).toBe(5);expect(g.players[0].heat).toBe(6);
});
it('回溯不退还已用火热次数，包括开启与最后一投',()=>{
 let g=newContract(10);g.players[0].heat=10;g.commerce.inventory.item_002=4;
 g=act(g,{type:'train',playerId:'p1'});g=act(g,{type:'rewind'});
 expect(g.players[0].hotShotsRemaining).toBe(6);expect(g.players[0].heat).toBe(0);
 for(let i=0;i<6;i++)g=act(g,{type:'train',playerId:'p1'});
 g=act(g,{type:'rewind'});expect(g.players[0].hotShotsRemaining).toBe(0);expect(g.players[0].heat).toBe(0);
});
it('非法或过期训练不会消耗火热次数',()=>{
 let g=newContract(10);g.players[0].heat=10;g=act(g,{type:'train',playerId:'p1'});
 const stale=dispatch(g,g.revision-1,{type:'train',playerId:'p1'});expect(stale.state).toBe(g);
 g=act(g,{type:'queue',playerId:'p1',queued:true});
 expect(dispatch(g,g.revision,{type:'train',playerId:'p1'}).state).toBe(g);expect(g.players[0].hotShotsRemaining).toBe(6);
});
