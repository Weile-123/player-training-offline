import {mkdir, writeFile} from 'node:fs/promises';
import {equipmentCatalog, equipmentCatalogVersion, equipmentArtVersion, equipmentFamilyLabels, previousEquipmentCatalog, type GymEquipment} from '../src/game/gym/catalog';
import {shopCatalog} from '../src/game/contract/commerce';
import originalEquipment from '../src/game/contract/runtime/equipment.json';
import {courseRecoveryCap, newGym, projectCost} from '../src/game/gym/engine';

const rarityLabels = {common: '普通', rare: '稀有', legendary: '传说'};
const statLabels = {three: '三分', mid: '中投', drive: '突破', inside: '篮下', handle: '控球', defense: '防守'};
export const equipmentEffectText = (item: GymEquipment) => {
  const e = item.effects;
  return [e.stamina ? `体力上限+${e.stamina}` : '', e.recovery ? `恢复间隔−${e.recovery}秒` : '',
    e.courseRecovery ? `每10球课程额外恢复+${e.courseRecovery}` : '', e.experience ? `每球经验+${e.experience}` : '',
    e.automationExperience ? `自动每球经验+${e.automationExperience}` : '', e.offlineMinutes ? `离线上限+${e.offlineMinutes}分钟` : '',
    e.valuePercent ? `培养品牌/展示身价+${e.valuePercent}%` : '', e.cooperationBonus ? `完整启用2课后达标合作+${e.cooperationBonus}券` : '',
    e.focusKey ? `${statLabels[e.focusKey]}成长倾向+${e.focusPower}` : ''].filter(Boolean).join('；');
};
const scope = (item: GymEquipment) => item.family === 'automation' ? '在线自动、离线自动' : item.family === 'offline' ? '离线结算时长'
  : item.family === 'brand' ? '实际培养声望、当前展示身价' : item.family === 'cooperation' ? '达标合作推荐'
  : '全体在训球员，手动/在线自动/离线';
const purpose = (item: GymEquipment) => ({capacity: '连续出手缓冲；换入不补体力', recovery: '持续体力供给', course: '长程训练返体力',
  experience: '全模式经验效率', automation: '多球员自动经验效率', offline: '低频回访；提前练满则无额外收益',
  brand: '推进馆级声望，不直接产券', cooperation: '需实际培养，不支持领奖前临时换装'} as Record<string, string>)[item.family]
  ?? '指定属性方向；不增加升级总属性点数，不保证模板';
const rows = equipmentCatalog.map((item, index) => {
  const previous = equipmentCatalog.filter(other => other.family === item.family && other.grade < item.grade).sort((a, b) => b.grade - a.grade)[0];
  const resale = previous ? Math.floor(previous.price / 2) : 0;
  return {...item, sequence: index + 1, category: equipmentFamilyLabels[item.family], rarityName: rarityLabels[item.rarity],
    artPath: `public/art/products/${item.artId}.png`,
    previousId: previous?.id ?? '', previousPrice: previous?.price ?? 0, previousResale: resale,
    netUpgradeCost: item.price - resale, effectText: equipmentEffectText(item), scope: scope(item), purpose: purpose(item)};
});
const oldById = new Map(previousEquipmentCatalog.map(item => [item.id, item]));
const currentById = new Map(equipmentCatalog.map(item => [item.id, item]));
const changes = previousEquipmentCatalog.map(old => {
  const next = currentById.get(old.id);
  return {id: old.id, oldName: old.name, oldPrice: old.price, newName: next?.name ?? '', newPrice: next?.price ?? null,
    status: next ? '重写保留' : '下架退款', artId: next?.artId ?? '', newEffects: next ? equipmentEffectText(next) : '按记录购价全额退款，历史收藏留档'};
});
const total = rows.reduce((sum, item) => sum + item.price, 0);
const projectTotal = ['endurance', 'recovery', 'recruitment', 'equipment', 'automation', 'offline'].reduce((sum, id) =>
  sum + Array.from({length: id === 'endurance' || id === 'recovery' ? 8 : id === 'recruitment' ? 6 : id === 'equipment' ? 4 : 5}, (_, i) => projectCost(id, i + 1)).reduce((a, b) => a + b, 0), 0);
if (rows.length !== 35 || new Set(rows.map(item => item.id)).size !== rows.length
  || new Set(rows.map(item => item.artId)).size !== rows.length || rows.some(item => shopCatalog.find(original => original.id === item.artId)?.name !== item.name)
  || new Set(rows.map(item => JSON.stringify(item.effects))).size !== rows.length || rows.some(item => !oldById.has(item.id))) throw new Error('Invalid V3 catalog or original artwork/name pairs');
