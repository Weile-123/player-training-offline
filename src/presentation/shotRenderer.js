import {drawHeatCourt,drawHeatBall} from './heatRenderer.js';
export const limits={speed:[.1,4],ballScale:[.25,2.5]};
export function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
export function settingsFrom(value={}){
 const number=(key,fallback)=>typeof value?.[key]==='number'&&Number.isFinite(value[key])?clamp(value[key],...limits[key]):fallback;
 return {speed:number('speed',1),ballScale:number('ballScale',1),loop:typeof value?.loop==='boolean'?value.loop:true};
}
export function frameIndex(frames,timeMs){
 let lo=0,hi=frames.length-1;
 while(lo<hi){const mid=(lo+hi)>>1;if(timeMs<frames[mid].endMs)hi=mid;else lo=mid+1;}
 return lo;
}
export function advancePlayback(time,delta,{speed,loop,duration}){
 const next=time+Math.max(0,delta)*speed;
 return loop?{time:next%duration,ended:false}:{time:Math.min(next,duration),ended:next>=duration};
}
export function drawScene(ctx,images,f,ballScale,width=720,height=540,hoopScale=1){
 drawMultiScene(ctx,images,[f],ballScale,width,height,hoopScale);
}
// Stretch only the decorative edges, leaving the hoop/skyline and ball shapes intact.
export function sceneProjection(width,height,hoopScale=1){
 const scale=Math.min(width/720,height/540),w=width/scale,h=height/scale;
 const extraX=Math.max(0,w-720)/2,extraY=Math.max(0,h-540)/2;
 const map=(value,start,end,full,extra,anchor)=>{
  const first=start+extra+(anchor-start)*(1-hoopScale),last=end+extra-(end-anchor)*(1-hoopScale);
  return value<start?value*first/start:value<=end?first+(value-start)*hoopScale:last+(value-end)*(full+extra*2-last)/(full-end);
 };
 return {scale,width:w,height:h,extraX,extraY,
  x:value=>map(value,100,620,720,extraX,360),y:value=>map(value,24,420,540,extraY,112)};
}
export function drawMultiScene(ctx,images,frames,ballScale,width=720,height=540,hoopScale=1,heat=null){
 const view=sceneProjection(width,height,hoopScale),x=view.x,y=view.y;
 // A single background/net; all independent balls stay visible in depth order.
 const dominant=frames.reduce((best,f)=>{
  const weight=x=>(x?.vignette||0)*10+Math.abs(x?.camera?.angle||0)+(x?.camera?.zoom||1)-1;
  return weight(f)>=weight(best)?f:best;
 },null);
 const f={camera:dominant?.camera,vignette:Math.max(0,...frames.map(f=>f.vignette||0)),
  netHeight:frames.length?Math.max(...frames.map(f=>f.netHeight)):71,netGreen:Math.max(0,...frames.map(f=>f.netGreen||0)),
  strokes:frames.flatMap(f=>f.strokes||[]),
  label:[...frames].reverse().find(f=>f.label?.text.includes('重伤'))?.label||[...frames].reverse().find(f=>f.label)?.label};
 ctx.clearRect(0,0,width,height);
 ctx.save();ctx.scale(view.scale,view.scale);
 width=view.width;height=view.height;
 ctx.save();
 const camera=f.camera;
 if(camera){
  ctx.translate(width/2+camera.x,height/2+camera.y);ctx.rotate(camera.angle*Math.PI/180);
  ctx.scale(camera.zoom,camera.zoom);ctx.translate(-width/2,-height/2);
 }
 if(view.extraX<.001&&view.extraY<.001&&hoopScale===1)ctx.drawImage(images.court,0,0,720,540);
 else{
  // Nine contiguous slices from ONE scene: no second hoop or repeated tiles.
  const xs=[0,100,620,720],ys=[0,24,420,540];
  const sourceX=(images.court.naturalWidth||images.court.width)/720,sourceY=(images.court.naturalHeight||images.court.height)/540;
  for(let row=0;row<3;row++)for(let col=0;col<3;col++){
   const left=xs[col],top=ys[row],right=xs[col+1],bottom=ys[row+1];
   ctx.drawImage(images.court,left*sourceX,top*sourceY,(right-left)*sourceX,(bottom-top)*sourceY,x(left),y(top),x(right)-x(left),y(bottom)-y(top));
  }
 }
 drawHeatCourt(ctx,view,heat,hoopScale);
 const net=()=>{
  ctx.drawImage(images.net,x(316),y(112),89*hoopScale,f.netHeight*hoopScale);
  if(f.netGreen>0){ctx.save();ctx.globalAlpha=f.netGreen;ctx.drawImage(images.green,x(316),y(112),89*hoopScale,f.netHeight*hoopScale);ctx.restore();}
  ctx.drawImage(images.rim,x(360)-360*hoopScale,y(112)-112*hoopScale,720*hoopScale,540*hoopScale);
 };
 const ball=f=>{if(f.alpha>0){
  const diameter=2*f.radius*ballScale*hoopScale;
  ctx.save();ctx.globalAlpha=f.alpha;ctx.translate(x(f.x),y(f.y));
  drawHeatBall(ctx,heat,diameter/2);
  // Canvas positive angles are clockwise; Pillow GIF rotations are counterclockwise.
  ctx.rotate(-f.rotation*Math.PI/180);
  ctx.drawImage(images.ball,-diameter/2,-diameter/2,diameter,diameter);ctx.restore();
 }};
 const visible=[...frames].sort((a,b)=>a.radius-b.radius);
 visible.filter(f=>f.occluded).forEach(ball);
 net();
 visible.filter(f=>!f.occluded).forEach(ball);
 for(const frame of frames)if(frame.particles){
  const {width:w,alpha}=frame.particles,h=w*images.particles.height/images.particles.width;
  ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(images.particles,x(360)-w/2,y(165)-h/2,w,h);ctx.restore();
 }
 ctx.restore();
 if(f.vignette){
  ctx.save();ctx.translate(width/2,height/2);ctx.scale(width/2,height/2);
  const shade=ctx.createRadialGradient(0,0,.38,0,0,1.1);
  shade.addColorStop(0,'rgba(16,3,5,0)');shade.addColorStop(1,`rgba(16,3,5,${f.vignette})`);
  ctx.fillStyle=shade;ctx.fillRect(-1,-1,2,2);ctx.restore();
 }
 for(const stroke of f.strokes||[]){
  ctx.save();ctx.globalAlpha=stroke.alpha;ctx.strokeStyle=stroke.color;
  ctx.lineWidth=stroke.width;ctx.lineJoin='round';ctx.beginPath();
  stroke.points.forEach(([px,py],i)=>i?ctx.lineTo(x(px),y(py)):ctx.moveTo(x(px),y(py)));ctx.stroke();ctx.restore();
 }
 if(f.label){
  ctx.save();ctx.globalAlpha=f.label.alpha;ctx.fillStyle='#101a20';ctx.strokeStyle=f.label.color;ctx.lineWidth=1;
  ctx.translate(x(360)-360,y(459)-459);
  ctx.beginPath();ctx.moveTo(206,437);ctx.lineTo(521,437);ctx.lineTo(514,482);ctx.lineTo(199,482);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.font='bold 22px "Microsoft YaHei", sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=f.label.color;
  ctx.fillText(f.label.text,360,459);ctx.restore();
 }
 ctx.restore();
}
