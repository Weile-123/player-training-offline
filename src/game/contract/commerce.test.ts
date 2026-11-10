import { describe, expect, it } from 'vitest';
import { dispatch, newContract, playerValue, previewSettlement, previewShot, type Contract, type Action } from './engine';
import { makeMerchant, newCommerce, rollShop, shopCatalog, shopEntry, offerWeight, rerollPrice, merchantPrice, purchasePrice } from './commerce';
import { random, stream, hash } from './random';
import { outcomeAt } from './probability';
import { encodeContract, decodeContract, validContract } from './save';
import { rules } from './rules';

function act(s: Contract, a: Action): Contract { const r = dispatch(s,s.revision,a); expect(r.error).toBeUndefined(); return r.state; }
function month(s: Contract, m: number): Contract { s.month = m; s.commerce = newCommerce(m,s.equipment,s.credit,s.rng.market); return s; }
function ready(s: Contract) { return s.clockMs < s.nextShotAt ? act(s,{type:'advance',milliseconds:s.nextShotAt-s.clockMs}) : s; }
function force(s: Contract, wanted: string, duplicate = false) {
  const tickets = previewShot(s,s.players[0]).tickets;
  for(let n=0;n<200000;n++) {
    const r={state:n}; const outcome=outcomeAt(tickets,Math.floor(random(r)*1000));
    if(outcome===wanted && (!duplicate || random(r)<0.02)) { s.rng.economy.state=n; return; }
  }
  throw new Error('找不到测试随机值');
}
function fire(s: Contract, result: string, duplicate=false) { s=ready(s); force(s,result,duplicate); return act(s,{type:'train',playerId:s.players[0].id}); }

describe('积分商店',()=>{
  it('固定八件初始池、三件不重复、免费只拿一件且不能刷新',()=>{
    expect(shopCatalog.filter(e=>e.starter).map(e=>e.id).sort()).toEqual([2,3,9,17,36,41,11,12].map(n=>`relic_${String(n).padStart(3,'0')}`).sort());
    let s=newContract(7); const offers=[...s.commerce.shop.offers];
    expect(new Set(offers).size).toBe(3); expect(dispatch(s,0,{type:'reroll'}).error).toBe('gift-cannot-reroll');
    s=act(s,{type:'buy-equipment',id:offers[0]}); expect(s.equipment).toContain(offers[0]); expect(s.credits).toBe(0); expect(s.commerce.shop.offers).toEqual([]);
    expect(dispatch(s,s.revision,{type:'buy-equipment',id:offers[1]}).error).toBe('unavailable-equipment');
  });
  it('按月份、锁定和已持有排除，稀有价格例外保留',()=>{
    for(let seed=0;seed<100;seed++) {
      const owned=['relic_003']; const offers=rollShop(6,owned,[],stream(seed,'shop'));
      expect(new Set(offers).size).toBe(offers.length);
      for(const id of offers) { const e=shopEntry(id)!; expect(e.month).toBeLessThanOrEqual(6); expect(e.locked).toBe(false); expect(owned).not.toContain(id); }
    }
    expect(shopEntry('relic_020')?.price).toBe(1); expect(shopEntry('relic_068')?.price).toBe(3);
    expect(shopEntry('relic_083')?.rarity).toBe('rare'); expect(shopEntry('relic_091')?.rarity).toBe('rare');
    expect(offerWeight(shopEntry('relic_024')!,8)).toBe(1);
    expect(offerWeight(shopEntry('relic_003')!,3)).toBe(1.75); expect(offerWeight(shopEntry('relic_008')!,8)).toBe(0.45);
    expect(rollShop(30,shopCatalog.map(e=>e.id),[],stream(1,'shop'))).toEqual([]);
  });
  it('付款使用积分；不足与满槽失败均无副作用，替换原子完成',()=>{
    const gear=shopCatalog.slice(0,8).map(e=>e.id); let s=month(newContract(9,gear),6);
    s.commerce.shop.offers=['relic_060']; const before=JSON.stringify(s);
    expect(dispatch(s,s.revision,{type:'buy-equipment',id:'relic_060'}).error).toBe('insufficient-credits'); expect(JSON.stringify(s)).toBe(before);
    s.credits=3; expect(dispatch(s,s.revision,{type:'buy-equipment',id:'relic_060'}).error).toBe('equipment-full');
    s=act(s,{type:'buy-equipment',id:'relic_060',replaceId:gear[0]}); expect(s.equipment).toHaveLength(8); expect(s.credits).toBe(1); expect(s.equipment).not.toContain(gear[0]);
  });
  it('经费刷新逐次涨价，免费券不计入付费次数且跨月恢复',()=>{
    expect(rerollPrice(6,0)).toBe('855'); expect(rerollPrice(6,1)).toBe('2138');
    let s=month(newContract(2,['relic_043']),6); s.cash='10000';
    const economic={...s.rng.economy};
    s=act(s,{type:'reroll'}); expect(s.cash).toBe('10000'); expect(s.commerce.shop.paidRerolls).toBe(0);
    s=act(s,{type:'reroll'}); expect(s.cash).toBe('9145'); expect(s.rng.economy).toEqual(economic);
    s=act(s,{type:'settle'}); expect(s.commerce.shop.freeUsed).toBe(false); expect(s.commerce.shop.paidRerolls).toBe(0);
  });
});

