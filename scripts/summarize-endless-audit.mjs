import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
const root='output/balance-audit-20261022',result={runs:0,ended:0,monthLimit:0,actionLimit:0,errors:[],actions:0,extraShots:0,maxLevel:0,maxCash:'0',months:{},groups:{}};
for(const file of fs.readdirSync(root+'/endless').filter(f=>f.endsWith('.json.gz'))){
 const data=JSON.parse(gunzipSync(fs.readFileSync(root+'/endless/'+file))),s=data.summary;
 result.runs++;result.ended+=Number(s.status==='ended');result.monthLimit+=Number(s.status==='month-limit');result.actionLimit+=Number(s.status==='action-limit');
 if(s.error)result.errors.push({key:s.key,error:s.error});
 result.actions+=s.operations;result.extraShots+=data.actions.filter(a=>a.type==='train'||a.type==='share-reward').length;
 result.months[s.month]=(result.months[s.month]??0)+1;
 const group=s.key.replace(/-\d+-endless$/,''),g=result.groups[group]??={runs:0,ended:0,survived60:0};g.runs++;g.ended+=Number(s.status==='ended');g.survived60+=Number(s.status==='month-limit');
 for(const row of data.rows){result.maxLevel=Math.max(result.maxLevel,row.playerAfter?.level??0);if(BigInt(row.cashAfter)>BigInt(result.maxCash))result.maxCash=row.cashAfter;}
}
fs.writeFileSync(root+'/endless-summary.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
