import {readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {dispatch,newContract} from '../src/game/contract/engine';
import {encodeContract,decodeContract} from '../src/game/contract/save';
import {mergeProfile,type Profile} from '../src/game/contract/profile';

const root=process.argv[2]??'output/balance-audit-20261023/ads';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const read=(file:string)=>JSON.parse(gunzipSync(readFileSync(file)).toString());
const report:{file:string;actions:number;hash:string}[]=[];
function replay(file:string){
 const data=read(file),s=data.summary;
 const endless=s.key.endsWith('-endless');
 let state=endless?read(root+'/runs-v2/'+s.key.replace(/-endless$/,'')+'.json.gz').finalState:newContract(s.seed,[],data.profile.collection);
 if(!endless){state.commerce.unlocked=[...data.profile.unlocked];state.careerId=data.finalState.careerId;}
 if(hash(state)!==s.initialHash)throw Error(file+': initial hash mismatch');
 for(const [i,action]of data.actions.entries()){
  const result=dispatch(state,state.revision,action);
  if(result.error)throw Error(file+': '+i+' '+result.error);
  state=result.state;
  if((i+1)%100===0)state=decodeContract(encodeContract(state))!;
 }
 if(hash(state)!==s.finalHash)throw Error(file+': final hash mismatch');
 report.push({file,actions:data.actions.length,hash:hash(state)});return data;
}
let profile:Profile={collection:{},unlocked:[]};
if(process.env.QUOTA_CURVE)process.env.QUOTA_PRELUDE='1';
for(let i=0;i<24;i++){
 const file=root+'/prelude/'+i+'.json.gz',data=read(file);
 if(hash(data.profile)!==hash(profile))throw Error('Profile provenance mismatch at '+i);
 replay(file);profile=mergeProfile(profile,{collection:data.finalState.collection,unlocked:data.finalState.commerce.unlocked});
}
if(hash(profile)!==JSON.parse(readFileSync(root+'/advanced-profile.json','utf8')).hash)throw Error('Advanced profile hash mismatch');
delete process.env.QUOTA_PRELUDE;
// Replay one seed in every policy/account/share group, plus any naturally capped run.
const picked=new Set<string>();
for(const file of readdirSync(root+'/runs-v2').filter(f=>/-0\.json\.gz$/.test(f)))picked.add(file);
let capped=false;
if(existsSync(root+'/diagnostics-500.json')){
 const diagnostics=JSON.parse(readFileSync(root+'/diagnostics-500.json','utf8'));
 if(diagnostics.maxExamples[0])picked.add(diagnostics.maxExamples[0].key+'.json.gz');capped=diagnostics.maxLevel===99;
}else for(const file of readdirSync(root+'/runs-v2').filter(f=>f.endsWith('.json.gz'))){
 if(capped)break;const data=read(root+'/runs-v2/'+file);
 if(data.rows.some((r:any)=>r.playerAfter?.level===99)){picked.add(file);capped=true;}
}
for(const file of picked)replay(root+'/runs-v2/'+file);
if(existsSync(root+'/endless')){
 const seen=new Set<string>();
 for(const file of readdirSync(root+'/endless').filter(f=>f.endsWith('.json.gz'))){
  const group=file.replace(/-\d+\.json\.gz$/,'');if(seen.has(group))continue;
  replay(root+'/endless/'+file);seen.add(group);
 }
}
writeFileSync(root+'/replay-check.json',JSON.stringify({passed:true,profileProvenance:true,cappedRunReplayed:capped,runs:report.length,actions:report.reduce((s,r)=>s+r.actions,0),report},null,2));
console.log(JSON.stringify({passed:true,runs:report.length,actions:report.reduce((s,r)=>s+r.actions,0),cappedRunReplayed:capped}));
