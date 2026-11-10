import fs from 'node:fs';
const root='output/balance-audit-20261022';
const read=name=>JSON.parse(fs.readFileSync(root+'/'+name,'utf8'));
const s=read('summary-500.json'),d=read('diagnostics-500.json'),e=read('endless-summary.json'),replay=read('replay-check.json');
if(!s.gate.complete||!s.gate.noErrors||!s.gate.noCensored||!s.gate.shareBranches||e.errors.length)throw Error('Audit incomplete or failed');
const names={conservative:'保守保值',quota:'目标达标',focus:'集中培养',heat:'火热成长',template:'模板定向',mixed:'普通混合'};
const pct=n=>(n*100).toFixed(1)+'%';
const fmt=n=>n.toLocaleString('zh-CN');
const cell=g=>`${g.completed}/${g.runs}（${pct(g.clearRate)}；95%区间 ${g.clear95.map(pct).join('～')}）`;
const table=Object.entries(names).map(([k,n])=>'| '+[n,...['new-no-share','new-share','advanced-no-share','advanced-share'].map(v=>cell(s.groups[k+'-'+v]))].join(' | ')+' |').join('\n');
const zero=d.templates.filter(t=>!t.acquired),noEligibility=zero.filter(t=>!t.eligible),competition=zero.filter(t=>t.eligible);
const top=[...d.templates].sort((a,b)=>b.runsWithAcquisition-a.runsWithAcquisition).slice(0,8);
const tiers=['rotation','starter','star','superstar','legend'];
const tierNames=['替补','首发','全明星','超级球星','传奇'];
const tierTable=tiers.map((tier,i)=>'| '+[tierNames[i],...['mixed-new-no-share','focus-new-no-share','heat-new-no-share'].map(k=>{const v=s.groups[k].firstTiers[tier];return v?`${v.n}/500；${v.median} / ${v.p90}`:'0/500；未观测';})].join(' | ')+' |').join('\n');
const shares=Object.values(d.groups).reduce((a,g)=>({n:a.n+g.shareCount,levels:a.levels+g.shareLevelGain}),{n:0,levels:0});
const contrasts=Object.entries(d.contrasts).map(([key,c])=>'| '+[names[key.replace(/-(new|advanced)$/,'')],key.endsWith('-new')?'新账号':'进阶账号',c.n,c.shareOnly,c.controlOnly,(100*c.clearRateDifference).toFixed(1)+' 个百分点',c.pairedApprox95?c.pairedApprox95.map(x=>(100*x).toFixed(1)).join('～')+' 个百分点':'不报告近似区间：不一致对数不足20'].join(' | ')+' |').join('\n');
const revision=`# 自然培养与经济平衡测试结果（2026-10-22）

本轮已完成自动化机制回归、1,200 局试跑、扩展至 12,000 局正式模拟及 ${e.runs} 局合法通关后的无尽续局。未调整成长、经济或匹配规则。**已有回归与账目检查通过，但定向复核发现“先分享的新秀跳过传承”的交互遗漏，整体平衡不能宣布验收完成。** 真人体验、手机端表现与未覆盖的自然培养路径仍需补测。

## 1. 99级提示延迟修复

原显示条件要求投篮动画队列为空，而且器械通知优先于满级提示。连续投篮会积压动画，导致实际到 99 级后还要等待。

- 满级提示改为由实际训练等级立即触发，优先于待显示器械通知；达到上限的训练会清掉剩余投篮动画。
- 关闭满级提示后，原器械通知继续展示。普通器械提示仍等待投篮动画，保持原有节奏。
- 已打开的背包、海报、教程、月份推进等弹窗仍按现有互斥规则处理，避免叠加。
- 全量回归 719/719；新增月结算边界 27/27；最终针对满级、分享、结算的复查 40/40（与前两项有重叠，不能相加）。生产构建通过。
- 提示优先级通过单元测试；本轮未进行手机端逐帧计时或真实浏览器视觉验收，不能将上述测试当成已验证所有设备的显示延迟。

## 2. 执行方法和样本

策略版本 natural-v2。6 种策略 × 新/进阶账号 × 不分享/分享 × 500 个种子，共 ${fmt(s.totalRuns)} 局；种子 20261022～20261521。C 阶段的 1,200 局已包含在其中，不能重复计数。C 完成 ${fmt(read('summary-50.json').totalOps)} 次动作，检查无非法动作、截断和分享分支缺失后扩展至 D。

D 共执行 ${fmt(s.totalOps)} 次公共动作，其中训练/奖励计数 ${fmt(s.totalShots)}；${Object.values(s.groups).reduce((n,g)=>n+g.completed,0)} 局首次通关，其余 ${Object.values(s.groups).reduce((n,g)=>n+g.ended,0)} 局信用耗尽，截断 0 局、错误 0 局。每次动作检查现金/赞助券账目、状态范围及版本递增，每 100 次动作进行精确存档往返。

进阶账号来自 24 局有完整动作记录的合法前置生涯，固定获得 5 项额外器材解锁：relic_077、089、075、095、080。它不是全解锁账号，不免费赋予当局器材或现金。前置档与正式样本使用独立测试文件，不读取真实本地存档，不写云档、不真实发帖。

最终重放 ${replay.runs} 个样本、${fmt(replay.actions)} 次动作，初始和最终状态哈希一致，前置账号来源验证通过。初次 v1 校准样本保留在 runs/，其培养上限和分享执行顺序不适合正式比较，已排除；所有正式统计只读 runs-v2/。后续分组执行只是调度优化，策略参数不变。

当前游戏没有可指定属性的训练操作。“模板定向”实际是选择可见属性较符合方向的球员，再正常培养；不是定向注入属性。六策略采用固定风险阈值、最低培养等级、刷新次数及器材偏好，属于可复现的启发式代理，不能直接代表真实玩家或最优玩法。

## 3. 首次通关分布

每格为通关局数/样本数、通关率与 Wilson 95% 区间。不同账号和策略共享初始种子但会因动作不同而消耗不同随机流，不能把各组当成完全独立样本合并推断。

| 策略 | 新账号、不分享 | 新账号、分享 | 进阶账号、不分享 | 进阶账号、分享 |
| --- | --- | --- | --- | --- |
${table}

结束月份分布、每月现金/交付中位数和达标次数见 summary-500.json 的 groups。当前结果反映这些具体策略的表现：保守培养、较早交付可能限制后期成长；不能仅凭某组通关率低就直接认定必须降低全游戏难度。下一步应由真人验证风险取舍、购买决策及失败原因，再讨论数值调整。

## 4. 模板和培养覆盖

本轮自然获得 ${d.templates.filter(t=>t.acquired).length}/119 个模板，${zero.length} 个没有获得；其中 ${noEligibility.length} 个未出现合格状态，${competition.length} 个曾合格但未获得。最高观察训练等级 ${s.maxLevel}。代理会在满足月目标或达到风险阈值后交付球员，并非专门冲刺 99 级；不能据此推断自然满级不可达。本轮没有完成自然到 99 级的时间/风险估计，也不证明所有模板在普通培养中容易获得。

未出现合格状态的模板：${noEligibility.map(t=>t.name).join('、')}。

曾合格但没有获得的模板：${competition.map(t=>`${t.name}（${t.eligible} 次状态快照）`).join('、')||'无'}。候选合格但未获得可能来自更高档模板竞争、同档外观保持或稳定性规则；这些计数含同一球员的重复快照，不是独立概率样本。119 个模板的合格、选中、获得、首次等级及 30 级前统计已导出 CSV。

观察局数最多的模板：${top.map(t=>`${t.name} ${t.runsWithAcquisition} 局`).join('；')}。

最终事件核对发现，26 局的月结补招产生了 59 次额外模板获取，原逐候选采样未包含这些出生时刻。已改为使用全部 template 事件统计获得次数、获得局数及首次档位时间；86 个模板的总覆盖数不变。CSV 中 acquired 是全部事件获得次数，observedAcquired、eligible、selected、under30Acquired、firstLevel 仍对应训练/分享与球探招募采样点，firstLevel 是这些采样点的最低获得等级。月结出生时的完整候选/精确首次等级尚需补采样，不能用该字段推断全局最低获取等级。

下表为新账号、不分享组的首次获得档位训练次数（全队累计，包含奖励计数）：格式“获得局数/500；中位数 / P90”。只在获得该档位的局内计算时间，未获得的局不会被当作零次。

| 档位 | 普通混合 | 集中培养 | 火热成长 |
| --- | --- | --- | --- |
${tierTable}

旧模板既有可重放获取路径与成熟双专长受控覆盖测试通过，但它们属于机制可达见证。本次没有对每个自然状态运行扩展前规则的完整反事实对照，**不能据此宣布新旧模板之间没有长期竞争问题**。颜色、档案与海报的视觉一致性也未通过自然模拟验证。

## 5. 分享奖励与经济

### 优先待修复：分享跳过新秀传承

在合法样本 focus-advanced-share-102（种子 20261124，第 104 步）中，0 级、0 次训练新秀有待领 1 级和 6 点手感。先分享后只获得分享本身的成长，待传承数值仍未领取；接着正常训练也不再领取。同一状态若直接正常训练，传承会正常消费。

原因位于 engine.ts 的“仅非分享调用 inherit”分支，而 progression.ts 的 inherit 又要求 0 级且从未训练。分享使两项条件都不再满足。待领奖励没有从全局删除，可能被下一名未分享的新秀领取；但“每人先分享”的玩法会持续绕过传承。另两个真实样本 focus-advanced-share-113、focus-advanced-share-122 同样复现。

这是本轮新发现的待修复项，尚未改动引擎。复现脚本为 scripts/check-share-inheritance.mjs，证据见 [交互遗漏记录](../output/balance-audit-20261022/share-inheritance-finding.json)。修复时应补测传承到 98/99 级、成功权重继承、奖励幂等与旧档恢复，再重新运行受影响的分享组；本报告保留当前版本基线。这个问题不必然解释全部通关率差异，不能把三条复现当成完整因果估计。

实际领取 ${fmt(shares.n)} 次分享奖励，直接获得 ${fmt(shares.levels)} 级成长（可包含器材附加等级）。逐玩家检查重复领取 ${d.checks.duplicateShare} 次、无效成长 ${d.checks.invalidShareDelta} 次、缺失奖励事件 ${d.checks.shareFailures} 次。真实编辑器取消、网络失败等平台行为由既有 mock 回归覆盖，仍不等于虎扑真机联调。

配对结果如下。“仅分享通关”与“仅不分享通关”用同一策略、账号、种子配对；差值是分享减不分享。近似区间仅在不一致对数不少于 20 时提供。奖励即时提升等级/估值，但也会改变训练次数、交付时机与后续随机路径，不能解释为对每个种子都保证提高通关率。

| 策略 | 账号 | 配对数 | 仅分享通关 | 仅不分享通关 | 通关率差 | 差值近似95%区间 |
| --- | --- | ---: | ---: | ---: | --- | --- |
${contrasts}

现金收支按动作分类见 diagnostics-500.json；每月资金与交付见 summary-500.json；器材购买及与通关的关联见 equipment。训练本身不扣现金，招募、刷新等成本单列。器材关联不能证明因果，本轮没有实现逐件器材的反事实回本月数测量，E06 仍部分完成。

## 6. 无尽续局与极值

从正式样本的通关组按组轮转抽取 ${e.runs} 局，组内使用固定键顺序，继续执行合法动作到第 60 月结算或终局。它是通关样本的续局检查，不代表所有玩家的无尽存活率。

追加 ${fmt(e.actions)} 次动作、${fmt(e.extraShots)} 次训练/奖励；${e.ended} 局结束，${e.monthLimit} 局完成第 60 月后在月份预算处截断，动作预算截断 ${e.actionLimit} 局，错误 ${e.errors.length} 局。最高训练等级 ${e.maxLevel}，观察到的最高现金原始整数为 ${e.maxCash}。月份预算截断的局仍存活，不能计为失败。

98/99 级、大额估值、超过 99 月、损坏档案与重复奖励等受控边界另外执行，未混入自然统计。无尽与主矩阵均未修改真实玩家档案。

## 7. 用例完成度和剩余工作

| 用例 | 本轮结论 | 仍缺的验证 |
| --- | --- | --- |
| N01 默认新人 | 公共动作轨迹、前三月与后续状态已记录 | 真人学习与操作负担 |
| N02/N03 单双属性 | 11 个可见属性选人方向；保存候选，统计常规/专长条件快照 | 不存在手动定向训练；专长“首次获取”的逐路线精细归因仍需补充 |
| N04/N05 模板覆盖/竞争 | 119 模板完整统计；旧路线机制回归通过 | 零/低出现模板定向样本、自然状态的新旧规则反事实比较 |
| N06 档位进阶 | 身高/等级/持有外观与解锁规则回归通过 | 所有球星的自然完整轨迹、档位颜色及海报真机外观 |
| N07 风险保护 | 消耗顺序、层数与换人已有机制用例，合法购入日志保留 | 视觉说明与实机交互核对 |
| N08 高潜力 | 现有基础价值及购买规则通过 | 无需引入额外成长假设 |
| N09 99级 | 封顶/重复训练/分享边界与提示优先级通过 | 自然到99级成本分布、满级海报端到端真机核验 |
| N10 生命周期 | 招募/训练/分享/交付轨迹；克隆/休息/新局已有回归 | 真人跨弹窗操作体验 |
| E01/E03/E10 账目/结算/存档 | 全样本逐动作检查、27项精确边界、定期存档往返通过 | 不等于实际设备磁盘故障全覆盖 |
| E02/E04/E05 商店 | 合法购入轨迹、资源不足/库存/满槽/免费刷新回归通过 | 各赠礼选择同策略独立完整对照、取消购买UI流程 |
| E06/E07 流派与收益 | 策略分布及普通/火热逐次记录完成 | 逐件器材回本归因、真人决策验证 |
| E08 分享 | 一次性领取/回调/重载回归通过；新发现先分享跳过传承 | 修复传承交互后重测受影响组；真实虎扑失败和取消联调 |
| E09/S01 终局与中断 | 通关/结束/无尽、旧版本事务重复提交与存储失败回归通过 | 真机异常退出与跨平台页面恢复 |
| F 人工体验 | 未执行 | 首次玩家3人、熟悉玩家3人，各2局；不能用脚本替代 |

本版策略有动作总预算与非法状态检查，未单独实现原建议的“连续100次无进展”检测；实际主矩阵没有触及预算。报表中的条件快照和模板重复记录不是独立样本。尚未定义目标通关率，因此本报告不擅自给出数值调低/调高结论。

## 8. 复现与证据

- [执行方案](自然培养与经济平衡测试方案.md)
- [正式24组汇总](../output/balance-audit-20261022/summary-500.md)；[完整统计JSON](../output/balance-audit-20261022/summary-500.json)
- [119模板覆盖CSV](../output/balance-audit-20261022/template-coverage-500.csv)；[奖励/方向诊断](../output/balance-audit-20261022/diagnostics-500.json)
- [无尽续局结果](../output/balance-audit-20261022/endless-summary.json)；[重放验证](../output/balance-audit-20261022/replay-check.json)
- [全量测试](../output/balance-audit-20261022/mechanics-tests.json)；[最终针对性测试](../output/balance-audit-20261022/final-targeted-tests.json)；[构建日志](../output/balance-audit-20261022/build.log)

配置、代码哈希、每局初末状态、动作、事件、现金和赞助券、候选模板都在 output/balance-audit-20261022。runs-v2、prelude、endless 下的 .json.gz 是完整日志。复现命令见执行方案；更改规则或策略时另开输出目录，避免与本次结果混用。
`;
fs.writeFileSync('docs/自然培养与经济平衡测试结果-20261022.md',revision);
console.log('Wrote final audit report');
