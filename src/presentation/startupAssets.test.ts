import {expect,it} from 'vitest';
import manifest from '../data/runtime-assets.json';
import {selectStartupAssets} from './startupAssets';
import {equipmentCatalog} from '../game/gym/catalog';
import portraits from '../data/poster-portraits.json';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {startupAssetBatches} from './startupAssets';

it('preloads the current Gym image closure, including portraits and panels, within a 40 MB budget',()=>{
 const selected=selectStartupAssets(manifest.entries),paths=new Set(selected.map(a=>a.path));
 for(const path of ['art/home/background-b-portrait.webp','art/home/background-b-landscape.webp','art/game/template-paper.png','art/game/dock-controls.png','art/collection/court-lines.svg'])expect(paths.has(path),path).toBe(true);
 for(const path of ['art/home/title-comic.webp','art/home/title-comic.png','art/home/button-new-career.png','art/home/button-new-game.png','art/home/background-simple-sky.webp','art/home/background-portrait-simple-sky.webp'])expect(paths.has(path),path).toBe(false);
 for(const file of ['court-clean.png','ball.png','net.png','rim-front.png','player-data.json'])expect(paths.has('art/shot/'+file),file).toBe(true);
 for(const outcome of ['great','success','hold','minor','severe'])expect(paths.has(`art/shot-status/${outcome}.png`),outcome).toBe(true);
 expect(selected.reduce((total,a)=>total+a.bytes,0)).toBeLessThan(40_000_000);
 for(const path of ['art/collection/unknown-equipment-b-cutout.png','art/players/high-potential-rookie.png','art/scheme-a/design-atlas.png'])expect(paths.has(path),path).toBe(true);
});
it('includes every current equipment, career illustration and mapped local portrait; excludes disabled and former UI',()=>{
 const selected=new Set(selectStartupAssets(manifest.entries).map(a=>a.path));
 for(const item of equipmentCatalog)expect(selected.has(`art/products/${item.artId}.png`),item.id).toBe(true);
 for(const asset of manifest.entries.filter(a=>a.path.startsWith('art/career/')))expect(selected.has(asset.path),asset.path).toBe(true);
 for(const path of Object.values(portraits)){
  expect(selected.has(path),path).toBe(true);
  const entry=manifest.entries.find(asset=>asset.path===path)!,bytes=readFileSync('public/'+path);
  expect(entry.local).toBe(true);expect(entry.bytes).toBe(bytes.length);
  expect(entry.hash).toBe(createHash('sha256').update(bytes).digest('hex').slice(0,16));
 }
 for(const asset of manifest.entries.filter(a=>a.path.startsWith('art/consumables/')||a.path.startsWith('art/scout/')))expect(selected.has(asset.path),asset.path).toBe(false);
 expect(selected.has('art/home/background-continuous.png')).toBe(false);
 expect(selected.has('art/home/continue-frame.svg')).toBe(false);
 expect(selectStartupAssets([{path:'art/products/relic_unused.png'},{path:'art/poster-portraits/unmapped.png'}])).toEqual([]);
});
it('prioritizes the first screen, then local portraits and basic gear, before remaining panel art',()=>{
 const batches=startupAssetBatches(manifest.entries),index=(path:string)=>batches.findIndex(batch=>batch.some(asset=>asset.path===path));
 expect(batches.flat()).toHaveLength(selectStartupAssets(manifest.entries).length);
 expect(index('art/shot/court-clean.png')).toBe(0);expect(index('art/scheme-a/design-atlas.png')).toBe(0);
 expect(index(portraits.beverley)).toBe(1);
 for(const item of equipmentCatalog.filter(item=>item.grade===1))expect(index(`art/products/${item.artId}.png`)).toBe(1);
 expect(index('art/career/album.png')).toBe(2);
});
