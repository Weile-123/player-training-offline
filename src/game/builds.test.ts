import { describe, expect, it } from 'vitest';
import { config } from './config';
import { equipmentCatalog } from './equipment';
import { activateHot, buyConsumable, buyEquipment, monthPreview, newGame, nextMonth, probabilities, rest, saleValue, seededRandom, select, sell, toggleEquipment, train, trainingProbabilities, useConsumable } from './engine';
import { decodeSave } from './save';
import type { ConsumableId, Game } from './types';
const fresh = () => newGame(seededRandom(123));
const roll = (first: number, remaining = 0.5) => { let index = 0; return () => index++ === 0 ? first : remaining; };
const sequence = (...values: number[]) => { let index = 0; return () => values[index++] ?? 0; };
function equipped(ids: string[]): Game {
  let game = { ...fresh(), cash: 200000 };
  for (const id of ids) game = toggleEquipment(buyEquipment(game,id),id);
  return game;
}

describe('手感与保护', () => {
  it('成功 +1、大成功 +2、轻伤 -1，上下限受控', () => {
    const g = fresh();
    expect(train(g,roll(.5)).recruits[0].heat).toBe(1);
    expect(train(g,roll(.99)).recruits[0].heat).toBe(2);
    g.recruits[0].heat = 1;
    expect(train(g,roll(.05)).recruits[0].heat).toBe(0);
    g.recruits[0].heat = 6;
    expect(train(g,roll(.99)).recruits[0]).toMatchObject({heat:0,hotShots:1});
    g.recruits[0].heat = 0;
    expect(train(g,roll(.05)).recruits[0].heat).toBe(0);
  });
  it('满格状态的兼容激活消耗 6 点，不能反复覆盖剩余保护', () => {
    const g = fresh();
    expect(activateHot(g)).toBe(g);
    g.recruits[0].heat = 6;
    expect(g.recruits[0].hotShots).toBe(0);
    const active = activateHot(g);
    expect(active.recruits[0].heat).toBe(0);
    expect(active.recruits[0].hotShots).toBe(2);
    expect(activateHot(active)).toBe(active);
    expect(g.recruits[0].heat).toBe(6);
  });
  it('成功或大成功补满后自动开启，保护期间不再积累，恰好消耗两次后恢复普通手感', () => {
    for(const [heat,shot] of [[5,.5],[4,.99]]){
      const g=fresh();g.recruits[0].heat=heat;
      const charged=train(g,roll(shot));
      expect(charged.recruits[0]).toMatchObject({heat:0,hotShots:2});
      expect(charged.lastOutcome).toBe(shot===.5?'success':'great');
      const first=train(charged,roll(.99)),second=train(first,roll(.99));
      expect(first.recruits[0]).toMatchObject({heat:0,hotShots:1});
      expect(second.recruits[0]).toMatchObject({heat:0,hotShots:0});
      expect(trainingProbabilities(second,second.recruits[0]).severe).toBeGreaterThan(0);
      expect(train(second,roll(.5)).recruits[0]).toMatchObject({heat:1,hotShots:0});
      expect(g.recruits[0]).toMatchObject({heat,hotShots:0});
    }
  });
  it('火热恰好免疫 2 次，第三次恢复重伤风险', () => {
    const g = fresh(), id = g.selectedId!;
    g.recruits[0].heat = 6;
    const first = train(activateHot(g),roll(0));
    expect(first.recruits.some(p=>p.id===id)).toBe(true);
    expect(first.recruits[0].hotShots).toBe(1);
    const second = train(first,roll(0));
    expect(second.recruits[0].hotShots).toBe(0);
    expect(second.recruits.some(p=>p.id===id)).toBe(true);
    expect(train(second,roll(0)).recruits.some(p=>p.id===id)).toBe(false);
  });
  it('冰敷恰好保护一次，下一次轻伤正常下降属性和手感', () => {
    const g = fresh(); g.recruits[0].heat = 3;
    const protectedGame = useConsumable(g,'ice');
    const first = train(protectedGame,roll(.05));
    expect(first.lastOutcome).not.toBe('minor');
    expect(first.recruits[0].stats).toEqual(g.recruits[0].stats);
    expect(first.recruits[0].heat).toBe(3);
    expect(first.recruits[0].iceShots).toBe(0);
    expect(train(first,roll(.05)).recruits[0].heat).toBe(2);
  });
  it('两种保护可叠加，免疫概率转为维持而非成功', () => {
    const g = fresh(); g.recruits[0].heat = 6;
    const active = useConsumable(activateHot(g),'ice'), p = active.recruits[0];
    const base = probabilities(p.level), protectedChance = trainingProbabilities(active,p);
    expect(protectedChance.severe).toBe(0);
    expect(protectedChance.minor).toBe(0);
    expect(protectedChance.success).toBeCloseTo(base.success);
    expect(protectedChance.hold).toBeCloseTo(base.hold+base.severe+base.minor);
    const result = train(active,roll(0));
    expect(result.lastOutcome).toBe('hold');
    expect(result.recruits[0].hotShots).toBe(1);
    expect(result.recruits[0].iceShots).toBe(0);
  });
  it('切换、休息、跨月和刷新不消耗手感或保护次数', () => {
    const g = fresh(); g.recruits[0].heat = 6;
    let active = useConsumable(activateHot(g),'ice');
    const p = active.recruits[0];
    active = select(active,active.recruits[1].id);
    expect(active.recruits[0]).toEqual(p);
    const next = nextMonth({ ...rest(active,p.id),cash:500000 },seededRandom(123));
    expect(next.lounge[0]).toEqual(p);
    expect(decodeSave(JSON.stringify(next))?.lounge[0]).toEqual(p);
  });
  it('每名球员手感独立，下一月新人从零开始', () => {
    let g = train(fresh(),roll(.99));
    expect(g.recruits[1].heat).toBe(0);
    g = nextMonth({ ...rest(g,g.recruits[0].id),cash:500000 },seededRandom(12));
    expect(g.lounge[0].heat).toBe(2);
    expect(g.recruits.every(p=>p.heat===0 && p.hotShots===0 && p.iceShots===0)).toBe(true);
  });
});

