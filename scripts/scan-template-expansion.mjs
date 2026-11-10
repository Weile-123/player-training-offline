import {build} from 'esbuild';
await build({entryPoints:['scripts/scan-template-expansion.ts'],outfile:'.tmp/scan-template-expansion.mjs',bundle:true,platform:'node',format:'esm'});
await import('../.tmp/scan-template-expansion.mjs');
