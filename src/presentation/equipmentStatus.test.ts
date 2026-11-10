import {it,expect} from 'vitest';
import {newContract} from '../game/contract/engine';
import {equipmentStates} from './equipmentStatus';
import {onBreak,inherit,survivingEffects} from '../game/contract/progression';
import {fraction} from '../game/contract/money';
import {encodeContract,decodeContract,validContract} from '../game/contract/save';
it('保护按球员与月份分别显示，换人不会共用个人保护次数',()=>{
 const g=newContract(1,['relic_056','relic_090','relic_062','relic_079']);g.commerce.monthlyRescueUsed=true;g.players[0].traits.cornerUsed=true;g.players[0].history.spineReady=true;
 const first=equipmentStates(g,g.players[0]),second=equipmentStates(g,g.players[1]);
 expect(first.find(r=>r.label==='月度保护')?.value).toBe('已用完');expect(second.find(r=>r.label==='月度保护')?.value).toBe('已用完');
 expect(first.find(r=>r.label==='首次保护')?.value).toBe('已用完');expect(second.find(r=>r.label==='首次保护')?.value).toBe('剩 1 次');expect(first.find(r=>r.label==='轻伤护盾')?.value).toBe('已就绪');
});
it('相似效果分别显示真实器械，积蓄进度与未重伤计数一致',()=>{
 const g=newContract(4,['relic_027','relic_042','relic_018','relic_081','relic_041','relic_011']);const p=g.players[0];p.traits.greatLevels=3;p.normalShots=4;
 const rows=equipmentStates(g,p);
 expect(rows.filter(r=>r.label==='连续得手').map(r=>r.sources)).toEqual([['relic_042'],['relic_027']]);
 expect(rows.filter(r=>r.label==='相同结果').map(r=>r.sources)).toEqual([['relic_018'],['relic_081']]);
 expect(rows.find(r=>r.sources?.includes('relic_041'))?.progress).toEqual({current:3,total:4});
 expect(rows.find(r=>r.sources?.includes('relic_011'))?.detail).toContain('再完成 1 次未重伤');
});
it('继承与成功累计保留真实来源，存档读写及弃置不丢失来源',()=>{
 const g=newContract(5,['relic_028','relic_034','relic_076','relic_065','relic_094','relic_059']);const p=g.players[0];p.level=10;p.peakLevel=10;p.history.previous='hold';
 onBreak(g,p);
 expect(equipmentStates(g).find(r=>r.id==='inheritance')?.sources).toEqual(['relic_028','relic_034','relic_076']);
 const newcomer=g.players[1];inherit(g,newcomer,true);newcomer.peakLevel=newcomer.level;
 survivingEffects(g,newcomer,'success',false,newcomer.level,fraction(100),false,false);
 newcomer.peakLevel=newcomer.level;g.equipment=[];
 const restored=decodeContract(encodeContract(g))!;
 expect(equipmentStates(restored,restored.players[1]).find(r=>r.id==='success-weight')?.sources).toEqual(['relic_028','relic_059']);
 expect(equipmentStates(restored).find(r=>r.id==='career-hold')?.sources).toEqual(['relic_065']);
 expect(equipmentStates(restored).find(r=>r.id==='reserved-supply')?.sources).toEqual(['relic_094']);
 expect(restored.progress.inheritanceSources).toBeUndefined();
});
it('旧存档合计不误认来源，新来源可以追加，拒绝无效来源',()=>{
 const g=newContract(6,['relic_059']);const p=g.players[0];p.history.successTickets=4;
 expect(validContract(g)).toBe(true);
 expect(equipmentStates(g,p).find(r=>r.id==='success-weight')?.legacySource).toBe(true);
 survivingEffects(g,p,'success',false,0,fraction(100),false,false);
 expect(p.history.successSources).toEqual({ids:['relic_059'],legacy:true});
 p.history.successSources={ids:['unknown-file']};expect(validContract(g)).toBe(false);
});
it('弃置后积蓄仍显示，读取不修改游戏状态',()=>{
 const g=newContract(2);g.players[0].traits.greatLevels=3;g.players[0].history.damageBank=7;g.players[0].history.successBank=2;const before=structuredClone(g);
 const rows=equipmentStates(g,g.players[0]);expect(rows.filter(r=>r.tone==='charge').map(r=>r.value)).toEqual(['+3级','+2级','+7级']);expect(g).toEqual(before);
});
it('无上场球员时保留全局继承、免费刷新状态，不显示别人的个人状态',()=>{
 const g=newContract(3,['relic_043','relic_041']);g.progress.pendingLevel=120;const rows=equipmentStates(g);
 expect(rows.find(r=>r.id==='inheritance')?.value).toBe('+99级');expect(rows.find(r=>r.label==='免费刷新')?.value).toBe('剩 1 次');expect(rows.some(r=>r.label==='大成功积蓄')).toBe(false);
});
