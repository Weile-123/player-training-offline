import {describe,it,expect} from 'vitest';
import {existsSync} from 'node:fs';
import {equipmentCatalog} from '../src/game/gym/catalog';
import {includeRuntimeAsset,currentEquipmentImages,currentHomeImages} from './runtime-asset-selection.mjs';
import manifest from '../src/data/runtime-assets.json';

describe('published Gym artwork closure',()=>{
 it('ships every current catalog artwork by artId, independently of persistent equipment IDs',()=>{
  const actual=[...new Set(equipmentCatalog.map(item=>`art/products/${item.artId}.png`))].sort();
  expect(currentEquipmentImages).toEqual(actual);
  for(const path of actual){expect(includeRuntimeAsset(path)).toBe(true);expect(existsSync('public/'+path)).toBe(true);expect(manifest.entries.some(entry=>entry.path===path)).toBe(true);}
  const remapped=equipmentCatalog.find(item=>item.id==='relic_001')!;
  expect(remapped.artId).toBe('relic_005');expect(includeRuntimeAsset('art/products/'+remapped.artId+'.png')).toBe(true);
 });
 it('keeps both current covers, all five consumables, and CSS fallback resources',()=>{
  const paths=[...currentHomeImages,...['brace','timer','chalk','supplement','drink'].map(id=>`art/consumables/${id}.png`),'art/home/background-continuous.png','art/home/continue-frame.svg'];
  for(const path of paths){expect(includeRuntimeAsset(path)).toBe(true);expect(manifest.entries.some(entry=>entry.path===path)).toBe(true);}
 });
 it('omits obsolete product and former cover entries from the actual browser manifest',()=>{
  for(const path of ['art/products/relic_001.png','art/products/basic.png','art/home/title-comic.png','art/home/background-simple-sky.png']){
   expect(existsSync('public/'+path)).toBe(true);expect(includeRuntimeAsset(path)).toBe(false);expect(manifest.entries.some(entry=>entry.path===path)).toBe(false);
  }
 });
});
