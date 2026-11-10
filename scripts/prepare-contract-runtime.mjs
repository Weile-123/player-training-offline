import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';

// Research snapshots stay intact; only gameplay data is shipped to browsers.
const root = 'src/game/contract/';
const read = name => JSON.parse(readFileSync(root + 'reference/' + name + '.json', 'utf8'));
const {title, source_note, sources, ...numerical} = read('numerical');
const equipment = {relics: read('equipment').relics.map(({id, name}) => ({id, name}))};
mkdirSync(root + 'runtime', {recursive: true});
for (const [name, data] of Object.entries({numerical, equipment})) {
  const text = JSON.stringify(data, null, 2) + '\n';
  if (/https?:\/\//i.test(text)) throw Error('Research URL leaked into runtime data: ' + name);
  writeFileSync(root + 'runtime/' + name + '.json', text);
}
