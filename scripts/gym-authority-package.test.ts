import {afterEach,beforeEach,expect,it} from 'vitest';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {prepareGymAuthority} from './prepare-gym-authority.mjs';
import {resolveGymRdbServiceToken,resolveGymServerToken} from '../server/gymAuthorityRuntime.mjs';
let directory:string;
const packageTestBase=process.env.GYM_AUTHORITY_EXTERNAL_PACKAGE_TEST==='1'?resolve(tmpdir()):resolve('.tmp/gym-authority-portable-tests');
beforeEach(async()=>{await mkdir(packageTestBase,{recursive:true});directory=await mkdtemp(join(packageTestBase,'legend-gym-authority-package-'));});
afterEach(async()=>{if(dirname(resolve(directory))!==packageTestBase||!resolve(directory).startsWith(join(packageTestBase,'legend-gym-authority-package-')))throw Error('Unsafe package test cleanup');await rm(directory,{recursive:true,force:true});});

it('builds a hash-listed package without credentials or runtime build dependencies and keeps its production lock aligned',async()=>{
 const result=await prepareGymAuthority({outDir:directory});expect(result.files).toBeGreaterThan(100);
 const manifest=JSON.parse(await readFile(join(directory,'manifest.json'),'utf8'));
 expect(manifest.sourceCredentialsIncluded).toBe(false);
 for(const file of manifest.files){expect(file.path).not.toMatch(/credentials\.json$|node_modules\/|(^|\/)\.env/);expect(createHash('sha256').update(await readFile(join(directory,file.path))).digest('hex')).toBe(file.sha256);}
 const pkg=JSON.parse(await readFile(join(directory,'package.json'),'utf8')),lock=JSON.parse(await readFile(join(directory,'package-lock.json'),'utf8'));
 expect(pkg.dependencies).toEqual(lock.packages[''].dependencies);expect(lock.packages[''].name).toBe(pkg.name);expect(pkg.dependencies.esbuild).toBeUndefined();expect(pkg.scripts.start).toBe('node server/start.mjs');
 const code=await readFile(join(directory,'server/main.mjs'),'utf8');expect(code).not.toContain(resolve('.'));expect(code).not.toMatch(/from ["']esbuild["']/);
});

it('starts from a standalone package directory without source/node_modules and serves the local test-only BFF',async()=>{
 await prepareGymAuthority({outDir:directory});
 const code=`import {startGymAuthorityRuntime} from './server/gymAuthorityRuntime.mjs';
let cursor=100000;const clock=()=>({streamKey:'clock:main',ensure:async()=>({}),settle:async()=>{const from=cursor,to=cursor+1;cursor=to;const report={settlementId:'portable-'+to,realDuration:1,effectiveDuration:1,segments:[{from,to,streamKey:'clock:main',metricId:'elapsed_ms',phaseIndex:0,rate:'1',produced:'1',capped:'0',netChange:'1'}],gains:{elapsed_ms:'1'},losses:{},capped:{},events:[],ruleVersions:{gym_clock_ms:1},definitionVersion:1,replayed:false,approximated:false};return{status:'ready',settlementId:report.settlementId,report};},ack:async()=>({})});
const runtime=await startGymAuthorityRuntime({env:{GYM_AUTHORITY_MODE:'development',GYM_AUTHORITY_TEST_ONLY:'1',GYM_AUTHORITY_ENVIRONMENT:'packaging-test',SHAPER_TOKEN:'packaging-test-token-only',GYM_DEV_SESSION:'packaging-test-local-session',PORT:'0'},testClockFactory:clock});
try{const base='http://127.0.0.1:'+runtime.port;const headers={'X-Gym-Dev-Session':'packaging-test-local-session','Content-Type':'application/json'};const denied=await fetch(base+'/api/gym/session');if(denied.status!==401)throw Error('Unauthenticated read accepted');const session=(await(await fetch(base+'/api/gym/session',{headers})).json()).data;const started=(await(await fetch(base+'/api/gym/start',{method:'POST',headers,body:JSON.stringify({epoch:session.epoch,requestId:'portable-start'})})).json()).data;if(!started.hasSave||started.state.updatedAt!==100001||runtime.liveTimeflow!==false)throw Error('Portable package failed');console.log(JSON.stringify({portable:true,unauthenticatedStatus:denied.status,hasSave:started.hasSave,realPlatformCalls:false}));}finally{await new Promise(r=>runtime.server.close(r));}`;
 const child=spawnSync(process.execPath,['--input-type=module','--eval',code],{cwd:directory,env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,TEMP:process.env.TEMP,TMP:process.env.TMP,PATH:process.env.PATH,NODE_PATH:''},windowsHide:true,encoding:'utf8',timeout:15000});
 expect(child.error).toBeUndefined();expect(child.status,child.stderr).toBe(0);expect(JSON.parse(child.stdout.trim())).toEqual({portable:true,unauthenticatedStatus:401,hasSave:true,realPlatformCalls:false});
});

it('fails closed in production without configuration and rejects all test clock overrides',async()=>{
 await prepareGymAuthority({outDir:directory});
 const {startGymAuthorityRuntime}=await import(pathToFileURL(join(directory,'server/gymAuthorityRuntime.mjs')).href);
 await expect(startGymAuthorityRuntime({env:{},runtimeRoot:directory})).rejects.toThrow('Missing server');
 await expect(startGymAuthorityRuntime({env:{GYM_AUTHORITY_MODE:'production',GYM_AUTHORITY_TEST_ONLY:'1'},runtimeRoot:directory,testClockFactory:()=>({})})).rejects.toThrow('forbidden in production');
 await expect(startGymAuthorityRuntime({env:{GYM_AUTHORITY_MODE:'production',SHAPER_TOKEN:'test-token-not-real',GYM_AUTHORITY_ENVIRONMENT:'test'},runtimeRoot:directory})).rejects.toThrow('verified authentication module');
});

it('resolves only the official shaperToken field from an explicit mount, with environment precedence',async()=>{
 await writeFile(join(directory,'credentials.json'),JSON.stringify({shaperToken:'fixture-mount-token',token:'not-the-authority-token'}));
 expect(await resolveGymServerToken({GYM_AUTHORITY_CREDENTIALS_FILE:'./credentials.json'},directory)).toBe('fixture-mount-token');
 expect(await resolveGymServerToken({SHAPER_TOKEN:' fixture-env-token ',GYM_AUTHORITY_CREDENTIALS_FILE:'./credentials.json'},directory)).toBe('fixture-env-token');
 await writeFile(join(directory,'credentials.json'),JSON.stringify({token:'must-not-be-read',ticket:'must-not-be-read'}));
 expect(await resolveGymServerToken({GYM_AUTHORITY_CREDENTIALS_FILE:'./credentials.json'},directory)).toBeUndefined();
});

it('resolves the documented CloudBase credential shapes and accessKey fallback without duplicating Bearer',async()=>{
 const app=(value:unknown)=>({auth:()=>({getClientCredential:async()=>value})});
 expect(await resolveGymRdbServiceToken(app('fixture-service-key'),{})).toBe('Bearer fixture-service-key');
 expect(await resolveGymRdbServiceToken(app({access_token:'Bearer fixture-service-key'}),{})).toBe('Bearer fixture-service-key');
 expect(await resolveGymRdbServiceToken(app(null),{COLORBOX__ACCESS_KEY:'fixture-access-key'})).toBe('Bearer fixture-access-key');
 await expect(resolveGymRdbServiceToken(app(null),{})).rejects.toThrow('service credential unavailable');
});
