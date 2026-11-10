import {build} from 'esbuild';
import fs from 'node:fs';
import {quotaExperimentPlugin,curves} from './quota-experiment.mjs';
const results={};
for(const curve of ['baseline',...Object.keys(curves)]){
 if(curve==='baseline')delete process.env.QUOTA_CURVE;else process.env.QUOTA_CURVE=curve;
 const outfile=`.tmp/verify-quota-${curve}.mjs`;
 await build({stdin:{contents:`import {newContract,previewSettlement} from './src/game/contract/engine';import{rerollPrice,merchantPrice}from'./src/game/contract/commerce';export const rows=Array.from({length:60},(_,i)=>{const s=newContract(7);s.month=i+1;return {month:s.month,quota:previewSettlement(s).required,reroll:rerollPrice(s.month,0),merchant:merchantPrice(s.month,'basic')};});`,resolveDir:process.cwd(),loader:'ts'},outfile,bundle:true,platform:'node',format:'esm',logLevel:'silent',plugins:quotaExperimentPlugin()});
 results[curve]=(await import('../'+outfile)).rows;
 if(curve!=='baseline')for(const [i,row]of results[curve].entries()){
  const base=results.baseline[i],pct=curves[curve][Math.min(i,20)];
  if(BigInt(row.quota)!==(BigInt(base.quota)*BigInt(pct)+50n)/100n)throw Error('Quota mismatch');
  if(row.reroll!==base.reroll||row.merchant!==base.merchant)throw Error('Commerce changed');
  if(i&&BigInt(row.quota)<BigInt(results[curve][i-1].quota))throw Error('Quota decreased');
 }
}
delete process.env.QUOTA_CURVE;
fs.mkdirSync('output/quota-experiment-20261023',{recursive:true});
fs.writeFileSync('output/quota-experiment-20261023/verified-curves.json',JSON.stringify(results,null,2));
console.log('Verified 60 months: exact targets, monotonic curves, unchanged commerce.');
