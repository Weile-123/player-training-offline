import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium} = await import(pathToFileURL(resolve(dirname(process.execPath), '../node_modules/playwright/index.mjs')).href);
const base = 'http://127.0.0.1:8800', output = resolve('outputs/ui-perfect-match-20261116/rewards');
await mkdir(output, {recursive: true});
const browser = await chromium.launch({executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true});
const results = [];
try {
 for (const [width, height] of [[320, 740], [430, 932], [844, 430]]) {
  const page = await browser.newPage({viewport: {width, height}, deviceScaleFactor: 1});
  await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await page.goto(`${base}/outputs/ui-verification-20261116-batch/preview.html`, {waitUntil: 'networkidle'});
  await page.locator('.gym-player-share').waitFor();
  await page.evaluate(() => document.fonts.ready);
  const geometry = await page.evaluate(() => {
   const button = document.querySelector('.gym-player-share').getBoundingClientRect();
   const stats = document.querySelector('.template-live-stats').getBoundingClientRect();
   const identity = document.querySelector('.template-main-identity').getBoundingClientRect();
   const header = document.querySelector('.star-template-panel').getBoundingClientRect();
   return {buttonOverlapsStats: button.right > stats.left + .5, buttonRight: button.right, statsLeft: stats.left, buttonFont: getComputedStyle(document.querySelector('.gym-player-share')).fontSize, parentFont: getComputedStyle(document.querySelector('.template-position-action')).fontSize, identityWidth: identity.width, identityClipped: identity.top < header.top - .5, overflow: document.documentElement.scrollWidth > innerWidth};
  });
  if (geometry.buttonOverlapsStats || geometry.identityClipped || geometry.overflow) throw Error(`Invalid player identity ${JSON.stringify({width, ...geometry})}`);
  await page.locator('.player-value-card').screenshot({path: `${output}/player-${width}.png`});
  await page.getByRole('button', {name: '本地测试', exact: true}).click();
  await page.getByRole('button', {name: '跳过发帖：已关闭', exact: true}).click();
  await page.getByRole('button', {name: '跳过广告：已关闭', exact: true}).click();
  await page.getByRole('button', {name: '关闭面板', exact: true}).click();
  await page.getByRole('button', {name: '分享·等级+3', exact: true}).click();
  await page.locator('.gym-share-dialog').screenshot({path: `${output}/share-${width}.png`});
  await page.getByRole('button', {name: '发帖分享', exact: true}).click();
  await page.getByRole('button', {name: '已领取', exact: true}).waitFor();
  await page.getByRole('button', {name: '关闭面板', exact: true}).click();
  if (await page.locator('.gym-player-share').count()) throw Error('Share reward button did not disappear');
  // This preview uses an isolated in-memory store, with browser storage disabled.
  const staminaFixture = await page.evaluate(() => window.__gymPreviewSetStamina(0));
  await page.getByRole('button', {name: '分享发帖，体力回满', exact: true}).waitFor({timeout: 3000}).catch(async error => {
   console.log(JSON.stringify({width, staminaFixture, dom: await page.locator('.gym-stamina-meter').textContent(), dialogs: await page.locator('[role=dialog]').allTextContents(), inert: await page.locator('.game-viewport').evaluate(node => node.inert)})); throw error;
  });
  await page.locator('.gym-stamina-meter').screenshot({path: `${output}/stamina-${width}.png`});
  await page.getByRole('button', {name: '分享发帖，体力回满', exact: true}).click();
  await page.getByRole('button', {name: '发帖分享', exact: true}).click();
  await page.getByRole('button', {name: '已领取', exact: true}).waitFor();
  await page.getByRole('button', {name: '关闭面板', exact: true}).click();
  await page.evaluate(() => window.__gymPreviewSetStamina(0));
  await page.getByRole('button', {name: '看广告，体力回满', exact: true}).click();
  await page.locator('.gym-stamina-restore').waitFor({state: 'detached'});
  await page.getByRole('button', {name: '赞助合作', exact: true}).click();
  await page.locator('.gm-cooperation-panel').waitFor();
  await page.locator('[role=dialog]').screenshot({path: `${output}/cooperation-${width}.png`});
  await page.locator('.gm-cooperation-ad:not(:disabled)').first().click();
  const replacement = page.getByRole('button', {name: '观看广告并完成', exact: true});
  if (await replacement.count()) await replacement.click();
  await page.getByText('广告已完成合作，推荐签约时结算。', {exact: true}).waitFor();
  results.push({viewport: [width, height], ...geometry, shareOnce: true, staminaShareThenAd: true, cooperationAd: true});
  await page.close();
 }
 await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
 console.log(JSON.stringify(results));
} finally {await browser.close();}
