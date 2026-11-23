/** Build-time closure for the shipped Gym entry. Public originals remain intact. */
import {readFileSync} from 'node:fs';
const {relics}=JSON.parse(readFileSync(new URL('../src/game/contract/runtime/equipment.json',import.meta.url),'utf8'));
const equipmentImages=new Set(relics.map(({id})=>{
  if(!/^relic_\d{3}$/.test(id))throw Error('Invalid challenge equipment artwork ID');
  return `art/products/${id}.png`;
}));

// The current entry is AppBootstrap -> GymHome. These former covers/buttons are
// not used by it. Keep background-continuous.png because existing CSS refers to
// that fallback, plus all other illustrations and legacy save data.
const formerHomeImages=new Set([
  'background-simple-sky.png','background-portrait-simple-sky.png','title-comic.png',
  'background-simple-sky.webp','background-portrait-simple-sky.webp','title-comic.webp',
  'button-career.png','button-collection.png','button-new-career.png','button-new-game.png','button-rank.png',
].map(name=>`art/home/${name}`));

export function includeRuntimeAsset(path){
  if(formerHomeImages.has(path))return false;
  // Challenges can offer any original relic, including ones outside the gym shop.
  if(path.startsWith('art/products/'))return equipmentImages.has(path);
  return true;
}
export const currentEquipmentImages=Object.freeze([...equipmentImages].sort());
export const currentHomeImages=Object.freeze(['art/home/background-b-portrait.webp','art/home/background-b-landscape.webp']);
