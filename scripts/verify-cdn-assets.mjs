import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const {urls={}}=JSON.parse(readFileSync('public/config/assets.json','utf8'));
const entries=Object.entries(urls),metadata={},errors=[];let next=0;
await Promise.all(Array.from({length:4},async()=>{while(next<entries.length){const [path,url]=entries[next++];try{
 const response=await fetch(url,{referrerPolicy:'no-referrer',signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw Error(`HTTP ${response.status}`);
 if(response.headers.get('access-control-allow-origin')!=='*')throw Error('CDN must allow cross-origin reads');
 const bytes=Buffer.from(await response.arrayBuffer());
 if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Invalid PNG');
 metadata[path]={url,bytes:bytes.length,hash:createHash('sha256').update(bytes).digest('hex').slice(0,16)};
 }catch(error){errors.push({path,url,error:String(error)})}}}));
if(errors.length){console.error(JSON.stringify(errors,null,2));process.exitCode=1}else{
 writeFileSync('src/data/cdn-assets.json',JSON.stringify(Object.fromEntries(Object.entries(metadata).sort()),null,2)+'\n');
 console.log(JSON.stringify({verified:entries.length,bytes:Object.values(metadata).reduce((s,a)=>s+a.bytes,0)}));
}
