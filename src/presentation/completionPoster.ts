import {cloneData} from '../utils/cloneData';
import {comicPoster,posterStats,posterColors} from './comicPosterCanvas';
import {playerValue,type Athlete,type Contract,type CompletionRecord} from '../game/contract/engine';
import {templateById} from '../game/templates';
import {statKeys} from '../game/types';
import {statLabels} from '../game/config';
import {equipmentName} from '../game/contract/catalog';
import {money} from './money';
import {posterPortrait,loadPosterPortrait} from './posterPortrait';
import {productImagePath} from '../components/ProductImage';

function loadImage(src:string|null):Promise<HTMLImageElement|null>{
 if(!src)return Promise.resolve(null);
 return new Promise(resolve=>{const img=new Image();img.crossOrigin='anonymous';img.referrerPolicy='no-referrer';const timer=setTimeout(()=>{img.onload=img.onerror=null;resolve(null);},5000);img.onload=()=>{clearTimeout(timer);resolve(img)};img.onerror=()=>{clearTimeout(timer);resolve(null)};img.src=src;});
}
export function playerPosterData(game:Contract,player:Athlete){
 return {name:templateById(player.templateId)?.name??'待发掘球员',portrait:posterPortrait(player.templateId,player.highPotential).src,templateId:player.templateId,highPotential:player.highPotential===true,level:player.level,value:playerValue(game,player),stats:{...player.stats},height:player.height,shots:player.shots,month:game.month};
}
export type PlayerPosterData=ReturnType<typeof playerPosterData>;
export const playerPostText=(p:PlayerPosterData)=>`我在《王牌训练师》培养出了${p.level}级球员${p.name}！当前估值${money(p.value)}，累计训练${p.shots}次。`;
export async function createPlayerPoster(p:PlayerPosterData,kind:'player'|'cap'='cap'):Promise<Blob>{
 const a=comicPoster(1320),{ink,cream,red,gold}=posterColors,cap=kind==='cap',portrait=await loadPosterPortrait(p.templateId,p.highPotential);
 a.header(cap?'99级王牌':'王牌养成档案',cap?'训练巅峰 · 满级纪念':`第 ${p.month} 月 · 我的球星培养记录`,cap?'cap':'standard');
 a.panel(50,300,800,862);
 a.portrait(portrait.image,72,326,342,421,portrait.tier,portrait.crop);
 if(cap){a.box(90,689,306,46,gold,cream,3,2);a.text('★  99级 · MAX  ★',243,721,25,ink,'center',290);}
 a.text(p.name,439,371,43,ink,'left',389);
 a.box(439,399,387,59,cap?'#9b6a28':'#24634d',gold,3,2);a.text(`训练 +${p.level}`,632,440,35,cream,'center',365);
 a.text('当前球员估值',440,512,25,ink);a.text(money(p.value),439,578,54,red,'left',387);
 a.box(439,608,387,56,ink,gold,3,2);a.text(`★ 综评 ${(Object.values(p.stats).reduce((n,v)=>n+v,0)/6).toFixed(1)}`,632,647,30,cream,'center');
 a.text(`${p.height} cm · 累计训练 ${p.shots} 次`,632,713,22,ink,'center',387);
 a.ribbon('六维能力 · 实力档案',74,782,752,65,34,cap?'#9b6a28':red);
 posterStats(a,p.stats,statLabels,statKeys,869);
 a.text(cap?'练至巅峰，留下我的王牌。':'每一次成长，都写进球星档案。',450,1129,24,ink,'center');
 a.footer(cap?'满级不是终点，传奇仍在继续':'下一位王牌，由我培养',cap?'#9b6a28':red);
 return a.blob();
}
export function completionPostText(record:CompletionRecord){return `我在《王牌训练师》完成了${record.month}个月合同！累计交付${money(record.delivered)}，训练${record.totalShots}次${record.bestPlayer?`，最高价值球员：${templateById(record.bestPlayer.templateId)?.name??'球星'}（${money(record.bestPlayer.value)}）`:''}。继续挑战无尽模式！`;}
/** 使用本局冻结的结算数据生成可下载PNG；远程头像不可用时仍可完整导出。 */
export async function createCompletionPoster(record:CompletionRecord,kind:'completion'|'career-end'='completion'):Promise<Blob>{
 const a=comicPoster(1560),{ink,cream,red,gold}=posterColors,win=kind==='completion';
 const [portrait,...products]=await Promise.all([loadPosterPortrait(record.bestPlayer?.templateId),...record.equipment.map(id=>loadImage(productImagePath(id)))]);
 a.header(win?'合同圆满完成':'我的执教战报',win?`${record.month}个月的培养，交出我的王牌答卷`:'球星巅峰 · 我的训练营记录',win?'victory':'standard');
 const metrics=[[win?'完成合同':'挑战至',`第 ${record.month} 月`],['累计交付',money(record.delivered)],['累计训练',`${record.totalShots} 次`]];
 a.panel(50,295,800,120);
 metrics.forEach(([label,value],i)=>{const x=62+i*260;a.box(x,307,256,96,'#f7e9cb');a.text(label,x+128,338,22,ink,'center');a.text(value,x+128,385,39,red,'center',230);});
 a.panel(50,437,800,578);a.ribbon(win?'冠军阵容 · 最高价值球员':'本局最高价值球员',76,449,748,66,38,win?'#24634d':red);
 const p=record.bestPlayer;
 if(p){
  a.portrait(portrait.image,73,537,286,241,portrait.tier,portrait.crop);a.text(`模板：${templateById(p.templateId)?.name??'球星模板'}`,386,570,30,ink,'left',441);
  a.text(money(p.value),386,638,55,red,'left',441);
  a.box(386,662,440,49,'#24634d',gold,3,2);a.text(`训练 +${p.level}`,606,697,30,cream,'center');
  a.box(386,726,440,49,ink,gold,3,2);a.text(`★ 综评 ${(Object.values(p.stats).reduce((n,v)=>n+v,0)/6).toFixed(1)}`,606,761,30,cream,'center');
  posterStats(a,p.stats,statLabels,statKeys,801);
 }else{a.portrait(portrait.image,90,545,250,280,portrait.tier,portrait.crop);a.text('下一位球星，等我发掘',585,663,32,ink,'center',460);a.text('训练与交付记录，都是成长的证明。',450,944,26,ink,'center');}
 a.panel(50,1036,800,382);a.ribbon(`${win?'通关':'本局'}器械 · ${record.equipment.length}/8`,76,1048,748,64,36,win?'#24634d':red);
 if(!record.equipment.length)a.text('轻装上阵，也有属于我的战绩。',450,1274,29,ink,'center');
 record.equipment.forEach((id,i)=>{const x=69+(i%4)*193,y=1128+Math.floor(i/4)*137;a.box(x,y,183,128,'#f8edcf');if(products[i])a.fit(products[i]!,x+8,y+5,167,90);a.text(equipmentName(id),x+91.5,y+115,18,ink,'center',167);});
 a.footer(win?'合同已兑现，下一站无尽挑战':'培养我的王牌，记录每次突破',win?'#24634d':red);
 return a.blob();
}
export type PosterSpec={kind:'player'|'cap';player:PlayerPosterData}|{kind:'completion'|'career-end';record:CompletionRecord};
export function careerPosterData(game:Contract):CompletionRecord{return {month:game.month,delivered:game.delivered,totalShots:game.totalShots,bestPlayer:game.bestPlayer?cloneData(game.bestPlayer):null,equipment:[...game.equipment],acknowledged:true};}
export function posterDescription(spec:PosterSpec){
 if('player' in spec)return {title:spec.kind==='cap'?'满级球员海报':'球员成长海报',content:playerPostText(spec.player),filename:`王牌训练师-${spec.player.name}-${spec.player.level}级.png`};
 return {title:spec.kind==='completion'?'通关成绩海报':'本局战绩海报',content:spec.kind==='completion'?completionPostText(spec.record):`我在《王牌训练师》挑战到了第${spec.record.month}月，累计训练${spec.record.totalShots}次，交付${money(spec.record.delivered)}。下一局，卷土重来！`,filename:`王牌训练师-${spec.kind==='completion'?'通关成绩':'本局战绩'}.png`};
}
export async function generatePoster(spec:PosterSpec):Promise<Blob>{
 if(typeof document!=='undefined'&&document.fonts)await document.fonts.ready;
 return 'player' in spec?createPlayerPoster(spec.player,spec.kind):createCompletionPoster(spec.record,spec.kind);
}
