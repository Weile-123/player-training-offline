import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const {chromium} = await import(pathToFileURL(resolve(dirname(process.execPath), '../node_modules/playwright/index.mjs')).href);
const base = process.env.GYM_PREVIEW_URL ?? 'http://127.0.0.1:8800';
const output = resolve('outputs/ui-perfect-match-20261116');
await mkdir(output, {recursive: true});
const browser = await chromium.launch({executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, ignoreDefaultArgs: ['--hide-scrollbars']});
const properties = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color', 'backgroundColor', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginBottom', 'borderTopWidth', 'borderTopColor', 'borderRadius', 'gap', 'width'];
const shared = [['.dialog','[role="dialog"]'], ['.dialog-header','.sheet-heading'], ['.dialog-header h1','.sheet-heading h2'], ['.close','.sheet-close'], ['.content','.sheet-scroll']];
const plans = {
  offline: {button:'离线报告', selectors:['.report-dashboard','.report-dashboard-top h2','.report-dashboard-primary b','.report-dashboard-metrics','.report-dashboard-metrics b','.cap-note','.result-heading h2','.report-athlete','.athlete-cover','.athlete-cover img','.athlete-cover h3','.athlete-cover small','.athlete-level','.athlete-level strong','.athlete-xp','.athlete-stat','.athlete-template','.offline-summary','.offline-summary strong','.offline-summary small','.report-bottom','.primary']},
  career: {button:'球馆档案', selectors:['.dashboard-hero','.dashboard-hero h2','.dashboard-level','.dashboard-fame-head','.dashboard-fame-head b','.dashboard-counters','.counter','.counter b','.dashboard-split','.dashboard-split h2','.distribution','.distribution-key','.stats-row','.records-table','.records-table header','.block','.section-title h2','.collection-rings','.ring-card','.ring','.ring b','.ring-card h3']},
};
const read = async (page, selector) => page.locator(selector).first().evaluate((element, properties) => {
  const style = getComputedStyle(element);
  return Object.fromEntries(properties.map(key => [key, style[key]]));
}, properties);
const settle = async page => page.evaluate(async () => {await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode().catch(() => {})));});
const reports = {};
try {
  for (const [kind, plan] of Object.entries(plans).filter(([kind]) => process.argv.length < 3 || process.argv.slice(2).includes(kind))) {
    const reference = await browser.newPage({viewport:{width:430,height:1400},deviceScaleFactor:1});
    const actual = await browser.newPage({viewport:{width:430,height:1400},deviceScaleFactor:1});
    await reference.goto(`${base}/outputs/ui-redesign-20261116/${kind}-b.html`,{waitUntil:'networkidle'});
    await actual.goto(`${base}/outputs/ui-verification-20261116-batch/preview.html`,{waitUntil:'networkidle'});
    await actual.getByRole('navigation',{name:'验收预览'}).getByRole('button',{name:plan.button,exact:true}).click();
    await actual.locator('.gym-design-surface').waitFor();
    await settle(reference); await settle(actual);
    const pairs = [...shared,...plan.selectors.map(selector=>[selector,selector])];
    const differences = [];
    for (const [before,after] of pairs) {
      if (!(await reference.locator(before).count()) || !(await actual.locator(after).count())) {differences.push({before,after,missing:true});continue;}
      const expected = await read(reference,before), received = await read(actual,after);
      for (const key of properties) if (expected[key]!==received[key]) differences.push({before,after,property:key,expected:expected[key],received:received[key]});
    }
    const textWidth = difference => difference.property === 'width' && /(?:\bh[1-6]|\bb|\bstrong|\bsmall)$/.test(difference.after);
    reports[kind] = {styleDifferences: differences.filter(difference => !textWidth(difference)), dataDependentTextWidths: differences.filter(textWidth)};
    await reference.locator('.dialog').screenshot({path:`${output}/${kind}-reference.png`,animations:'disabled'});
    await actual.getByRole('dialog').screenshot({path:`${output}/${kind}-actual.png`,animations:'disabled'});
    await actual.close(); await reference.close();
  }
  await writeFile(`${output}/style-differences.json`,JSON.stringify(reports,null,2));
  console.log(JSON.stringify(reports));
  if (Object.values(reports).some(report => report.styleDifferences.length)) process.exitCode = 1;
} finally {await browser.close();}
