import { describe, it, expect } from 'vitest';
import { assetCatalog, assetEffects, initialAssets, loungeCapacity, upgradeCost } from './assets';
import { buyConsumable, newGame, nextMonth, probabilities, rest, sell, seededRandom, train, upgradeAsset } from './engine';
import { gameSaleValue, monthPreview, monthlyInterest, saleBreakdown } from './economy';
import { config } from './config';
import { decodeSave } from './save';
import { type AssetId, type Game, statKeys } from './types';
const game = (): Game => ({ ...newGame(seededRandom(42)), cash:10_000_000 });
const empty = (): Game => ({ ...game(), recruits:[], selectedId:null, cash:0 });
const maxAssets = { gym:5, rehab:5, scout:5, lounge:4, rental:5 };
const roll = (first:number) => { let count=0; return () => count++===0 ? first : .5; };
describe('资产投资', () => {
  it.each(assetCatalog)('$name 成本递增且升级有封顶', asset => {
    let g=game();
    for(let level=0;level<asset.costs.length;level++) {
      const before=g; expect(upgradeCost(g.assetLevels,asset.id)).toBe(asset.costs[level]);
      g=upgradeAsset(g,asset.id); expect(g.cash).toBe(before.cash-asset.costs[level]);
      expect(g.assetLevels[asset.id]).toBe(level+1); expect(before.assetLevels[asset.id]).toBe(level);
      if(level) expect(asset.costs[level]).toBeGreaterThan(asset.costs[level-1]);
    }
    expect(upgradeCost(g.assetLevels,asset.id)).toBeNull(); expect(upgradeAsset(g,asset.id)).toBe(g);
  });
  it('无效资产、缺钱、游戏结束均不扣款', () => {
    for(const g of [empty(),{...game(),status:'over' as const}]) expect(upgradeAsset(g,'gym')).toBe(g);
    const g=game(); expect(upgradeAsset(g,'missing' as AssetId)).toBe(g);
  });
  it('康复减少两种伤病，训练馆提高成功率与实际成长', () => {
    const g=game(), improved={...g,assetLevels:{...initialAssets(),gym:2,rehab:2}};
    const a=probabilities(10), b=probabilities(10,[],undefined,improved.assetLevels);
    expect(b.severe).toBeCloseTo(a.severe*.81); expect(b.minor).toBeCloseTo(a.minor*.81); expect(b.success).toBeGreaterThan(a.success);
    const old=train(g,roll(.5)).recruits[0], next=train(improved,roll(.5)).recruits[0];
    const changed=statKeys.filter(k=>old.stats[k]>g.recruits[0].stats[k]);
    expect(changed).toHaveLength(2); for(const k of changed) expect(next.stats[k]-old.stats[k]).toBe(2);
    expect(train(improved,roll(.08)).recruits[0].stats).toEqual(train(g,roll(.08)).recruits[0].stats);
  });
  it('满级资产与装备组合概率有效，保护消除对应伤病', () => {
    for(const gear of [[],['vest','smart-ball'],['brace','shoes']]) for(const level of [0,50,10000]) {
      const p=probabilities(level,gear,undefined,maxAssets);
      expect(Object.values(p).reduce((a,b)=>a+b,0)).toBeCloseTo(1);
      expect(Object.values(p).every(n=>n>=0&&n<=1)).toBe(true);
      const safe=probabilities(level,gear,{hotShots:2,iceShots:1},maxAssets); expect(safe.severe+safe.minor).toBe(0);
    }
  });
  it('扩建席位真实可用并跨月保留，满席拒绝加入', () => {
    let g={...game(),assetLevels:maxAssets};
    expect(loungeCapacity(g)).toBe(6);
    for(let month=0;month<3;month++) { for(const p of g.recruits) g=rest(g,p.id); g=nextMonth(g,seededRandom(month)); }
    expect(g.lounge).toHaveLength(6); expect(rest(g,g.recruits[0].id)).toBe(g);
    expect(decodeSave(JSON.stringify(g))?.lounge).toEqual(g.lounge);
    expect(decodeSave(JSON.stringify({...g,assetLevels:initialAssets()}))).toBeNull();
  });
});
describe('统一报价和月底现金流', () => {
  it('球探与装备叠加，手动和自动出售都使用同一报价', () => {
    const g={...game(),equippedEquipment:['tablet'],assetLevels:{...initialAssets(),scout:2}};
    const p=g.recruits[0], quote=saleBreakdown(p,g.equippedEquipment,g.assetLevels);
    expect(quote.bonusRate).toBeCloseTo(.31); expect(gameSaleValue(g,p)).toBe(quote.total);
    expect(sell(g,p.id).cash-g.cash).toBe(quote.total);
    expect(monthPreview(g).saleIncome).toBe(g.recruits.reduce((n,p)=>n+gameSaleValue(g,p),0));
    expect(sell(g,p.id,true).cash-g.cash).toBe(config.economy.minimumSale);
  });
  it('训练等级和最高售价封顶，不能无限堆等级涨价', () => {
    const p=game().recruits[0]; p.stats=Object.fromEntries(statKeys.map(k=>[k,99])) as typeof p.stats;
    p.level=1000; const quote=saleBreakdown(p,['tablet'],maxAssets);
    expect(quote.total).toBe(2_000_000); expect(quote.bonusRate).toBeLessThanOrEqual(.6);
    expect(saleBreakdown({...p,level:100000},['tablet'],maxAssets)).toEqual(quote);
  });
  it('月息按剩余债务向上取整，清债归零且债务上限有效', () => {
    const g=game(); expect(monthlyInterest(g)).toBe(20000);
    expect(monthlyInterest({...g,debt:1234})).toBe(3); expect(monthlyInterest({...g,debt:0})).toBe(0);
    expect(monthlyInterest({...g,debt:config.economy.debtCap-1})).toBe(1);
    expect(monthlyInterest({...g,debt:config.economy.debtCap})).toBe(0);
  });
  it('先收租再还款，预览和真正结算一致', () => {
    const g={...empty(),cash:38000,assetLevels:{...initialAssets(),rental:1}}, preview=monthPreview(g), next=nextMonth(g,seededRandom(9));
    expect(preview.canPay).toBe(true); expect(preview.passiveIncome).toBe(12000);
    expect(next.cash).toBe(0); expect(next.debt).toBe(9970000); expect(next.credit).toBe(3);
    expect(next.totalPassiveIncome).toBe(12000); expect(next.totalInterest).toBe(20000);
    expect(next.debt).toBe(preview.debtAfter); expect(next.cash).toBe(preview.cashAfter);
  });
  it('还款失败和最后关营月份仍收租计息，结束后不能重复领取', () => {
    const g={...empty(),credit:1,assetLevels:{...initialAssets(),rental:1}}, next=nextMonth(g);
    expect(next.status).toBe('over'); expect(next.cash).toBe(12000); expect(next.debt).toBe(10020000);
    expect(next.totalPaid).toBe(0); expect(next.totalPassiveIncome).toBe(12000); expect(nextMonth(next)).toBe(next);
  });
  it('购买资产后的预览包含支出和新增月收入', () => {
    const g={...empty(),cash:100000}, upgraded=upgradeAsset(g,'rental');
    expect(monthPreview(g).cashAfter).toBe(50000); expect(monthPreview(upgraded).shortfall).toBe(0);
    expect(monthPreview(upgraded).cashAfter).toBe(2000); expect(g.assetLevels.rental).toBe(0);
  });
  it('租金封顶不足以覆盖后期最低还款，自由经营收入按月线性增长', () => {
    expect(assetEffects(maxAssets).monthlyIncome).toBe(60000);
    expect(monthPreview({...empty(),month:100,assetLevels:maxAssets}).shortfall).toBe(440000);
    let g={...empty(),debt:0,assetLevels:maxAssets};
    for(let i=0;i<120;i++) g=nextMonth({...g,recruits:[],selectedId:null},seededRandom(i));
    expect(g.cash).toBe(7200000); expect(g.totalPassiveIncome).toBe(7200000); expect(g.totalInterest).toBe(0); expect(g.credit).toBe(3);
  });
});
describe('批量补给与存档迁移', () => {
  it.each([5,10])('一次购买 %s 份，扣费与库存准确', quantity => {
    const g=game(), next=buyConsumable(g,'drink',quantity);
    expect(next.cash).toBe(g.cash-2500*quantity); expect(next.consumables.drink).toBe(1+quantity); expect(g.consumables.drink).toBe(1);
  });
  it('不足库存空间或现金时整单拒绝，无效数量不生效', () => {
    const g={...game(),consumables:{drink:95,ice:1}};
    expect(buyConsumable(g,'drink',5)).toBe(g); expect(buyConsumable({...g,cash:10000},'ice',5).consumables.ice).toBe(1);
    for(const n of [0,-1,.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1]) expect(buyConsumable(g,'drink',n)).toBe(g);
  });
  it('旧存档新增资产为零，不追补历史利息或租金', () => {
    const {assetLevels,totalInterest,totalPassiveIncome,...old}=game();
    const restored=decodeSave(JSON.stringify(old)); expect(restored?.assetLevels).toEqual(initialAssets());
    expect(restored?.totalInterest).toBe(0); expect(restored?.totalPassiveIncome).toBe(0);
    expect(restored?.debt).toBe(old.debt);
  });
  it('新字段完整恢复，可保存高于初始额的债务，拒绝非法资产和累计值', () => {
    const g={...game(),debt:10020000,assetLevels:maxAssets,totalInterest:20000,totalPassiveIncome:60000};
    expect(decodeSave(JSON.stringify(g))).toEqual(g);
    for(const patch of [{assetLevels:{...maxAssets,gym:6}},{assetLevels:{...maxAssets,rental:-1}},{assetLevels:{gym:0}}, {assetLevels:null},{totalInterest:-1},{totalPassiveIncome:.5},{debt:config.economy.debtCap+1}]) expect(decodeSave(JSON.stringify({...g,...patch}))).toBeNull();
  });
});
