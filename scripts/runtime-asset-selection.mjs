/** Build-time closure for the shipped Gym entry. Public originals remain intact. */
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=ts.createSourceFile('equipmentArt.ts',readFileSync(new URL('../src/game/gym/equipmentArt.ts',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
let mapping;
for(const statement of source.statements)if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations){
  if(declaration.name.getText(source)==='equipmentArtIds')mapping=declaration.initializer;
}
if(!mapping||!ts.isObjectLiteralExpression(mapping))throw Error('Equipment artwork mapping requires a reviewed asset closure');
const equipmentImages=new Set();
for(const entry of mapping.properties){
  if(!ts.isPropertyAssignment(entry)||!ts.isStringLiteral(entry.initializer)||!/^relic_\d{3}$/.test(entry.initializer.text))throw Error('Dynamic equipment artwork requires a reviewed asset closure');
  equipmentImages.add(`art/products/${entry.initializer.text}.png`);
}
if(!equipmentImages.size)throw Error('Current equipment artwork mapping is empty');

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
  // Legacy Gym equipment is migrated to the current catalog. Its preserved
  // historical collection is displayed as a count, never as old ProductImages.
  if(path.startsWith('art/products/'))return equipmentImages.has(path);
  return true;
}
export const currentEquipmentImages=Object.freeze([...equipmentImages].sort());
export const currentHomeImages=Object.freeze(['art/home/background-b-portrait.webp','art/home/background-b-landscape.webp']);
