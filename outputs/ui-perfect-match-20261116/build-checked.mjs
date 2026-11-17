import {readFileSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {dirname} from 'node:path';
const files = ['src/data/runtime-assets.json', 'src/game/contract/runtime/equipment.json', 'src/game/contract/runtime/numerical.json'];
const originals = files.map(path => [path, readFileSync(path)]);
let result;
try {
 result = spawnSync(process.execPath, ['D:/nodeJS/node_modules/npm/bin/npm-cli.js', 'run', 'build'], {
  env: {...process.env, PATH: `${dirname(process.execPath)};${process.env.PATH}`}, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
 });
 writeFileSync('outputs/ui-perfect-match-20261116/build.log', `${result.stdout ?? ''}\n${result.stderr ?? ''}`);
 console.log((result.stdout ?? '').slice(-3000));
 if (result.stderr) console.error(result.stderr.slice(-2000));
} finally {for (const [path, original] of originals) writeFileSync(path, original);}
if (result?.error) throw result.error;
process.exitCode = result?.status ?? 1;
