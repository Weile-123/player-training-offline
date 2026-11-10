import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
const root='output/balance-audit-20261023-heat3';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const current=read(root+'/ads/summary-50.json'),control=read(root+'/no-ads/summary-50.json'),old=read('output/balance-audit-20261023/ads/summary-50.json');
const wins=r=>Object.values(r.groups).reduce((n,g)=>n+g.completed,0);
const rate=r=>(wins(r)/r.totalRuns*100).toFixed(1)+'%';
const count=r=>119-r.underrepresented.length;
const totals=r=>Object.values(r.groups).reduce((out,g)=>{for(const [k,n]of Object.entries(g.counters))if(k.startsWith('ad:'))out[k]=(out[k]??0)+n;return out;},{});
const adCounts=totals(current),oldCounts=totals(old),adTotal=Object.values(adCounts).reduce((a,b)=>a+b,0);
const heat={uses:0,immediate:0,overflow:0,added:0,before:{},errors:[]};
const rewardLoads=[];
for(const f of fs.readdirSync(root+'/ads/runs-v2')){
 const data=JSON.parse(gunzipSync(fs.readFileSync(root+'/ads/runs-v2/'+f)));
 rewardLoads.push(Object.entries(data.summary.counters).filter(([k])=>k.startsWith('ad:')).reduce((n,[,v])=>n+v,0));
 for(const r of data.rows)if(r.action.type==='ad-reward'&&r.action.reward==='heat'){
  const a=r.playerBefore,b=r.playerAfter;heat.uses++;heat.before[a.heat]=(heat.before[a.heat]??0)+1;
  heat.added+=Math.min(3,10-a.heat);heat.overflow+=Math.max(0,a.heat+3-10);
  if(a.heat>=7){heat.immediate++;if(b.heat!==0||!(b.hot>0))heat.errors.push({f,step:r.step});}
  else if(b.heat!==a.heat+3||b.hot>0)heat.errors.push({f,step:r.step});
 }
}
rewardLoads.sort((a,b)=>a-b);
const rewardLoad={median:rewardLoads[Math.floor((rewardLoads.length-1)*.5)],p90:rewardLoads[Math.floor((rewardLoads.length-1)*.9)],max:rewardLoads.at(-1)};
const indexes=Object.fromEntries(['ads','no-ads'].map(m=>[m,read(`${root}/${m}/run-index.json`)]));
const oldControl=new Map(read('output/balance-audit-20261023/no-ads/run-index.json').map(r=>[r.key,r]));
const unchangedControl=indexes['no-ads'].filter(r=>oldControl.get(r.key)?.finalHash===r.finalHash).length;
const oldMissing=read('output/balance-audit-20261023/missing-33-review.json').missing;
const recovered=oldMissing.filter(t=>current.templates[t.id].acquired),remaining=oldMissing.filter(t=>!current.templates[t.id].acquired);
const tests=read(root+'/mechanics-retest.json');
const endless=Object.fromEntries(['ads','no-ads'].map(m=>[m,read(`${root}/${m}/endless-summary.json`)]));
const replay=Object.fromEntries(['ads','no-ads'].map(m=>[m,read(`${root}/${m}/replay-check.json`)]));
if(!current.gate.complete||!control.gate.complete||!current.gate.noErrors||!control.gate.noErrors||heat.errors.length||tests.numFailedTests||Object.values(endless).some(e=>e.errors.length)||Object.values(replay).some(r=>!r.passed))throw Error('Audit gate failed');
fs.writeFileSync(root+'/comparison.json',JSON.stringify({current:{wins:wins(current),templates:count(current)},control:{wins:wins(control),templates:count(control)},old:{wins:wins(old),templates:count(old)},adCounts,oldCounts,heat,rewardLoad,unchangedControl,recovered:recovered.map(t=>t.name),remaining:remaining.map(t=>t.name),endless,replay,tests:tests.numPassedTests},null,2));
let md=`# 火热加速版重测结果（2026-10-23）

## 先说结论

本轮是“看完增加3格”的新规则，不再直接送满火热槽。全量 ${tests.numPassedTests} 项测试通过，TypeScript 与生产构建通过；2,400局主矩阵完整，报错为0。未调整游戏平衡参数。测试日志仅在本地，已忽略Git。

| 同规模对照（每列1200局） | 无广告 | 旧版直接火热 | 新版增加3格 |
| --- | ---: | ---: | ---: |
| 通关局数 | ${wins(control)} | ${wins(old)} | ${wins(current)} |
| 通关率 | ${rate(control)} | ${rate(old)} | ${rate(current)} |
| 自然获得模板 | ${count(control)}/119 | ${count(old)}/119 | ${count(current)}/119 |
| 最高观察训练等级 | ${control.maxLevel} | ${old.maxLevel} | ${current.maxLevel} |

新旧广告组相差 ${((wins(current)-wins(old))/12).toFixed(1)} 个百分点。无广告组重新运行后，${unchangedControl}/1200个终局状态哈希与上轮一致；对照没有混用旧日志。三组策略和种子相同，仅旧广告奖励规则不同。每组50种子覆盖6策略×2账号×2分享×2广告条件；不同条件共享种子，汇总比例只作描述统计，不当作2400个独立玩家。

**通俗理解：加速本身确实削弱了，但本轮没有看到整个游戏随之明显变难。** 新版只比旧版多 ${wins(current)-wins(old)} 局通关，不能据此断言3格更强。奖励变化会改变出手数量、保护消耗、交付时机与后续随机结果；更需要关注的是广告组与无广告组仍然有很大的距离。

## 哪种玩法变化最大

| 策略（每列200局） | 无广告通关 | 旧直接火热 | 新加3格 |
| --- | ---: | ---: | ---: |
`;
for(const [id,name]of Object.entries({conservative:'较早交付、保守保值',quota:'达到目标就交付',focus:'集中培养一名主力',heat:'围绕火热培养',template:'按模板方向培养',mixed:'混合操作'})){
 const n=r=>Object.entries(r.groups).filter(([k])=>k.startsWith(id+'-')).reduce((n,[,g])=>n+g.completed,0);
 md+=`| ${name} | ${n(control)} | ${n(old)} | ${n(current)} |\n`;
}
md+=`
## 奖励是否正常

新广告组共领取 ${adTotal} 次奖励，平均每局 ${(adTotal/1200).toFixed(1)} 次。分类为：${Object.entries(adCounts).map(([k,v])=>k.replace('ad:','')+' '+v+'次').join('；')}。

每局领取次数中位数 ${rewardLoad.median} 次，P90 ${rewardLoad.p90} 次，最高 ${rewardLoad.max} 次。这些是截至通关或结束的次数，不含后续无尽阶段；高观看负担值得优先做真人体验验证。

其中重伤回溯由旧版 ${oldCounts['ad:injury-rewind']} 次增至 ${adCounts['ad:injury-rewind']} 次；减少直接火热后，部分风险可能被其他保护奖励补偿。这只是待验证解释，必须分别关闭奖励进行对照后才能判断原因。平均领取次数也不等于真实玩家观看次数。

加速逐次日志检查 ${heat.uses} 次，错误 ${heat.errors.length} 次。其中 ${heat.immediate} 次直接达到火热；其余只增加进度。实际增加 ${heat.added} 格，丢弃溢出 ${heat.overflow} 格。使用前格数分布：${JSON.stringify(heat.before)}。模拟维持“准备继续训练且可领取就领取”的原策略，没有特别寻找最佳加速时机，因此不代表高水平玩家的最优效果。

机制测试覆盖五类广告的成功、失败、取消、重复回调、存档重载及次数限制；加速0/1/6格只加3格，7/8/9格立即火热且不结转溢出。第一次全量测试发现1处旧奖励断言及2处并行压力超时：已更新旧断言，限制测试并发后全量通过；没有为通过测试改动生产玩法。

## 模板与长期游玩

原缺口33个模板中，本轮自然获得 ${recovered.length} 个：${recovered.map(t=>t.name).join('、')}。

本轮仍未自然获得 ${remaining.length} 个：${remaining.map(t=>t.name).join('、')}。之前33条合法可达路径已通过，此次只是自然覆盖率观测；零样本不等于不能获得。每侧仅1200局，稀有模板出现或消失不能直接判成匹配退化。

| 通关后的续局 | 局数 | 正常结束 | 完成60月仍存活 | 动作上限截断 | 错误 |
| --- | ---: | ---: | ---: | ---: | ---: |
`;
for(const mode of ['no-ads','ads']){const e=endless[mode];md+=`| ${mode} | ${e.runs} | ${e.ended} | ${e.monthLimit} | ${e.actionLimit} | ${e.errors.length} |\n`;}
md+=`
无尽样本来自真实通关档分层抽取，样本构成不同，不用于推断所有开局的长期存活率。达到60月后仍存活按观察截止统计。日志重放：${Object.entries(replay).map(([m,r])=>m+' '+r.runs+'局/'+r.actions+'动作').join('；')}，初始/最终哈希及前置账号来源核对通过。

## 建议与可以调整的地方

1. 先保留“加3格、每月一次”，避免刚修改就凭感觉继续削弱。是否还需改动，应结合上表的玩法差异和真人体验，而不是只盯总体通关率。
2. 如果希望降低广告依赖，下一步分别关闭“免费传说”“重伤回溯”“复活”做同种子对照，找出影响最大的一项。当前五类同时开启，不能凭相关性认定免费传说是唯一原因。
3. 可调旋钮包括：加速格数/使用频率、免费传说的间隔月份、回溯的每人或每局额度、复活赠送人数与信用。先改变一个旋钮再复测；本轮没有验证其他数值，不能给出已证实最优参数。
   - 想降低奖励强度：优先试验“免费传说从每3月一次改为每4月一次”，不要同时改其他入口。这只是下一轮候选参数，不是本轮已验证结论。
   - 想减少每局观看负担：先验证“保留每人一次回溯，同时增加每局总次数上限”的对照；具体上限需结合平均与高分位观看次数决定，避免只按平均数设计。
   - 复活先保持原规则：每局一次的边界清晰，暂不建议同时削弱人数和信用，让测试无法判断是哪项导致体验变化。
4. 每局奖励次数是体验重点。当前假设所有请求都能看完，没有观看耗时、无库存或主动跳过；真机应记录实际播放次数、放弃率与每局耗时，再决定是否增加跨入口观看频控。
5. 稀有模板先做定向培养提示和专门路线测试，不急着统一降低门槛。玩家看不懂培养方向和模板实际不可达是两个问题。

本轮不能证明虎扑真实视频/切后台/原生返回、手机性能与视觉已验收；也未执行每格500种子的24000局扩展。805以上机制测试和无界面代理都不能替代真人试玩。

复现：设置 BALANCE_AUDIT_ROOT=output/balance-audit-20261023-heat3 后执行 batch-balance-ads.mjs 50；summarize/replay 脚本传该目录的 ads 或 no-ads 子目录。原始数据在上述输出目录，历史报告不覆盖。
`;
md=md.replace('805以上机制测试',`${tests.numPassedTests}项机制测试`);
fs.writeFileSync('docs/火热加速版重测结果-20261023.md',md);
console.log(JSON.stringify({current:wins(current),control:wins(control),old:wins(old),templates:count(current),heat,adTotal,unchangedControl,tests:tests.numPassedTests},null,2));
