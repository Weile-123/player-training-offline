import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const entry = process.argv[2] === 'economy' ? 'gym-economy-balance' : 'gym-balance';
const output = fileURLToPath(new URL('../.tmp/' + entry + '.mjs', import.meta.url));
await mkdir(new URL('../.tmp/', import.meta.url), {recursive: true});
await build({absWorkingDir: root, entryPoints: ['scripts/' + entry + '.ts'], outfile: output,
  bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'silent'});
await import(pathToFileURL(output).href);