describe('外部球探与购买',()=>{
  it('来访月份、初始必带物品、正常与特殊供给价格',()=>{
    expect(makeMerchant(2,[],3,false,stream(1,'m')).offers).toEqual([]);
    const offers=makeMerchant(3,[],3,false,stream(1,'m')).offers;
    expect(offers.map(o=>o.id).sort()).toEqual(['basic','special','item_001','item_002'].sort());
    expect(offers.find(o=>o.id==='basic')?.stock).toBe(2);
    expect(merchantPrice(3,'item_002')).toBe('3980'); expect(merchantPrice(15,'special')).toBe('160120');
    expect(merchantPrice(24,'special')).toBe('1094450'); expect(merchantPrice(24,'item_003')).toBe('224510');
  });
  it('重复购买x3，库存用完拒绝，特殊球员有独立640基值',()=>{
    let s=month(newContract(1),9); s.cash='1000000';
    const offer=s.commerce.merchant.offers.find(o=>o.id==='basic')!; const first=purchasePrice(offer);
    s=act(s,{type:'buy-merchant',id:'basic'}); expect(purchasePrice(s.commerce.merchant.offers.find(o=>o.id==='basic')!)).toBe(String(BigInt(first)*3n));
    s=act(s,{type:'buy-merchant',id:'special'}); const p=s.players[s.players.length-1]; expect(p.level).toBe(2); expect(playerValue(s,p)).toBe('1440');
    expect(dispatch(s,s.revision,{type:'buy-merchant',id:'special'}).error).toBe('merchant-unavailable');
  });
  it('推荐函下月只生效一次，信用修复买即生效且全局限一次',()=>{
    let s=month(newContract(1),9); s.cash='1000000'; s.credit=2;
    s.commerce.merchant.offers=[{id:'item_007',basePrice:'11650',stock:3,purchased:0,level:0},{id:'item_006',basePrice:'27650',stock:1,purchased:0,level:0}];
    const n=s.players.length;
    s=act(s,{type:'buy-merchant',id:'item_007'}); expect(s.players).toHaveLength(n); expect(s.commerce.nextSupply).toBe(2);
    s=act(s,{type:'buy-merchant',id:'item_006'}); expect(s.credit).toBe(3); expect(s.commerce.incenseUsed).toBe(true);
    s=act(s,{type:'settle'}); expect(s.players).toHaveLength(n+5); expect(s.commerce.nextSupply).toBe(0);
    s=act(s,{type:'settle'}); expect(s.players).toHaveLength(n+8);
  });
  it('商人库存扩容只在下一次来访生效',()=>{
    let s=month(newContract(1),6); s.credits=10; s.commerce.shop.offers=['relic_074'];
    expect(s.commerce.merchant.offers[0].stock).toBe(3);
    s=act(s,{type:'buy-equipment',id:'relic_074'}); expect(s.commerce.merchant.offers[0].stock).toBe(3);
    expect(makeMerchant(9,s.equipment,3,false,stream(1,'merchant')).offers[0].stock).toBe(5);
  });
});

