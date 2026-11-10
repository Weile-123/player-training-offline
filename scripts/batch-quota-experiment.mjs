import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {curves} from './quota-experiment.mjs';
const root='output/quota-experiment-20261023';
const runs=process.argv[2]??'50';
const baseline='output/balance-audit-20261023-heat3';
const jobs=[];
const selected=process.argv[3]?[process.argv[3]]:Object.keys(curves);
if(selected.some(name=>!curves[name]))throw Error('Unknown curve');
for(const name of selected)for(const mode of ['ads','no-ads']){
 const dest=`${root}/${name}/${mode}`;fs.mkdirSync(dest,{recursive:true});
 // Identical legally earned starting profiles, not new accounts trained on each curve.
 fs.copyFileSync(`${baseline}/${mode}/advanced-profile.json`,`${dest}/advanced-profile.json`);
 fs.cpSync(`${baseline}/${mode}/prelude`,`${dest}/prelude`,{recursive:true});
 fs.writeFileSync(`${dest}/experiment.json`,JSON.stringify({name,percent:curves[name],baseline,commerce:'unchanged',prelude:'baseline rules',after21:'retain final percentage'},null,2));
 for(const policy of ['conservative','quota','focus','heat','template','mixed'])jobs.push({name,mode,policy});
}
async function worker(){while(jobs.length){
 const {name,mode,policy}=jobs.shift();const log=fs.createWriteStream(`${root}/${name}/${mode}-${policy}.log`);
 await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['scripts/run-balance-ads-audit.mjs','--runs',runs,'--policy',policy,...(mode==='ads'?['--ads']:[])],{env:{...process.env,QUOTA_CURVE:name,BALANCE_AUDIT_ROOT:`${root}/${name}`},stdio:['ignore','pipe','pipe'],windowsHide:true});
  child.stdout.pipe(log);child.stderr.pipe(log);child.on('error',reject);child.on('close',code=>{log.end();if(code)reject(Error(`${name}/${mode}/${policy}: ${code}`));else{console.log('done',name,mode,policy);resolve();}});
 });
}}
await Promise.all(Array.from({length:6},worker));
