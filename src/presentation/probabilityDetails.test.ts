import {expect,it} from 'vitest';
import {newContract,previewShot} from '../game/contract/engine';
import {supportedEquipment} from '../game/contract/effects';
import {probabilityDetails} from './probabilityDetails';

it('matches the design example, identifies its sources and never changes game state',()=>{
 const g=newContract(3),p=g.players[0];p.level=7;g.equipment=['relic_002','relic_003'];p.armed=['item_003'];
 const before=JSON.stringify(g),d=probabilityDetails(g,p);
 expect(d.tickets).toEqual({severe:293,minor:52,hold:131,success:419,great:105});
 expect(d.rows).toEqual(expect.arrayContaining([
  expect.objectContaining({source:'基础投篮机',effect:'成功权重 +4'}),
  expect.objectContaining({source:'镁粉',effect:'大成功权重 ×2'}),
  expect.objectContaining({source:'护膝绑带',effect:'重伤概率 ×0.9，其余按比例分配'}),
 ]));expect(JSON.stringify(g)).toBe(before);
});
it('uses the real engine for every equipment item in ordinary and hot states',()=>{
 for(const id of supportedEquipment)for(const hot of [false,true]){
  const g=newContract(4),p=g.players[0];g.equipment=[id];p.level=10;p.heat=hot?10:0;
  p.history.previous='hold';p.history.successTickets=2;p.history.charm=2;p.traits.scars=1;
  const result=probabilityDetails(g,p);expect(result.tickets,id).toEqual(previewShot(g,p).tickets);
  expect(Object.values(result.tickets).reduce((a,b)=>a+b,0)).toBe(1000);
 }
});
it('shows inheritance, consumable conversion, debug override and separate protection',()=>{
 const g=newContract(7),p=g.players[0];p.level=0;p.shots=0;g.progress.pendingSuccess=4;g.progress.pendingLevel=7;
 p.armed=['item_001','item_004'];
 const d=probabilityDetails(g,p,true);
 expect(d.level).toBe(7);expect(d.tickets).toEqual(previewShot(g,p,{noSevere:true}).tickets);
 expect(d.rows.some(r=>r.source==='传承笔记'&&r.effect.includes('+4'))).toBe(true);
 expect(d.rows.some(r=>r.source==='训练补剂')).toBe(true);
 expect(d.rows.some(r=>r.source==='应急护具'&&r.category==='结果保护')).toBe(true);
 expect(d.rows.some(r=>r.category==='测试设置')).toBe(true);
 expect(p.level).toBe(0);expect(g.progress.pendingSuccess).toBe(4);
});
it('lists only ready guards in priority order and keeps probability unchanged',()=>{
 const g=newContract(8),p=g.players[0];p.armed=['item_001'];g.equipment=['relic_056','relic_090','relic_062','relic_079'];p.history.spineReady=true;
 const d=probabilityDetails(g,p),guards=d.rows.filter(r=>r.category==='结果保护');
 expect(guards).toHaveLength(5);expect(guards[0].source).toBe('应急护具');
 p.armed=[];g.commerce.monthlyRescueUsed=true;p.traits.cornerUsed=true;p.history.spineReady=false;p.traits.phoenixUsed=true;
 expect(probabilityDetails(g,p).rows.filter(r=>r.category==='结果保护')).toHaveLength(0);
 expect(probabilityDetails(g,p).tickets).toEqual(d.tickets);
});
