import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {chromium} = await import(pathToFileURL(resolve(dirname(process.execPath), '../node_modules/playwright/index.mjs')).href);
const browser = await chromium.launch({executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true});
const output = resolve('outputs/ui-redesign-20261117'); await mkdir(output, {recursive: true});
try {
 const page = await browser.newPage({viewport: {width: 466, height: 960}, deviceScaleFactor: 2});
 await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:8800' ? route.continue() : route.abort());
 page.on('pageerror', error => console.error(error.message));
 await page.goto('http://127.0.0.1:8800/outputs/ui-redesign-20261117/career-original-style.html', {waitUntil: 'networkidle'});
 await page.locator('.career-statistics').waitFor();
 await page.evaluate(async () => {await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode().catch(() => {})));});
 const geometry = await page.evaluate(() => ({overflow: document.documentElement.scrollWidth > innerWidth, heading: document.querySelector('h2').textContent, height: document.documentElement.scrollHeight}));
 if (geometry.overflow) throw Error('Preview overflows horizontally');
 await page.screenshot({path: `${output}/career-original-style.png`, fullPage: true});
 await writeFile(`${output}/career-preview-geometry.json`, JSON.stringify(geometry, null, 2));
 console.log(JSON.stringify(geometry));
} finally {await browser.close();}