describe('消耗品与可撤销训练事务',()=>{
  it('粉笔真实改变预览与抽签；无效重复使用不扣库存',()=>{
    let s=newContract(1); s.commerce.inventory.item_003=2;
    const before=previewShot(s,s.players[0]).tickets.great;
    s=act(s,{type:'use-item',id:'item_003',playerId:'p1'}); expect(previewShot(s,s.players[0]).tickets.great).toBeGreaterThan(before);
    expect(dispatch(s,s.revision,{type:'use-item',id:'item_003',playerId:'p1'}).state).toBe(s);
    s=fire(s,'hold'); expect(s.players[0].armed).toEqual([]); expect(s.commerce.inventory.item_003).toBe(1);
  });
  it('饮料满手感和火热禁用；豪赌只剩重伤/大成功且不能引入火热',()=>{
    let s=newContract(1); s.commerce.inventory.item_005=2; s.commerce.inventory.item_004=1; s.players[0].heat=8;
    s=act(s,{type:'use-item',id:'item_005',playerId:'p1'}); expect(s.players[0].heat).toBe(10);
    expect(dispatch(s,s.revision,{type:'use-item',id:'item_005',playerId:'p1'}).error).toBe('item-blocked-during-frenzy');
    expect(dispatch(s,s.revision,{type:'use-item',id:'item_004',playerId:'p1'}).error).toBe('item-blocked-during-frenzy');
    s.players[0].heat=0; s=act(s,{type:'use-item',id:'item_004',playerId:'p1'});
    const t=previewShot(s,s.players[0]).tickets; expect(t.hold+t.minor+t.success).toBe(0);
    expect(dispatch(s,s.revision,{type:'use-item',id:'item_005',playerId:'p1'}).error).toBe('normal-shot-item-already-armed');
  });
  it('护盾阻止重伤但不触发维持奖励，命中后也消耗',()=>{
    let s=newContract(1,['relic_008','relic_001']); s.players[0].level=10; s.players[0].peakLevel=10; s.commerce.inventory.item_001=1;
    s=act(s,{type:'use-item',id:'item_001',playerId:'p1'}); const v=playerValue(s,s.players[0]);
    s=fire(s,'severe'); expect(s.players[0].id).toBe('p1'); expect(playerValue(s,s.players[0])).toBe(v); expect(s.cash).toBe('0'); expect(s.players[0].heat).toBe(1); expect(s.players[0].armed).toEqual([]);
  });
  it('重伤回溯撤销保险现金和残值，但不返还已耗物品、不重复回溯',()=>{
    let s=newContract(1,['relic_001','relic_020']); s.players[0].level=10; s.players[0].peakLevel=10;
    s.commerce.inventory.item_002=1; s.commerce.inventory.item_003=1;
    s=act(s,{type:'use-item',id:'item_003',playerId:'p1'}); s=fire(s,'severe');
    expect(s.cash).toBe('500'); expect(BigInt(s.scrap)).toBeGreaterThan(0n); expect(s.players.some(p=>p.id==='p1')).toBe(false);
    const rng=structuredClone(s.rng); s=decodeContract(encodeContract(s))!;
    s=act(s,{type:'rewind'}); expect(s.players[0].id).toBe('p1'); expect(s.cash).toBe('0'); expect(s.scrap).toBe('0'); expect(s.rng).toEqual(rng);
    expect(s.commerce.inventory.item_002).toBe(0); expect(s.commerce.inventory.item_003).toBe(0); expect(s.players[0].armed).toEqual([]);
    expect(dispatch(s,s.revision,{type:'rewind'}).error).toBe('no-rewind');
  });
  it('回溯不能撤销交付/兑换，事后购买不能补造快照',()=>{
    let s=newContract(1); s=fire(s,'hold'); s.commerce.inventory.item_002=1;
    expect(dispatch(s,s.revision,{type:'rewind'}).error).toBe('no-rewind');
    s=fire(s,'success'); expect(s.undo).not.toBeNull();
    s=act(s,{type:'queue',playerId:'p1',queued:true}); expect(s.undo).toBeNull();
    expect(dispatch(s,s.revision,{type:'rewind'}).error).toBe('no-rewind');
  });
  it('回溯只消费当前投篮的道具，保留另一名球员的预备道具',()=>{
    let s=newContract(4); s.commerce.inventory.item_002=1; s.commerce.inventory.item_003=2;
    s=act(s,{type:'use-item',id:'item_003',playerId:'p2'});
    s=act(s,{type:'use-item',id:'item_003',playerId:'p1'});
    s=fire(s,'success'); s=act(s,{type:'rewind'});
    expect(s.players.find(p=>p.id==='p1')!.armed).toEqual([]);
    expect(s.players.find(p=>p.id==='p2')!.armed).toEqual(['item_003']);
    expect(s.commerce.inventory.item_003).toBe(0);
    expect(validContract(s)).toBe(true);
  });
  it('复制球员使用新ID且回溯删除副本，首次图鉴保留',()=>{
    let s=newContract(1,['relic_093']); s.commerce.inventory.item_002=1;
    const count=s.players.length; s=fire(s,'hold',true);
    expect(s.players).toHaveLength(count+1); expect(new Set(s.players.map(p=>p.id)).size).toBe(count+1);
    const nextId=s.nextId; s=act(s,{type:'rewind'}); expect(s.players).toHaveLength(count); expect(s.nextId).toBe(nextId);
  });
});

