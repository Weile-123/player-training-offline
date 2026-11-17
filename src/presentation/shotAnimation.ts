import {assetUrl} from './assetUrls';
import { frameIndex, type ShotImages, type ShotFrame, type ShotTimeline } from './shotRenderer.js';
import type { Outcome } from '../game/types';
import packagedTimeline from '../../public/art/shot/player-data.json';

export const shotArt=(name:string)=>assetUrl(`art/shot/${name}`);
export const shotPlayback={duration:3430,ballScale:1,width:720,height:540} as const;
let cached:Promise<{timeline:ShotTimeline;images:ShotImages}>|null=null;
export function loadShotAnimation(){
 if(!cached){
  const image=(file:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{
   const img=new Image(),timer=setTimeout(()=>reject(new Error('投篮画面加载超时')),8000);
   // WebView may fire load before its decoded bitmap is available to drawImage.
   // Idle scenes only paint once, so wait for decoding before exposing the canvas.
   img.onload=()=>{void (typeof img.decode==='function'?img.decode():Promise.resolve()).then(()=>{clearTimeout(timer);resolve(img);},error=>{clearTimeout(timer);reject(error);});};img.onerror=()=>{clearTimeout(timer);reject(new Error('投篮画面加载失败'));};img.src=shotArt(file);
  });
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  cached=Promise.all([
   (import.meta.env.PROD?Promise.resolve(packagedTimeline as ShotTimeline):fetch(shotArt('player-data.json'),{signal:controller.signal}).then(async response=>{
    if(!response.ok)throw new Error('投篮动作加载失败');
    const timeline:ShotTimeline=await response.json();
    if(timeline.width!==720||timeline.height!==540||['great','success','hold','minor','severe'].some(k=>!timeline.outcomes[k as keyof typeof timeline.outcomes]?.frames?.length))throw new Error('投篮动作数据不完整');
    return timeline;
   })),
   Promise.all([image('court-clean.png'),image('ball.png'),image('net.png'),image('rim-front.png')]),
  ]).then(([timeline,[court,ball,net,rim]])=>({timeline,images:{court,ball,net,rim}})).catch(error=>{cached=null;throw error;}).finally(()=>clearTimeout(timer));
 }
 return cached;
}

export function spawnScale(elapsed:number){
 if(elapsed>=190)return 1;
 if(elapsed<=75)return .86+.32*Math.sin(Math.max(0,elapsed)/75*Math.PI/2);
 return 1+.18*(1-(elapsed-75)/115)**2;
}
type ShotEvent={id:number;outcome:Outcome};
/** Each shot owns its own age. One shared court is composed around all balls. */
export class ConcurrentShots {
 private active=new Map<number,ShotEvent&{elapsed:number}>();
 private completed=new Set<number>();
 sync(events:readonly ShotEvent[]){
  const ids=new Set(events.map(e=>e.id));
  for(const id of this.active.keys())if(!ids.has(id))this.active.delete(id);
  for(const id of this.completed)if(!ids.has(id))this.completed.delete(id);
  for(const event of events)if(!this.active.has(event.id)&&!this.completed.has(event.id))this.active.set(event.id,{...event,elapsed:0});
 }
 step(delta:number,speed:number,timeline:ShotTimeline){
  const frames:ShotFrame[]=[],finished:number[]=[];
  for(const [id,shot] of this.active){
   shot.elapsed+=Math.max(0,delta)*speed;
   if(shot.elapsed>=shotPlayback.duration){this.active.delete(id);this.completed.add(id);finished.push(id);continue;}
   const samples=timeline.outcomes[shot.outcome].frames,frame=samples[frameIndex(samples,shot.elapsed)];
   const scale=spawnScale(shot.elapsed);
   frames.push(scale===1?frame:{...frame,radius:frame.radius*scale});
  }
  return {frames,finished};
 }
}

