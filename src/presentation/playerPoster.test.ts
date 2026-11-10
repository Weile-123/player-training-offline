import {it,expect} from 'vitest';
import {newContract,playerValue} from '../game/contract/engine';
import {playerPosterData,playerPostText,careerPosterData,posterDescription} from './completionPoster';
it('满级海报取当前球员的实际数据，不使用生涯最佳记录',()=>{
 const g=newContract(1),p=g.players[0];p.level=p.peakLevel=99;p.templateId='curry';p.shots=230;
 g.bestPlayer={playerId:'other',templateId:'jordan',level:99,value:'99999999999999',stats:{...p.stats}};
 const data=playerPosterData(g,p);expect(data.name).toContain('库里');expect(data.value).toBe(playerValue(g,p));expect(data.shots).toBe(230);
 const old=data.stats.three;p.stats.three++;expect(data.stats.three).toBe(old);expect(playerPostText(data)).toContain('99级');expect(playerPostText(data)).not.toContain('乔丹');
});
it('继承至满级但未匹配模板的球员仍可生成分享数据',()=>{
 const g=newContract(2);g.players[0].level=99;const data=playerPosterData(g,g.players[0]);expect(data.name).toBe('待发掘球员');expect(data.portrait).toContain('poster-portraits/rookie-atlas.png');expect(data.templateId).toBeNull();expect(data.level).toBe(99);
});
it('keeps ended-career and victory copy distinct and freezes the actual final equipment and best player',()=>{
 const g=newContract(1);g.month=27;g.totalShots=2301;g.bestPlayer={playerId:'p1',templateId:'curry',level:99,value:'10000',stats:{...g.players[0].stats}};g.equipment=['relic_001'];
 const record=careerPosterData(g),end=posterDescription({kind:'career-end',record}),win=posterDescription({kind:'completion',record});
 g.equipment.length=0;g.bestPlayer.stats.three=99;
 expect(record.equipment).toEqual(['relic_001']);expect(record.bestPlayer!.stats.three).not.toBe(99);
 expect(end.content).toContain('第27月');expect(end.content).not.toContain('完成了');expect(win.content).toContain('完成了27个月合同');
});
