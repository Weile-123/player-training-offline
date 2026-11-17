/** Workspace convenience command. Deployed packages run server/start.mjs without a build dependency. */
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {prepareGymAuthority} from '../scripts/prepare-gym-authority.mjs';
import {resolveGymServerToken} from './gymAuthorityRuntime.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const token=await resolveGymServerToken(process.env,root),environment=process.env.GYM_AUTHORITY_ENVIRONMENT;
if(!token||!environment)throw Error('Missing server SHAPER_TOKEN or GYM_AUTHORITY_ENVIRONMENT');
const mode=process.env.GYM_AUTHORITY_MODE??'production';
if(mode==='production'&&((!process.env.GYM_AUTHORITY_AUTH_MODULE&&process.env.GYM_AUTHORITY_AUTH_MODE!=='cloudbase-gateway')||!process.env.CLOUDBASE_ENV_ID))throw Error('Production requires verified authentication and a shared database');
const {outDir}=await prepareGymAuthority({outDir:resolve(root,'.tmp/gym-authority-runtime')});
const {startGymAuthorityRuntime}=await import(pathToFileURL(resolve(outDir,'server/gymAuthorityRuntime.mjs')).href);
const env={...process.env,SHAPER_TOKEN:token,...(process.env.GYM_AUTHORITY_AUTH_MODULE?{GYM_AUTHORITY_AUTH_MODULE:resolve(root,process.env.GYM_AUTHORITY_AUTH_MODULE)}:{})};
const runtime=await startGymAuthorityRuntime({env});
console.log(JSON.stringify({service:'gym-authority',mode:runtime.mode,port:runtime.port,host:runtime.host,repository:runtime.repository,liveTimeflow:runtime.liveTimeflow}));
for(const event of ['SIGINT','SIGTERM'])process.once(event,()=>runtime.server.close(()=>process.exit(0)));
