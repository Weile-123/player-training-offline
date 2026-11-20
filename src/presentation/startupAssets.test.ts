import {expect,it} from 'vitest';
import manifest from '../data/runtime-assets.json';
import {selectStartupAssets} from './startupAssets';
import portraits from '../data/poster-portraits.json';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

it('preloads the active cover, court and first training, within a 9 MB budget',()=>{
 const selected=selectStartupAssets(manifest.entries),paths=new Set(selected.map(a=>a.path));
 expect(selected[0].path).toBe('art/home/background-b-portrait.webp');
 for(const path of ['art/game/template-paper.png','art/game/dock-controls.png'])expect(paths.has(path),path).toBe(true);
 for(const path of ['art/home/title-comic.webp','art/home/title-comic.png','art/home/button-new-career.png','art/home/button-new-game.png','art/home/background-simple-sky.webp','art/home/background-portrait-simple-sky.webp'])expect(paths.has(path),path).toBe(false);
 for(const file of ['court-clean.png','ball.png','net.png','rim-front.png','player-data.json'])expect(paths.has('art/shot/'+file),file).toBe(true);
 for(const outcome of ['great','success','hold','minor','severe'])expect(paths.has(`art/shot-status/${outcome}.png`),outcome).toBe(true);
 expect(selected.reduce((total,a)=>total+a.bytes,0)).toBeLessThan(9_000_000);
 for(const path of ['art/players/high-potential-rookie.png','art/scheme-a/design-atlas.png'])expect(paths.has(path),path).toBe(true);
});
it('keeps the packaged local portraits intact and out of the startup gate with other panel artwork',()=>{
 const selected=new Set(selectStartupAssets(manifest.entries).map(a=>a.path));
 for(const asset of manifest.entries.filter(a=>/^art\/(career|products|collection)\//.test(a.path)))expect(selected.has(asset.path),asset.path).toBe(false);
 for(const path of Object.values(portraits)){
  expect(selected.has(path),path).toBe(false);
  const entry=manifest.entries.find(asset=>asset.path===path)!,bytes=readFileSync('public/'+path);
  expect(entry.local).toBe(true);expect(entry.bytes).toBe(bytes.length);
  expect(entry.hash).toBe(createHash('sha256').update(bytes).digest('hex').slice(0,16));
 }
 for(const asset of manifest.entries.filter(a=>a.path.startsWith('art/consumables/')||a.path.startsWith('art/scout/')))expect(selected.has(asset.path),asset.path).toBe(false);
 expect(selected.has('art/home/background-continuous.png')).toBe(false);
 expect(selected.has('art/home/continue-frame.svg')).toBe(false);
 expect(selectStartupAssets([{path:'art/products/relic_unused.png'},{path:'art/poster-portraits/unmapped.png'}])).toEqual([]);
});
