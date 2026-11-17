import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const {chromium} = await import(pathToFileURL(resolve(dirname(process.execPath), '../node_modules/playwright/index.mjs')).href);
const base = process.env.GYM_PREVIEW_URL ?? 'http://127.0.0.1:8800';
const output = resolve('outputs/ui-perfect-match-20261116/tier-frames');
await mkdir(output, {recursive: true});
const browser = await chromium.launch({executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, ignoreDefaultArgs: ['--hide-scrollbars']});
const results = [];
const readFrame = element => {
  const style = getComputedStyle(element), rect = element.getBoundingClientRect();
  return {tier:element.dataset.tier, borders:[style.borderTopWidth,style.borderRightWidth,style.borderBottomWidth,style.borderLeftWidth], shadow:style.boxShadow, background:style.backgroundImage, animation:style.animationName, angle:style.getPropertyValue('--legend-angle'), width:rect.width, height:rect.height};
};
try {
  for (const width of [320, 430, 844]) {
    const page = await browser.newPage({viewport:{width,height:width === 844 ? 430 : 932},deviceScaleFactor:1});
    await page.goto(`${base}/outputs/ui-verification-20261116-batch/preview.html`, {waitUntil:'networkidle'});
    await page.getByRole('navigation',{name:'验收预览'}).getByRole('button',{name:'球馆档案',exact:true}).click();
    const card = page.locator('.gm-career-best');
    await card.waitFor();
    const before = await card.evaluate(readFrame), portrait = await card.locator('.tier-portrait-frame').evaluate(readFrame);
    assert.deepEqual(before.borders, ['4px','4px','4px','4px']);
    assert.deepEqual(portrait.borders, ['3px','3px','3px','3px']);
    assert.equal(before.tier, 'legend');
    assert.equal(before.animation, 'legend-border-orbit');
    assert.equal(portrait.animation, 'legend-border-orbit');
    assert.notEqual(before.shadow, 'none');
    await page.waitForTimeout(120);
    const after = await card.evaluate(readFrame);
    assert.notEqual(before.angle, after.angle);
    await card.screenshot({path:`${output}/career-${width}.png`,animations:'disabled'});
    await page.getByRole('button',{name:'关闭面板',exact:true}).click();
    await page.getByRole('navigation',{name:'验收预览'}).getByRole('button',{name:'离线报告',exact:true}).click();
    const avatars = page.locator('.gm-offline-portrait');
    const frames = await avatars.evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element), bounds = element.getBoundingClientRect();
      return {tier:element.dataset.tier, width:bounds.width, height:bounds.height, border:style.borderTopWidth, background:style.backgroundImage, shadow:style.boxShadow};
    }));
    assert.equal(frames.length,3);
    for (const frame of frames) {
      assert.equal(frame.width,52); assert.equal(frame.height,62); assert.equal(frame.border,'3px'); assert.notEqual(frame.shadow,'none');
    }
    // Exercise the rendered tier palette and animation without modifying any game data.
    await avatars.first().evaluate(element => {element.dataset.tier='legend';});
    assert.equal((await avatars.first().evaluate(readFrame)).animation,'legend-border-orbit');
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal((await avatars.first().evaluate(readFrame)).animation,'none');
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.locator('.gm-offline-report').evaluate(element => {element.classList.add('reduce-motion');});
    assert.equal((await avatars.first().evaluate(readFrame)).animation,'none');
    await page.locator('.gm-offline-report').evaluate(element => {element.classList.remove('reduce-motion');});
    await avatars.first().evaluate((element, tier) => {element.dataset.tier=tier;}, frames[0].tier);
    await page.getByRole('dialog').screenshot({path:`${output}/offline-${width}.png`,animations:'disabled'});
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.querySelector('.gym-design-surface').scrollWidth > document.querySelector('.gym-design-surface').clientWidth);
    assert.equal(overflow,false);
    results.push({width,career:before,portrait,offline:frames});
    await page.close();
  }
  await writeFile(`${output}/results.json`,JSON.stringify(results,null,2));
  console.log(JSON.stringify({passed:results.length,screenshots:output}));
} finally {await browser.close();}
