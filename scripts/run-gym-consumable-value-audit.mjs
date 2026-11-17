import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
await mkdir(new URL('../.tmp/', import.meta.url), {recursive: true});
const output = fileURLToPath(new URL('../.tmp/gym-consumable-value-audit-20261116.mjs', import.meta.url));
await build({entryPoints: [fileURLToPath(new URL('./gym-consumable-value-audit.ts', import.meta.url))], outfile: output,
  bundle: true, platform: 'node', format: 'esm', target: 'node24', logLevel: 'silent'});
await import(pathToFileURL(output).href);
