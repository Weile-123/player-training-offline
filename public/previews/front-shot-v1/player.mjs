import {settingsFrom,frameIndex,advancePlayback,drawScene,clamp,limits} from './player-core.mjs';

const $=id=>document.getElementById(id),key='basketball.preview.front-shot.controls.v1';
let options=settingsFrom(),data,images,ready=false,playing=false,time=0,lastStamp=null,lastFrame=-1,dirty=true;
try{options=settingsFrom(JSON.parse(localStorage.getItem(key)||'{}'));}catch{/* Preview works without storage. */}
const panels=[...document.querySelectorAll('canvas[data-kind]')].map(canvas=>({canvas,ctx:canvas.getContext('2d'),kind:canvas.dataset.kind}));
function save(){try{localStorage.setItem(key,JSON.stringify(options));}catch{/* Session-only settings. */}}
function syncOptions(){
 $('speed').value=options.speed;$('speed-number').value=Number(options.speed.toFixed(2));
 $('size').value=Math.round(options.ballScale*100);$('size-number').value=Math.round(options.ballScale*100);
 $('speed-label').textContent=options.speed.toFixed(2)+'×';$('size-label').textContent=Math.round(options.ballScale*100)+'%';
 $('loop').checked=options.loop;
 $('cycle').textContent=data?(data.durationMs/options.speed/1000).toFixed(2)+' 秒 / 轮':'—';
}
function syncPlay(){
 $('play').textContent=playing?'暂停':'播放';$('play').setAttribute('aria-label',playing?'暂停全部动画':'播放全部动画');
 $('play').setAttribute('aria-pressed',String(playing));
}
function editOption(name,input,divisor=1){
 if(input.value.trim()==='')return;
 const n=Number(input.value)/divisor;if(!Number.isFinite(n))return;
 options[name]=clamp(n,...limits[name]);dirty=true;syncOptions();save();
}
for(const id of ['speed','speed-number']){
 $(id).addEventListener(id==='speed'?'input':'change',e=>editOption('speed',e.target));
}
for(const id of ['size','size-number']){
 $(id).addEventListener(id==='size'?'input':'change',e=>editOption('ballScale',e.target,100));
}
document.querySelectorAll('[data-speed]').forEach(button=>button.addEventListener('click',()=>{options.speed=Number(button.dataset.speed);syncOptions();save();}));
$('loop').addEventListener('change',e=>{options.loop=e.target.checked;save();});
$('play').addEventListener('click',()=>{if(!ready)return;if(time>=data.durationMs)time=0;playing=!playing;lastStamp=null;dirty=true;syncPlay();});
$('replay').addEventListener('click',()=>{if(!ready)return;time=0;playing=true;lastStamp=null;dirty=true;syncPlay();});
$('reset').addEventListener('click',()=>{options=settingsFrom();time=0;dirty=true;lastStamp=null;syncOptions();save();});
$('seek').addEventListener('input',e=>{if(!ready)return;time=Number(e.target.value);playing=false;lastStamp=null;dirty=true;syncPlay();});
function step(direction){
 if(!ready)return;playing=false;lastStamp=null;
 const frames=data.outcomes.great.frames,i=frameIndex(frames,time);
 const target=clamp(i+direction,0,frames.length-1);
 time=target===0?0:frames[target-1].endMs;dirty=true;syncPlay();
}
$('prev').addEventListener('click',()=>step(-1));$('next').addEventListener('click',()=>step(1));
document.addEventListener('visibilitychange',()=>{lastStamp=null;});
function tick(stamp){
 if(ready){
  if(playing&&!document.hidden&&lastStamp!==null){
   const result=advancePlayback(time,stamp-lastStamp,{...options,duration:data.durationMs});
   time=result.time;if(result.ended){playing=false;syncPlay();}
  }
  lastStamp=stamp;
  const index=frameIndex(data.outcomes.great.frames,time);
  if(index!==lastFrame||dirty){
   for(const {ctx,kind} of panels)drawScene(ctx,images,data.outcomes[kind].frames[index],options.ballScale,data.width,data.height);
   $('frame').textContent=(index+1)+' / '+data.outcomes.great.frames.length+' 帧';
   lastFrame=index;dirty=false;
  }
  // Progress keeps advancing during the final held frame and reaches the end
  // even though the canvas does not need another paint.
  $('seek').value=time;$('time').textContent=(time/1000).toFixed(2)+' / '+(data.durationMs/1000).toFixed(2)+' 秒';
 }
 requestAnimationFrame(tick);
}
function loadImage(src){return new Promise((resolve,reject)=>{const image=new Image();image.crossOrigin='anonymous';image.referrerPolicy='no-referrer';image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('素材加载失败：'+src));image.src=src;});}
async function start(){
 try{
  const urls={"court":"https://i2.hoopchina.com.cn/shaper-img/e862351c279570c0778d6606793311a8.png","ball":"https://i3.hoopchina.com.cn/shaper-img/837feb2881f12ee25440c34c84498f54.png","net":"https://i1.hoopchina.com.cn/shaper-img/13995295312b95ef33768af322706f71.png","rim":"https://i5.hoopchina.com.cn/shaper-img/cd81a8030cc0a4d2edecb8d317ab4cbe.png"};
  const [timeline,loaded]=await Promise.all([
   fetch('../../art/shot/player-data.json',{referrerPolicy:'no-referrer'}).then(r=>{if(!r.ok)throw new Error('动画数据加载失败');return r.json();}),
   Promise.all(Object.entries(urls).map(async([name,url])=>[name,await loadImage(url)])),
  ]);
  if(panels.some(p=>!p.ctx))throw new Error('当前浏览器不支持画布预览');
  data=timeline;images=Object.fromEntries(loaded);ready=true;
  $('seek').max=data.durationMs;document.querySelectorAll('[data-needs-assets]').forEach(el=>el.disabled=false);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  playing=!reduced;$('status').textContent=reduced?'已加载，点击播放开始预览。':'已加载，五个结果同步播放。';
  syncOptions();syncPlay();requestAnimationFrame(tick);
 }catch(error){$('status').textContent=error.message+'。请刷新重试，检查网络连接。';$('status').classList.add('error');}
}
syncOptions();syncPlay();start();