const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const csv = (data: unknown[][]) => '\uFEFF' + data.map(row => row.map(quote).join(',')).join('\r\n') + '\r\n';
await mkdir('docs/balance', {recursive: true});
await writeFile('docs/器材汇总.csv', csv([
  ['序号','逻辑ID','原版图片ID','原版名称','原图路径','类别','档位','品质','解锁馆级','所需球星模板种类','购买价_券','上档逻辑ID','上档标价_券','上档半价回款_券','升级净支出_券','体力上限','恢复缩短_秒','课程额外回体','通用每球经验','自动每球经验','离线延长_分钟','品牌百分比','合作额外券','专项方向','专项倾向','效果','作用范围','用途'],
  ...rows.map(item => [item.sequence,item.id,item.artId,item.name,item.artPath,item.category,item.grade,item.rarityName,item.unlockLevel,item.requiredTemplates,item.price,
    item.previousId,item.previousPrice,item.previousResale,item.netUpgradeCost,item.effects.stamina,item.effects.recovery,item.effects.courseRecovery,
    item.effects.experience,item.effects.automationExperience,item.effects.offlineMinutes,item.effects.valuePercent,item.effects.cooperationBonus,
    item.effects.focusKey ? statLabels[item.effects.focusKey] : '',item.effects.focusPower,item.effectText,item.scope,item.purpose]),
]));
await writeFile('docs/器材新版变更表.csv', csv([
  ['逻辑ID','旧名称','旧标价_券','当前原版名称','当前原版图片ID','新标价_券','处理','新效果'],
  ...changes.map(item => [item.id,item.oldName,item.oldPrice,item.newName,item.artId,item.newPrice,item.status,item.newEffects]),
]));
await writeFile('docs/原版器械资源索引.csv', csv([
  ['原版图片ID','原版名称','原版在售','当前采用逻辑ID','当前类别','当前档位','原图路径'],
  ...originalEquipment.relics.map(original => {const current = rows.find(item => item.artId === original.id);return [original.id,original.name,
    shopCatalog.some(item => item.id === original.id) ? '在售' : '停用',current?.id ?? '',current?.category ?? '',current?.grade ?? '',`public/art/products/${original.id}.png`];}),
]));
const familyRows = Object.entries(equipmentFamilyLabels).map(([family, label]) => {
  const items = rows.filter(item => item.family === family);
  return `| ${label} | ${items.length} | ${items.map(item => item.effectText).join(' → ')} | ${items.map(item => item.price).join(' / ')} | ${items.map(item => item.unlockLevel).join(' / ')} |`;
});
const report = `# 新版器械表

更新日期：2026-11-13。器材库版本${equipmentCatalogVersion}、原版名图映射版本${equipmentArtVersion}，当前已实装 **${rows.length}件、14个类别、总标价${total}券**。35件均采用逐一配对的原版名称和图片，效果设计、价格与解锁不变。逻辑ID负责存档，图片ID负责原版美术，两者分别列出。旧版按ID自动分配效果与定价的公式不再用于新库。

已查看原版全部96张器械图，其中94件在售、2件停用；新库采用35种不同在售资源，排除停用件、消耗品与招募卡。见[全部原器械索引](原版器械资源索引.csv)和[35件图片对照](evidence/equipment-original-reuse-v3.png)。

## 使用与费用

- 全馆共享，初始4个启用位置、项目升级后最多8个。每类只启用一件，购买更高档需确认替换同类旧件，旧件进入仓库。
- 馆级、模板收藏是购买资格，不额外收费；只支付表中标价。普通基础不要求收藏，收藏器材统一要求8种球星模板，各专项方向规则一致。
- 仓库器材可重新入馆或按记录购入价半价出售、向下取整。表中升级净支出假定上档按本表标价购买且卖出；保留仓库不出售则仍支付完整新价。历史净购价不同，以实际存档为准。
- 35件全部收藏标价${total}券，六个项目全满${projectTotal}券，合计${total + projectTotal}券；这不是必需购买清单或经营时长。器材存在模式、回访频率和模板方向的取舍。

## 类别与梯度

| 类别 | 数量 | 效果梯度 | 价格/券 | 解锁馆级 |
| --- | ---: | --- | --- | --- |
${familyRows.join('\n')}

## 完整器械表

| 逻辑ID | 原版名称 | 原版图片ID | 类别 | 档位 | 馆级 | 模板数 | 购买价/券 | 卖出上档后的净支出/券 | 效果 |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
${rows.map(item => `| ${item.id} | ${item.name} | [${item.artId}](../${item.artPath}) | ${item.category} | ${item.grade} | ${item.unlockLevel} | ${item.requiredTemplates} | ${item.price} | ${item.netUpgradeCost} | ${item.effectText} |`).join('\n')}

## 生效规则

- 每球基础经验仍为维持8、成功12、大成功20，概率30%/60%/10%。通用经验与自动经验按整数相加；自动项目仍每级额外+1经验。手动冷却固定1秒，器材不更改概率、模板匹配或每级经验曲线。
- 在线自动与离线每球经验一致。离线器材只延长结算时长：项目基础30/45/60/90/120/180分钟，加器材15/30/60分钟，合计封顶240分钟。达到99级停止训练；提前练满时，剩余时长不会再产生收益，也不会自动推荐招新。
- 器材容量最高+20、自然恢复最高缩短4秒；课程基础恢复4，器材额外上限按馆1–8为${Array.from({length:8},(_,i)=>courseRecoveryCap({...newGym(0),gymLevel:i+1})).join('/')}。新库单课额外最高3，总返体力最高7。
- 合作加券档位+1/+2，必须接取后实际启用相应档位完成2个完整课程，每课10球均启用才计。资格已取得可换下；重新接合作则重新累计。只完成合作本身不自动取得器材加券。
- 品牌声望按球员每次实际训练的品牌值平均计算，合计上限50%；不增加基础推荐券、培养奖金或固定合作声望。当前展示身价按当前器材显示，不能兑换现金。
- 六专项只是成长倾向，不增加每次升级总属性点数，不保证模板。目标属性达到99后停止额外倾向。
- 训练位、器材位置、初始属性、自动出手间隔由球馆和项目负责，不再用器材重复发放。馆7/8的增长来自训练位、项目与收藏目标，没有新增某个方向独占的器材门槛。

## 旧档处理

下架器材按已记录购价全额退款；保留项降价时退差并更新净购价，涨价不追收。旧同类多件持有保留，最高档启用，其余进入仓库。旧收藏全部历史留档，仍存在的新资源ID保留当前图鉴记录。

旧版尚未领取的离线时间使用迁移前器材快照结算，完成后启用新效果，不追溯新经验或新离线上限。旧球员已有训练按旧品牌建立均值基线，合作资格从更新后的实际课程累计；已领取推荐奖励不重算。

完整变更见[44件旧库变更CSV](器材新版变更表.csv)，数值试验见[器材库重写与测试报告](器材库重写与测试报告.md)，本轮价格结论与后期积券方案见[复核与方案](器械价格复核与赞助券消耗方案.md)。当前35件价格全部保留；精选招生只作方案。执行 \`node scripts/export-gym-equipment.mjs\` 可从游戏配置重新生成本表、CSV与目录快照。
`;
await writeFile('docs/新版器械表.md', report);
await writeFile('docs/器材汇总与定价调整.md', `# 器材汇总与定价调整\n\n更新日期：2026-11-13。当前器材库版本3，已完成全面重写：**35件、14类、总标价${total}券**。\n\n完整在售表、梯度、解锁条件与结算规则统一以[新版器械表](新版器械表.md)和[CSV](器材汇总.csv)为准；平衡结果见[器材库重写与测试报告](器材库重写与测试报告.md)。\n\n旧44件中35件复用资源并重写用途，9件下架退款，详见[新版变更表](器材新版变更表.csv)。原94→44的[50件同效删减表](器材删减对应表.csv)只作历史记录，不能当成当前映射或购买清单。旧版474券、94件944券均不再是当前价格。\n\n旧档退款、历史收藏及未领取离线收益边界详见新版器械表。当前35件与六个项目全部买齐的标价合计${total + projectTotal}券，不代表玩家必须全买或相应经营时间。\n`);
await writeFile('docs/balance/equipment-v3-catalog.json', JSON.stringify({date:'2026-11-13',version:equipmentCatalogVersion,artVersion:equipmentArtVersion,
  count:rows.length,total,projectTotal,totalWithProjects:total+projectTotal,familyCount:Object.keys(equipmentFamilyLabels).length,
  rules:{oneActivePerFamily:true,slots:[4,8],offlineHardCapMinutes:240,probabilities:[.3,.6,.1],manualCooldownSeconds:1},rows,changes}, null, 2)+'\n');
console.log(JSON.stringify({version:equipmentCatalogVersion,count:rows.length,total,projectTotal,totalWithProjects:total+projectTotal,removed:changes.filter(item=>!item.newName).length}));