describe('装备构筑', () => {
  it('购买扣款但不会自动装备，同一装备只能买一次', () => {
    const g = { ...fresh(),cash:20000 };
    const bought = buyEquipment(g,'brace');
    expect(bought.cash).toBe(8000);
    expect(bought.ownedEquipment).toEqual(['brace']);
    expect(bought.equippedEquipment).toEqual([]);
    expect(buyEquipment(bought,'brace')).toBe(bought);
    expect(buyEquipment(g,'missing')).toBe(g);
    expect(buyEquipment(fresh(),'brace').ownedEquipment).toEqual([]);
  });
  it('只能装配已购装备，两个槽位，卸下后立即取消加成', () => {
    const g = fresh(); expect(toggleEquipment(g,'brace')).toBe(g);
    let active = equipped(['brace','vest']);
    active = buyEquipment(active,'glove');
    expect(toggleEquipment(active,'glove')).toBe(active);
    const removed = toggleEquipment(active,'brace');
    expect(removed.equippedEquipment).toEqual(['vest']);
    expect(removed.cash).toBe(active.cash);
    expect(trainingProbabilities(removed,removed.recruits[0]).severe).toBeGreaterThan(trainingProbabilities(active,active.recruits[0]).severe);
  });
  it('稳健降低风险，豪赌提高重伤和大成功，智能篮球提高成功率', () => {
    const base = probabilities(20), safe = probabilities(20,['brace']), gamble = probabilities(20,['vest']), smart = probabilities(20,['smart-ball']);
    expect(safe.severe).toBeCloseTo(base.severe*.65);
    expect(gamble.severe).toBeCloseTo(base.severe*1.4);
    expect(gamble.great).toBeCloseTo(base.great+.05);
    expect(smart.success).toBeCloseTo(base.success+.07);
  });
  it('所有合法装备组合和保护状态都保持概率有效、归一', () => {
    const combinations = [[],...equipmentCatalog.map(e=>[e.id]),...equipmentCatalog.flatMap((a,index)=>equipmentCatalog.slice(index+1).map(b=>[a.id,b.id]))];
    for (const ids of combinations) for (const level of [0,10,50,100,1000]) for (const hotShots of [0,2]) for (const iceShots of [0,1]) {
      const chance = probabilities(level,ids,{ hotShots,iceShots });
      expect(Object.values(chance).every(p=>Number.isFinite(p)&&p>=0&&p<=1)).toBe(true);
      expect(Object.values(chance).reduce((sum,p)=>sum+p,0)).toBeCloseTo(1);
    }
  });
  it('重复 ID 不叠加同一件装备效果', () => {
    expect(probabilities(20,['brace','brace'])).toEqual(probabilities(20,['brace']));
  });
  it('成长加成只作用于成功，不加重轻伤损失', () => {
    const base = fresh(), smart = equipped(['smart-ball']);
    const normal = train(base,roll(.5)), improved = train(smart,roll(.5));
    for (const key of ['inside','drive'] as const) expect(improved.recruits[0].stats[key]-normal.recruits[0].stats[key]).toBe(1);
    expect(train(smart,roll(.05)).recruits[0].stats).toEqual(train(base,roll(.05)).recruits[0].stats);
  });
  it('射手手套改变抽取分布，并提高三分和中投成长', () => {
    const base = fresh(), shooter = equipped(['glove']);
    const normal = train(base,sequence(.5,.45,0,0,0)), improved = train(shooter,sequence(.5,.45,0,0,0));
    expect(normal.recruits[0].stats.drive).toBe(base.recruits[0].stats.drive+2);
    expect(improved.recruits[0].stats.drive).toBe(shooter.recruits[0].stats.drive);
    expect(improved.recruits[0].stats.mid).toBe(shooter.recruits[0].stats.mid+3);
    expect(improved.recruits[0].stats.three).toBe(shooter.recruits[0].stats.three+4);
  });
  it('商业分红用于手动和月底出售，重伤仍为最低价', () => {
    const g = equipped(['tablet']), p = g.recruits[0], quote = saleValue(p,g.equippedEquipment);
    expect(quote/saleValue(p)).toBeCloseTo(1.15,3);
    expect(sell(g,p.id).cash-g.cash).toBe(quote);
    expect(monthPreview(g).income).toBe(g.recruits.reduce((sum,p)=>sum+saleValue(p,g.equippedEquipment),0));
    expect(train(g,roll(0)).cash-g.cash).toBe(config.economy.minimumSale);
  });
  it('装备、背包跨月保留，新开局全部重置', () => {
    const g = equipped(['brace','tablet']);
    const next = nextMonth(g,seededRandom(123));
    expect(next.equippedEquipment).toEqual(g.equippedEquipment);
    expect(next.ownedEquipment).toEqual(g.ownedEquipment);
    expect(next.consumables).toEqual(g.consumables);
    expect(fresh().ownedEquipment).toEqual([]);
  });
});

