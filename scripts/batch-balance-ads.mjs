import {spawn} from 'node:child_process';
import fs from 'node:fs';
const runs=process.argv[2]??'50';
const jobs=['ads','no-ads'].flatMap(mode=>['conservative','quota','focus','heat','template','mixed'].map(policy=>({mode,policy})));
const root=process.env.BALANCE_AUDIT_ROOT??'output/balance-audit-20261023';
fs.mkdirSync(root,{recursive:true});
async function worker(){
 while(jobs.length){
  const {mode,policy}=jobs.shift();
  const log=fs.createWriteStream(`${root}/${mode}-${policy}.log`);
  const args=['scripts/run-balance-ads-audit.mjs','--runs',runs,'--policy',policy,...(mode==='ads'?['--ads']:[])];
  console.log('start',mode,policy,runs);
  await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:['ignore','pipe','pipe'],windowsHide:true});child.stdout.pipe(log);child.stderr.pipe(log);child.on('error',reject);child.on('close',code=>{log.end();if(code===0){console.log('done',mode,policy);resolve();}else reject(Error(`${mode}/${policy}: ${code}`));});});
 }
}
await Promise.all(Array.from({length:6},worker));
