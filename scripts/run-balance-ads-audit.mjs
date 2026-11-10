import {build} from 'esbuild';
import {quotaExperimentPlugin} from './quota-experiment.mjs';
import {mkdir} from 'node:fs/promises';
await mkdir('.tmp',{recursive:true});
const worker=process.argv.includes('--policy')?process.argv[process.argv.indexOf('--policy')+1]:'all';
const outfile='.tmp/balance-ads-audit-'+worker+'-'+process.pid+'.mjs';
await build({entryPoints:['scripts/balance-ads-audit.ts'],outfile,bundle:true,platform:'node',format:'esm',target:'node20',logLevel:'silent',plugins:quotaExperimentPlugin()});
await import('../'+outfile+'?run='+Date.now());
