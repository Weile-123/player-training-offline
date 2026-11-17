import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const runtimeModules = resolve(dirname(process.execPath), '../node_modules/playwright/index.mjs');
const {chromium} = await import(pathToFileURL(runtimeModules).href);
const base = process.env.GYM_PREVIEW_URL ?? 'http://127.0.0.1:8800';
const output = resolve('outputs/ui-perfect-match-20261116');
await mkdir(output, {recursive: true});
const browser = await chromium.launch({executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, ignoreDefaultArgs: ['--hide-scrollbars']});
const results = [];
const settle = async page => {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
  });
};
try {
  for (const [width, height] of [[430, 932], [320, 740], [844, 430]]) {
    const page = await browser.newPage({viewport: {width, height}, deviceScaleFactor: 1});
    await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await page.goto(`${base}/outputs/ui-verification-20261116-batch/preview.html`, {waitUntil: 'networkidle'});
    await page.locator('.player-value-footer').waitFor();
    await settle(page);
    const layout = await page.evaluate(() => {
      const card = document.querySelector('.player-value-card');
      const footer = document.querySelector('.player-value-footer');
      const rect = card.getBoundingClientRect(), foot = footer.getBoundingClientRect();
      const buttons = [...document.querySelectorAll('.gym-player-actions > button')].map(button => {
        const box = button.getBoundingClientRect();
        return {label: button.textContent, height: box.height,
          topGap: box.top - foot.top - parseFloat(getComputedStyle(footer).borderTopWidth),
          bottomGap: rect.bottom - parseFloat(getComputedStyle(card).borderBottomWidth) - box.bottom};
      });
      return {buttons, viewportOverflow: document.documentElement.scrollWidth > innerWidth};
    });
    results.push({viewport: [width, height], ...layout});
    if (layout.viewportOverflow || layout.buttons.some(button => Math.abs(button.topGap - button.bottomGap) > .25)) throw new Error(`Unbalanced player actions: ${JSON.stringify(layout)}`);
    await page.locator('.player-value-card').screenshot({path: `${output}/player-card-${width}.png`});
    await page.close();
  }
  await writeFile(`${output}/layout-results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {await browser.close();}
