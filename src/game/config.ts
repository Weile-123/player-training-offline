export const config = {
  initialDebt: 10_000_000, initialCredit: 3, recruitsPerMonth: 2, loungeCapacity: 2,
  age: [18, 23], height: [178, 218], initialStat: [24, 48], maxStat: 99,
  risk: { severeBase: 0.015, severePerLevel: 0.004, severeCap: 0.28, minor: 0.10, hold: 0.20, great: 0.10 },
  growth: { success: [2, 5], great: [5, 9], minor: [2, 5], successCount: 2, greatCount: 3, minorCount: 2 },
  economy: { minimumSale: 5_000, valueMultiplier: 0.70, levelBonus: 0.035, firstPayment: 50_000, paymentGrowth: 15_000, paymentCap: 500_000, monthlyInterestRate: 0.002, debtCap: 100_000_000, levelBonusCap: 2, saleBonusCap: 0.6, maximumSale: 2_000_000 },
  matching: {
    tiers: [
      { id: 'rotation', label: '替补', minimumRating: 45 },
      { id: 'starter', label: '首发', minimumRating: 55 },
      { id: 'star', label: '全明星', minimumRating: 65 },
      { id: 'superstar', label: '巨星', minimumRating: 77 },
      { id: 'legend', label: '传奇', minimumRating: 87 },
    ],
    downgradeBuffer: 3, switchAdvantage: 0.05, similarityScale: 2, balancedScale: 8,
  },
  feel: { maximum: 6, activationCost: 6, hotShots: 2, successGain: 1, greatGain: 2, minorLoss: 1 },
  equipment: {
    slots: 2,
    catalog: [
      { id: 'brace', name: '稳定护具', price: 12000, build: '稳健流', description: '重伤风险 ×0.65；成功率 +2 个百分点', effects: { severeMultiplier: 0.65, successBonus: 0.02 } },
      { id: 'vest', name: '极限负重背心', price: 18000, build: '豪赌流', description: '重伤风险 ×1.4；大成功率 +5 个百分点；成长 +2', effects: { severeMultiplier: 1.4, greatBonus: 0.05, growthBonus: 2 } },
      { id: 'glove', name: '射手训练手套', price: 15000, build: '射手流', description: '更易训练三分/中投；三分成长 +2、中投 +1', effects: { statGrowth: { three: 2, mid: 1 }, statWeights: { three: 3, mid: 2 } } },
      { id: 'smart-ball', name: '智能训练篮球', price: 20000, build: '成长流', description: '成功率 +7 个百分点；成长 +1', effects: { successBonus: 0.07, growthBonus: 1 } },
      { id: 'tablet', name: '球探分析平板', price: 25000, build: '商业流', description: '正常出售分红 +15%；重伤最低价不受加成', effects: { saleBonus: 0.15 } },
      { id: 'shoes', name: '轻量训练球鞋', price: 18000, build: '均衡流', description: '重伤风险 ×0.85；成功率 +2、大成功率 +2 个百分点', effects: { severeMultiplier: 0.85, successBonus: 0.02, greatBonus: 0.02 } },
    ],
    severeCap: 0.45, greatCap: 0.35,
  },
  consumables: {
    starter: { drink: 1, ice: 1 }, maximumStock: 99,
    drink: { name: '运动饮料', price: 2500, heatGain: 2, description: '当前球员手感 +2（上限 6）' },
    ice: { name: '冰敷包', price: 3500, protectedShots: 1, description: '当前球员下一次训练免疫轻伤' },
  },
  assets: {
    catalog: [
      { id: 'gym', name: '训练馆', description: '每级成功率 +1 个百分点，成功成长 +1', costs: [35000, 75000, 150000, 300000, 600000] },
      { id: 'rehab', name: '康复中心', description: '每级重伤和轻伤概率各乘 0.9', costs: [40000, 90000, 180000, 360000, 720000] },
      { id: 'scout', name: '球探网络', description: '每级正常出售分红 +8%，与装备叠加', costs: [50000, 100000, 200000, 400000, 800000] },
      { id: 'lounge', name: '休息室扩建', description: '每级增加 1 个跨月席位，最多 6 席', costs: [25000, 60000, 140000, 320000] },
      { id: 'rental', name: '出租球场', description: '每级月底租金 $12,000，最多 $60,000/月', costs: [60000, 150000, 350000, 750000, 1500000] },
    ],
    gymSuccessPerLevel: 0.01, gymGrowthPerLevel: 1,
    rehabRiskMultiplier: 0.9, scoutSalePerLevel: 0.08,
    loungeSlotsPerLevel: 1, rentalIncomePerLevel: 12000,
  },
  logLimit: 20, saveKey: 'player-training.save.v1', backupKey: 'player-training.backup.v1',
  collectionKey: 'player-training.collection.v1', collectionBackupKey: 'player-training.collection.backup.v1',
} as const;
export const statLabels = { three: '三分', mid: '中投', drive: '突破', inside: '篮下', handle: '控球', defense: '防守' };
