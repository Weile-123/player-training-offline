/** Trusted operator CLI. It never runs provisioning merely by being imported. */
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,dirname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createGymTimeflowUpstream,timeflowApplicationId} from '../server/timeflow.mjs';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
const activity=JSON.parse(await readFile(new URL('../hupu-skills/activity.json',import.meta.url),'utf8'));
const requiredScenarios=['1h','1d','30d','window','segment-equivalence','receipt-replay'];
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const failure=(code,message)=>Object.assign(new Error(message),{code});
const hash=value=>createHash('sha256').update(value).digest('hex');
const key=(purpose,value)=>`gym-${purpose}-${hash(value).slice(0,40)}`;

/** Only documented Timeflow fields are credentials; deployment API keys are never reused. */
export async function resolveGymShaperCredential({env=process.env,read=readFile}={}) {
  if(typeof env.SHAPER_TOKEN==='string'&&env.SHAPER_TOKEN.trim())return{token:env.SHAPER_TOKEN.trim(),source:'environment.SHAPER_TOKEN'};
  const candidates=['hupu-skills/credentials.json','hupu-skills/skills/credentials.json','hupu-skills/skills/shaper-timeflow/credentials.json','credentials.json'];
  for(const name of candidates){
    let value;
    try{value=JSON.parse(await read(resolve(projectRoot,name),'utf8'));}
    catch(error){if(error?.code==='ENOENT')continue;throw failure('INVALID_CREDENTIAL_FILE','Timeflow credential file cannot be read as JSON');}
    if(typeof value?.shaperToken==='string'&&value.shaperToken.trim())return{token:value.shaperToken.trim(),source:name+'.shaperToken'};
  }
  throw failure('MISSING_SHAPER_TOKEN','Missing server SHAPER_TOKEN or documented credentials.json.shaperToken');
}

/** The public guide specifies six named passed cases, but not their container DTO. */
export function readGymReplayEvidence(value) {
  if(!object(value)||value.passed!==true)throw failure('VALIDATION_NOT_PASSED','Platform definition validation did not pass');
  const found=new Map();
  const mark=(scenario,passed)=>{if(requiredScenarios.includes(scenario))found.set(scenario,found.get(scenario)===false?false:passed===true);};
  const visit=node=>{
    if(Array.isArray(node)){node.forEach(visit);return;}
    if(!object(node))return;
    if(typeof node.passed==='boolean')for(const entry of Object.values(node))if(typeof entry==='string')mark(entry,node.passed);
    for(const [name,entry] of Object.entries(node)){
      if(requiredScenarios.includes(name)&&object(entry)&&typeof entry.passed==='boolean')mark(name,entry.passed);
      visit(entry);
    }
  };
  visit(value);
  if(requiredScenarios.some(name=>found.get(name)!==true))throw failure('VALIDATION_EVIDENCE_INCOMPLETE','Platform validation must explicitly pass all six replay scenarios');
  return requiredScenarios.map(scenario=>({scenario,passed:true}));
}

