import {comicPoster, posterColors, posterStats} from './comicPosterCanvas';
import {loadPosterPortrait} from './posterPortrait';
import {gymPlayerName} from './gymPlayerName';
import {money} from './money';
import {statLabels} from '../game/config';
import {statKeys} from '../game/types';
import type {GymPlayer} from '../game/gym/engine';
import type {ChallengePlayer} from '../game/gym/challenge';
import {challengeCards} from '../game/gym/challengeCatalog';
import {templateById} from '../game/templates';
import {tierConfig} from '../game/matching';

export type GymSharePoster = {player: GymPlayer; value?: string; reason: 'levels' | 'stamina'} |
 {reason:'revive'; stage:number; roster:readonly Pick<ChallengePlayer,'id'|'level'>[]};
/** Fixed copy accompanies the frozen preview. The native editor remains the publishing surface. */
export function gymShareCopy(snapshot: GymSharePoster) {
 if (snapshot.reason === 'revive') return {
  title:`传奇球馆｜我的阵容打到了第 ${snapshot.stage} 关`,
  content:`我在《传奇球馆》的球馆挑战闯到了第 ${snapshot.stage} 关！阵容有${snapshot.roster.map(player => challengeCards.get(player.id)?.name).filter(Boolean).join('、')}。新的援手已经就位，下一场继续挑战！`,
 };
 const {player, reason} = snapshot;
 const name = gymPlayerName(player);
 return {
  title: reason === 'levels' ? `传奇球馆｜我的${name}成长档案` : '传奇球馆｜球星加练日记',
  content: `我在《传奇球馆》培养出了 ${player.level} 级的${name}，已经完成 ${player.shots} 次投篮训练。${reason === 'stamina' ? '补充能量，下一课继续成长！' : '下一位篮球传奇，由我培养！'}`,
 };
}
export async function generateGymSharePoster(snapshot: GymSharePoster): Promise<Blob> {
 if (typeof document !== 'undefined' && document.fonts) await document.fonts.ready;
 if (snapshot.reason === 'revive') return generateChallengePoster(snapshot);
 const {player, value = '0', reason} = snapshot, name = gymPlayerName(player), template = templateById(player.templateId);
 const a = comicPoster(1230, {name: '传奇球馆', slogan: '下一位传奇，由我培养'}), {ink, cream, red, gold} = posterColors;
 const portrait = await loadPosterPortrait(player.templateId).catch(() => null);
 a.header(reason === 'levels' ? '球星成长档案' : '球星加练日记', '我的球馆 · 我的培养记录');
 a.panel(50, 300, 800, 710);
 a.portrait(portrait?.image ?? null, 72, 324, 300, 354, template?.tier ?? 'undiscovered', portrait?.crop);
 a.text(name, 398, 374, 42, ink, 'left', 427);
 a.box(398, 399, 427, 53, '#23674f', gold, 3, 2);
 a.text(`${template ? tierConfig(template.tier).label : '潜力新秀'} · 训练 Lv.${player.level}`, 611, 435, 28, cream, 'center', 402);
 a.text('当前球员身价', 399, 495, 23, ink);
 a.text(money(value), 398, 552, 49, red, 'left', 427);
 const rating = Object.values(player.stats).reduce((sum, stat) => sum + stat, 0) / 6;
 a.box(398, 581, 427, 49, ink, gold, 3, 2);
 a.text(`★ 综合评分 ${rating.toFixed(1)}`, 611, 615, 29, cream, 'center', 402);
 a.text(`累计 ${player.shots} 次有效投篮`, 611, 669, 23, ink, 'center', 427);
 a.ribbon('六维能力 · 成长记录', 73, 706, 754, 60, 33);
 posterStats(a, player.stats, statLabels, statKeys, 784, 73, 754);
 a.text(reason === 'levels' ? '每一次突破，都写进我的球星档案。' : '恢复状态，再出发。每一课都离传奇更近。', 450, 1047, 24, ink, 'center', 760);
 a.footer('下一位篮球传奇，由我培养');
 return a.blob();
}

async function generateChallengePoster({stage,roster}: Extract<GymSharePoster,{reason:'revive'}>) {
 const rowCount = Math.ceil(roster.length/3), height = 740 + rowCount*292;
 const art = comicPoster(height,{name:'传奇球馆',slogan:'球馆挑战'}), {ink,cream,red,gold} = posterColors;
 const portraits = await Promise.all(roster.map(player=>loadPosterPortrait(player.id).catch(()=>null)));
 art.header('球馆挑战战报','我的阵容 · 我的闯关记录');
 art.panel(50,300,800,280 + rowCount*292);
 art.box(73,324,754,112,ink,gold,8,3);
 art.text(`闯到第 ${stage} 关`,450,398,57,cream,'center',680);
 art.ribbon('挑战阵容',73,466,754,55,30);
 for (const [index,player] of roster.entries()) {
  const card=challengeCards.get(player.id)!, portrait=portraits[index];
  const x=73+index%3*255, y=544+Math.floor(index/3)*292;
  art.box(x,y,244,277,'#faedce',gold,6,2);
  art.portrait(portrait?.image??null,x+11,y+11,222,184,card.tier,portrait?.crop);
  art.text(card.name,x+122,y+227,25,ink,'center',220);
  art.text(`${tierConfig(card.tier).label} · Lv.${player.level}`,x+122,y+258,21,red,'center',222);
 }
 art.footer('强力援手 · 下一场再战');
 return art.blob();
}
