/** Read-only deployment readiness. No API call and no credential value is emitted. */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolveGymShaperCredential} from './timeflow-register.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const file=path=>resolve(root,path);
const candidates=['credentials.json','hupu-skills/credentials.json','hupu-skills/skills/credentials.json','hupu-skills/skills/shaper-timeflow/credentials.json'];
let credential={configured:false,source:null,errorCode:null};
try{const value=await resolveGymShaperCredential();credential={configured:true,source:value.source,errorCode:null};}
catch(error){credential.errorCode=typeof error?.code==='string'?error.code:'CREDENTIAL_UNAVAILABLE';}
const sums=(await readFile(file('hupu-skills/skills/shaper-timeflow/sdk/SHA256SUMS'),'utf8')).trim().split(/\r?\n/);
let verified=0;
for(const line of sums){const[expected,path]=line.trim().split(/\s+/);if(createHash('sha256').update(await readFile(file('hupu-skills/skills/shaper-timeflow/sdk/'+path))).digest('hex')!==expected)throw Error('Timeflow SDK integrity check failed');verified++;}
let platformEvidence={present:false,verifiedByPlatform:false,activated:false};
const evidencePath=file('outputs/home-timeflow-20261117/timeflow/provisioning.json');
if(existsSync(evidencePath)){const data=JSON.parse(await readFile(evidencePath,'utf8'));platformEvidence={present:true,verifiedByPlatform:data.verifiedByPlatform===true&&data.source==='platform-http',activated:data.activated===true};}
const deployment=JSON.parse(await readFile(file('activity/timeflow.manifest.json'),'utf8'));
const deployed=deployment.deploymentStatus==='active';
const configuration={environmentConfigured:!!process.env.GYM_AUTHORITY_ENVIRONMENT||deployed&&!!deployment.environmentId,
 databaseConfigured:!!process.env.CLOUDBASE_ENV_ID||deployed&&deployment.verification.databaseMigrationApplied===true,
 trustedAuthenticationConfigured:!!process.env.GYM_AUTHORITY_AUTH_MODULE&&existsSync(resolve(process.env.GYM_AUTHORITY_AUTH_MODULE))
  ||deployed&&deployment.verification.gatewayVerified===true,
 frontendBaseConfigured:/^https:\/\//.test(process.env.VITE_GYM_AUTHORITY_API_BASE??(deployed?deployment.publicApiBase:'')),
 frontendEnvironmentConfigured:!!process.env.VITE_GYM_AUTHORITY_ENV_ID||deployed&&!!deployment.environmentId};
const result={date:'2026-11-17',readOnly:true,platformRequestsMade:0,credential,credentialFiles:candidates.map(path=>({path,present:existsSync(file(path))})),
 sdk:{verifiedFiles:verified},configuration,configurationSource:deployed?'verified-deployment-manifest-or-server-environment':'server-environment-only',platformEvidence,
 configurationReady:credential.configured&&Object.values(configuration).every(Boolean)&&platformEvidence.verifiedByPlatform&&platformEvidence.activated,
 ready:credential.configured&&Object.values(configuration).every(Boolean)&&platformEvidence.verifiedByPlatform&&platformEvidence.activated&&deployment.verification.productionBusinessFlow===true,
 documentaryCredentialSources:['SHAPER_TOKEN','credentials.json.shaperToken'],
 documentaryReferences:['hupu-skills/skills/shaper-timeflow/references/management.md','hupu-skills/skills/shaper-timeflow/references/authentication.md','hupu-skills/skills/shaper-timeflow/scripts/register-platform.py']};
const out=file('outputs/home-timeflow-20261117/timeflow/readiness.json');await mkdir(resolve(out,'..'),{recursive:true});await writeFile(out,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));if(!result.ready)process.exitCode=2;
