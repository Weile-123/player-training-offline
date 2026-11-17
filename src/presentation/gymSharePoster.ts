import {comicPoster, posterColors, posterStats} from './comicPosterCanvas';
import {loadPosterPortrait} from './posterPortrait';
import {gymPlayerName} from './gymPlayerName';
import {money} from './money';
import {statLabels} from '../game/config';
import {statKeys} from '../game/types';
import type {GymPlayer} from '../game/gym/engine';
import {templateById} from '../game/templates';
import {tierConfig} from '../game/matching';

export type GymSharePoster = {player: GymPlayer; value: string; reason: 'levels' | 'stamina'};
/** Fixed copy accompanies the frozen preview. The native editor remains the publishing surface. */
export function gymShareCopy({player, reason}: GymSharePoster) {
 const name = gymPlayerName(player);
 return {
  title: reason === 'levels' ? `传奇球馆｜我的${name}成长档案` : '传奇球馆｜球星加练日记',
  content: `我在《传奇球馆》培养出了 ${player.level} 级的${name}，已经完成 ${player.shots} 次投篮训练。${reason === 'stamina' ? '补充能量，下一课继续成长！' : '下一位篮球传奇，由我培养！'}`,
 };
}
export async function generateGymSharePoster(snapshot: GymSharePoster): Promise<Blob> {
 if (typeof document !== 'undefined' && document.fonts) await document.fonts.ready;
 const {player, value, reason} = snapshot, name = gymPlayerName(player), template = templateById(player.templateId);
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
