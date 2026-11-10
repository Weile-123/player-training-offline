import {build} from 'esbuild';
await build({entryPoints:['scripts/audit-missing-templates.ts'],outfile:'.tmp/audit-missing-templates.mjs',bundle:true,platform:'node',format:'esm',logLevel:'silent'});
await import('../.tmp/audit-missing-templates.mjs');
