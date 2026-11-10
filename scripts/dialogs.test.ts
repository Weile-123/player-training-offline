import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync,readdirSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {ComicDialog} from '../src/components/ComicDialog';
import {ExistingCareerWarning} from '../src/components/ComicDialogContent';
import {newGame,seededRandom} from '../src/game/engine';

describe('shared comic dialog system',()=>{
 it('keeps the same shell, visible labelled header and scroll area for all dialog kinds',()=>{
  for(const variant of ['standard','month','repay','template','workshop','roster','empty'] as const){
   const html=renderToStaticMarkup(createElement(ComicDialog,{title:'本月新人',variant,onClose:()=>{},children:'弹窗内容'}));
   expect(html).toContain('comic-dialog-layer');expect(html).toContain('role="dialog"');expect(html).toContain('class="sheet-heading"');expect(html).toContain('class="sheet-scroll"');
   const titleId=html.match(/aria-labelledby="([^"]+)"/)?.[1];expect(titleId).toBeDefined();expect(html).toContain(`<h2 id="${titleId}">本月新人</h2>`);
   expect(html).toContain('aria-label="关闭面板"');
  }
 });
 it('gives nested confirmations a distinct title ID and a higher dialog layer',()=>{
  const child=createElement(ComicDialog,{title:'升级资产',onClose:()=>{},children:'确认升级'});
  const html=renderToStaticMarkup(createElement(ComicDialog,{title:'资产经营',onClose:()=>{},children:child}));
  const ids=[...html.matchAll(/aria-labelledby="([^"]+)"/g)].map(m=>m[1]);
  expect(new Set(ids).size).toBe(2);expect(html).toContain('data-dialog-depth="0"');expect(html).toContain('data-dialog-depth="1"');
  expect(html).toContain('z-index:50');expect(html).toContain('z-index:60');
 });
 it('makes the existing local career and destructive consequence explicit, using live progress',()=>{
  const game={...newGame(seededRandom(3)),month:17,cash:123456,debt:8765432};
  const before=JSON.stringify(game),html=renderToStaticMarkup(createElement(ExistingCareerWarning,{game}));
  for(const text of ['本地已有存档','覆盖当前生涯进度','第 17 月','$123,456','$8,765,432','永久球星图鉴及历史纪录保留'])expect(html).toContain(text);
  expect(JSON.stringify(game)).toBe(before);
 });
 it('has no parallel bespoke dialog markup outside the common component',()=>{
  const directory='src/components';
  for(const file of readdirSync(directory).filter(file=>file.endsWith('.tsx')&&file!=='ComicDialog.tsx')){
   const source=readFileSync(`${directory}/${file}`,'utf8');
   expect(source,`${file} bypasses ComicDialog`).not.toMatch(/role=["'](?:dialog|alertdialog)["']|className=["']modal-backdrop["']/);
  }
  for(const file of ['Home.tsx','Gameplay.tsx','Workshop.tsx','Collection.tsx'])expect(readFileSync(`${directory}/${file}`,'utf8')).toContain("from './ComicDialog'");
 });
});
