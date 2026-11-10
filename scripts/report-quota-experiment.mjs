import fs from 'node:fs';
const root='output/quota-experiment-20261023';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const paths={baseline:'output/balance-audit-20261023-heat3',mild:root+'/mild',staged:root+'/staged'};
const labels={baseline:'当前正式曲线',mild:'A 温和版',staged:'B 分段版'};
const data={},indexes={},metrics={};
const sum=r=>Object.values(r.groups).reduce((n,g)=>n+g.completed,0);
for(const [name,path]of Object.entries(paths)){
 data[name]={};indexes[name]={};metrics[name]={};
 for(const mode of ['no-ads','ads']){
  const r=data[name][mode]=read(`${path}/${mode}/summary-50.json`);
  if(!r.gate.complete||!r.gate.noErrors||!r.gate.noCensored)throw Error('Failed gate: '+name+'/'+mode);
  const rows=indexes[name][mode]=read(`${path}/${mode}/run-index.json`);
  const counts={};for(const g of Object.values(r.groups))for(const [k,n]of Object.entries(g.counters))if(k.startsWith('ad:'))counts[k]=(counts[k]??0)+n;
  metrics[name][mode]={runs:r.totalRuns,wins:sum(r),clearRate:sum(r)/r.totalRuns,templates:119-r.underrepresented.length,adCounts:counts,adAverage:Object.values(counts).reduce((a,b)=>a+b,0)/r.totalRuns,reach12:rows.filter(r=>r.month>=12).length,reach18:rows.filter(r=>r.month>=18).length};
 }
}
const pairs={};
for(const name of ['mild','staged']){
 pairs[name]={};
 for(const mode of ['ads','no-ads']){
  const base=new Map(indexes.baseline[mode].map(r=>[r.key,r]));const counts={both:0,candidateOnly:0,baselineOnly:0,neither:0};
  for(const r of indexes[name][mode]){const b=base.get(r.key);if(!b||r.profileHash!==b.profileHash||r.seed!==b.seed)throw Error('Pairing mismatch');counts[r.completed?b.completed?'both':'candidateOnly':b.completed?'baselineOnly':'neither']++;}
  pairs[name][mode]=counts;
 }
}
fs.writeFileSync(root+'/comparison.json',JSON.stringify({metrics,pairs},null,2));
const curves=read(root+'/verified-curves.json');
const replays={};
for(const name of ['mild','staged'])for(const mode of ['ads','no-ads']){
 const r=read(`${paths[name]}/${mode}/replay-check.json`);
 if(!r.passed||!r.profileProvenance)throw Error('Replay failed');
 replays[name+'/'+mode]={runs:r.runs,actions:r.actions};
}
let md=`# 月份交付曲线候选测试结果（2026-10-23）

本次只测试候选，没有修改正式游戏参数。两套候选各2400局，共新增4800局；对照是同一版本、同种子、同起始账号的当前曲线2400局。6种策略×新/进阶账号×分享/不分享×广告/无广告×50种子。引擎仅在独立测试构建中替换交付目标，商店价格、奖励、成长、球员与随机种子不变。

**结论：本轮不推荐直接实装 A 或 B。** 中期推进改善了，但无广告通关率下降，广告通关率几乎不变，没有实现照顾普通玩法且增加成熟阵容挑战的目标。正式曲线维持原值。

## 1. 总体对照

| 曲线 | 无广告通关 /1200 | 广告通关 /1200 | 无广告模板 | 广告模板 | 广告平均次数/局 |
| --- | ---: | ---: | ---: | ---: | ---: |
`;
for(const name of Object.keys(paths)){const c=metrics[name]['no-ads'],a=metrics[name].ads;md+=`| ${labels[name]} | ${c.wins}（${(c.clearRate*100).toFixed(1)}%） | ${a.wins}（${(a.clearRate*100).toFixed(1)}%） | ${c.templates}/119 | ${a.templates}/119 | ${a.adAverage.toFixed(1)} |\n`;}
md+=`
所有候选主矩阵执行错误和动作上限截断均为0，现金/券账目及每100动作存档往返检查通过。共享种子的不同策略/账号条件不视为独立玩家，汇总比例只用于描述。奖励使用均假设成功完成视频；未计观看耗时、库存及玩家跳过。

抽样日志重放全部通过，包含前置账号来源与初始/最终状态校验：${Object.entries(replays).map(([k,r])=>k+' '+r.runs+'局/'+r.actions+'动作').join('；')}。测试前后正式src文件哈希未变。

## 2. 哪类玩法受影响

| 策略（每格200局） | 当前无广告 | A无广告 | B无广告 | 当前广告 | A广告 | B广告 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
`;
for(const [policy,label]of Object.entries({conservative:'保守保值',quota:'目标达标',focus:'集中培养',heat:'火热成长',template:'模板定向',mixed:'普通混合'})){
 const n=(name,mode)=>Object.entries(data[name][mode].groups).filter(([k])=>k.startsWith(policy+'-')).reduce((n,[,g])=>n+g.completed,0);
 md+=`| ${label} | ${['no-ads','ads'].flatMap(mode=>Object.keys(paths).map(name=>n(name,mode))).join(' | ')} |\n`;
}
md+=`
## 3. 前中期推进与后期失败分布

“进入月份”只表示推进到该月，不代表每次交付都达标；信用允许失败后继续推进。降低目标会改变代理交付时机，可能减少实际训练，并非所有策略都会更强。

| 曲线/条件 | 进入12月 | 进入18月 | 终局月份分布（含通关后22月） |
| --- | ---: | ---: | --- |
`;
for(const name of Object.keys(paths))for(const mode of ['no-ads','ads']){
 const rows=indexes[name][mode],dist={};for(const r of rows)dist[r.month]=(dist[r.month]??0)+1;
 const m=metrics[name][mode];md+=`| ${labels[name]}/${mode} | ${m.reach12}/1200 | ${m.reach18}/1200 | ${Object.entries(dist).map(([k,n])=>k+'月:'+n).join('、')} |\n`;
}
md+=`
## 4. 逐月候选数值

第1～3月不变。第22月以后沿用末月倍率，避免通关后目标回落；只验证了曲线数值连续递增，未将本轮主线试验冒称为新曲线无尽玩法验收。商店刷新费与球探价格保持当前原值。

| 月份 | 当前交付目标 | A温和版 | B分段版 |
| --- | ---: | ---: | ---: |
`;
for(let i=0;i<22;i++)md+=`| ${i+1} | ${curves.baseline[i].quota} | ${curves.mild[i].quota} | ${curves.staged[i].quota} |\n`;
md+=`
## 5. 同种子通关分歧

| 候选/条件 | 两侧均通关 | 只有候选通关 | 只有当前曲线通关 | 两侧均未通关 |
| --- | ---: | ---: | ---: | ---: |
`;
for(const name of ['mild','staged'])for(const mode of ['no-ads','ads']){const p=pairs[name][mode];md+=`| ${labels[name]}/${mode} | ${p.both} | ${p.candidateOnly} | ${p.baselineOnly} | ${p.neither} |\n`;}
md+=`
此处是结果配对，不保证同种子在不同交付策略后仍消耗相同随机序列。不能简单把某个种子的胜负变化归因于单月数值。

## 6. 复现与范围

运行 node scripts/verify-quota-experiment.mjs 检查目标与商店隔离，再运行 node scripts/batch-quota-experiment.mjs 50。每个候选目录运行 summarize-balance-ads-audit.mjs 50。回放时设置 QUOTA_CURVE=mild 或 staged；前置账号按原规则重放，正式候选局按候选规则重放。

数据：output/quota-experiment-20261023/，已忽略Git。两套曲线都没有写进正式规则文件。真实虎扑视频、手机体验、最优人类策略和新候选无尽续局不在本轮已完成范围。

## 7. 建议与下一轮候选

- 当前无广告进入第12月564局，A670局，B763局，说明候选能增加中期游玩空间；但进入18月仅从243变为248/249，最终通关反而下降。这更像是把困难推迟，而没有解决后程培养不足。
- 不推荐继续统一提高后期交付要求。广告组的强策略仍然轻松通关，而无广告组受到更多损失。两版同时修改前中期与后期，因此不能把差异全部归因于某一段；需要分开测试。
- 下一轮可单独试“A版第4～12月缓冲，第13月起恢复正式目标”，验证中期改善是否能保留下来。该混合曲线本轮未测试，不能直接作为已验证推荐值上线。
- 如果目标是增加成熟广告阵容的挑战，应先分别关闭单项奖励验证其贡献。单纯改共同关卡目标无法保证只影响高收益玩法。
- 本轮代理按目标与风险交付，低目标会改变训练和交付时机；真人可能选择继续培养。正式改版前仍需要真人试玩确认，不能把代理当作所有玩家。
`;
fs.writeFileSync('docs/月份交付曲线候选测试结果-20261023.md',md);
console.log(JSON.stringify(metrics,null,2));
