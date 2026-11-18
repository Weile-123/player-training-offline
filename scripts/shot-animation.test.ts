import { describe,it,expect,vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { shotPlayback,loadShotAnimation,ConcurrentShots,spawnScale,sampleShotFrame } from '../src/presentation/shotAnimation';
import {drawMultiScene,sceneProjection} from '../src/presentation/shotRenderer.js';
import type { ShotTimeline } from '../src/presentation/shotRenderer.js';
const timeline:ShotTimeline=JSON.parse(readFileSync('public/art/shot/player-data.json','utf8'));
describe('approved front-shot animation in gameplay',()=>{
 it('ships five complete non-looping outcomes in the production animation data',()=>{
  expect(timeline.width).toBe(720);expect(timeline.height).toBe(540);
  expect(Object.keys(timeline.outcomes).sort()).toEqual(['great','hold','minor','severe','success']);
  for(const frames of Object.values(timeline.outcomes).map(x=>x.frames)){
   expect(frames.at(-1)?.alpha).toBe(0);expect(frames.at(-1)?.endMs).toBe(shotPlayback.duration+500);
  }
 });
 it.each(['great','success','hold','minor','severe'] as const)('%s completes only once and stays invisible',kind=>{
  const group=new ConcurrentShots();group.sync([{id:1,outcome:kind}]);
  expect(group.step(1500,1,timeline).finished).toEqual([]);
  const final=group.step(shotPlayback.duration-1500,1,timeline);
  expect(final.finished).toEqual([1]);expect(final.frames).toEqual([]);
  expect(group.step(10000,1,timeline).finished).toEqual([]);
 });
 it('heavy injury darkens edges with red/black strokes, then clears them before the sale result',()=>{
  const frames=timeline.outcomes.severe.frames;
  expect(Math.max(...frames.map(f=>f.vignette))).toBeGreaterThan(.8);
  expect(frames.some(f=>f.strokes.some(s=>s.width===26&&s.color==='#080b10'))).toBe(true);
  expect(frames.some(f=>f.label?.text==='重伤 · 训练终止')).toBe(true);
  expect(frames.at(-1)?.vignette).toBe(0);expect(frames.at(-1)?.label).toBeNull();
 });
 it('asset failures reject promptly and can be retried without caching a failed load',async()=>{
  const fetcher=vi.fn().mockResolvedValue({ok:false});
  vi.stubGlobal('fetch',fetcher);
  vi.stubGlobal('Image',class {onerror=()=>{};set src(_value:string){queueMicrotask(()=>this.onerror());}});
  try{await expect(loadShotAnimation()).rejects.toThrow();await expect(loadShotAnimation()).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(2);}
  finally{vi.unstubAllGlobals();}
 });
});

describe('concurrent basketball playback',()=>{
 it('interpolates recorded ball poses without changing keyframe timing or net occlusion',()=>{
  const frames=timeline.outcomes.success.frames,index=8,start=frames[index-1].endMs,end=frames[index].endMs;
  const current=frames[index],next=frames[index+1],middle=sampleShotFrame(frames,(start+end)/2);
  expect(sampleShotFrame(frames,start)).toBe(current);
  expect(middle.x).toBeCloseTo((current.x+next.x)/2);expect(middle.y).toBeCloseTo((current.y+next.y)/2);
  expect(middle.radius).toBeCloseTo((current.radius+next.radius)/2);expect(middle.occluded).toBe(current.occluded);
  expect(sampleShotFrame(frames,end)).toBe(next);
 });
 it('retains all batched clicks and leaves an older ball at its original flight position',()=>{
  const group=new ConcurrentShots();group.sync([{id:1,outcome:'success'}]);
  const first=group.step(600,1,timeline).frames[0];
  group.sync([{id:1,outcome:'success'},{id:2,outcome:'great'},{id:3,outcome:'hold'}]);
  const next=group.step(0,1,timeline);
  expect(next.frames).toHaveLength(3);expect(next.frames[0]).toEqual(first);
  expect(next.frames[1].y).toBe(500);expect(next.frames[2].y).toBe(500);
  const advanced=group.step(300,1,timeline);
  expect(advanced.frames).toHaveLength(3);expect(advanced.frames[0].y).not.toBe(first.y);
 });
 it('applies speed to future elapsed time without resetting any shot',()=>{
  const group=new ConcurrentShots();group.sync([{id:1,outcome:'success'}]);group.step(500,1,timeline);
  const frames=group.step(200,2,timeline).frames;
  const reference=new ConcurrentShots();reference.sync([{id:1,outcome:'success'}]);
  expect(frames).toEqual(reference.step(900,1,timeline).frames);
  group.sync([{id:1,outcome:'success'},{id:2,outcome:'great'}]);
  expect(group.step(0,.1,timeline).frames[0]).toEqual(frames[0]);
  expect(group.step(500,.1,timeline).finished).toEqual([]);
 });
 it('finishes balls individually, does not replay pending React events, and clears on departure',()=>{
  const group=new ConcurrentShots();const events=[{id:1,outcome:'success' as const},{id:2,outcome:'great' as const}];
  group.sync(events.slice(0,1));group.step(1000,1,timeline);group.sync(events);
  expect(group.step(2430,1,timeline).finished).toEqual([1]);
  group.sync(events);expect(group.step(0,1,timeline).frames).toHaveLength(1);
  expect(group.step(1000,1,timeline).finished).toEqual([2]);
  expect(group.step(1000,1,timeline).finished).toEqual([]);
  group.sync([]);expect(group.step(1,1,timeline).frames).toHaveLength(0);
 });
 it('pops each new ball above normal size and settles before release',()=>{
  expect(spawnScale(0)).toBeLessThan(1);expect(spawnScale(75)).toBeCloseTo(1.18);
  expect(spawnScale(150)).toBeGreaterThan(1);expect(spawnScale(190)).toBe(1);expect(spawnScale(500)).toBe(1);
 });
 it('draws one court and net with both entering and foreground balls visible',()=>{
  const calls:string[]=[];
  const ctx={clearRect(){},save(){},restore(){},translate(){},rotate(){},scale(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){},fill(){},fillRect(){},fillText(){},createRadialGradient(){return {addColorStop(){}};},drawImage(image:{id:string}){calls.push(image.id);}};
  const images=Object.fromEntries(['court','net','rim','ball'].map(id=>[id,{id}]));
  const entering=timeline.outcomes.great.frames.find(f=>f.occluded&&f.alpha>0)!;
  const front=timeline.outcomes.success.frames[10];
  drawMultiScene(ctx as unknown as CanvasRenderingContext2D,images as never,[entering,front],1);
  expect(calls.filter(x=>x==='court')).toHaveLength(1);expect(calls.filter(x=>x==='net')).toHaveLength(1);
  expect(calls.filter(x=>x==='ball')).toHaveLength(2);
  expect(calls.indexOf('ball')).toBeLessThan(calls.indexOf('net'));expect(calls.lastIndexOf('ball')).toBeGreaterThan(calls.indexOf('rim'));
 });
});

describe('responsive court projection',()=>{
 it('reuses a full-resolution court raster and refreshes it when size or hoop scale changes',()=>{
  const sourceDraw=vi.fn(),surfaces:{width:number;height:number;getContext:()=>unknown}[]=[];
  vi.stubGlobal('document',{});
  vi.stubGlobal('OffscreenCanvas',class {
   width:number;height:number;
   constructor(width:number,height:number){this.width=width;this.height=height;surfaces.push(this);}
   getContext(){return {scale(){},drawImage:sourceDraw};}
  });
  const ctx={clearRect(){},save(){},restore(){},scale(){},drawImage:vi.fn()};
  const images={court:{width:1448,height:1086},net:{},rim:{},ball:{}};
  try{
   drawMultiScene(ctx as never,images as never,[],1,780,680);
   drawMultiScene(ctx as never,images as never,[],1,780,680);
   expect(sourceDraw).toHaveBeenCalledTimes(9);expect(surfaces).toHaveLength(1);
   expect(surfaces[0]).toMatchObject({width:780,height:680});
   expect(ctx.drawImage.mock.calls[0]).toEqual([surfaces[0],0,0,720,680/(780/720)]);
   drawMultiScene(ctx as never,images as never,[],1,780,700);
   drawMultiScene(ctx as never,images as never,[],1,780,700,.85);
   expect(surfaces).toHaveLength(3);expect(sourceDraw).toHaveBeenCalledTimes(27);
  }finally{vi.unstubAllGlobals();}
 });
 it.each([[320,600],[640,330],[900,500]])('keeps a smaller hoop and animated ball aligned across %sx%s', (width,height)=>{
  const scale=.85,view=sceneProjection(width,height,scale);
  expect(view.x(720)*view.scale).toBeCloseTo(width);expect(view.y(540)*view.scale).toBeCloseTo(height);
  expect(view.x(405)-view.x(316)).toBeCloseTo(89*scale);
  expect(view.y(183)-view.y(112)).toBeCloseTo(71*scale);
  expect(view.x(360)).toBeCloseTo(360+view.extraX);expect(view.y(112)).toBeCloseTo(112+view.extraY);
  const calls:{id:string;args:number[]}[]=[];
  const ctx={clearRect(){},save(){},restore(){},scale(){},translate(){},rotate(){},drawImage(image:{id:string},...args:number[]){calls.push({id:image.id,args});}};
  const frame={...timeline.outcomes.great.frames[0],camera:{x:0,y:0,angle:0,zoom:1},vignette:0,strokes:[],label:null};
  const images=Object.fromEntries(['court','net','rim','ball'].map(id=>[id,{id,width:1448,height:1086}]));
  drawMultiScene(ctx as unknown as CanvasRenderingContext2D,images as never,[frame],1,width,height,scale);
  expect(calls.find(c=>c.id==='net')?.args.slice(2)).toEqual([89*scale,frame.netHeight*scale]);
  expect(calls.find(c=>c.id==='rim')?.args.slice(2)).toEqual([720*scale,540*scale]);
  expect(calls.find(c=>c.id==='ball')?.args.slice(2)).toEqual([2*frame.radius*scale,2*frame.radius*scale]);
 });
 it.each([[320,600],[390,340],[500,1100],[768,440],[900,500],[460,390]])('fills %sx%s without repeating or cropping the central hoop', (width,height)=>{
  const view=sceneProjection(width,height);
  expect(view.x(0)).toBe(0);expect(view.y(0)).toBe(0);
  expect(view.x(720)*view.scale).toBeCloseTo(width);expect(view.y(540)*view.scale).toBeCloseTo(height);
  expect(view.x(620)-view.x(100)).toBe(520);expect(view.y(420)-view.y(24)).toBe(396);
  // Net and front rim retain the exact same projection as the background hoop.
  expect(view.x(316)).toBe(316+view.extraX);expect(view.y(112)).toBe(112+view.extraY);
  expect(view.y(540)*view.scale).toBeCloseTo(height);
 });
 it('samples the entire high-resolution source once, using contiguous regions',()=>{
  const draws:number[][]=[];
  const court={id:'court',width:1448,height:1086};
  const ctx={clearRect(){},save(){},restore(){},scale(){},drawImage(image:unknown,...args:number[]){if(image===court)draws.push(args);}};
  drawMultiScene(ctx as unknown as CanvasRenderingContext2D,{court,net:{},rim:{},ball:{}} as never,[],1,390,600);
  expect(draws).toHaveLength(9);
  const sourceArea=draws.reduce((sum,rect)=>sum+rect[2]*rect[3],0);
  expect(sourceArea).toBeCloseTo(1448*1086);
  expect(Math.max(...draws.map(r=>r[0]+r[2]))).toBeCloseTo(1448);
  expect(Math.max(...draws.map(r=>r[1]+r[3]))).toBeCloseTo(1086);
 });
});
