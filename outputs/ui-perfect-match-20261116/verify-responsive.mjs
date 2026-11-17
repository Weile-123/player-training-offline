import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(resolve(dirname(process.execPath),'../node_modules/playwright/index.mjs')).href);
const base=process.env.GYM_PREVIEW_URL??'http://127.0.0.1:8800',output=resolve('outputs/ui-perfect-match-20261116');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,ignoreDefaultArgs:['--hide-scrollbars']});
const results=[];
try {
 for(const [width,height] of [[320,740],[430,932],[844,430]]) for(const [kind,label] of [['career','球馆档案'],['offline','离线报告']]) {
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  await page.goto(`${base}/outputs/ui-verification-20261116-batch/preview.html`,{waitUntil:'networkidle'});
  await page.getByRole('navigation',{name:'验收预览'}).getByRole('button',{name:label,exact:true}).click();
  await page.locator('.gym-design-surface').waitFor();
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode().catch(()=>{})));});
  const result=await page.evaluate(()=>{
   const dialog=document.querySelector('[role="dialog"]'),surface=document.querySelector('.gym-design-surface'),region=surface.querySelector('.gm-offline-players');
   const rootOverflow=document.documentElement.scrollWidth>innerWidth;
   const contentOverflow=surface.scrollWidth>surface.clientWidth;
   const scrolling=region?{client:region.clientWidth,total:region.scrollWidth,overflowX:getComputedStyle(region).overflowX,scrollbarHeight:region.offsetHeight-region.clientHeight,cardWidths:[...region.children].map(card=>card.getBoundingClientRect().width)}:null;
   const sheet=dialog.querySelector('.sheet-scroll');
   return {rootOverflow,contentOverflow,dialogWidth:dialog.getBoundingClientRect().width,surfaceWidth:surface.clientWidth,sheetWidth:sheet.clientWidth,sheetPadding:getComputedStyle(sheet).padding,sheetScrollbar:getComputedStyle(sheet).scrollbarWidth,scrolling};
  });
  results.push({kind,width,height,...result});
  if(result.rootOverflow||result.contentOverflow||result.scrolling&&(result.scrolling.overflowX!=='scroll'||result.scrolling.client!==result.surfaceWidth||result.scrolling.scrollbarHeight<=0||result.scrolling.cardWidths.some(cardWidth=>Math.abs(cardWidth-183.5)>.1)))throw new Error(JSON.stringify(results.at(-1)));
  await page.getByRole('dialog').screenshot({path:`${output}/${kind}-${width}.png`,animations:'disabled'});
  await page.close();
 }
 await writeFile(`${output}/responsive-results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
} finally {await browser.close();}
