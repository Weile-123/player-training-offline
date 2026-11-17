import {mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium} = await import(pathToFileURL(resolve(dirname(process.execPath), '../node_modules/playwright/index.mjs')).href);
const browser = await chromium.launch({executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true});
const output = resolve('outputs/ui-redesign-20261117'); await mkdir(output, {recursive: true});
try {
 for (const [width, height] of [[320, 740], [430, 932], [844, 430]]) {
  const page = await browser.newPage({viewport: {width, height}, deviceScaleFactor: 1});
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:8800' ? route.continue() : route.abort());
  await page.goto('http://127.0.0.1:8800/outputs/ui-verification-20261116-batch/preview.html', {waitUntil: 'networkidle'});
  await page.locator('.gym-court-switch').waitFor();
  for (const withSwitch of [true, false]) {
   if (!withSwitch) {
    for (let index = 0; index < 2; index++) {
     await page.getByRole('button', {name: '推荐球员签约', exact: true}).click();
     await page.getByRole('button', {name: /^确认推荐/}).click();
     const close = page.getByRole('button', {name: '关闭面板', exact: true});
     if (await close.count()) await close.click();
    }
   }
   await page.evaluate(() => window.__gymPreviewSetStamina(0));
   await page.locator('.gym-stamina-restore').waitFor();
   const geometry = await page.evaluate(() => {
    const stage = document.querySelector('.game-stage').getBoundingClientRect();
    const restore = document.querySelector('.gym-stamina-restore').getBoundingClientRect();
    const switching = document.querySelector('.gym-court-switch')?.getBoundingClientRect();
    return {rightGap: stage.right - restore.right, bottomGap: stage.bottom - restore.bottom, switchRight: switching?.right, restoreLeft: restore.left, text: document.querySelector('.gym-stamina-restore').textContent};
   });
   if (geometry.text !== '体力回满' || geometry.rightGap < 0 || geometry.rightGap > 25 || geometry.bottomGap < 0 || geometry.bottomGap > 25 || withSwitch && geometry.switchRight > geometry.restoreLeft || !withSwitch && geometry.switchRight !== undefined) throw Error(`Invalid quick actions ${JSON.stringify({width, withSwitch, geometry})}`);
   await page.locator('.gym-court-quick-actions').screenshot({path: `${output}/quick-actions-${width}-${withSwitch ? 'multiple' : 'single'}.png`});
   console.log(JSON.stringify({width, withSwitch, ...geometry}));
  }
  await page.close();
 }
} finally {await browser.close();}
