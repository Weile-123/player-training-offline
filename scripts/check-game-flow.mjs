import {build} from 'esbuild';
import {writeFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const out='output/leaderboard-verification';mkdirSync(out,{recursive:true});
await build({stdin:{contents:"export {simulateCommerce} from './src/game/contract/simulation';export {validContract} from './src/game/contract/save';",resolveDir:process.cwd()},outfile:'.tmp/game-flow-check.mjs',bundle:true,platform:'node',format:'esm'});
const {simulateCommerce,validContract}=await import(pathToFileURL(resolve('.tmp/game-flow-check.mjs')).href);
const runs=[];
for(let i=0;i<200;i++){
 const start=performance.now(),result=simulateCommerce(2026102300+i,60),ms=performance.now()-start;
 if(!validContract(result.state))throw Error('Invalid save: '+i);
 if(result.operations>=20000)throw Error('Action limit: '+i);
 runs.push({seed:2026102300+i,ms,operations:result.operations,month:result.state.month,status:result.state.status});
}
const sorted=runs.map(r=>r.ms).sort((a,b)=>a-b);
const report={scope:'Node engine simulation, not browser FPS or mobile performance',runs:runs.length,operations:runs.reduce((n,r)=>n+r.operations,0),p50Ms:sorted[99],p95Ms:sorted[189],maxMs:sorted[199],errors:0,details:runs};
writeFileSync(out+'/game-flow.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,details:undefined}));
