// Presentation-only fire: all coordinates share the shot camera and court projection.
export function stepHeat(level,active,delta,reduced=false){
 if(reduced)return active?1:0;
 return active?Math.min(1,level+Math.max(0,delta)/420):Math.max(0,level-Math.max(0,delta)/760);
}
export function drawHeatCourt(ctx,view,heat,hoopScale){
 if(!heat||heat.level<=0)return;
 const {x,y}=view,level=heat.level,time=heat.reduced?0:heat.time/1000;
 ctx.save();ctx.globalCompositeOperation='screen';
 // Warm reflected pool under the basket, without replacing the original court texture.
 ctx.save();ctx.translate(x(360),y(454));ctx.scale(1,.26);
 const glow=ctx.createRadialGradient(0,0,8,0,0,300*hoopScale);
 glow.addColorStop(0,`rgba(255,109,12,${.42*level})`);glow.addColorStop(.55,`rgba(255,60,4,${.19*level})`);glow.addColorStop(1,'rgba(255,60,4,0)');
 ctx.fillStyle=glow;ctx.fillRect(-330,-330,660,660);ctx.restore();
 // Broken reflections follow the ground plane, leaving existing painted lines intact.
 for(let i=0;i<26;i++){
  const px=x(130+(i*83)%460),py=y(388+(i*29)%142),len=(8+(i*17)%52)*hoopScale;
  ctx.globalAlpha=level*(.06+(i%4)*.025);ctx.strokeStyle=i%3?'#ff7e19':'#ffc15e';ctx.lineWidth=(i%2+1)*hoopScale;
  ctx.beginPath();ctx.moveTo(px-len/2,py);ctx.lineTo(px+len/2,py);ctx.stroke();
 }
 ctx.globalAlpha=1;
 const left=x(260),top=y(26),w=x(460)-left,h=y(145)-top;
 ctx.shadowColor='#ff6b16';ctx.shadowBlur=12*level;ctx.strokeStyle=`rgba(255,175,58,${level*.9})`;ctx.lineWidth=3*hoopScale;ctx.strokeRect(left,top,w,h);
 ctx.shadowBlur=0;
 if(heat.images?.board){
  const fw=w/.8,fh=h/.6;
  ctx.globalAlpha=level*(.91+.07*Math.sin(time*8));
  ctx.drawImage(heat.images.board,left-fw*.1,top-fh*.30,fw,fh);
 }
 if(!heat.reduced){
  // Stable visual seeds, independent of the gameplay random stream.
  for(let i=0;i<32;i++){
   const life=(time*(.18+(i%5)*.018)+i*.618)%1;
   const px=x(70+(i*137)%580)+Math.sin(time*1.4+i)*9*hoopScale;
   const py=y(510-life*(i%3===0?490:330));
   const alpha=Math.sin(life*Math.PI)*level*(.5+(i%3)*.15);
   ctx.globalAlpha=alpha;ctx.fillStyle=i%3?'#ff8326':'#ffe7a4';ctx.shadowColor='#ff6c14';ctx.shadowBlur=6;
   ctx.beginPath();ctx.ellipse(px,py,(i%2+1)*hoopScale,(i%3+2)*hoopScale,.45,0,Math.PI*2);ctx.fill();
  }
 }
 ctx.restore();
}
export function drawHeatBall(ctx,heat,radius){
 if(!heat||heat.level<=0)return;
 ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha*=heat.level;
 const g=ctx.createRadialGradient(0,0,radius*.65,0,0,radius*1.65);
 g.addColorStop(0,'#ff8b1700');g.addColorStop(.65,'#ff731866');g.addColorStop(1,'#ff3c0000');
 ctx.fillStyle=g;ctx.fillRect(-radius*1.7,-radius*1.7,radius*3.4,radius*3.4);
 if(heat.images?.ball){
  const s=radius*3.25,pulse=heat.reduced?1:1+Math.sin(heat.time/1000*7)*.02;
  ctx.globalAlpha*=.85;ctx.drawImage(heat.images.ball,-s*.5*pulse,-s*.58*pulse,s*pulse,s*pulse);
 }
 ctx.restore();
}
