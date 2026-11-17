import {createHash} from 'node:crypto';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {dirname,relative,resolve} from 'node:path';
import {deflateRawSync} from 'node:zlib';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const crcTable=Array.from({length:256},(_,value)=>{for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
const crc32=bytes=>{let value=0xffffffff;for(const byte of bytes)value=crcTable[(value^byte)&255]^(value>>>8);return(value^0xffffffff)>>>0;};

/** ZIP creator OS=Unix and external attributes carry executable bootstrap mode,
 * independently of Windows stat/chmod behavior. No shell or archive dependency. */
export function createLinuxZip(entries){
 const local=[],central=[];let offset=0;
 if(entries.length>65535)throw Error('ZIP64 is not supported');
 for(const entry of entries){
  if(typeof entry.path!=='string'||!entry.path||entry.path.includes('\\')||entry.path.startsWith('/')||entry.path.split('/').some(part=>!part||part==='..'||part==='.'))throw Error('Unsafe archive path');
  const name=Buffer.from(entry.path),bytes=Buffer.from(entry.bytes),compressed=deflateRawSync(bytes,{level:6}),crc=crc32(bytes),mode=entry.unixMode??0o100644;
  const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(bytes.length,22);header.writeUInt16LE(name.length,26);
  local.push(header,name,compressed);
  const directory=Buffer.alloc(46);directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(0x314,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(0x800,8);directory.writeUInt16LE(8,10);directory.writeUInt16LE(33,14);directory.writeUInt32LE(crc,16);directory.writeUInt32LE(compressed.length,20);directory.writeUInt32LE(bytes.length,24);directory.writeUInt16LE(name.length,28);directory.writeUInt32LE((mode*65536)>>>0,38);directory.writeUInt32LE(offset,42);central.push(directory,name);
  offset+=header.length+name.length+compressed.length;if(offset>0xffffffff)throw Error('ZIP64 is not supported');
 }
 const centralBytes=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(centralBytes.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...local,centralBytes,end]);
}
export function inspectLinuxZip(bytes){
 const end=bytes.length-22;if(end<0||bytes.readUInt32LE(end)!==0x06054b50)throw Error('Invalid ZIP footer');
 const count=bytes.readUInt16LE(end+10),entries=[];let cursor=bytes.readUInt32LE(end+16);
 for(let index=0;index<count;index++){
  if(bytes.readUInt32LE(cursor)!==0x02014b50)throw Error('Invalid ZIP central directory');
  const nameLength=bytes.readUInt16LE(cursor+28),extra=bytes.readUInt16LE(cursor+30),comment=bytes.readUInt16LE(cursor+32);
  entries.push({path:bytes.subarray(cursor+46,cursor+46+nameLength).toString('utf8'),creatorOS:bytes[cursor+5],unixMode:bytes.readUInt32LE(cursor+38)>>>16,size:bytes.readUInt32LE(cursor+24)});cursor+=46+nameLength+extra+comment;
 }
 return entries;
}
async function filesIn(directory){
 const files=[];
 async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const file=resolve(dir,entry.name);if(entry.isSymbolicLink())throw Error('Deployment package must not contain symlinks');if(entry.isDirectory())await walk(file);else files.push({path:relative(directory,file).replaceAll('\\','/'),bytes:await readFile(file)});}}
 await walk(directory);files.sort((a,b)=>a.path.localeCompare(b.path));return files;
}

