const ink='#102c3a',cream='#fff0c8',red='#bd2d21',gold='#ba9559';
export const posterColors={ink,cream,red,gold};
/** Drawing primitives shared by all four exported posters, in game UI colours. */
export function comicPoster(height=1320){
 const canvas=document.createElement('canvas');canvas.width=900;canvas.height=height;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('当前浏览器无法生成图片');
 function box(x:number,y:number,w:number,h:number,fill:string,border=gold,radius=8,width=2){
  ctx!.beginPath();ctx!.roundRect(x,y,w,h,radius);ctx!.fillStyle=fill;ctx!.fill();ctx!.strokeStyle=border;ctx!.lineWidth=width;ctx!.stroke();
 }
 function text(value:string,x:number,y:number,size:number,color=ink,align:CanvasTextAlign='left',max=790){
  const safe=Array.from(value).slice(0,100).join('');ctx!.save();ctx!.fillStyle=color;ctx!.textAlign=align;ctx!.textBaseline='alphabetic';
  let fitted=size;ctx!.font=`900 ${fitted}px "Microsoft YaHei",system-ui,sans-serif`;
  while(ctx!.measureText(safe).width>max&&fitted>12){fitted-=1;ctx!.font=`900 ${fitted}px "Microsoft YaHei",system-ui,sans-serif`;}
  ctx!.fillText(safe,x,y,max);ctx!.restore();
 }
 function dots(x:number,y:number,w:number,h:number,color='rgba(145,100,40,.15)',step=7){
  ctx!.fillStyle=color;for(let yy=y;yy<y+h;yy+=step)for(let xx=x;xx<x+w;xx+=step){ctx!.beginPath();ctx!.arc(xx,yy,.9,0,Math.PI*2);ctx!.fill();}
 }
 function ribbon(label:string,x:number,y:number,w:number,h:number,size=40,fill=red){
  ctx!.save();ctx!.beginPath();ctx!.moveTo(x+20,y+6);ctx!.lineTo(x+w,y);ctx!.lineTo(x+w-22,y+h*.35);ctx!.lineTo(x+w-7,y+h*.36);ctx!.lineTo(x+w-32,y+h);ctx!.lineTo(x,y+h);ctx!.lineTo(x+12,y+h*.55);ctx!.lineTo(x+3,y+h*.55);ctx!.closePath();ctx!.clip();
  ctx!.fillStyle=fill;ctx!.fillRect(x,y,w,h);dots(x,y,w,h,'rgba(255,230,177,.29)',6);
  ctx!.fillStyle='#681c1c33';ctx!.fillRect(x,y+h-6,w,6);text(label,x+w/2,y+h*.72,size,cream,'center',w-55);ctx!.restore();
 }
 function ball(x:number,y:number,r:number){
  ctx!.save();ctx!.translate(x,y);ctx!.rotate(-.3);ctx!.fillStyle=cream;ctx!.beginPath();ctx!.arc(0,0,r,0,Math.PI*2);ctx!.fill();ctx!.strokeStyle=red;ctx!.lineWidth=2.5;ctx!.beginPath();ctx!.moveTo(-r,0);ctx!.lineTo(r,0);ctx!.moveTo(0,-r);ctx!.lineTo(0,r);ctx!.moveTo(-r*.7,-r*.7);ctx!.quadraticCurveTo(r*.8,0,-r*.7,r*.7);ctx!.moveTo(r*.7,-r*.7);ctx!.quadraticCurveTo(-r*.8,0,r*.7,r*.7);ctx!.stroke();ctx!.restore();
 }
 function panel(x:number,y:number,w:number,h:number){box(x,y,w,h,'#f7e8c7',ink,12,3);box(x+6,y+6,w-12,h-12,'#f7e8c7',gold,8,1);dots(x+12,y+12,w-24,h-24);}
 function portrait(img:HTMLImageElement|null,x:number,y:number,w:number,h:number,tier='undiscovered',crop?:readonly [number,number,number,number]){
  box(x,y,w,h,ink,ink,8,3);ctx!.save();ctx!.beginPath();ctx!.roundRect(x+3,y+3,w-6,h-6,6);ctx!.clip();
  ctx!.strokeStyle='#a4c1bb28';ctx!.lineWidth=1;for(let i=-h;i<w;i+=24){ctx!.beginPath();ctx!.moveTo(x+i,y+h);ctx!.lineTo(x+i+h,y);ctx!.stroke();}
  ctx!.strokeStyle='#e2c88b55';ctx!.lineWidth=2;ctx!.beginPath();ctx!.arc(x+w/2,y+h*.62,w*.43,0,Math.PI*2);ctx!.stroke();
  if(img){const [sx,sy,sw,sh]=crop??[0,0,img.width,img.height];const scale=Math.max(w/sw,h/sh);ctx!.drawImage(img,sx,sy,sw,sh,x+(w-sw*scale)/2,y+h-sh*scale,sw*scale,sh*scale);}
  else{ctx!.fillStyle='#dfcda6';ctx!.beginPath();ctx!.arc(x+w/2,y+h*.33,w*.18,0,Math.PI*2);ctx!.fill();ctx!.beginPath();ctx!.ellipse(x+w/2,y+h*.92,w*.42,h*.39,0,Math.PI,Math.PI*2);ctx!.fill();text('潜力新秀',x+w/2,y+h*.88,25,ink,'center',w-20);}
  ctx!.restore();
  const palettes:Record<string,string[]>={undiscovered:['#858c8d','#e1e2dd','#838e90'],rotation:['#563526','#b87c53','#65402b'],starter:['#718b9a','#fcfff7','#7c929f'],star:['#b97d09','#ffd42a','#fff2a0','#eab00d'],superstar:['#8f2423','#ee795b','#ffc0a0','#b22c28'],legend:['#fa675d','#ffc14c','#a2da59','#40c7bb','#4c9fe8','#a17ce5','#eb77ba','#fa675d']};
  const colors=palettes[tier]??palettes.undiscovered,gradient=tier==='legend'?ctx!.createConicGradient(-Math.PI/2,x+w/2,y+h/2):ctx!.createLinearGradient(x,y,x+w,y+h);
  colors.forEach((color,i)=>gradient.addColorStop(i/(colors.length-1),color));
  ctx!.save();ctx!.beginPath();ctx!.roundRect(x+4,y+4,w-8,h-8,7);ctx!.strokeStyle=gradient;ctx!.lineWidth=9;ctx!.stroke();ctx!.beginPath();ctx!.roundRect(x+10,y+10,w-20,h-20,4);ctx!.strokeStyle=cream;ctx!.lineWidth=1;ctx!.stroke();ctx!.restore();
 }
 function fit(img:HTMLImageElement,x:number,y:number,w:number,h:number){const s=Math.min(w/img.width,h/img.height);ctx!.drawImage(img,x+(w-img.width*s)/2,y+(h-img.height*s)/2,img.width*s,img.height*s);}
 function header(label:string,kicker:string,theme:'standard'|'cap'|'victory'='standard'){
  text('王牌训练师',48,65,26,ink);text('从训练球星开始',852,65,19,ink,'right');
  if(theme==='standard'){
   ctx!.save();ctx!.translate(30,87);ctx!.rotate(-.018);ribbon('',0,0,840,132);ball(70,66,34);text(label,471,92,65,cream,'center',680);ctx!.restore();
  }else{
   const cap=theme==='cap',accent=cap?'#ffd34a':'#e9cd84';
   box(44,88,812,142,cap?'#302b20':'#164e41',accent,5,3);dots(51,95,798,128,cap?'#efb82333':'#7ab68b44',7);
   ctx!.save();ctx!.strokeStyle=accent;ctx!.lineWidth=3;
   // Laurel branches distinguish the championship plaque from the angular MAX plate.
   if(!cap)for(const side of [-1,1]){ctx!.beginPath();ctx!.moveTo(450+side*335,202);ctx!.quadraticCurveTo(450+side*388,153,450+side*338,112);ctx!.stroke();for(let j=0;j<5;j++){ctx!.beginPath();ctx!.ellipse(450+side*(350+Math.sin(j/4*Math.PI)*18),185-j*15,13,5,side*.8,0,Math.PI*2);ctx!.fillStyle=accent;ctx!.fill();}}
   if(cap){const g=ctx!.createLinearGradient(120,100,780,210);g.addColorStop(0,'#b67d13');g.addColorStop(.45,'#fff0a0');g.addColorStop(1,'#e7ad18');ctx!.fillStyle=g;ctx!.beginPath();ctx!.moveTo(104,105);ctx!.lineTo(797,105);ctx!.lineTo(775,213);ctx!.lineTo(82,213);ctx!.closePath();ctx!.fill();text('★',143,176,40,'#594017','center');text('★',754,176,40,'#594017','center');}
   text(label,450,cap?184:180,cap?68:58,cap?'#382b14':accent,'center',cap?560:630);ctx!.restore();
  }
  ctx!.strokeStyle=gold;ctx!.lineWidth=2;ctx!.beginPath();ctx!.moveTo(60,259);ctx!.lineTo(225,259);ctx!.moveTo(675,259);ctx!.lineTo(840,259);ctx!.stroke();text(kicker,450,268,23,ink,'center',430);
 }
 function footer(slogan:string,color=red){ribbon(slogan,48,height-127,804,61,27,color);text('王牌训练师',450,height-38,22,ink,'center');}
 box(0,0,900,height,ink,ink,0);box(13,13,874,height-26,'#e9d5aa',gold,20,3);box(22,22,856,height-44,ink,ink,15);box(29,29,842,height-58,'#f3e3c5',cream,12,2);
 const gradient=ctx.createLinearGradient(0,0,900,height);gradient.addColorStop(0,'#fff5df66');gradient.addColorStop(.55,'#d9b37622');gradient.addColorStop(1,'#fff0c455');ctx.fillStyle=gradient;ctx.fillRect(34,34,832,height-68);
 return {canvas,ctx,box,text,dots,ribbon,ball,panel,portrait,fit,header,footer,blob:()=>new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('海报生成失败')),'image/png'))};
}
export type ComicPoster=ReturnType<typeof comicPoster>;
export function posterStats(p:ComicPoster,stats:Record<string,number>,labels:Record<string,string>,keys:readonly string[],y:number,x=67,w=766){
 const colors=['#c32f23','#d88b24','#b99c2a','#2b8e7d','#2e8fac','#83458d'],gap=10,cw=(w-gap*2)/3;
 keys.forEach((key,i)=>{const xx=x+i%3*(cw+gap),yy=y+Math.floor(i/3)*103;
  p.box(xx,yy,cw,93,'#faedce');p.text(labels[key],xx+12,yy+34,25);p.text(String(stats[key]),xx+cw-12,yy+40,38,red,'right',95);
  p.box(xx+12,yy+59,cw-24,19,'#afb29d',gold,0,1);p.ctx.fillStyle=colors[i];p.ctx.fillRect(xx+13,yy+60,(cw-26)*Math.min(99,stats[key])/99,17);
  p.ctx.strokeStyle='#fff1cb99';p.ctx.lineWidth=1;for(let n=1;n<10;n++){const sx=xx+12+(cw-24)*n/10;p.ctx.beginPath();p.ctx.moveTo(sx,yy+60);p.ctx.lineTo(sx,yy+77);p.ctx.stroke();}
 });
}
