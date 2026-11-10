import reference from './numerical.json';

export const evidence = {
  commerce: { status: 'reference_checked', source: 'https://www.forgetax.tools/tools/relic-shop', decision: '94件启用器材；4件停用排除。价格/稀有度/开放月份逐项配置；随机抽取调用顺序不宣称与原作逐种子一致。' },
  merchant: { status: 'basketball_design', originalStatus: 'unconfirmed', source: 'https://www.forgetax.tools/merchant', decision: '表内价格采用参考值；表外使用公开比例并向上取十位。先确定传奇资格再均匀无放回填商品槽，内部选取顺序未核实。' },
  rewind: { status: 'basketball_design', source: 'https://www.forgetax.tools/merchant/regret-clockwork', decision: '须在投篮前持有；任何非投篮/时间推进动作使快照失效。回退训练领域状态，不回退随机流、逻辑时钟、已消费物品或永久图鉴；不可跨月或跨交易回退。' },
  shields: { status: 'basketball_design', decision: '保护顺序：一次性护盾→月度保护→球员首次保护→两次轻伤积蓄保护→凤凰保命。被阻止的重伤不触发维持收益；未重伤出手+手感。' },
  lockedRelics: { status: 'basketball_design', source:'https://www.forgetax.tools/achievements', decision: '7项经营成就参考原条件；9项剑系+20替换为球员+20及六维风格条件，具体门槛属于篮球适配。16件解锁跨生涯保存。' },
  triggeredRelics: {status:'basketball_design',originalStatus:'unconfirmed',decision:'事件价值奖励按器材编号顺序结算，镜子重复最后一个本次奖励。传承累积并由下个上场未训练+0球员领取。多效果组合次序不宣称原作一致。'},
  browserTime: {status:'basketball_design',decision:'火热采用剩余投篮次数，基础7次；不随时间流逝。取消投篮冷却，动画不限制逻辑出手。'},
  persistentRelics: { status: 'basketball_design', originalStatus: 'unconfirmed', decision: '已获得的永久价值、伤痕风险减免、积蓄的额外等级与超额折抵保留；卸下器材停止新增触发，静态加值/概率随装备实时改变，火热次数加成在每轮开启时锁定。继承副本保留已用保命标记。原作卸装/复制细节未核实。' },
  probability: { status: 'reference_checked', source: reference.sources.odds },
  valueSamples: { status: 'reference_checked', source: reference.sources.value },
  frenzy: { status: 'basketball_design', source: reference.sources.frenzy, decision:'原4秒最大约7投，改为固定7次；原+1/+2秒按7/4比例取整为+2/+4次。无出手冷却。' },
  greatWithFlat: {
    status: 'basketball_design', originalStatus: 'unconfirmed',
    decision: '额外价值记入可随等级增长的基值账户；当前固定值参与大成功目标值，事件加值在等级结算后执行。无装备样例已对照，复杂组合不宣称原作一致。',
  },
  quotaAfter47: {
    status: 'basketball_design', originalStatus: 'unconfirmed',
    decision: '第48月起以第47月表值为锚，精确乘(6/5)的月数次幂后四舍五入；不逐月对已取整值递推。',
  },
  growthAndTemplates: { status: 'basketball_design', decision: '成长10点/级、五档等级与核心能力配置为试验参数。模板获取以历史最高等级为档次上限；已获得的外观不会因六维变化或降级撤销，仅在追平峰值且满足更高档门槛后升级。经济与概率仍使用当前等级。' },
  effectOrder: { status: 'basketball_design', decision: '替换基础权重→加减→有界转移→倍乘权重→等级曲线→风险倍率→火热→物品映射→整数票。复杂原作组合待核实。' },
  scrapRounding: { status: 'basketball_design', originalStatus: 'unconfirmed', decision: '首批将已记录最高整数报价的30%向下取整为交付补偿，等待原作取整证据。' },
} as const;