describe('补给、存档与无效操作', () => {
  it('饮料补满手感自动进入火热，火热期间不浪费饮料库存', () => {
    const g = fresh(); g.recruits[0].heat = 5;
    const used = useConsumable(g,'drink');
    expect(used.recruits[0]).toMatchObject({heat:0,hotShots:2});
    expect(used.consumables.drink).toBe(0);
    expect(useConsumable({ ...used,consumables:{drink:1,ice:1} },'drink').consumables.drink).toBe(1);
    expect(useConsumable(used,'drink')).toBe(used);
  });
  it('已有冰敷时不能重复使用，购买消耗现金且有库存上限', () => {
    const g = { ...fresh(),cash:10000 }, protectedGame = useConsumable(g,'ice');
    const stocked = buyConsumable(protectedGame,'ice');
    expect(stocked.cash).toBe(6500);
    expect(stocked.consumables.ice).toBe(1);
    expect(useConsumable(stocked,'ice')).toBe(stocked);
    const full = { ...g,consumables:{drink:99,ice:99} };
    expect(buyConsumable(full,'ice')).toBe(full);
    expect(buyConsumable(fresh(),'drink').consumables.drink).toBe(1);
  });
  it('老存档补零状态和首次补给，新存档不重复赠送', () => {
    const g = fresh(), old = JSON.parse(JSON.stringify(g));
    delete old.ownedEquipment; delete old.equippedEquipment; delete old.consumables;
    for (const p of old.recruits) { delete p.heat; delete p.hotShots; delete p.iceShots; }
    const migrated = decodeSave(JSON.stringify(old))!;
    expect(migrated.recruits.every(p=>p.heat===0 && p.hotShots===0 && p.iceShots===0)).toBe(true);
    expect(migrated.consumables).toEqual({drink:1,ice:1});
    const used = useConsumable(migrated,'drink');
    expect(decodeSave(JSON.stringify(used))?.consumables.drink).toBe(0);
    expect(used.debt).toBe(g.debt);
  });
  it('新系统完整往返，非法手感、保护、装备或库存拒绝恢复', () => {
    const g = equipped(['brace','tablet']); g.recruits[0].heat = 6;
    const active = useConsumable(activateHot(g),'ice');
    expect(decodeSave(JSON.stringify(active))).toEqual(active);
    for (const patch of [{ownedEquipment:['unknown']},{equippedEquipment:['vest']},{equippedEquipment:['brace','brace']},{consumables:{drink:-1,ice:1}},{consumables:{drink:100,ice:1}}]) expect(decodeSave(JSON.stringify({...g,...patch}))).toBeNull();
    for (const patch of [{heat:7},{heat:-1},{hotShots:3},{iceShots:2}]) expect(decodeSave(JSON.stringify({...g,recruits:[{...g.recruits[0],...patch},g.recruits[1]]}))).toBeNull();
  });
  it('没有球员或游戏结束，不允许消费、开启火热或购买装配', () => {
    const g = { ...fresh(),status:'over' as const,credit:0,cash:100000 };
    expect(activateHot(g)).toBe(g); expect(useConsumable(g,'drink')).toBe(g);
    expect(buyEquipment(g,'brace')).toBe(g); expect(toggleEquipment(g,'brace')).toBe(g); expect(buyConsumable(g,'ice')).toBe(g);
    const empty = { ...fresh(),recruits:[],selectedId:null };
    expect(useConsumable(empty,'drink')).toBe(empty); expect(activateHot(empty)).toBe(empty);
    expect(useConsumable(fresh(),'unknown' as ConsumableId).consumables).toEqual(config.consumables.starter);
  });
});
