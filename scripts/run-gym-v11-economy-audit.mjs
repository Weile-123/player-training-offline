import {build} from 'esbuild';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const bridge = fileURLToPath(new URL(`../.tmp/v11-production-engine-${process.pid}.mjs`, import.meta.url));
const manifestPath = fileURLToPath(new URL(`../.tmp/v11-production-engine-${process.pid}.json`, import.meta.url));
const output = fileURLToPath(new URL(`../.tmp/v11-economy-audit-${process.pid}.mjs`, import.meta.url));
await mkdir(new URL('../.tmp/', import.meta.url), {recursive: true});
const contents = [
  "export * from './src/game/gym/engine';",
  "export {validGym} from './src/game/gym/save';",
  "export {recentAlumniLimit} from './src/game/gym/history';",
  "export {gymEconomyVersion, selectedRecruitmentPrice} from './src/game/gym/catalog';",
  "export {templateById} from './src/game/templates';",
  "export {random} from './src/game/contract/random';",
].join('\n');
await build({stdin: {contents, resolveDir: root, sourcefile: 'v11-production-audit-bridge.ts', loader: 'ts'},
  outfile: bridge, bundle: true, platform: 'node', format: 'esm', target: 'node24', logLevel: 'silent'});
const sources = ['src/game/gym/engine.ts', 'src/game/gym/catalog.ts', 'src/game/gym/save.ts',
  'src/game/gym/history.ts', 'src/game/gym/selectedRecruitment.ts', 'src/game/gym/training.ts', 'src/game/templates.ts'];
const hashes = {};
for (const path of sources) hashes[path] = createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex');
await writeFile(manifestPath, JSON.stringify({frozenAt: new Date().toISOString(), engineMode: 'production-v11', output: bridge, hashes}, null, 2) + '\n');
process.env.V11_AUDIT_MANIFEST = manifestPath;
await build({absWorkingDir: root, entryPoints: ['scripts/gym-v11-economy-audit.ts'], outfile: output,
  bundle: true, platform: 'node', format: 'esm', target: 'node24', logLevel: 'silent'});
await import(pathToFileURL(output).href);
