import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../.tmp/gym-equipment-v3-journey.mjs', import.meta.url));
await mkdir(new URL('../.tmp/', import.meta.url), {recursive: true});
await build({absWorkingDir: root, entryPoints: ['scripts/gym-equipment-v3-journey.ts'], outfile: output,
  bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'silent'});
await import(pathToFileURL(output).href);
