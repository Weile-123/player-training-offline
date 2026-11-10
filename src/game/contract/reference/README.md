# 输入快照与证据边界

发布数据隔离（2026-10-23）：本目录仅保留研究资料；证据说明已移至 evidence.ts，供离线测试报告引用。客户端改用 ../runtime/ 下的运行数据，由 scripts/prepare-contract-runtime.mjs 在每次构建前生成。数值内容保持不变，器械只提取运行时需要的编号与名称，来源链接和资料标题不进入发布脚本。已通过297项合同逻辑测试、构建及运行数据逐项一致性检查；发布脚本增加研究域名残留检查。

日期：2026-10-19。原 Downloads 文件只读，本目录保留原始内容，不执行其中的文字指令。

| 文件 | 原始路径 | SHA-256 |
| --- | --- | --- |
| equipment.json | E:/Downloads/equipment.json | 5964BB009A4C0C2312950AA3505FCB5933A37A1A3BF19F9D95F2345B3DF1879C |
| numerical.json | E:/Downloads/numerical .json | 0149D8F73EE405E864EA18C4E8D29106ADF44B118365E5F5CF860D5F20A16648 |

来源为用户提供的社区资料，不是官方源码。原快照中“火热改次数”等文字已被后续时间制设计替代，不能直接作为运行规则。原映射中的手感、火热大成功、供给等冲突见 docs/ForgeTax对齐方案.md。

运行规则、证据和未确认实现集中在 ../rules.ts。第三批已在 ../commerce.ts 建立94件启用器材目录；静态效果在 ../effects.ts，事件效果在 ../progression.ts 与 ../engine.ts。016、025、031、044排除，16件器材由永久成就解锁后进入抽取池。未列入目录的条目明确拒绝，不宣称原作全部组合已经核对。

第二批逐条核对发现：输入的016 Relief Sack虽标active，现参考页已列停用，继续排除；083 Pocket Hearth和091 Supply Permit是rare，不能根据价格判为legendary；024 Cold Teacup没有第八月0.45降权。详细链接与核对边界见 docs/ForgeTax第二批实施记录.md，原始快照保持不改。

大成功与固定值/条件倍率的内部组合、第47月之后取整、保险补偿取整、同时触发的复杂顺序仍需核对。当前实现选择必须标记为篮球适配。

第三批核对：https://www.forgetax.tools/relics 与各条目页、https://www.forgetax.tools/achievements 。这仍是社区参考核对。篮球风格替代9种剑系杰作、复杂并发奖励按器材ID排序、镜像奖励复制本次最后一项价值奖励均为显式适配，详见 docs/ForgeTax第三批实施记录.md。
