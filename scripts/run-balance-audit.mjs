import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
await mkdir('.tmp',{recursive:true});
const worker=process.argv.includes('--policy')?process.argv[process.argv.indexOf('--policy')+1]:'all';
const outfile='.tmp/balance-audit-'+worker+'-'+process.pid+'.mjs';
await build({entryPoints:['scripts/balance-audit.ts'],outfile,bundle:true,platform:'node',format:'esm',target:'node20',logLevel:'silent'});
await import('../'+outfile+'?run='+Date.now());
