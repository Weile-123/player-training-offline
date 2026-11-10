import type { Stats } from './types';
import {specialistTemplates} from './specialistTemplates';
import { extraTemplates } from './extraTemplates';

export type TemplateTier = 'rotation' | 'starter' | 'star' | 'superstar' | 'legend';
export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C';
export type NbaTemplate = {
  id: string;
  name: string;
  englishName: string;
  tier: TemplateTier;
  position: Position;
  height: readonly [number, number];
  stats: Stats;
  style: string;
};

// 策划属性：用于游戏风格匹配，不代表真实球员统计或官方能力评级。
const stats = (three: number, mid: number, drive: number, inside: number, handle: number, defense: number): Stats =>
  ({ three, mid, drive, inside, handle, defense });

export const nbaTemplates: readonly NbaTemplate[] = [
  { id: 'caruso', name: '亚历克斯·卡鲁索', englishName: 'Alex Caruso', tier: 'rotation', position: 'SG', height: [185, 201], stats: stats(61, 45, 62, 55, 65, 88), style: '外线防守' },
  { id: 'beverley', name: '帕特里克·贝弗利', englishName: 'Patrick Beverley', tier: 'rotation', position: 'PG', height: [178, 193], stats: stats(62, 42, 45, 38, 66, 85), style: '压迫防守' },
  { id: 'duncan-robinson', name: '邓肯·罗宾逊', englishName: 'Duncan Robinson', tier: 'rotation', position: 'SG', height: [190, 207], stats: stats(90, 55, 42, 40, 48, 45), style: '无球射手' },
  { id: 'seth-curry', name: '塞斯·库里', englishName: 'Seth Curry', tier: 'rotation', position: 'SG', height: [178, 195], stats: stats(87, 70, 49, 40, 64, 43), style: '精准投射' },
  { id: 'tucker', name: 'PJ·塔克', englishName: 'PJ Tucker', tier: 'rotation', position: 'PF', height: [190, 208], stats: stats(66, 33, 30, 57, 32, 88), style: '底角与防守' },
  { id: 'mcgee', name: '贾维尔·麦基', englishName: 'JaVale McGee', tier: 'rotation', position: 'C', height: [203, 218], stats: stats(15, 28, 42, 88, 26, 75), style: '篮下终结' },
  { id: 'conley', name: '迈克·康利', englishName: 'Mike Conley', tier: 'starter', position: 'PG', height: [178, 195], stats: stats(79, 77, 76, 61, 87, 74), style: '稳健组织' },
  { id: 'mccollum', name: 'CJ·麦科勒姆', englishName: 'CJ McCollum', tier: 'starter', position: 'SG', height: [180, 198], stats: stats(85, 90, 80, 63, 87, 53), style: '技术型得分' },
  { id: 'brook-lopez', name: '布鲁克·洛佩斯', englishName: 'Brook Lopez', tier: 'starter', position: 'C', height: [205, 218], stats: stats(75, 60, 35, 85, 35, 88), style: '空间护筐' },
  { id: 'capela', name: '克林特·卡佩拉', englishName: 'Clint Capela', tier: 'starter', position: 'C', height: [200, 218], stats: stats(12, 28, 52, 91, 35, 86), style: '空接护筐' },
  { id: 'gordon', name: '阿隆·戈登', englishName: 'Aaron Gordon', tier: 'starter', position: 'PF', height: [193, 213], stats: stats(60, 58, 88, 90, 63, 79), style: '爆发终结' },
  { id: 'harris', name: '托拜厄斯·哈里斯', englishName: 'Tobias Harris', tier: 'starter', position: 'SF', height: [190, 210], stats: stats(77, 83, 73, 77, 67, 64), style: '锋线得分' },
  { id: 'irving', name: '凯里·欧文', englishName: 'Kyrie Irving', tier: 'star', position: 'PG', height: [178, 198], stats: stats(90, 94, 97, 81, 99, 53), style: '控球大师' },
  { id: 'paul-george', name: '保罗·乔治', englishName: 'Paul George', tier: 'star', position: 'SF', height: [193, 213], stats: stats(88, 87, 87, 78, 85, 92), style: '攻守锋线' },
  { id: 'butler', name: '吉米·巴特勒', englishName: 'Jimmy Butler', tier: 'star', position: 'SF', height: [190, 211], stats: stats(60, 86, 93, 88, 83, 95), style: '强硬突破' },
  { id: 'thompson', name: '克莱·汤普森', englishName: 'Klay Thompson', tier: 'star', position: 'SG', height: [188, 207], stats: stats(97, 88, 61, 60, 59, 86), style: '顶级无球投射' },
  { id: 'draymond', name: '德雷蒙德·格林', englishName: 'Draymond Green', tier: 'star', position: 'PF', height: [193, 213], stats: stats(51, 43, 62, 74, 81, 98), style: '组织与防守' },
  { id: 'gobert', name: '鲁迪·戈贝尔', englishName: 'Rudy Gobert', tier: 'star', position: 'C', height: [205, 218], stats: stats(10, 22, 40, 94, 29, 99), style: '禁区屏障' },
  { id: 'nash', name: '史蒂夫·纳什', englishName: 'Steve Nash', tier: 'superstar', position: 'PG', height: [178, 198], stats: stats(94, 93, 85, 65, 98, 49), style: '投射组织' },
  { id: 'bryant', name: '科比·布莱恩特', englishName: 'Kobe Bryant', tier: 'legend', position: 'SG', height: [185, 207], stats: stats(85, 99, 95, 89, 94, 91), style: '全域得分' },
  { id: 'durant', name: '凯文·杜兰特', englishName: 'Kevin Durant', tier: 'legend', position: 'SF', height: [198, 218], stats: stats(95, 99, 91, 88, 89, 83), style: '高个投射' },
  { id: 'leonard', name: '科怀·伦纳德', englishName: 'Kawhi Leonard', tier: 'superstar', position: 'SF', height: [190, 211], stats: stats(87, 95, 88, 85, 83, 99), style: '双向核心' },
  { id: 'antetokounmpo', name: '扬尼斯·阿德托昆博', englishName: 'Giannis Antetokounmpo', tier: 'superstar', position: 'PF', height: [198, 218], stats: stats(54, 68, 99, 99, 87, 96), style: '冲击禁区' },
  { id: 'jokic', name: '尼古拉·约基奇', englishName: 'Nikola Jokic', tier: 'superstar', position: 'C', height: [200, 218], stats: stats(83, 91, 75, 98, 97, 75), style: '中锋组织' },
  { id: 'curry', name: '斯蒂芬·库里', englishName: 'Stephen Curry', tier: 'legend', position: 'PG', height: [178, 198], stats: stats(99, 94, 92, 74, 99, 70), style: '超远投射' },
  { id: 'jordan', name: '迈克尔·乔丹', englishName: 'Michael Jordan', tier: 'legend', position: 'SG', height: [185, 207], stats: stats(81, 99, 99, 97, 96, 99), style: '攻守统治' },
  { id: 'lebron', name: '勒布朗·詹姆斯', englishName: 'LeBron James', tier: 'legend', position: 'SF', height: [193, 214], stats: stats(91, 94, 98, 99, 97, 96), style: '全能巨星' },
  { id: 'magic', name: '魔术师·约翰逊', englishName: 'Magic Johnson', tier: 'legend', position: 'PG', height: [195, 214], stats: stats(68, 86, 91, 88, 99, 79), style: '高个控场' },
  { id: 'duncan', name: '蒂姆·邓肯', englishName: 'Tim Duncan', tier: 'legend', position: 'PF', height: [200, 218], stats: stats(25, 91, 66, 98, 64, 99), style: '内线基石' },
  { id: 'oneal', name: '沙奎尔·奥尼尔', englishName: "Shaquille O'Neal", tier: 'legend', position: 'C', height: [205, 218], stats: stats(5, 38, 77, 99, 48, 94), style: '篮下统治' },
  ...extraTemplates,
  ...specialistTemplates,
];

export const templateById = (id: string | null | undefined) => nbaTemplates.find(t => t.id === id);
export const positionLabels: Record<Position, string> = { PG: '控球后卫', SG: '得分后卫', SF: '小前锋', PF: '大前锋', C: '中锋' };
