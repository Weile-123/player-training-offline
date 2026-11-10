import {build} from 'esbuild';
import fs from 'node:fs';
await build({stdin:{contents:"import {templateRules} from './src/game/contract/templates';import {statKeys} from './src/game/types';export const catalog={templates:templateRules.map(t=>t.id),statKeys};",resolveDir:process.cwd()},outfile:'.tmp/leaderboard-catalog.mjs',bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const {catalog}=await import('../.tmp/leaderboard-catalog.mjs');
fs.writeFileSync('activity/cloudfunctions/activity_api/catalog.json',JSON.stringify(catalog,null,2));
