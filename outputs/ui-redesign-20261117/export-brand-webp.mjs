import {writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium} = await import(pathToFileURL(resolve(dirname(process.execPath), '../node_modules/playwright/index.mjs')).href);
const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {
 const page = await browser.newPage();
 await page.goto('http://127.0.0.1:8800/outputs/ui-verification-20261116-batch/preview.html');
 const results=[];
 for (const name of ['background-portrait-simple-sky','background-simple-sky','title-comic']) {
  const result=await page.evaluate(async name=>{
   const image=new Image(); image.src=`/art/home/${name}.png`; await image.decode();
   const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
   const context=canvas.getContext('2d');context.drawImage(image,0,0);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.98));
   if(!blob||blob.type!=='image/webp')throw Error('WebP encoder unavailable');
   return {width:canvas.width,height:canvas.height,bytes:blob.size,data:Array.from(new Uint8Array(await blob.arrayBuffer()))};
  },name);
  await writeFile(`public/art/home/${name}.webp`,new Uint8Array(result.data));
  results.push({name,width:result.width,height:result.height,bytes:result.bytes,quality:.98});
 }
 await writeFile('outputs/ui-redesign-20261117/brand-export.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
} finally {await browser.close();}
