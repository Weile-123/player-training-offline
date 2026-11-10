import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const root='output/quota-experiment-20261023';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const paths={baseline:'output/balance-audit-20261023-heat3',mild:root+'/mild',buffer:root+'/buffer'};
const names={baseline:'当前正式版',mild:'A：中期放宽+后期加压',buffer:'C：只做中期缓冲'};
const data={},metrics={},pairs={};
for(const [key,path]of Object.entries(paths)){
 data[key]={};metrics[key]={};
 for(const mode of ['no-ads','ads']){
  const r=read(`${path}/${mode}/summary-50.json`),rows=read(`${path}/${mode}/run-index.json`);
  if(!r.gate.complete||!r.gate.noErrors||!r.gate.noCensored)throw Error('Incomplete matrix');
  data[key][mode]={r,rows};
  const counters={};for(const g of Object.values(r.groups))for(const [k,n]of Object.entries(g.counters))if(k.startsWith('ad:'))counters[k]=(counters[k]??0)+n;
  metrics[key][mode]={runs:rows.length,wins:rows.filter(r=>r.completed).length,reach12:rows.filter(r=>r.month>=12).length,reach18:rows.filter(r=>r.month>=18).length,templates:119-r.underrepresented.length,adAverage:Object.values(counters).reduce((a,b)=>a+b,0)/rows.length};
 }
}
const prefix={checked:0,mismatches:[]};
const hash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
for(const mode of ['ads','no-ads']){
 pairs[mode]={both:0,bufferOnly:0,baselineOnly:0,neither:0};
 const base=new Map(data.baseline[mode].rows.map(r=>[r.key,r]));
 for(const row of data.buffer[mode].rows){
  const b=base.get(row.key);if(b.seed!==row.seed||b.profileHash!==row.profileHash)throw Error('Pair mismatch');
  pairs[mode][row.completed?b.completed?'both':'bufferOnly':b.completed?'baselineOnly':'neither']++;
  const before13=key=>JSON.parse(gunzipSync(fs.readFileSync(`${paths[key]}/${mode}/runs-v2/${row.key}.json.gz`))).rows.filter(r=>r.month<=13).map(r=>({action:r.action,cash:r.cashAfter,credits:r.creditsAfter,player:r.playerAfter}));
  prefix.checked++;if(hash(before13('buffer'))!==hash(before13('mild')))prefix.mismatches.push(mode+'/'+row.key);
 }
}
if(prefix.mismatches.length)throw Error('Shared early curve produced different actions');
const replay=Object.fromEntries(['ads','no-ads'].map(m=>[m,read(`${paths.buffer}/${m}/replay-check.json`)]));
if(Object.values(replay).some(r=>!r.passed||!r.profileProvenance))throw Error('Replay failed');
fs.writeFileSync(root+'/buffer-comparison.json',JSON.stringify({metrics,pairs,prefix,replay},null,2));
let md=`# 仅中期缓冲曲线测试结果（2026-10-23）

C候选：第1～3月不变，第4～12月使用A版缓冲（原目标的95%、90%、85%、80%、80%、80%、85%、90%、95%），第13月及以后全部恢复正式目标。仅测试构建修改交付目标；商店价格、奖励、成长与正式源代码保持不变。

新增2400局：6策略×2账号×2分享×2广告×50种子，与当前版及A版同种子同合法起始账号对照。全部主矩阵完整、错误和动作上限截断为0，账目检查与每100动作存档往返通过。

**建议：C可作为中期体验的试玩候选，但不能宣称显著改善通关或解决广告依赖。** 当前正式数值仍未修改。相较A，撤掉后期加压后，无广告通关从95恢复到115；相较正式版110仅增加5局，改善幅度很小，不能用此样本确定真实玩家通关概率会提高。

## 对照结果

| 版本 | 无广告通关 /1200 | 广告通关 /1200 | 无广告进入12月 | 无广告进入18月 | 无广告/广告模板 | 广告平均次数/局 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
`;
for(const key of Object.keys(paths)){const n=metrics[key]['no-ads'],a=metrics[key].ads;md+=`| ${names[key]} | ${n.wins}（${(n.wins/12).toFixed(1)}%） | ${a.wins}（${(a.wins/12).toFixed(1)}%） | ${n.reach12} | ${n.reach18} | ${n.templates}/${a.templates} | ${a.adAverage.toFixed(1)} |\n`;}
md+=`
“进入某月”并不意味着所有交付均达标，信用允许失败后推进。模板总数为119。不同条件共享种子，汇总比例为描述统计，不当作独立真人样本。广告组仍是假设请求全部能看完，不计观看耗时和库存。

## 分玩法

| 策略（每格200局） | 当前无广告 | A无广告 | C无广告 | 当前广告 | A广告 | C广告 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
`;
for(const [policy,name]of Object.entries({conservative:'保守保值',quota:'目标达标',focus:'集中培养',heat:'火热成长',template:'模板定向',mixed:'普通混合'})){
 const vals=['no-ads','ads'].flatMap(mode=>Object.keys(paths).map(key=>Object.entries(data[key][mode].r.groups).filter(([k])=>k.startsWith(policy+'-')).reduce((n,[,g])=>n+g.completed,0)));
 md+=`| ${name} | ${vals.join(' | ')} |\n`;
}
md+=`
## 数值表

| 月份 | 正式目标 | C候选 |
| --- | ---: | ---: |
`;
const curves=read(root+'/verified-curves.json');for(let i=0;i<21;i++)md+=`| ${i+1} | ${curves.baseline[i].quota} | ${curves.buffer[i].quota} |\n`;
md+=`
## 复核

- C与A在第1～13月使用相同目标，${prefix.checked}局的该阶段动作、账目及球员结果逐一比对全部一致；从第14月起才允许分歧，验证本轮只移除了后期加压。
- C与正式版同种子通关分歧：${JSON.stringify(pairs)}。
- 日志重放：${Object.entries(replay).map(([m,r])=>m+' '+r.runs+'局/'+r.actions+'动作').join('；')}，来源及终局哈希通过。
- verify-quota-experiment.mjs验证1～60月目标单调、金额精确、商店价格不变；本轮没有新曲线无尽续局或虎扑真机验收。
- 本次仅新增候选试验，没有实装正式数值；日志位于output/quota-experiment-20261023/buffer/并忽略Git。

复现：node scripts/verify-quota-experiment.mjs；node scripts/batch-quota-experiment.mjs 50 buffer。回放时设置QUOTA_CURVE=buffer。

## 判读与建议

- 无广告进入12月从564增加到670，进入18月从243增加到257，最终通关从110增加到115。主要收益是减少前中期淘汰，越到后期优势越小。
- 无广告保守、目标达标、普通混合策略仍没有通关；增加的5局全部来自火热培养。不能描述为所有普通玩法都被改善。
- 广告组从692增加到707，广告与无广告的通关差距未缩小。集中培养、火热成长、模板定向仍全部通关；广告奖励组合的帮助依然很大。
- 若下一步做体验试玩，优先选C，放弃A/B的后期加压。重点观察玩家是否在第7～12月获得更多培养机会，以及是否因目标降低而过早交付。
- 暂不继续同时改关卡与奖励。需要压缩广告依赖时，另做单项奖励关闭对照；需要证明C优于正式版时，再扩大独立种子并加入真人试玩，不能把本轮5局差异当作稳定提升。
`;
fs.writeFileSync('docs/仅中期缓冲曲线测试结果-20261023.md',md);
console.log(JSON.stringify({metrics,pairs,prefix},null,2));
