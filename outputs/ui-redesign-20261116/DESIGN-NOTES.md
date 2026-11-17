# 球馆档案与离线报告方案

这些页面是待选择的静态设计稿，全部标明示例数据，没有读取或更改玩家存档。运行 `generate-designs.mjs` 可重新生成 HTML；在 Vite 下打开 `/outputs/ui-redesign-20261116/overview.html` 对比。

## 球馆档案

- A「荣誉档案」：突出馆级、培养纪录、最高身价与收藏，按纵向阅读；没有校友列表。
- B「经营仪表盘」：突出当前经营资源、推荐档次分布、训练与设施，并排比较；没有校友列表。

数据口径：

| 展示 | 真实数据来源 |
| --- | --- |
| 馆级、名称、下级门槛 | `state.gymLevel`、`gymLevels` |
| 开馆天数 | 当前日期减 `state.createdAt` |
| 可用券、累计声望 | `state.credits`、`state.fame`；当前余额不叫累计收入 |
| 在训、自动人数 | `state.player` 与 `state.bench`，过滤 `autoEnabled` |
| 推荐人数、档次分布、平均等级、最高最终身价 | 读取冷热全量校友记录后聚合；与 `alumniArchive` 对应记录不能重复计数 |
| 有效投篮、已完成课程、最高训练等级 | 全量校友＋在馆球员的 `shots`、`training.completedCourses`、`peakLevel`；明确不包含已丢弃且未留档球员，不冒充全生涯累计 |
| 模板、器材收藏 | `state.collection`、`state.collectedEquipment`，分母使用当前目录数量 |
| 已推荐不同模板 | `state.postgameRecommendedTemplates` 或全量真实校友最终模板去重 |
| 器材、项目、自动间隔、离线上限 | `ownedEquipment`、`equippedEquipment`、`projects`、`equipmentCapacity`、`automaticIntervalMs`、`offlineLimitMs` |

示例图中的比例条只表示视觉样式；落地必须使用实际目录长度或实际门槛计算。尚未记录的完整收入、历史消耗、离线累计时长不显示，也不推测补算。

## 离线报告

- A「结算票据」：总经验为主视觉；时长、球数、人数压缩为一行，球员成长纵向条目。
- B「球队战报」：深色总计分板＋双列成长卡，人数较多时继续排布。

两个布局完全依赖现有 `OfflineTrainingReport`：离开时长 `elapsedMs`、计入训练时长 `creditedMs`、单次上限 `capMs`、超上限 `capped`、总球数 `totalShots`、总经验 `totalExperience`，以及每人前后等级、体力、模板、课程与经验。模板应展示模板名，并在 ID 改变时比较实际前后模板。图中档次名仅用于演示。

共同保留“已自动保存、无需领取、超时仅恢复、不会自动推荐或补招”；设计未增加赞助券产出或额外奖励。
