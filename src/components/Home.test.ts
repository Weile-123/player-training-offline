import {assetUrl} from '../presentation/assetUrls';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeCareer } from '../game/careerSave';
import { newGame } from '../game/engine';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('home career entry visibility', () => {
 async function render(hasSave: boolean) {
  vi.resetModules();
  const data = new Map<string,string>();
  const storage = { getItem: (k:string) => data.get(k) ?? null, setItem: (k:string,v:string) => { data.set(k,v); } };
  if (hasSave) writeCareer(storage, newGame());
  vi.stubGlobal('window', { localStorage: storage });
  const { default: Home } = await import('./Home');
  return renderToStaticMarkup(createElement(Home));
 }
 it('keeps continue visible below new game for an empty local career', async () => {
  const html = await render(false);
  expect(html).toContain('aria-label="新游戏"');
  expect(html).toContain('aria-label="继续游戏"');
  expect(html.indexOf('aria-label="新游戏"')).toBeLessThan(html.indexOf('aria-label="继续游戏"'));
  expect(html).not.toContain('aria-label="开启新生涯"');
  expect(html).not.toContain('home-slots');
  expect(html).not.toContain('???');
 });
 it('shows continue and replacement, preserving separate menu assets', async () => {
  const html = await render(true);
  expect(html).toContain('aria-label="继续游戏"');
  expect(html).toContain('aria-label="开启新生涯"');
  expect(html.indexOf('aria-label="开启新生涯"')).toBeLessThan(html.indexOf('aria-label="继续游戏"'));
  expect(html).toContain('aria-label="图鉴"');
  expect(html).not.toContain('aria-label="球星图鉴"');
  expect(html).not.toContain('aria-label="新游戏"');
  for (const name of ['collection','rank']) expect(html).toContain(assetUrl('art/home/button-'+name+'.png'));
  expect(html).not.toContain('???');
 });
});
