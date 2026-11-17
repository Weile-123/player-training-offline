import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeFile} from 'node:fs/promises';
const {chromium}=await import(pathToFileURL(resolve(dirname(process.execPath),'../node_modules/playwright/index.mjs')).href);
const base='http://127.0.0.1:8800',output=resolve('outputs/leaderboard-verification-20261117');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const results=[];
try{
 for(const [width,height] of [[320,740],[430,932],[844,430]]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await page.goto(`${base}/outputs/leaderboard-verification-20261117/preview.html`,{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  for(const board of ['球员榜','声望榜']){
   await page.getByRole('tab',{name:board,exact:true}).click();
   await page.locator('.leaderboard-list > li').first().waitFor();
   const layout=await page.evaluate(()=>({rootOverflow:document.documentElement.scrollWidth>innerWidth,rows:document.querySelectorAll('.leaderboard-list > li').length,personal:!!document.querySelector('.personal-score'),listScrollable:document.querySelector('.leaderboard-list').scrollHeight>document.querySelector('.leaderboard-list').clientHeight}));
   if(layout.rootOverflow||layout.rows!==50||!layout.personal||!layout.listScrollable)throw Error(`Ranking layout failed ${JSON.stringify({width,board,...layout})}`);
   await page.locator('.leaderboard-dialog').screenshot({path:`${output}/${board==='球员榜'?'player':'fame'}-${width}.png`});
   results.push({width,height,board,...layout});
  }
  await page.close();
 }
 await writeFile(`${output}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser.close();}
