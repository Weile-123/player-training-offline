import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium} = await import(pathToFileURL(resolve(dirname(process.execPath), '../node_modules/playwright/index.mjs')).href);
const browser = await chromium.launch({executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true});
const output = resolve('outputs/ui-redesign-20261117'); await mkdir(output, {recursive: true});
try {
 for (const [width, height] of [[430, 932], [320, 740]]) {
  const page = await browser.newPage({viewport: {width, height}, deviceScaleFactor: 1});
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:8800' ? route.continue() : route.abort());
  await page.goto('http://127.0.0.1:8800/outputs/ui-verification-20261116-batch/preview.html', {waitUntil: 'networkidle'});
  await page.locator('.gym-player-share').click();
  await page.locator('.gym-share-poster').waitFor({timeout: 25000});
  if (await page.locator('.gym-share-dialog input,.gym-share-dialog textarea').count()) throw Error('Share title or content remains editable');
  if (await page.locator('.gym-share-dialog .poster-share-footer button').count() !== 1) throw Error('Share dialog must have one action');
  await page.locator('.gym-share-dialog').screenshot({path: `${output}/share-poster-dialog-${width}.png`});
  if (width === 430) {
   const encoded = await page.locator('.gym-share-poster').evaluate(async image => {
    const response = await fetch(image.src), blob = await response.blob();
    return new Promise(resolve => {const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob);});
   });
   await writeFile(`${output}/gym-share-poster.png`, Buffer.from(encoded.split(',')[1], 'base64'));
  }
  await page.getByRole('button', {name: '关闭面板', exact: true}).click();
  await page.getByRole('button', {name: '校友', exact: true}).click();
  await page.locator('.gm-alumnus').first().waitFor();
  await page.evaluate(async () => {await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode().catch(() => {})));});
  const geometry = await page.locator('.gm-alumni-panel').evaluate(root => ({overflow: root.scrollWidth > root.clientWidth, cards: root.querySelectorAll('.gm-alumnus').length}));
  if (geometry.overflow) throw Error('Alumni archive overflows horizontally');
  await page.locator('[role=dialog]').screenshot({path: `${output}/alumni-${width}.png`});
  console.log(JSON.stringify({width, ...geometry}));
  await page.close();
 }
} finally {await browser.close();}
