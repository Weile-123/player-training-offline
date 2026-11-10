import {expect,it} from 'vitest';
import manifest from '../data/runtime-assets.json';
import {selectStartupAssets} from './startupAssets';

it('keeps the home and complete shot sequence ready within a 10 MB startup asset budget',()=>{
 const selected=selectStartupAssets(manifest.entries),paths=new Set(selected.map(a=>a.path));
 for(const path of ['art/home/title-comic.png','art/home/continue-frame.svg','art/home/button-new-career.png','art/home/button-new-game.png','art/home/button-career.png','art/home/button-collection.png','art/home/button-rank.png','art/home/background-simple-sky.png','art/home/background-portrait-simple-sky.png','art/game/template-paper.png','art/game/dock-controls.png','art/collection/court-lines.svg'])expect(paths.has(path),path).toBe(true);
 for(const file of ['court-clean.png','ball.png','net.png','rim-front.png','player-data.json'])expect(paths.has('art/shot/'+file),file).toBe(true);
 for(const outcome of ['great','success','hold','minor','severe'])expect(paths.has(`art/shot-status/${outcome}.png`),outcome).toBe(true);
 expect(selected.reduce((total,a)=>total+a.bytes,0)).toBeLessThan(10_000_000);
 expect(selected.length).toBeLessThan(manifest.entries.length/4);
});
it('defers catalog, career and optional artwork while packaging it locally',()=>{
 const selected=new Set(selectStartupAssets(manifest.entries).map(a=>a.path));
 const deferred=manifest.entries.filter(a=>a.path.startsWith('art/products/')||a.path.startsWith('art/career/')||a.path==='art/players/high-potential-rookie.png');
 expect(deferred.length).toBeGreaterThan(90);
 for(const asset of deferred){expect(selected.has(asset.path),asset.path).toBe(false);expect(asset.local,asset.path).toBe(true);}
 expect(selected.has('art/home/background-continuous.png')).toBe(false);
 expect(selected.has('art/scheme-a/design-atlas.png')).toBe(false);
});
