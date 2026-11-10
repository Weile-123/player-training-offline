import fs from 'node:fs';
const root='output/balance-audit-20261023';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const control=read(root+'/no-ads/summary-50.json'),ads=read(root+'/ads/summary-50.json'),missing=read(root+'/missing-33-review.json');
const indexes=Object.fromEntries(['ads','no-ads'].map(mode=>[mode,read(`${root}/${mode}/run-index.json`)]));
const controls=new Map(indexes['no-ads'].map(r=>[r.key,r])),pairs={};
for(const row of indexes.ads){
 const other=controls.get(row.key);if(!other)throw Error('Missing paired control: '+row.key);
 const key=row.key.replace(/-\d+$/,''),p=pairs[key]??={n:0,adsOnly:0,controlOnly:0,both:0,neither:0};p.n++;
 p[row.completed?other.completed?'both':'adsOnly':other.completed?'controlOnly':'neither']++;
}
const adCounts={};for(const group of Object.values(ads.groups))for(const [key,n]of Object.entries(group.counters))if(key.startsWith('ad:'))adCounts[key]=(adCounts[key]??0)+n;
const recovered=missing.missing.filter(t=>ads.templates[t.id].acquired),remaining=missing.missing.filter(t=>!ads.templates[t.id].acquired);
const total=r=>Object.values(r.groups).reduce((n,g)=>n+g.completed,0),rate=n=>(n*100).toFixed(1)+'%';
const e=Object.fromEntries(['ads','no-ads'].map(mode=>[mode,read(`${root}/${mode}/endless-summary.json`)]));
const replay=Object.fromEntries(['ads','no-ads'].map(mode=>[mode,read(`${root}/${mode}/replay-check.json`)]));
const tests=read(root+'/mechanics-tests.json');
fs.writeFileSync(root+'/comparison.json',JSON.stringify({control:{runs:control.totalRuns,completed:total(control),templates:119-control.underrepresented.length,maxLevel:control.maxLevel},ads:{runs:ads.totalRuns,completed:total(ads),templates:119-ads.underrepresented.length,maxLevel:ads.maxLevel},pairs,adCounts,recovered:recovered.map(t=>t.id),remaining:remaining.map(t=>t.id),endless:e,replay,tests:{passed:tests.numPassedTests,failed:tests.numFailedTests}},null,2));
let md=`# 广告流程与自然培养重测结果（2026-10-23）

本轮完成五类激励广告的本地流程复核、${tests.numPassedTests} 项全量机制测试、2,400 局广告/无广告配对模拟、200 局通关后的无尽续局，以及旧缺口 33 个模板的合法路径核查。未修改游戏经济、成长、匹配或奖励参数；新增测试、脚本与报告。生产构建结果见 build.log。

**机制检查通过，但充分领取广告奖励会大幅提高通关率。** 这不是整体平衡或虎扑真机广告已验收的结论。当前浏览器工具返回空清单，无法验证真实视频播放、切后台、原生返回和手机界面。

## 1. 五类广告整体流程

共同链路：用户点击 → 检查资格 → 全局单流程锁与等待弹窗 → 官方 completeRewardVideo() → 校验 code=200 且 rewarded=true → 发起非阻塞的平台任务状态刷新 → 原子发奖并保存额度 → UI 更新。失败/取消/仅启动不发奖、不扣额度；正式环境忽略本地免广告开关。

| 入口 | 本轮核查 | 结论 |
| --- | --- | --- |
| 一键火热 | 当月全队一次、立即进入火热、器械次数加成、换人/重载/下月恢复 | 通过 |
| 必得传说 | 指定保底0券、其余两格按概率及原价、满背包失败不丢免费标记、购买/刷新清除标记、最后使用月+3冷却 | 通过 |
| 重伤回溯 | 实际离营后提示、恢复出手前账目、只送1次保护、护具不双扣、秒表不退额度、每人一次 | 通过 |
| 球探刷新 | 新商品满库存、价格倍率重置、每次到访一次、永久信用修复限制保留 | 通过 |
| 结束复活 | 原月、3信用、增3新人、不重复原结算收益、结束档恢复、每局一次 | 通过 |
| 公共容错 | 五入口分别经过模拟SDK失败/成功、真实store提交、存档重载、重复回调；并发和过期回调拦截 | 通过 |

新增 src/rewardedAdsFlow.test.ts 将 SDK、实际 store 和存档串联测试，避免只分别测试接口与引擎。另补了免费传说满背包及重载边界。没有发现需要修改生产逻辑的新缺陷。

本地测试不证明平台会提供无限广告库存，也未确认原生回调在刷新页面/切后台场景下的行为。真实观看仍应依照激励广告接入与验收文档的真机步骤补验。

## 2. 新版本自然培养对照

natural-ads-v3：6策略 × 新/进阶账号 × 分享/不分享 × 广告/不看广告 × 50个种子 = 2,400局。每种广告条件1,200局、24组。两侧使用相同种子与相同合法前置账号，不偷看随机未来、不失败回档、不注入属性/现金/器材；模拟的广告成功回调是明确情景假设。

| 指标 | 当前代码无广告 | 当前代码充分领取广告 |
| --- | ---: | ---: |
| 样本 | ${control.totalRuns} | ${ads.totalRuns} |
| 21月通关 | ${total(control)}（${rate(total(control)/control.totalRuns)}） | ${total(ads)}（${rate(total(ads)/ads.totalRuns)}） |
| 自然获得模板 | ${119-control.underrepresented.length}/119 | ${119-ads.underrepresented.length}/119 |
| 最高观察训练等级 | ${control.maxLevel} | ${ads.maxLevel} |
| 公共动作数 | ${control.totalOps} | ${ads.totalOps} |
| 错误 / 截断 | 0 / 0 | 0 / 0 |

各策略汇总如下；每列每策略200局（4个账号/分享条件合计），属于描述统计，不能把共享种子的各条件当作独立玩家。

| 策略 | 无广告通关 | 广告通关 |
| --- | ---: | ---: |
`;
for(const [id,name]of Object.entries({conservative:'保守保值',quota:'目标达标',focus:'集中培养',heat:'火热成长',template:'模板定向',mixed:'普通混合'})){
 const wins=r=>Object.entries(r.groups).filter(([k])=>k.startsWith(id+'-')).reduce((n,[,g])=>n+g.completed,0);
 md+=`| ${name} | ${wins(control)}/200 | ${wins(ads)}/200 |\n`;
}
md+=`
广告组成功领取：一键火热 ${adCounts['ad:heat']} 次、传说刷新 ${adCounts['ad:legendary-shop']} 次、重伤回溯 ${adCounts['ad:injury-rewind']} 次、球探刷新 ${adCounts['ad:merchant-refresh']} 次、复活 ${adCounts['ad:revive']} 次。共 ${Object.values(adCounts).reduce((a,b)=>a+b,0)} 次，平均每局 ${(Object.values(adCounts).reduce((a,b)=>a+b,0)/1200).toFixed(1)} 次。这是高广告参与情景；没有计入观看耗时，也没有模拟平台无库存或玩家主动跳过，因此不能直接当作线上通关率预测。

每组50个配对种子的获胜分歧如下；原始各组 Wilson 95% 区间见两侧 summary-50.json。动作不同会改变后续随机序列，因此同种子不保证遇到完全相同的投篮结果。

| 组 | 仅广告通关 | 仅无广告通关 | 两侧均通关 | 两侧均未通关 |
| --- | ---: | ---: | ---: | ---: |
`;
for(const [key,p]of Object.entries(pairs))md+=`| ${key} | ${p.adsOnly} | ${p.controlOnly} | ${p.both} | ${p.neither} |\n`;
md+=`
## 3. 旧缺口33模板

33/33 在当前默认规则下通过精选合法培养路径重放，均在30级前取得；这是可达性证据，不能冒充自然出现率。详见[33模板逐项复核](./未获得33模板复核-20261023.md)。

欧文旧9次合格快照：3次选中帕克、6次选中希尔。去除已获外观后诊断仍选中相同模板，不能仅归因为外观锁定。32个旧零合格模板主要涉及等级、核心属性、身高或全能短板门槛，未发现规则无解。

新广告样本获得旧缺口中的 ${recovered.length} 个：${recovered.map(t=>t.name+'（'+ads.templates[t.id].runsWithAcquisition+'局）').join('、')}。

旧缺口中仍未自然获得 ${remaining.length} 个：${remaining.map(t=>t.name).join('、')}。

| 原缺口模板 | 本轮无广告获得局数 | 本轮广告获得局数 | 合法路径获取等级 |
| --- | ---: | ---: | ---: |
`;
for(const t of missing.missing)md+=`| ${t.name} | ${control.templates[t.id].runsWithAcquisition} | ${ads.templates[t.id].runsWithAcquisition} | ${t.witness.acquisition.level} |\n`;
md+=`
旧86/119来自12,000局、旧分享规则；新样本每侧1,200局且分享已限制模板资格。不能用86与新覆盖数的简单差值推断全部新增或丢失。当前无广告与广告之间才是同版本、同规模的对照。

## 4. 无尽、回放与存档

| 条件 | 通关后续局 | 正常结束 | 达60月预算仍存活 | 动作预算截断 | 错误 | 追加动作 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
`;
for(const mode of ['no-ads','ads']){const x=e[mode];md+=`| ${mode} | ${x.runs} | ${x.ended} | ${x.monthLimit} | ${x.actionLimit} | ${x.errors.length} | ${x.actions} |\n`;}
md+=`
续局来自主矩阵真实通关档的分层抽取，不代表所有开局的长期存活率。月份上限时仍存活必须算截断，不算死亡。

日志重放：无广告 ${replay['no-ads'].runs} 局 / ${replay['no-ads'].actions} 动作，广告 ${replay.ads.runs} 局 / ${replay.ads.actions} 动作；前置账号来源及初始/最终状态哈希均通过。每100动作检查精确存档往返。新日志补采月结补招、复活新人及其他实际模板变化时刻的候选，修正旧报告的出生时刻采样缺口。

## 5. 判读与后续

- 功能机制与账目本轮通过；${tests.numPassedTests}项全量测试、2,400局主矩阵及200局无尽续局不能代替虎扑真机与真人体验。
- 广告组集中培养、火热成长、模板定向接近全部通关，值得在上线前审视奖励强度和实际观看负担。此轮同时启用五类广告，不能把全部提升单独归因于免费传说；若调整，应先做单入口关闭对照，避免盲目削弱全部奖励。本次未改数值。
- 原D阶段每格500种子（广告对照后共24,000局）尚未执行；本轮是每格50种子的完整条件矩阵及专项核查。不得把小规模重测称为大样本最终平衡验收。
- 33个原缺口无需因为零样本就补球员或放宽门槛；22个仍未在广告组观测到，继续标记低覆盖，不宣布自然培养覆盖全部119模板。
- 测试日志仅本地保存并忽略Git；未操作真实玩家存档、云档、广告或发帖。

复现脚本：scripts/batch-balance-ads.mjs、scripts/summarize-balance-ads-audit.mjs、scripts/audit-missing-templates.mjs、scripts/replay-balance-ads-audit.mjs。数据及源码哈希位于 output/balance-audit-20261023/。
`;
fs.writeFileSync('docs/广告流程与自然培养重测结果-20261023.md',md);
console.log(JSON.stringify({tests:tests.numPassedTests,runs:2400,adsWins:total(ads),controlWins:total(control),recovered:recovered.length,remaining:remaining.length}));
