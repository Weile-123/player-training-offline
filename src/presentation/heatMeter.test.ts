import {describe,it,expect} from 'vitest';
import {dispatch,newContract} from '../game/contract/engine';
import {encodeContract,decodeContract,validContract} from '../game/contract/save';
import {heatMeter} from './heatMeter';

describe('火热次数条',()=>{
 it('就绪显示7次，每次投篮扣1次，等待不扣次数',()=>{
  let g=newContract(6);g.players[0].heat=10;
  expect(heatMeter(g,g.players[0])).toEqual({hot:true,remaining:7,total:7,percent:100});
  g=dispatch(g,g.revision,{type:'train',playerId:'p1'}).state;
  expect(heatMeter(g,g.players[0]).remaining).toBe(6);
  expect(heatMeter(g,g.players[0]).percent).toBeCloseTo(600/7);
  g=dispatch(g,g.revision,{type:'advance',milliseconds:80000}).state;
  expect(heatMeter(g,g.players[0]).remaining).toBe(6);
  for(let i=0;i<6;i++)g=dispatch(g,g.revision,{type:'train',playerId:'p1'}).state;
  expect(heatMeter(g,g.players[0])).toEqual({hot:false,remaining:0,total:7,percent:0});
  g.players[0].heat=6;expect(heatMeter(g,g.players[0]).percent).toBe(60);
 });
 it('开启时记录总次数，重载或移除加成器械不改变当前轮进度',()=>{
  let g=newContract(6,['relic_072','relic_095']);g.players[0].heat=10;
  g=dispatch(g,g.revision,{type:'train',playerId:'p1'}).state;
  expect(g.players[0].hotShotsTotal).toBe(13);
  expect(g.players[0].hotShotsRemaining).toBe(12);
  g=decodeContract(encodeContract(g))!;g.equipment=[];
  expect(heatMeter(g,g.players[0]).percent).toBeCloseTo(1200/13);
 });
 it('旧倒计时存档按剩余比例迁移，新次数字段拒绝非法值',()=>{
  const g=newContract(6),p=g.players[0];delete p.hotShotsRemaining;delete p.hotShotsTotal;
  p.hotUntil=2000;p.hotDurationMs=4000;g.nextShotAt=600;
  const migrated=decodeContract(encodeContract(g))!;
  expect(migrated.players[0].hotShotsRemaining).toBe(4);
  expect(migrated.nextShotAt).toBe(0);expect(migrated.players[0].hotUntil).toBe(0);
  expect(decodeContract(encodeContract(migrated))).toEqual(migrated);
  migrated.players[0].hotShotsRemaining=8;expect(validContract(migrated)).toBe(false);
  migrated.players[0].hotShotsRemaining=-1;expect(validContract(migrated)).toBe(false);
  expect(heatMeter(newContract(1)).percent).toBe(0);
 });
});
