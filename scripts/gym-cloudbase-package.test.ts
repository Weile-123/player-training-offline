import {afterEach,beforeEach,expect,it} from 'vitest';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createLinuxZip,inspectLinuxZip} from './package-gym-cloudbase.mjs';
const base=resolve('.tmp/gym-cloudbase-zip-tests');let directory:string;
beforeEach(async()=>{await mkdir(base,{recursive:true});directory=await mkdtemp(resolve(base,'case-'));});
afterEach(async()=>{if(!resolve(directory).startsWith(base+sep))throw Error('Unsafe cleanup');await rm(directory,{recursive:true,force:true});});
it('stores Unix executable bootstrap independently of Windows filesystem modes and is readable by the system archive tool',async()=>{
 const zip=createLinuxZip([{path:'scf_bootstrap',bytes:Buffer.from('#!/bin/sh\nexec node index.cjs\n'),unixMode:0o100755},{path:'index.cjs',bytes:Buffer.from('console.log("fixture")'),unixMode:0o100644}]);
 expect(inspectLinuxZip(zip)).toEqual([{path:'scf_bootstrap',creatorOS:3,unixMode:0o100755,size:30},{path:'index.cjs',creatorOS:3,unixMode:0o100644,size:22}]);
 const path=resolve(directory,'fixture.zip');await writeFile(path,zip);
 const command=spawnSync('tar',['-xOf',path,'scf_bootstrap'],{encoding:'utf8',windowsHide:true});expect(command.status,command.stderr).toBe(0);expect(command.stdout).toBe('#!/bin/sh\nexec node index.cjs\n');expect((await readFile(path)).equals(zip)).toBe(true);
});
it('rejects traversal paths before creating any deployable archive',()=>{
 for(const path of ['../secret','/secret','a/../secret','a\\secret'])expect(()=>createLinuxZip([{path,bytes:Buffer.from('fixture')}])).toThrow('Unsafe archive path');
});
