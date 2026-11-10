import {build} from 'esbuild';
await build({entryPoints:['scripts/check-share-inheritance.ts'],outfile:'.tmp/check-share-inheritance.mjs',bundle:true,platform:'node',format:'esm',target:'node20',logLevel:'silent'});
await import('../.tmp/check-share-inheritance.mjs');
