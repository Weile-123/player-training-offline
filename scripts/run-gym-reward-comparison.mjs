import {build} from 'esbuild';
import {readFile, mkdir} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';

// Simulation-only old-reward control. The built UI and production catalog are
// never changed; both groups use the current auto/inventory/experience rules.
const profile = process.env.GYM_ECONOMY_REWARD_PROFILE ?? 'current';
if (!['current', 'v4-control'].includes(profile)) throw new Error('Unknown reward profile');
const efficiency = process.argv[2] === 'efficiency';
const root = fileURLToPath(new URL('../', import.meta.url));
const out = fileURLToPath(new URL(`../.tmp/gym-reward-${profile}${efficiency ? '-efficiency' : ''}.mjs`, import.meta.url));
await mkdir(new URL('../.tmp/', import.meta.url), {recursive:true});
const control = profile === 'v4-control' ? [{name:'old-reward-control',setup(build){
  build.onLoad({filter:/[\\/]game[\\/]gym[\\/]catalog\.ts$/}, async args => {
    let contents = await readFile(args.path,'utf8');
    const pattern = /export const trainingCreditMilestones = \[[\s\S]*?\] as const;/;
    if (!pattern.test(contents)) throw new Error('Missing milestone control anchor');
    contents = contents.replace(pattern,`export const trainingCreditMilestones = [
      {level:10,tier:2,credits:2},{level:18,tier:3,credits:6},{level:25,tier:4,credits:12}
    ] as const;`);
    return {contents,loader:'ts'};
  });
  build.onLoad({filter:/[\\/]game[\\/]gym[\\/]cooperation\.ts$/}, async args => {
    let contents = await readFile(args.path,'utf8');
    if (!contents.includes('credits: 1, fame: 10')) throw new Error('Missing cooperation control anchor');
    contents = contents.replace('credits: 1, fame: 10','credits: 1, fame: 20');
    return {contents,loader:'ts'};
  });
}}] : [];
const entry = efficiency ? 'scripts/gym-automatic-efficiency.ts' : 'scripts/gym-economy-balance.ts';
await build({absWorkingDir:root, entryPoints:[entry],outfile:out,bundle:true,platform:'node',format:'esm',target:'node20',plugins:control,logLevel:'silent'});
await import(pathToFileURL(out).href);
