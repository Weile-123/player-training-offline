import portraits from '../data/poster-portraits.json';
import {equipmentCatalog} from '../game/gym/catalog';

const portraitPaths=new Set(Object.values(portraits));
const equipmentPaths=new Set(equipmentCatalog.map(item=>`art/products/${item.artId}.png`));
const commonEquipment=new Set(equipmentCatalog.filter(item=>item.grade===1).map(item=>`art/products/${item.artId}.png`));
const home=new Set(['art/home/background-b-portrait.webp','art/home/background-b-landscape.webp']);

/** Only the current Gym entry's reachable images. Former covers, scout art,
 * consumables from the disabled module and unused original equipment stay out.
 */
export function selectStartupAssets<T extends {path:string}>(entries:readonly T[]):T[]{
 return entries.filter(({path})=>home.has(path)||path.startsWith('art/game/')||path.startsWith('art/shot/')||path.startsWith('art/shot-status/')
  ||path.startsWith('art/career/')||path.startsWith('art/collection/')||equipmentPaths.has(path)||portraitPaths.has(path)
  ||path==='art/players/high-potential-rookie.png'||path==='art/scheme-a/design-atlas.png');
}

/** Decode the court/rookie first, then portraits and basic gear, then the rest.
 * A batch barrier keeps large optional-panel images from competing with the
 * first screen. All batches finish before the loading screen claims readiness.
 */
export function startupAssetBatches<T extends {path:string}>(entries:readonly T[]):T[][]{
 const priority=(path:string)=>home.has(path)||path.startsWith('art/game/')||path.startsWith('art/shot/')
  ||path==='art/players/high-potential-rookie.png'||path==='art/scheme-a/design-atlas.png'?0
  :portraitPaths.has(path)||commonEquipment.has(path)?1:2;
 const selected=selectStartupAssets(entries);
 return [0,1,2].map(group=>selected.filter(asset=>priority(asset.path)===group)).filter(batch=>batch.length);
}
