import {describe,it,expect} from 'vitest';
import {dispatch,newContract,previewShot,playerValue,type Contract} from './engine';
import {outcomeAt} from './probability';
import {random} from './random';
import {decodeContract,encodeContract} from './save';
import {bankGreat,ledger,quote} from './money';
function force(g:Contract,outcome:string){
 const tickets=previewShot(g,g.players[0]).tickets;
 for(let i=0;i<100000;i++){if(outcomeAt(tickets,Math.floor(random({state:i})*1000))===outcome){g.rng.economy.state=i;return;}}
 throw Error('unavailable outcome');
}
const train=(g:Contract)=>dispatch(g,g.revision,{type:'train',playerId:g.players[0].id});
describe('99级训练封顶',()=>{
 it('满级训练及物品操作不消费任何状态',()=>{
  const g=newContract(1);g.players[0].level=g.players[0].peakLevel=99;g.commerce.inventory.item_003=2;
  for(const action of [{type:'train' as const,playerId:'p1'},{type:'use-item' as const,id:'item_003' as const,playerId:'p1'}]){
   const result=dispatch(g,g.revision,action);expect(result.error).toBe('level-cap');expect(result.state).toBe(g);expect(result.events).toEqual([]);
  }
 });
 it('98级大成功叠加积蓄和火热结束奖励不越界，只按实际1级成长',()=>{
  const g=newContract(2,['relic_041','relic_047','relic_070']);const p=g.players[0];
  p.level=p.peakLevel=98;p.traits.greatLevels=4;p.history.damageBank=20;p.hotShotsTotal=7;p.hotShotsRemaining=1;
  force(g,'great');const r=train(g),q=r.state.players[0];
  expect(r.error).toBeUndefined();expect(q.level).toBe(99);expect(q.peakLevel).toBe(99);
  expect(Object.values(q.stats).reduce((a,b)=>a+b)-Object.values(p.stats).reduce((a,b)=>a+b)).toBe(10);
  expect(q.history.damageBank+q.traits.greatLevels).toBe(0);expect(q.hotShotsRemaining).toBe(0);
  expect(r.events.some(e=>e.type==='frenzy-end-level')).toBe(false);
  expect(decodeContract(encodeContract(r.state))?.players[0].level).toBe(99);
 });
 it('维持和成功附加等级均封顶，里程碑不发100级奖励',()=>{
  const g=newContract(3,['relic_017','relic_005','relic_042']);const p=g.players[0];p.level=p.peakLevel=98;p.history.milestone=24;p.traits.holds=1;
  force(g,'hold');const r=train(g);expect(r.error).toBeUndefined();expect(r.state.players[0].level).toBe(99);expect(r.state.players[0].history.milestone).toBe(24);
  const other=structuredClone(g);other.players[0].history.wins=1;force(other,'success');expect(train(other).state.players[0].level).toBe(99);
 });
 it('多次离营累加的继承可领取至99级，不额外投篮或消耗已预备物品',()=>{
  const g=newContract(4);g.progress.pendingLevel=160;g.progress.pendingHeat=7;g.players[0].armed=['item_003'];
  const r=train(g);expect(r.error).toBeUndefined();expect(r.state.players[0].level).toBe(99);expect(r.state.players[0].armed).toEqual(['item_003']);expect(r.state.totalShots).toBe(0);expect(r.state.rng).toEqual(g.rng);expect(r.state.progress.pendingLevel).toBe(0);
 });
 it('旧档和回溯快照等级归至99，保留历史价值与历史最佳记录',()=>{
  const g=newContract(5,['relic_006','relic_083']);g.commerce.paidMonths=12;g.players[0].level=120;g.players[0].peakLevel=150;g.players[0].peakValue='123456789';const value=playerValue(g,g.players[0]);
  const before=structuredClone(g);g.revision=1;g.undo={playerId:'p1',before};
  const loaded=decodeContract(encodeContract(g))!;expect(loaded.players[0].level).toBe(99);expect(loaded.players[0].peakLevel).toBe(99);expect(loaded.players[0].peakValue).toBe('123456789');expect(loaded.undo?.before.players[0].level).toBe(99);
  expect(playerValue(loaded,loaded.players[0])).toBe(value);const again=decodeContract(encodeContract(loaded))!;expect(again).toEqual(loaded);
 });
 it('大成功到顶不计算越界等级的价值，已满级不发溢价',()=>{
  const book=ledger();expect(bankGreat(book,99)).toBe(book);
  const at98=BigInt(quote(book,98)),at99=BigInt(quote(bankGreat(book,98),99));
  expect(Number(at99)/Number(at98)).toBeCloseTo(5/3,8);
 });
 it('无尽月份仍可超过99月',()=>{const g=newContract(6);g.month=99;g.credit=3;g.completed=true;const r=dispatch(g,g.revision,{type:'settle'});expect(r.error).toBeUndefined();expect(r.state.month).toBe(100);});
});
