import {hotCounts} from './heat';
import { dispatch, newContract, playerValue, previewSettlement, type Action, type Contract } from './engine';
import { purchasePrice, rerollPrice, shopEntry } from './commerce';
import { integer } from './rules';

/** 可复现的交易策略；只通过公共动作消费资源，不注入装备/现金/球员。 */
export function simulateCommerce(seed: number, maxMonths = 40) {
  integer(maxMonths, 1, 120);
  let state = newContract(seed), operations = 0;
  const counters: Record<string, number> = {};
  function act(action: Action) {
    const r = dispatch(state, state.revision, action);
    if (r.error) throw new Error(`${action.type}:${r.error}`);
    state = r.state; operations++;
    for (const event of r.events) counters[event.type] = (counters[event.type] ?? 0) + 1;
    return r.events;
  }
  const preference = ['relic_003','relic_036','relic_060','relic_056','relic_048','relic_017','relic_041','relic_002','relic_020','relic_063','relic_057','relic_058','relic_066','relic_068','relic_006','relic_009','relic_043'];
  const rank = (id: string) => { const index=preference.indexOf(id); return index < 0 ? 100 : index; };
  let preparedMonth = 0, tradedMonth = 0;
  const months: { month: number; cash: string; delivered: string; credit: number }[] = [];
  while (state.status === 'playing' && state.month <= maxMonths && operations < 20000 && state.players.length < 1000) {
    if (state.month !== preparedMonth) {
      preparedMonth = state.month;
      let offers = [...state.commerce.shop.offers].sort((a,b)=>rank(a)-rank(b));
      if (state.month === 1 && offers.length) act({ type:'buy-equipment',id:offers[0] });
      else {
        if (offers.length) {
          const target = offers[0], cost = shopEntry(target)!.price;
          const worst=[...state.equipment].sort((a,b)=>rank(b)-rank(a))[0];
          const shouldBuy=state.equipment.length<8||rank(target)<rank(worst);
          if (shouldBuy && state.credits < cost && state.players.length >= 3 && tradedMonth !== state.month) {
            const rookie = state.players.find(p=>p.level===0 && p.shots===0 && !p.queued);
            if(rookie) { act({type:'exchange',playerId:rookie.id}); tradedMonth=state.month; }
          }
          if(shouldBuy&&state.credits>=cost) act({type:'buy-equipment',id:target,...(state.equipment.length>=8?{replaceId:worst}:{})});
        }
        const reroll = BigInt(rerollPrice(state.month,state.commerce.shop.paidRerolls));
        if (state.credits > 0 && state.equipment.length < 8 && (state.equipment.includes('relic_043') || BigInt(state.cash)>reroll*4n)) {
          act({type:'reroll'}); offers=[...state.commerce.shop.offers].sort((a,b)=>rank(a)-rank(b));
          const affordable=offers.find(id=>shopEntry(id)!.price<=state.credits);
          if(affordable) act({type:'buy-equipment',id:affordable});
        }
      }
      for(const id of ['item_006','basic','item_007','item_005','item_001','item_003','item_002']) {
        const offer=state.commerce.merchant.offers.find(o=>o.id===id);
        if(offer && offer.purchased<offer.stock && BigInt(state.cash)>=BigInt(purchasePrice(offer))*2n) act({type:'buy-merchant',id});
      }
    }
    const p=state.players.find(p=>!p.queued);
    if(!p) {
      const m=state.month; act({type:'settle'}); months.push({month:m,cash:state.cash,delivered:state.delivered,credit:state.credit}); continue;
    }
    const preview=previewSettlement(state), remaining=BigInt(preview.required)-BigInt(preview.value);
    const active=state.players.filter(p=>!p.queued).length;
    const target = remaining > 0n ? (remaining + BigInt(active)-1n)/BigInt(active) : 0n;
    if((p.level>=3 && BigInt(playerValue(state,p))>=target) || p.level>=18 || p.shots>=100) { act({type:'queue',playerId:p.id,queued:true}); continue; }
    if(state.clockMs<state.nextShotAt) act({type:'advance',milliseconds:state.nextShotAt-state.clockMs});
    const current=()=>state.players.find(a=>a.id===p.id)!;
    let hot=hotCounts(state,current()).remaining>0 || current().heat>=10;
    if(!hot && current().heat>=7 && state.commerce.inventory.item_005>0) { act({type:'use-item',id:'item_005',playerId:p.id}); hot=true; }
    if(hot && state.commerce.inventory.item_003>0) act({type:'use-item',id:'item_003',playerId:p.id});
    if(!hot && p.level>=6 && state.commerce.inventory.item_001>0) act({type:'use-item',id:'item_001',playerId:p.id});
    const events=act({type:'train',playerId:p.id});
    if(events.some(e=>e.type==='departed') && state.undo && state.commerce.inventory.item_002>0) {
      act({type:'rewind'}); act({type:'queue',playerId:p.id,queued:true});
    }
  }
  return { state, counters, operations, months, status: state.status==='over' ? 'over' : state.month>maxMonths ? 'month-limit' : 'technical-limit' };
}