function validateDefinition(definition) {
  if(!object(definition)||definition.workspaceId!==timeflowApplicationId||definition.protocolVersion!==1
    ||!Number.isSafeInteger(definition.definitionVersion)||definition.definitionVersion<1
    ||JSON.stringify(definition.scopeTypes)!=='["gym"]'||definition.metrics?.length!==1||definition.stream?.length!==1
    ||!Number.isSafeInteger(definition.maxOfflineTime)||definition.maxOfflineTime<14_400_000||definition.maxOfflineTime>2_592_000_000)throw failure('INVALID_GYM_DEFINITION','Gym clock definition identity or time bounds are invalid');
  const metric=definition.metrics[0],stream=definition.stream[0],phase=stream.phases?.[0];
  if(metric.metricId!=='elapsed_ms'||metric.precision!==0||metric.cap!==null||metric.capScope!=='stream'||metric.shared!==false
    ||stream.streamPattern!=='clock:{id}'||stream.metricId!=='elapsed_ms'||stream.ruleKey!=='gym_clock_ms'||stream.ruleVersion!==1
    ||stream.carrier!=='interpreter'||stream.lifecycle!=='continuous'||stream.phases?.length!==1
    ||phase.baseRate!=='1'||phase.capacity!==null||phase.until?.kind!=='immortal'
    ||stream.decay?.length||definition.tasks?.length||definition.events?.length||definition.delivery?.enabled!==false)throw failure('INVALID_GYM_DEFINITION','Gym clock must be a single uninterrupted millisecond stream');
}
function safeEvidencePath(value) {
  const path=resolve(projectRoot,value??'outputs/home-timeflow-20261117/timeflow/provisioning.json');
  const outputRoot=resolve(projectRoot,'outputs');
  if(!path.startsWith(outputRoot+sep)||relative(outputRoot,path).split(sep).some(part=>part==='..'))throw failure('INVALID_EVIDENCE_PATH','Provisioning evidence must stay inside project outputs');
  return path;
}
async function saveEvidence(path,evidence) {
  await mkdir(dirname(path),{recursive:true});
  // No raw upstream body, configuration, token, signature or user identity is copied.
  await writeFile(path,JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
}

/** Injected transports are explicitly marked test-only and never count as platform evidence. */
export async function provisionGymTimeflow({token,env=process.env,transport,client,baseUrl,now,requestIdFactory,
  definition:providedDefinition,requestId='legend-gym-clock',outFile,writeEvidence=saveEvidence}={}) {
  const credential=token?{token,source:'explicit-server-token'}:await resolveGymShaperCredential({env});
  const definition=providedDefinition??JSON.parse(await readFile(new URL('../activity/timeflow.definition.json',import.meta.url),'utf8'));
  validateDefinition(definition);
  if(typeof requestId!=='string'||!/^[A-Za-z0-9_:-]{1,64}$/.test(requestId))throw failure('INVALID_REQUEST_ID','Provisioning request ID is invalid');
  const file=safeEvidencePath(outFile);
  const service=client??createGymTimeflowUpstream({token:credential.token,baseUrl:baseUrl??env.TIMEFLOW_BASE_URL,
    workspaceId:timeflowApplicationId,transport,now,requestIdFactory,timeoutMs:20_000});
  if(typeof service?.call!=='function')throw failure('INVALID_PROTOCOL_CLIENT','Timeflow protocol client is unavailable');
  const evidence={applicationId:timeflowApplicationId,workspaceId:timeflowApplicationId,definitionVersion:definition.definitionVersion,
    definitionSha256:hash(JSON.stringify(definition)),authenticationSource:credential.source,
    source:transport||client?'injected-test-transport':'platform-http',stages:[],validation:[],activated:false,verifiedByPlatform:false};
  const stage=async(name,path,options)=>{
    const response=await service.call(path,options);
    if(response?.ok!==true)throw failure('INVALID_PROTOCOL_RESPONSE','Timeflow did not acknowledge the provisioning stage');
    evidence.stages.push({name,acknowledged:true,replayed:response.replayed===true});
    return response.data;
  };
  try{
    const workspaceRequest=key('workspace',`${requestId}:${timeflowApplicationId}`);
    await stage('workspace','/shaper/timeflow/v1/workspaces',{body:{workspaceId:timeflowApplicationId,displayName:activity.activityName,kind:'game',requestId:workspaceRequest},idempotencyKey:workspaceRequest});
    const scopeRequest=key('scope-type',`${requestId}:${timeflowApplicationId}:gym`);
    await stage('scope-type','/shaper/timeflow/v1/scope-types',{body:{workspaceId:timeflowApplicationId,scopeType:'gym',lockStrategy:'row',settlePriority:30,enabled:true,requestId:scopeRequest},idempotencyKey:scopeRequest});
    const definitionKey=key('definition',`${requestId}:${definition.definitionVersion}:${evidence.definitionSha256}`);
    await stage('definition','/shaper/timeflow/v1/definitions',{body:definition,idempotencyKey:definitionKey});
    const validation=await stage('validate',`/shaper/timeflow/v1/definitions/${definition.definitionVersion}/validate`,{idempotencyKey:key('validate',definitionKey)});
    evidence.validation=readGymReplayEvidence(validation);
    await stage('activate',`/shaper/timeflow/v1/definitions/${definition.definitionVersion}/activate`,{idempotencyKey:key('activate',definitionKey)});
    evidence.activated=true;evidence.verifiedByPlatform=evidence.source==='platform-http';
    await writeEvidence(file,evidence);
    return evidence;
  }catch(error){
    const candidate=typeof error?.code==='string'?error.code:'';
    evidence.failure={code:/^[A-Z][A-Z0-9_]{0,63}$/.test(candidate)?candidate:'PROVISIONING_FAILED'};
    await writeEvidence(file,evidence);
    throw failure(evidence.failure.code,'Timeflow provisioning did not complete; inspect the sanitized evidence file');
  }
}

async function main() {
  const args=process.argv.slice(2),options={};
  for(let index=0;index<args.length;index++){
    const name=args[index];
    if(name==='--out'&&args[index+1])options.outFile=args[++index];
    else if(name==='--request-id'&&args[index+1])options.requestId=args[++index];
    else throw failure('INVALID_ARGUMENT','Only --out and --request-id are supported; credentials belong in server configuration');
  }
  const evidence=await provisionGymTimeflow(options);
  process.stdout.write(JSON.stringify({ok:true,applicationId:evidence.applicationId,definitionVersion:evidence.definitionVersion,
    activated:evidence.activated,verifiedByPlatform:evidence.verifiedByPlatform,scenarios:evidence.validation})+'\n');
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  main().catch(error=>{const code=typeof error?.code==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)?error.code:'PROVISIONING_FAILED';
    const message=code==='MISSING_SHAPER_TOKEN'?'Missing server SHAPER_TOKEN or credentials.json.shaperToken; no platform request was made':'Timeflow provisioning failed; inspect sanitized evidence and server configuration';
    process.stderr.write(JSON.stringify({ok:false,code,message})+'\n');process.exitCode=1;});
}
