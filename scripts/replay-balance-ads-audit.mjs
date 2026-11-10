import {build} from 'esbuild';
import {quotaExperimentPlugin} from './quota-experiment.mjs';
const mode=process.argv[2]?.endsWith('/no-ads')?'no-ads':'ads';
const outfile=`.tmp/replay-balance-ads-${mode}-${process.pid}.mjs`;
await build({entryPoints:['scripts/replay-balance-ads-audit.ts'],outfile,bundle:true,platform:'node',format:'esm',logLevel:'silent',plugins:quotaExperimentPlugin()});
await import('../'+outfile);
