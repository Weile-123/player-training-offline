// Render the game's actual Canvas poster functions with sample data, without posting.
// Preview-only dependency: npm install --prefix .tmp/poster-render --no-save @napi-rs/canvas
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const root=process.cwd(),out=path.join(root,'output/poster-previews-redesign');
await fs.mkdir(out,{recursive:true});
const require=createRequire(path.join(root,'.tmp/poster-render/package.json'));
const {createCanvas,Image,GlobalFonts}=require('@napi-rs/canvas');
GlobalFonts.registerFromPath('C:/Windows/Fonts/msyhbd.ttc','Microsoft YaHei');
const manifest=JSON.parse(await fs.readFile('src/data/runtime-assets.json','utf8'));
const localUrls=new Map(manifest.entries.filter(e=>e.url).map(e=>[e.url,path.join(root,'public',e.path)]));
const cache=new Map(),assetResults=[];
globalThis.Image=class extends Image{
 set src(value){
  const key=String(value);
  let promise=cache.get(key);
  if(!promise){promise=(async()=>{
   if(!/^https?:/.test(key))return fs.readFile(path.join(root,'public',key.replace(/^\.?\//,'')));
   if(localUrls.has(key)){try{return await fs.readFile(localUrls.get(key));}catch{}}
   const response=await fetch(key,{signal:AbortSignal.timeout(4500)});if(!response.ok)throw Error(`HTTP ${response.status}`);return Buffer.from(await response.arrayBuffer());
  })();cache.set(key,promise);}
  void promise.then(data=>{super.src=data;assetResults.push({url:key,status:'loaded'});}).catch(()=>{assetResults.push({url:key,status:'fallback'});this.onerror?.(new Error('image unavailable'));});
 }
};
globalThis.document={fonts:{ready:Promise.resolve()},createElement(tag){
 if(tag!=='canvas')throw Error(`Unexpected element ${tag}`);
 const canvas=createCanvas(900,1320);canvas.toBlob=callback=>{try{callback(new Blob([canvas.toBuffer('image/png')],{type:'image/png'}));}catch{callback(null);}};return canvas;
}};
const entry=`export {generatePoster,playerPosterData,careerPosterData} from './src/presentation/completionPoster'; export {newContract} from './src/game/contract/engine';`;
const bundle=path.join(root,'.tmp/poster-preview-bundle.mjs');
await build({stdin:{contents:entry,resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:bundle,define:{'import.meta.env.DEV':'false','import.meta.env.BASE_URL':'"/"'},loader:{'.css':'empty'}});
const {generatePoster,playerPosterData,careerPosterData,newContract}=await import(pathToFileURL(bundle).href);
const game=newContract(21);game.month=21;game.totalShots=1560;game.delivered='390000000';game.equipment=['relic_001','relic_007','relic_014','relic_027','relic_042','relic_059','relic_068','relic_085'];
const p=game.players[0];Object.assign(p,{templateId:'kevin-love',level:21,peakLevel:21,height:208,shots:86,stats:{three:91,mid:75,drive:60,inside:79,handle:92,defense:37}});
const growth=playerPosterData(game,p);
const cap=playerPosterData(game,{...p,templateId:'curry',level:99,peakLevel:99,height:191,shots:368,stats:{three:99,mid:99,drive:92,inside:78,handle:99,defense:82}});
game.bestPlayer={playerId:p.id,templateId:'curry',value:cap.value,level:99,stats:cap.stats};
const completion=careerPosterData(game),end={...completion,month:27,totalShots:2301,delivered:'1070000000000000000000'};
const specs=[['01-player','球员成长',{kind:'player',player:growth}],['02-career-end','执教战报',{kind:'career-end',record:end}],['03-completion','合同通关',{kind:'completion',record:completion}],['04-level-cap','99级球员',{kind:'cap',player:cap}]];
const images=[];
for(const [name,highPotential] of [['05-rookie',false],['06-high-potential',true]]){const player=playerPosterData(game,{...p,templateId:null,highPotential});const blob=await generatePoster({kind:'player',player});await fs.writeFile(path.join(out,name+'.png'),Buffer.from(await blob.arrayBuffer()));}
for(const [file,label,spec] of specs){
 const blob=await generatePoster(spec),bytes=Buffer.from(await blob.arrayBuffer());await fs.writeFile(path.join(out,file+'.png'),bytes);
 const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=bytes;});images.push({image,label});
}
const board=createCanvas(1840,800),ctx=board.getContext('2d');ctx.fillStyle='#102733';ctx.fillRect(0,0,board.width,board.height);
ctx.font='bold 26px "Microsoft YaHei"';ctx.fillStyle='#fff0cc';ctx.fillText('王牌训练师 · 四类海报实际生成预览（示例数据）',24,40);
for(let i=0;i<images.length;i++){const {image,label}=images[i],x=20+i*455;ctx.font='bold 23px "Microsoft YaHei"';ctx.fillStyle='#fff0cc';ctx.fillText(`${i+1}. ${label}`,x,84);const scale=Math.min(435/image.width,680/image.height);ctx.drawImage(image,x+(435-image.width*scale)/2,102,image.width*scale,image.height*scale);}
await fs.writeFile(path.join(out,'overview.png'),board.toBuffer('image/png'));
await fs.writeFile(path.join(out,'preview-report.json'),JSON.stringify({sampleData:true,renderer:'Actual game generatePoster() using native Canvas for export preview',files:specs.map(([name])=>name+'.png'),assets:assetResults},null,2)+'\n');
console.log(JSON.stringify({output:out,images:4,assetsLoaded:assetResults.filter(r=>r.status==='loaded').length,fallbacks:assetResults.filter(r=>r.status==='fallback').length}));
