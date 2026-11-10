import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {settingsFrom,frameIndex,advancePlayback,drawScene} from '../src/presentation/shotRenderer.js';
const data=JSON.parse(readFileSync(new URL('../public/art/shot/player-data.json',import.meta.url),'utf8'));

test('speed changes elapsed playback without resetting progress; loop and stop remain correct',()=>{
 assert.deepEqual(advancePlayback(500,200,{speed:2,loop:true,duration:3930}),{time:900,ended:false});
 assert.deepEqual(advancePlayback(500,200,{speed:.25,loop:true,duration:3930}),{time:550,ended:false});
 assert.deepEqual(advancePlayback(3900,100,{speed:1,loop:true,duration:3930}),{time:70,ended:false});
 assert.deepEqual(advancePlayback(3900,100,{speed:1,loop:false,duration:3930}),{time:3930,ended:true});
});
test('bad or old saved preferences fall back safely and extreme inputs are bounded',()=>{
 assert.deepEqual(settingsFrom(null),{speed:1,ballScale:1,loop:true});
 assert.deepEqual(settingsFrom({speed:Infinity,ballScale:NaN,loop:'no'}),settingsFrom());
 assert.deepEqual(settingsFrom({speed:100,ballScale:-5,loop:false}),{speed:4,ballScale:.25,loop:false});
});
test('seeking selects the exact GIF frame boundary and the final invisible frame',()=>{
 for(const {frames} of Object.values(data.outcomes)){
  assert.equal(frameIndex(frames,0),0);
  for(let i=0;i<frames.length-1;i++){
   assert.equal(frameIndex(frames,frames[i].endMs-.01),i);
   assert.equal(frameIndex(frames,frames[i].endMs),i+1);
  }
  assert.equal(frames[frameIndex(frames,data.durationMs)].alpha,0);
 }
});
function render(frame,scale){
 const calls=[];
 const ctx={clearRect(){},save(){},restore(){},translate(){},rotate(){},scale(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},stroke(){},fill(){},fillRect(){},fillText(){},createRadialGradient(){return {addColorStop(){}};},drawImage(image,...args){calls.push([image.id,...args]);}};
 const images=Object.fromEntries(['court','net','green','rim','ball','particles'].map(id=>[id,{id,width:200,height:60}]));
 drawScene(ctx,images,frame,scale);
 return calls;
}
test('changing basketball size leaves background, hoop and trajectory coordinates alone',()=>{
 const frame=data.outcomes.great.frames[20];
 const normal=render(frame,1),large=render(frame,2);
 assert.deepEqual(normal.filter(c=>c[0]!=='ball'),large.filter(c=>c[0]!=='ball'));
 const a=normal.find(c=>c[0]==='ball'),b=large.find(c=>c[0]==='ball');
 assert.equal(b[3],a[3]*2);assert.equal(b[4],a[4]*2);
 assert.equal(frame.x,data.outcomes.great.frames[20].x);
});
test('near ball draws over the hoop; entering ball draws behind net; invisible ball never draws',()=>{
 const frames=data.outcomes.great.frames;
 for(const f of frames.filter(f=>f.alpha>0)){
  const calls=render(f,1).map(c=>c[0]);
  if(f.occluded)assert.ok(calls.indexOf('ball')<calls.indexOf('net'));
  else assert.ok(calls.indexOf('ball')>calls.indexOf('rim'));
 }
 assert.ok(!render(frames.at(-1),2.5).some(c=>c[0]==='ball'));
});

test('success stays on the center line and rebounds exactly once before entry',()=>{
 const frames=data.outcomes.success.frames;
 assert.ok(frames.every(f=>f.x===360));
 const bounce=frames.slice(41,57);
 assert.ok(bounce[1].y<bounce[0].y);
 assert.ok(bounce.at(-1).y>bounce.at(-2).y);
 const turns=bounce.slice(1,-1).filter((f,i)=>f.y<bounce[i].y&&f.y<bounce[i+2].y);
 assert.equal(turns.length,1);
});

test('great keeps a cream net and emits a brief accent only after entering',()=>{
 const frames=data.outcomes.great.frames;
 assert.ok(frames.every(f=>f.netGreen===0));
 assert.ok(frames.slice(0,45).every(f=>f.strokes.length===0));
 assert.ok(frames.slice(46,59).some(f=>f.strokes.length>0));
 assert.ok(frames.slice(61).every(f=>f.strokes.length===0));
});

test('injuries stay short of the basket, fade at ground, settle camera, and retain synchronized timing',()=>{
 assert.deepEqual(Object.keys(data.outcomes).sort(),['great','hold','minor','severe','success']);
 for(const kind of ['minor','severe']){
  const frames=data.outcomes[kind].frames;
  assert.ok(frames.every(f=>f.y>290&&!f.occluded&&f.netHeight===71));
  assert.ok(frames.some(f=>f.label?.text.includes(kind==='minor'?'仍可继续':'训练终止')));
  assert.ok(frames.some(f=>f.camera.zoom>1));
  const last=frames.at(-1);
  assert.equal(last.alpha,0);assert.equal(last.endMs,data.durationMs);
  assert.equal(last.label,null);assert.equal(last.camera.zoom,1);
  assert.ok(Math.abs(last.camera.x)<.001&&Math.abs(last.camera.y)<.001);
  const fading=frames.findIndex(f=>f.alpha<1);
  for(let i=fading;i<frames.length-1;i++)assert.ok(frames[i+1].alpha<=frames[i].alpha);
  for(const f of frames)render(f,1);
 }
});
