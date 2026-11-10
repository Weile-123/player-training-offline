import {build} from 'esbuild';
await build({entryPoints:['scripts/replay-balance-audit.ts'],outfile:'.tmp/replay-balance-audit.mjs',bundle:true,platform:'node',format:'esm',target:'node20',logLevel:'silent'});
await import('../.tmp/replay-balance-audit.mjs?run='+Date.now());
