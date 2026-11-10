import {readFileSync,mkdirSync,copyFileSync} from 'node:fs';import {dirname,resolve} from 'node:path';
const manifest=JSON.parse(readFileSync('src/data/runtime-assets.json','utf8'));
const config=JSON.parse(readFileSync('public/config/assets.json','utf8'));
const local=manifest.entries.filter(a=>a.local||(!config.urls?.[a.path]&&!config.baseUrl?.trim()));
const portraits=JSON.parse(readFileSync('src/data/poster-portraits.json','utf8'));
const files=[...Object.values(portraits),...local.map(a=>a.path),'config/assets.json','config/animation.json'];
for(const file of files){const target=resolve('dist',file);mkdirSync(dirname(target),{recursive:true});copyFileSync(resolve('public',file),target)}
console.log(`CDN build: ${manifest.entries.length-local.length} remote assets, ${local.length} local assets + ${Object.keys(portraits).length} on-demand poster portraits.`);
await import('./package-review-notes.mjs');
