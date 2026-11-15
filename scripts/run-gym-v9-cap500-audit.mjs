import {build} from 'esbuild';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL(`../.tmp/gym-v9-cap500-audit-${process.pid}.mjs`, import.meta.url));
await mkdir(new URL('../.tmp/', import.meta.url), {recursive: true});
if (process.env.CAP_AUDIT_ENGINE_MODE === 'production' && !process.env.CAP_AUDIT_BASELINE_MANIFEST) {
  // A new checkout can audit its current production engine without a historical
  // V8 cache. An explicitly supplied manifest still selects a frozen snapshot.
  const bridge = fileURLToPath(new URL(`../.tmp/gym-reward-production-${process.pid}.mjs`, import.meta.url));
  const manifestPath = fileURLToPath(new URL(`../.tmp/gym-reward-production-${process.pid}.json`, import.meta.url));
  const modules = {
    './src/game/gym/engine': '*', './src/game/gym/save': 'validGym', './src/game/gym/history': 'recentAlumniLimit',
    './src/game/gym/catalog': 'gymEconomyVersion', './src/game/templates': 'templateById',
    './src/game/gym/training': 'trainingPlans', './src/game/contract/random': 'random', './src/game/types': 'statKeys',
  };
  const contents = Object.entries(modules).map(([path, names]) =>
    names === '*' ? `export * from '${path}';` : `export {${names}} from '${path}';`).join('\n');
  await build({stdin: {contents, resolveDir: root, sourcefile: 'production-audit-bridge.ts', loader: 'ts'},
    outfile: bridge, bundle: true, platform: 'node', format: 'esm', target: 'node24', logLevel: 'silent'});
  const sources = ['src/game/gym/engine.ts', 'src/game/gym/catalog.ts', 'src/game/gym/save.ts',
    'src/game/gym/history.ts', 'src/game/gym/selectedRecruitment.ts', 'src/game/gym/training.ts', 'src/game/templates.ts'];
  const hashes = {};
  for (const path of sources) hashes[path] = createHash('sha256').update(await readFile(new URL(`../${path}`, import.meta.url))).digest('hex');
  await writeFile(manifestPath, JSON.stringify({frozenAt: new Date().toISOString(), engineMode: 'production', output: bridge, hashes}, null, 2) + '\n');
  process.env.CAP_AUDIT_BASELINE_MANIFEST = manifestPath;
}
await build({absWorkingDir: root, entryPoints: ['scripts/gym-v9-cap500-audit.ts'], outfile: output,
  bundle: true, platform: 'node', format: 'esm', target: 'node24', logLevel: 'silent'});
await import(pathToFileURL(output).href);
