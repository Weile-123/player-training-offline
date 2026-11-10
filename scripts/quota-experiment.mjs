import fs from 'node:fs';
import path from 'node:path';
export const curves={
 buffer:[100,100,100,95,90,85,80,80,80,85,90,95,100,100,100,100,100,100,100,100,100],
 mild:[100,100,100,95,90,85,80,80,80,85,90,95,100,105,110,115,120,130,140,145,150],
 staged:[100,100,100,90,80,75,70,70,70,75,80,90,100,110,120,135,150,165,180,190,200],
};
// Only the engine's settlement quota is replaced in the test bundle. Commerce
// keeps using the original money.ts quota; no application source is modified.
export function quotaExperimentPlugin(){
 const name=process.env.QUOTA_CURVE;
 if(!name)return [];
 const curve=curves[name];if(!curve)throw Error('Unknown quota curve: '+name);
 return [{name:'quota-experiment',setup(build){
  build.onLoad({filter:/[\\/]src[\\/]game[\\/]contract[\\/]engine\.ts$/},args=>{
   let contents=fs.readFileSync(args.path,'utf8');
   const target='BigInt(quota(s.month))';
   if(contents.split(target).length!==2)throw Error('Settlement injection target changed');
   contents=contents.replace(target,'BigInt(experimentQuota(s.month))');
   contents+=`\nfunction experimentQuota(month:number):string { if(process.env.QUOTA_PRELUDE==='1')return quota(month);const scale=${JSON.stringify(curve)};const pct=scale[Math.min(month,21)-1];return String((BigInt(quota(month))*BigInt(pct)+50n)/100n); }\n`;
   return {contents,loader:'ts',resolveDir:path.dirname(args.path)};
  });
 }}];
}
