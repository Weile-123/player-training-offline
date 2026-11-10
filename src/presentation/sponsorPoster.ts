import type {Contract} from '../game/contract/engine';
import {money} from './money';
export type SponsorRecord=Pick<Contract,'month'|'delivered'|'totalShots'>;
export const sponsorPostText=(s:SponsorRecord)=>`我的《王牌训练师》训练营已经来到第 ${s.month} 月。累计交付金额 ${money(s.delivered)}，累计训练 ${s.totalShots.toLocaleString('zh-CN')} 次。`;
/** Runtime PNG with real game data; no remote assets or newer Canvas APIs. */
export async function createSponsorPoster(s:SponsorRecord):Promise<Blob>{
 const canvas=document.createElement('canvas');canvas.width=900;canvas.height=1100;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('当前浏览器无法生成分享图');
 const ink='#102c3a',cream='#f6e7c7',red='#ba2b20',gold='#c29b57';
 const box=(x:number,y:number,w:number,h:number,color:string)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
 const text=(value:string,x:number,y:number,size:number,color=ink,max=740)=>{
  ctx.fillStyle=color;ctx.textAlign='center';let fitted=size;ctx.font=`900 ${fitted}px "Microsoft YaHei",sans-serif`;
  while(ctx.measureText(value).width>max&&fitted>12)ctx.font=`900 ${--fitted}px "Microsoft YaHei",sans-serif`;
  ctx.fillText(value,x,y,max);
 };
 box(0,0,900,1100,ink);box(15,15,870,1070,gold);box(23,23,854,1054,ink);box(30,30,840,1040,cream);
 ctx.fillStyle='#d5bc8e';for(let y=38;y<1065;y+=12)for(let x=38;x<865;x+=12){ctx.beginPath();ctx.arc(x,y,1,0,Math.PI*2);ctx.fill();}
 box(45,50,810,72,ink);text('王牌训练师',450,99,34,cream);
 ctx.beginPath();ctx.moveTo(45,145);ctx.lineTo(855,145);ctx.lineTo(817,260);ctx.lineTo(45,260);ctx.closePath();ctx.fillStyle=red;ctx.fill();text('我的训练营战报',438,224,62,cream);
 const rows=[['当前进度',`第 ${s.month} 月`],['累计交付金额',money(s.delivered)],['累计训练',`${s.totalShots.toLocaleString('zh-CN')} 次`]];
 rows.forEach(([label,value],i)=>{const y=300+i*215;box(61,y+6,784,184,gold);box(55,y,784,184,ink);box(59,y+4,776,176,cream);text(label,450,y+51,28);text(value,450,y+137,67,red);});
 box(55,982,790,50,ink);text('王牌训练师 · 训练营成长记录',450,1017,25,cream);
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('分享图生成失败，请重试')),'image/png'));
}
