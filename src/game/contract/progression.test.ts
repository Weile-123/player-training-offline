import {describe,it,expect} from 'vitest';
import {dispatch,newContract,previewShot,playerValue,type Action,type Contract} from './engine';
import {random,hash} from './random';
import {outcomeAt} from './probability';
import {validContract,encodeContract,decodeContract,readContract,contractSaveKeys} from './save';
import {shopCatalog} from './commerce';
import {masteryRules,checkProgress} from './progression';
import {statKeys,type Outcome} from '../types';
const act=(s:Contract,a:Action)=>{const r=dispatch(s,s.revision,a);expect(r.error).toBeUndefined();expect(validContract(r.state)).toBe(true);return r.state;};
function fire(s:Contract,outcome:Outcome,secondary?:number){
 if(s.clockMs<s.nextShotAt)s=act(s,{type:'advance',milliseconds:s.nextShotAt-s.clockMs});
 const tickets=previewShot(s,s.players[0]).tickets;
 for(let n=0;n<100000;n++){const r={state:n};if(outcomeAt(tickets,Math.floor(random(r)*1000))===outcome&&(secondary===undefined||random(r)<secondary)){s.rng.economy.state=n;return act(s,{type:'train',playerId:s.players[0].id});}}
 throw Error('cannot force');
}
const start=(id:number,level=3)=>{const s=newContract(2026,[`relic_${String(id).padStart(3,'0')}`]);s.players[0].level=level;s.players[0].peakLevel=level;return s;};
describe('剩余40件器材真实触发',()=>{
 it('全部94件启用；4件停用不入池，16件需要永久解锁',()=>{expect(shopCatalog).toHaveLength(94);expect(shopCatalog.filter(r=>r.locked)).toHaveLength(16);for(const n of [16,25,31,44])expect(shopCatalog.some(r=>r.id===`relic_${String(n).padStart(3,'0')}`)).toBe(false);});
 it('首次、连续成功与累计成功分别计数',()=>{
  expect(fire(start(7,0),'success').players[0].level).toBe(3);
  let s=start(42,0);s=fire(s,'success');s=fire(s,'great');expect(s.players[0].level).toBe(4);
  s=start(85,0);s=fire(s,'success');s=fire(s,'hold');s=fire(s,'success');expect(s.players[0].level).toBe(3);
 });
 it('里程碑、相同结果、连续成长与价值复刻',()=>{
  let s=fire(start(5),'success');expect(s.players[0].book.permanent).toEqual({n:'23',d:'20'});
  s=fire(s,'minor');s=fire(s,'success');expect(s.players[0].book.permanent).toEqual({n:'23',d:'20'});
  s=fire(fire(start(18),'hold'),'hold');expect(s.players[0].book.flat.n).toBe('150');
  s=fire(fire(start(27),'success'),'great');expect(s.players[0].book.permanent).toEqual({n:'11',d:'10'});
  s=newContract(9,['relic_008','relic_081']);s=fire(fire(s,'hold'),'hold');expect(s.players[0].book.flat.n).toBe('540');
 });
 it.each([15,21,23,51,59,78,40])('状态概率器材 %i 改变实际抽签',id=>{
  let s=start(id,8);s=fire(s,id===51?'great':id===59||id===40?'success':'hold');
  const withEffect=previewShot(s,s.players[0]).tickets;
  const clean=structuredClone(s);clean.equipment=[];clean.players[0].history={...newContract(1).players[0].history};
  expect(withEffect).not.toEqual(previewShot(clean,clean.players[0]).tickets);
 });
 it('概率转移和倍率，维持/轻伤/额外升级随机触发',()=>{
  const s=start(33);expect(playerValue(s,s.players[0])).toBe('1188');expect(previewShot(s,s.players[0]).tickets.minor).toBeGreaterThan(previewShot(newContract(1),newContract(1).players[0]).tickets.minor);
  const a=start(71,8),b=structuredClone(a);b.equipment=[];expect(previewShot(a,a.players[0]).tickets.great).toBeGreaterThan(previewShot(b,b.players[0]).tickets.great);
  expect(fire(start(22),'hold',.5).players[0].heat).toBe(2);
  expect(fire(start(53),'hold',.7).players[0].level).toBe(4);
  expect(fire(start(55),'minor',.7).players[0].level).toBe(3);
  expect(fire(start(61),'success',.25).players[0].level).toBe(5);
 });
 it('积蓄升级、反弹和普通大成功额外等级',()=>{
  let s=fire(fire(start(32),'hold'),'success');expect(s.players[0].level).toBe(5);
  s=fire(fire(start(47),'minor'),'great');expect(s.players[0].level).toBe(5);
  s=fire(fire(start(49),'minor'),'success');expect(s.players[0].level).toBe(5);
  expect(fire(start(52),'great').players[0].level).toBe(6);
 });
 it('损失补偿、价值基础奖励与出手前门槛',()=>{
  expect(BigInt(fire(start(29),'minor').players[0].book.flat.n)).toBeGreaterThan(0n);
  expect(fire(start(35),'minor').players[0].book.flat).toEqual({n:'180',d:'1'});
  let s=fire(fire(start(54),'hold'),'success');expect(s.players[0].book.base.n).toBe('340');
  s=fire(start(92,6),'success');expect(s.players[0].book.permanent.n).toBe('1');s=fire(s,'success');expect(s.players[0].book.permanent.n).toBe('23');
 });
 it('两次轻伤保护不自充能；前两次免降级仍降低六维',()=>{
  let s=fire(fire(start(62,10),'minor'),'minor');expect(s.players[0].history.spineReady).toBe(true);
  s=fire(s,'severe');expect(s.players[0].history.spineReady).toBe(false);expect(s.players[0].history.spineCount).toBe(0);expect(s.players[0].level).toBe(7);
  s=start(84);const before=statKeys.reduce((n,k)=>n+s.players[0].stats[k],0);s=fire(fire(s,'minor'),'minor');expect(s.players[0].level).toBe(3);expect(statKeys.reduce((n,k)=>n+s.players[0].stats[k],0)).toBe(before-20);s=fire(s,'minor');expect(s.players[0].level).toBe(2);
 });
 it('重伤传承、全营积蓄/经验与下月补招',()=>{
  let s=newContract(1,['relic_028','relic_034','relic_076','relic_038','relic_065','relic_094']);s.players[0].level=10;s.players[0].peakLevel=10;s.players[0].history.previous='hold';
  s=fire(s,'severe');expect(s.progress.pendingLevel).toBe(7);expect(s.progress.pendingHeat).toBe(7);expect(s.progress.greatBank).toBe(10);expect(s.progress.tickets.hold).toBe(1);expect(s.commerce.nextSupply).toBe(1);
  s=fire(s,'hold');expect(s.players[0].level).toBe(7);expect(s.players[0].history.successTickets).toBe(4);expect(s.progress.pendingLevel).toBe(0);
  s=fire(s,'great');expect(s.progress.greatBank).toBe(0);
 });
 it('失败永久权重、刷新首次兑换双积分、达标供给继承',()=>{
  let s=act(start(39),{type:'settle'});expect(s.progress.tickets.great).toBe(1);
  s=start(45,0);s=act(s,{type:'settle'});s.cash='10000';s=act(s,{type:'reroll'});s=act(s,{type:'exchange',playerId:s.players[0].id});expect(s.credits).toBe(2);s=act(s,{type:'exchange',playerId:s.players[0].id});expect(s.credits).toBe(3);
  s=newContract(1,['relic_050','relic_067']);s.players[0].level=12;s.players[0].peakLevel=12;s=act(s,{type:'queue',playerId:'p1',queued:true});s=act(s,{type:'settle'});expect(s.players.find(p=>p.id==='p4')!.level).toBe(3);expect(s.players.find(p=>p.id==='p5')!.level).toBe(2);
 });
 it('火热结束只触发一次；等待不是反复领奖',()=>{
  let s=start(70);s.players[0].heat=10;for(let i=0;i<6;i++)s=fire(s,'success');const level=s.players[0].level;s=act(s,{type:'advance',milliseconds:4000});expect(s.players[0].level).toBe(level);s=fire(s,'success');expect(s.players[0].level).toBe(level+2);s=act(s,{type:'advance',milliseconds:1000});expect(s.players[0].level).toBe(level+2);
 });
 it('16件解锁可以触发，回溯不撤回已永久点亮的解锁',()=>{
  const s=newContract(1),p=s.players[0];p.level=20;for(const k of statKeys)p.stats[k]=99;
  s.progress.broken=10;s.progress.frenzies=5;s.progress.overtime=3;s.completed=true;s.month=22;checkProgress(s,[]);
  for(const r of masteryRules)expect(s.commerce.unlocked).toContain(r.id);for(const id of [75,80,95,98])expect(s.commerce.unlocked).toContain(`relic_${String(id).padStart(3,'0')}`);
  let a=newContract(3);a.players[0].level=10;a.players[0].peakLevel=10;a.credit=1;a=act(a,{type:'queue',playerId:'p1',queued:true});a=act(a,{type:'settle'});expect(a.commerce.unlocked).toContain('relic_077');expect(a.commerce.unlocked).toContain('relic_089');
  a.commerce.merchant={month:a.month,offers:[]};a.month=3;a.commerce.shop.month=3;a.commerce.merchant={month:3,offers:[{id:'item_005',stock:1,purchased:0,basePrice:'1',level:0}]};a=act(a,{type:'buy-merchant',id:'item_005'});expect(a.commerce.unlocked).toContain('relic_082');
 });
 it('新状态回读保持行为与随机流',()=>{
  const s=fire(start(42),'success');const restored=decodeContract(encodeContract(s))!;expect(fire(s,'great')).toEqual(fire(restored,'great'));
 });
 it('2.1实验档补充新历史字段，不重复领取旧等级里程碑',()=>{
  const s=JSON.parse(JSON.stringify(start(5,12)));s.version='contract-v2.1-experimental';delete s.progress;for(const p of s.players)delete p.history;
  const payload=JSON.stringify(s),restored=decodeContract(JSON.stringify({format:'contract-envelope-v1',checksum:hash(payload),payload}))!;
  expect(validContract(restored)).toBe(true);expect(restored.players[0].history.milestone).toBe(3);expect(restored.undo).toBeNull();expect(restored.progress.broken).toBe(0);
 });
 it('主档和备份都损坏时保留原文并提示，不当作正常空档',()=>{
  const data=new Map([[contractSaveKeys.main,'broken'],[contractSaveKeys.backup,'broken-backup']]);
  const result=readContract({getItem:k=>data.get(k)??null,setItem:()=>{throw Error('should not write');}});
  expect(result.error).toBe('invalid-save');expect(result.state).toBeNull();expect(data.get(contractSaveKeys.main)).toBe('broken');
 });
});
