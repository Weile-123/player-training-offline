import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium} = await import(pathToFileURL(resolve(dirname(process.execPath), '../node_modules/playwright/index.mjs')).href);
const browser = await chromium.launch({executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true});
const output = resolve('outputs/ui-redesign-20261117/final-visible'); await mkdir(output, {recursive: true});
const results = [], issues = [], base = 'http://127.0.0.1:8800';
const settle = page => page.evaluate(async () => {await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode().catch(() => {})));});
try {
 for (const [width, height] of [[320, 740], [430, 932], [844, 430]]) {
  const context = await browser.newContext({viewport: {width, height}, deviceScaleFactor: 1});
  await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto(`${base}/outputs/ui-verification-20261116-batch/preview.html`, {waitUntil: 'networkidle'});
  await page.locator('.gym-player-share').waitFor(); await settle(page);
  const card = await page.evaluate(() => {
   const button = document.querySelector('.gym-player-share'), name = document.querySelector('.template-main-identity > strong'), stats = document.querySelector('.template-live-stats'), header = document.querySelector('.star-template-panel');
   const b = button.getBoundingClientRect(), n = name.getBoundingClientRect(), s = stats.getBoundingClientRect(), h = header.getBoundingClientRect(), style = getComputedStyle(button);
   const overlaps = rect => rect.right > s.left + .5 && rect.bottom > s.top && rect.top < s.bottom;
   return {share: {text: button.textContent, background: style.backgroundImage, borderStyle: style.borderStyle, borderRadius: style.borderRadius,font:style.font,letterSpacing:style.letterSpacing,padding:style.padding,width:b.width,badgeWidth:document.querySelector('.template-identity-meta>.tier-badge').getBoundingClientRect().width}, metaText: document.querySelector('.template-identity-meta').textContent, name: {top: n.top, right: n.right}, button: {top: b.top, right: b.right}, statsLeft: s.left, headerTop: h.top, overlapsStats: overlaps(b) || overlaps(n), clippedAtTop: Math.min(n.top, b.top) < h.top - .5, overflow: document.documentElement.scrollWidth > innerWidth};
  });
  if (card.overlapsStats || card.clippedAtTop || card.overflow || /(小前锋|大前锋|控球后卫|得分后卫|中锋)/.test(card.metaText) || card.share.borderStyle !== 'double' || parseFloat(card.share.borderRadius) < 5) issues.push({width, kind: 'player-card', ...card});
  await page.locator('.player-value-card').screenshot({path: `${output}/player-card-${width}.png`});
  await page.getByRole('button', {name: '打开图鉴', exact: true}).click();
  await page.getByRole('tab', {name: '器材图鉴', exact: true}).click();
  await page.locator('.equipment-album-card.is-unlocked').first().waitFor();
  const borders = await page.evaluate(() => {
   const colors = selector => [...document.querySelectorAll(selector)].map(node => getComputedStyle(node).borderColor);
   const unlocked = colors('.equipment-album-card.is-unlocked'), unknown = colors('.equipment-album-card.is-unknown');
   return {unlockedCount: unlocked.length, unknownCount: unknown.length, unlockedColors: [...new Set(unlocked)], unknownColors: [...new Set(unknown)], equal: unlocked.every(color => color === unknown[0]) && unknown.every(color => color === unknown[0])};
  });
  if (!borders.equal) issues.push({width, kind: 'equipment-borders', ...borders});
  await page.locator('.equipment-album-card.is-unlocked').first().screenshot({path: `${output}/equipment-unlocked-${width}.png`});
  await page.locator('.equipment-album-card.is-unknown').first().screenshot({path: `${output}/equipment-unknown-${width}.png`});
  await page.getByRole('button', {name: '关闭面板', exact: true}).click();
  await page.getByRole('button', {name: '背包', exact: true}).click();
  const warehouse = page.locator('.gm-warehouse-product').filter({has: page.locator('.gm-warehouse-equip:not(:disabled)')}).first();
  await warehouse.getByRole('button', {name: /^器材详情/}).click();
  await page.locator('.gm-equipment-sell').waitFor();
  const sell = await page.evaluate(() => {
   const sale = document.querySelector('.gm-equipment-sell'), back = document.querySelector('.gym-equipment-detail > .album-back'), a = sale.getBoundingClientRect(), b = back.getBoundingClientRect(), s = getComputedStyle(sale), t = getComputedStyle(back);
   return {sale: {width: a.width, height: a.height, background: s.backgroundImage, color: s.color, padding: s.padding, font: s.font, border: s.border}, back: {width: b.width, height: b.height, padding: t.padding, font: t.font, border: t.border}, equal: Math.abs(a.width - b.width) < .25 && Math.abs(a.height - b.height) < .25};
  });
  if (!sell.equal || !/197, 64, 42/.test(sell.sale.background)) issues.push({width, kind: 'equipment-sell', ...sell});
  await page.locator('.equipment-detail-dialog').screenshot({path: `${output}/equipment-detail-${width}.png`});
  results.push({width, height, card, borders, sell});
  await context.close();
 }
 const context = await browser.newContext({viewport: {width: 430, height: 932}, deviceScaleFactor: 1});
 await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
 const page = await context.newPage();
 await page.goto(base, {waitUntil: 'networkidle'}); await page.locator('.gym-home').waitFor({timeout: 30000}); await settle(page);
 const home = await page.evaluate(() => ({title: document.querySelector('.home-brand img').getAttribute('alt'), titleSrc: document.querySelector('.home-brand img').src, titleImage: {naturalWidth: document.querySelector('.home-brand img').naturalWidth, naturalHeight: document.querySelector('.home-brand img').naturalHeight}, background: getComputedStyle(document.querySelector('.home-background')).backgroundImage, overflow: document.documentElement.scrollWidth > innerWidth, hasSave: !!document.querySelector('.home-continue')}));
 await page.screenshot({path: `${output}/home-430.png`, fullPage: true});
 if (home.overflow || !home.title.includes('传奇球馆') || !home.titleImage.naturalWidth) issues.push({kind: 'home', ...home});
 results.push({home}); await context.close();
 await writeFile(`${output}/results.json`, JSON.stringify({results, issues}, null, 2));
 console.log(JSON.stringify({results, issues}));
 if (issues.length) process.exitCode = 1;
} finally {await browser.close();}
