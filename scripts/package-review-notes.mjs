import {readFileSync,writeFileSync,readdirSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

copyFileSync('docs/渲染与发布说明.md','dist/REVIEW-NOTES.md');
writeFileSync('dist/THIRD-PARTY-NOTICES.txt','Preact 10.29.8 (locally adapted game renderer)\n'+readFileSync('vendor/preact/LICENSE','utf8')+'\nuse-sync-external-store (ESM compatibility adaptation)\n'+readFileSync('vendor/use-sync-external-store/LICENSE','utf8'));
const files=[];
// Binary audio data is a separate static module, imported during optional
// preloading. No custom native network transport is permitted in the game.
const audioChunk=readdirSync('dist/assets').find(name=>/^staticAudioData-.*\.js$/.test(name));
if(!audioChunk)throw Error('Missing packaged audio data module');
for(const name of readdirSync('dist/assets').filter(name=>name.endsWith('.js')).sort()){
 const path='assets/'+name,code=readFileSync('dist/'+path,'utf8'),references=[];
 for(const [index,line] of code.split('\n').entries()){
  const pattern=/https?:\/\/www\.w3\.org\/[^"'\s<>]+/g;
  for(const match of line.matchAll(pattern))references.push({line:index+1,column:match.index+1,namespace:match[0],context:line.slice(Math.max(0,match.index-100),match.index+match[0].length+100)});
 }
 const checks={researchReferenceLink:/forgetax\.tools/i.test(code),w3NamespaceLiteral:code.includes('www.w3.org'),reactDocumentationLink:code.includes('reactjs.org'),htmlWrite:/\.innerHTML\s*=/.test(code),directFetch:/\bfetch\s*\(/.test(code)};
 if(Object.values(checks).some(Boolean))throw Error('Unexpected legacy renderer, HTML write or direct network request in '+path);
 files.push({path,sha256:createHash('sha256').update(code).digest('hex'),references,checks});
}
writeFileSync('dist/REVIEW-EVIDENCE.json',JSON.stringify({purpose:'Game renderer build evidence; not a platform security approval.',renderer:'Preact 10.29.8 game-specific HTML/SVG prototype renderer',audio:{delivery:'separate static ES module containing base64 binary samples; decoded as bytes, never executed as code',path:'assets/'+audioChunk,source:'src/presentation/staticAudioData.ts',sourceSha256:createHash('sha256').update(readFileSync('src/presentation/staticAudioData.ts')).digest('hex')},files},null,2)+'\n');
console.log('Packaged REVIEW-NOTES.md and REVIEW-EVIDENCE.json.');
