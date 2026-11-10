import {build} from 'esbuild';
await build({entryPoints:['scripts/calibrate-templates.ts'],outfile:'.tmp/calibrate-templates.mjs',bundle:true,platform:'node',format:'esm'});
await import('../.tmp/calibrate-templates.mjs');
