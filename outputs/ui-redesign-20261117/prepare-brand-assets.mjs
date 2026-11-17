import {readFileSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const preserve = ['src/game/contract/runtime/equipment.json','src/game/contract/runtime/numerical.json'].map(path => [path, readFileSync(path)]);
try {
 const result = spawnSync(process.execPath, ['scripts/prepare-assets.mjs'], {encoding:'utf8'});
 if (result.status !== 0) throw Error(result.stderr || 'Asset preparation failed');
 console.log(result.stdout);
} finally {for (const [path, content] of preserve) writeFileSync(path, content);}
const index = readFileSync('index.html','utf8');
writeFileSync('index.html', index.replace('<title>王牌训练师：从训练球星开始</title>', '<title>传奇球馆</title>'));
