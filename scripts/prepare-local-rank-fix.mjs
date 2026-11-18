import {prepareGymAuthority,prepareGymCloudBase} from './prepare-gym-authority.mjs';
const base='outputs/rank-refresh-fix-20261117';
const authority=await prepareGymAuthority({outDir:base+'/authority'});
const cloud=await prepareGymCloudBase({authorityDir:authority.outDir,outDir:base+'/cloudbase'});
console.log(JSON.stringify({authority:authority.outDir,cloudbase:cloud.outDir,files:cloud.files}));