export async function packageGymCloudBase({sourceDir=resolve(root,'outputs/home-timeflow-20261117/cloudbase-package'),dependenciesDir=resolve(root,'.tmp/gym-cloudbase-production-deps'),outDir=resolve(root,'outputs/home-timeflow-20261117/cloudbase-deployments')}={}){
 const source=resolve(sourceDir),dependencies=resolve(dependenciesDir),sourceManifest=JSON.parse(await readFile(resolve(source,'manifest.json'),'utf8'));
 if(sourceManifest.sourceCredentialsIncluded!==false||sourceManifest.functionName!=='activity_api')throw Error('Unexpected reviewed source manifest');
 const sourceFiles=await filesIn(source),allowed=new Map(sourceManifest.files.map(file=>[file.path,file]));
 for(const file of sourceFiles){if(file.path==='manifest.json')continue;const expected=allowed.get(file.path);if(!expected||sha(file.bytes)!==expected.sha256)throw Error('Reviewed package changed or contains an unreviewed file');allowed.delete(file.path);}
 if(allowed.size)throw Error('Reviewed package is incomplete');
 const lockBytes=await readFile(resolve(source,'cloudfunctions/activity_api/package-lock.json'));
 if(sha(lockBytes)!==sha(await readFile(resolve(dependencies,'package-lock.json'))))throw Error('Installed production dependency lock differs from reviewed package');
 const lock=JSON.parse(lockBytes.toString('utf8'));
 for(const [path,entry]of Object.entries(lock.packages)){if(!path||entry.dev||entry.optional)continue;const installed=JSON.parse(await readFile(resolve(dependencies,path,'package.json'),'utf8'));if(installed.version!==entry.version)throw Error('Installed dependency does not match lock');}
 const dependencyFiles=(await filesIn(resolve(dependencies,'node_modules'))).map(file=>({...file,path:'cloudfunctions/activity_api/node_modules/'+file.path}));
 const entries=[...sourceFiles,...dependencyFiles];
 for(const file of entries)if(/(^|\/)(credentials\.json|\.env(?:\..*)?)$/.test(file.path))throw Error('Refusing to package runtime credentials');
 const files=entries.map(file=>({path:file.path,bytes:file.bytes.length,sha256:sha(file.bytes),unixMode:file.path==='cloudfunctions/activity_api/scf_bootstrap'?0o100755:0o100644})).sort((a,b)=>a.path.localeCompare(b.path));
 const fingerprint=sha(JSON.stringify(files)).slice(0,16),output=resolve(outDir,'activity-api-'+fingerprint);await mkdir(output,{recursive:true});
 for(const file of entries){const target=resolve(output,'package',file.path);await mkdir(dirname(target),{recursive:true});await writeFile(target,file.bytes);}
 const prefix='cloudfunctions/activity_api/',zipEntries=entries.filter(file=>file.path.startsWith(prefix)).map(file=>({path:file.path.slice(prefix.length),bytes:file.bytes,unixMode:file.path===prefix+'scf_bootstrap'?0o100755:0o100644}));
 const archive=createLinuxZip(zipEntries),inventory=inspectLinuxZip(archive),bootstrap=inventory.find(file=>file.path==='scf_bootstrap');
 if(!bootstrap||bootstrap.creatorOS!==3||bootstrap.unixMode!==0o100755||inventory.length!==zipEntries.length)throw Error('Executable bootstrap archive verification failed');
 const archivePath=resolve(output,'activity_api.zip');await writeFile(archivePath,archive);
 const review={applicationId:'app_847cdb589a',functionName:'activity_api',requiredRuntime:'Nodejs18.15',productionDependenciesInstalled:true,dependencyInstallation:'npm ci --omit=dev --ignore-scripts --offline --no-audit --no-fund',dependencyLockSha256:sha(lockBytes),sourceCredentialsIncluded:false,remoteDeployed:false,archive:{file:'activity_api.zip',bytes:archive.length,sha256:sha(archive),entries:inventory.length,bootstrap:{path:bootstrap.path,creatorOS:'Unix',unixMode:'100755'}},files};
 await writeFile(resolve(output,'deployment-manifest.json'),JSON.stringify(review,null,2)+'\n');return{outDir:output,archivePath,files:files.length,zipBytes:archive.length,sha256:review.archive.sha256,bootstrapMode:'0755',remoteDeployed:false};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)console.log(JSON.stringify(await packageGymCloudBase()));
