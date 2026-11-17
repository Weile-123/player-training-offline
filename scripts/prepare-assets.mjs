import {existsSync,readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {join,dirname} from 'node:path';import {createHash} from 'node:crypto';
import {includeRuntimeAsset,currentHomeImages} from './runtime-asset-selection.mjs';
import './prepare-contract-runtime.mjs';
const config=JSON.parse(readFileSync('public/config/assets.json','utf8'));
const previous=JSON.parse(readFileSync('src/data/runtime-assets.json','utf8'));
const verified=existsSync('src/data/cdn-assets.json')?JSON.parse(readFileSync('src/data/cdn-assets.json','utf8')):{};
const portraits=JSON.parse(readFileSync('src/data/poster-portraits.json','utf8'));
const alwaysLocal=new Set([...currentHomeImages,...Object.values(portraits),'art/collection/court-lines.svg','art/home/continue-frame.svg','art/shot/player-data.json']);
const paths=new Set([...previous.entries.map(a=>a.path),...Object.keys(config.urls??{}),...alwaysLocal].filter(includeRuntimeAsset));
const entries=[...paths].sort().map(path=>{
 const url=alwaysLocal.has(path)?undefined:config.urls?.[path];
 if(url){const a=verified[path];if(!a||a.url!==url)throw Error(`Run npm run assets:verify for ${path}`);return {path,bytes:a.bytes,hash:a.hash,local:false,url};}
 const bytes=readFileSync('public/'+path);return {path,bytes:bytes.length,hash:createHash('sha256').update(bytes).digest('hex').slice(0,16),local:alwaysLocal.has(path)||!config.baseUrl};
});
const data={version:createHash('sha256').update(JSON.stringify(entries)).digest('hex').slice(0,16),entries};
writeFileSync('src/data/runtime-assets.json',JSON.stringify(data,null,2)+'\n');
if(process.argv.includes('--export')){
 const root='output/cdn-upload';mkdirSync(root,{recursive:true});
 for(const a of entries.filter(a=>!a.local)){const source='public/'+a.path;if(!existsSync(source))throw Error(`Local original missing: ${source}`);const target=join(root,a.path);mkdirSync(dirname(target),{recursive:true});copyFileSync(source,target);}
 writeFileSync(root+'/asset-manifest.json',JSON.stringify(data,null,2)+'\n');
}
console.log(JSON.stringify({files:entries.length,localMB:entries.filter(a=>a.local).reduce((s,a)=>s+a.bytes,0)/1048576,cdnMB:entries.filter(a=>!a.local).reduce((s,a)=>s+a.bytes,0)/1048576}));