describe('器材事件与跨月效果',()=>{
  it('首次普通出手奖励不被先进入火热消耗',()=>{
    let s=newContract(8,['relic_048']); s.commerce.inventory.item_005=4;
    for(let i=0;i<4;i++) s=act(s,{type:'use-item',id:'item_005',playerId:'p1'});
    s=fire(s,'success'); expect(s.players[0].traits.firstNormalUsed).toBe(false);
    for(let i=0;i<6;i++)s=fire(s,'success'); s=fire(s,'hold'); expect(s.players[0].heat).toBe(3);
    s=fire(s,'hold'); expect(s.players[0].heat).toBe(4);
  });
  it('月度基础增值即时记录报价，供给初始等级立即匹配模板',()=>{
    let s=newContract(1,['relic_083','relic_098']);
    expect(s.players.every(p=>p.level===7)).toBe(true);
    const p=s.players[1], old=playerValue(s,p);
    s=act(s,{type:'queue',playerId:'p1',queued:true}); s=act(s,{type:'settle'});
    const retained=s.players.find(a=>a.id===p.id)!;
    expect(BigInt(retained.peakValue)).toBeGreaterThan(BigInt(old));
    expect(retained.peakValue).toBe(playerValue(s,retained));
    expect(validContract(s)).toBe(true);
  });
  it('首月新支持器材有实际效果，轻伤风险降低有上限',()=>{
    let s=newContract(1,['relic_017','relic_036','relic_041']);
    s=fire(s,'hold'); s=fire(s,'hold'); expect(s.players[0].level).toBe(1); expect(s.players[0].traits.greatLevels).toBe(2);
    s=fire(s,'great'); expect(s.players[0].level).toBe(5); expect(s.players[0].traits.greatLevels).toBe(0);
    for(let i=0;i<5;i++) s=fire(s,'minor'); expect(s.players[0].traits.scars).toBe(4);
  });
  it('保命优先级不重复消耗，每月保护与球员首次保护分别记账',()=>{
    let s=newContract(1,['relic_056','relic_090','relic_079']); s.players[0].level=20; s.players[0].peakLevel=20;
    s=fire(s,'severe'); expect(s.players[0].level).toBe(19); expect(s.commerce.monthlyRescueUsed).toBe(true); expect(s.players[0].traits.cornerUsed).toBe(false);
    s=fire(s,'severe'); expect(s.players[0].level).toBe(18); expect(s.players[0].traits.cornerUsed).toBe(true); expect(s.players[0].traits.phoenixUsed).toBe(false);
    const before=BigInt(playerValue(s,s.players[0])); s=fire(s,'severe'); expect(s.players[0].traits.phoenixUsed).toBe(true); expect(BigInt(playerValue(s,s.players[0]))).toBeLessThan(before);
    s=fire(s,'severe'); expect(s.players.some(p=>p.id==='p1')).toBe(false);
  });
  it('指标折扣、达标积分、超额折抵、额外新人及信用救援',()=>{
    let s=newContract(1,['relic_066','relic_068','relic_089','relic_091','relic_077']);
    expect(previewSettlement(s).required).toBe('1620'); s.players[0].level=6;
    s=act(s,{type:'queue',playerId:'p1',queued:true}); s=act(s,{type:'settle'});
    expect(s.credits).toBe(1); expect(s.commerce.paidMonths).toBe(1); expect(s.commerce.carry).toBe('607'); expect(previewSettlement(s).required).toBe('1323');
    expect(s.players).toHaveLength(6); s.credit=1; s=act(s,{type:'settle'});
    expect(s.credit).toBe(1); expect(s.status).toBe('playing'); expect(s.equipment).not.toContain('relic_077');
    s=act(s,{type:'settle'}); expect(s.status).toBe('over');
  });
  it('基础加值和永久事件倍率叠加，卸下器材不清除已发生奖励',()=>{
    let s=newContract(1,['relic_006','relic_024','relic_064']); expect(playerValue(s,s.players[0])).toBe('400');
    s=fire(s,'hold'); expect(playerValue(s,s.players[0])).toBe('424');
    s=act(s,{type:'discard-equipment',id:'relic_024'}); expect(playerValue(s,s.players[0])).toBe('424');
    s=fire(s,'success'); expect(playerValue(s,s.players[0])).toBe('684');
  });
});

it('第一批实验档迁移保留经济和随机流，新增商店状态，损坏商店拒绝读取',()=>{
  const s=newContract(1), old=JSON.parse(JSON.stringify(s)); old.version='contract-v2.0-experimental'; delete old.commerce; delete old.undo; delete old.rng.market;
  for(const p of old.players) { delete p.armed; delete p.traits; }
  const payload=JSON.stringify(old); const restored=decodeContract(JSON.stringify({format:'contract-envelope-v1',checksum:hash(payload),payload}))!;
  expect(restored.version).toBe(rules.version); expect(restored.rng.economy).toEqual(s.rng.economy); expect(restored.cash).toBe(s.cash); expect(validContract(restored)).toBe(true);
  restored.commerce.inventory.item_001=-1; expect(validContract(restored)).toBe(false);
});
