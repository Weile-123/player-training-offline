import {describe,it,expect} from 'vitest';
import {adRewardUnavailable,injuryRewindOffer,dispatch,newContract,previewShot,legendaryAdCooldown,equipmentOfferPrice,type Contract,type AdReward} from './engine';
import {newCommerce,shopEntry,legendaryCandidates,rollLegendaryShop,rarityWeights,purchasePrice} from './commerce';
import {decodeContract,encodeContract,validContract} from './save';
import {outcomeAt} from './probability';
import {random,stream} from './random';

const game=(month=2)=>{const s=newContract(23);s.careerId='ad-test';s.month=month;s.commerce=newCommerce(month,s.equipment,s.credit,s.rng.market);return s;};
const reward=(s:Contract,kind:AdReward,playerId='p1')=>dispatch(s,s.revision,{type:'ad-reward',reward:kind,careerId:s.careerId!,revision:s.revision,playerId});
function force(s:Contract,outcome:'severe'|'success'){
 const p=s.players[0];p.level=20;p.peakLevel=Math.max(p.peakLevel,20);p.heat=0;p.hotShotsRemaining=0;
 const odds=previewShot(s,p);
 for(let seed=1;seed<10000;seed++){
  const r=stream(seed,'economy');if(outcomeAt(odds.tickets,Math.floor(random({...r})*1000))===outcome){s.rng.economy=r;return;}
 }throw Error('Missing deterministic fixture');
}
const shoot=(s:Contract)=>dispatch(s,s.revision,{type:'train',playerId:'p1'});

describe('rewarded ad game contracts',()=>{
 it('adds three heat once per month, persists quota, leaves original untouched',()=>{
  const s=game(),r=reward(s,'heat');expect(r.error).toBeUndefined();
  expect(r.state.players[0].heat).toBe(3);expect(r.state.players[0].hotShotsRemaining??0).toBe(0);expect(r.state.totalShots).toBe(0);expect(r.state.progress.frenzies).toBe(0);
  expect(s.adRewards?.heatMonth).toBe(0);
  const loaded=decodeContract(encodeContract(r.state))!;expect(reward(loaded,'heat','p2').error).toBe('ad-already-used');
  const next=dispatch(loaded,loaded.revision,{type:'settle'}).state;expect(next.month).toBe(3);expect(reward(next,'heat','p2').error).toBeUndefined();
 });
 it.each([7,8,9])('starts frenzy at %i heat without carrying overflow',heat=>{
  const s=game();s.players[0].heat=heat;const r=reward(s,'heat');
  expect(r.error).toBeUndefined();expect(r.state.players[0].heat).toBe(0);
  expect(r.state.players[0].hotShotsRemaining).toBe(7);expect(r.state.progress.frenzies).toBe(1);
 });
 it.each([0,1,6])('adds exactly three at %i heat without starting frenzy',heat=>{
  const s=game();s.players[0].heat=heat;const r=reward(s,'heat');
  expect(r.state.players[0].heat).toBe(heat+3);expect(r.state.progress.frenzies).toBe(0);
 });
 it('uses equipped frenzy duration and protects ineligible contexts before ad opening',()=>{
  const equipped=game();equipped.players[0].heat=9;equipped.equipment=['relic_072','relic_095'];expect(reward(equipped,'heat').state.players[0].hotShotsRemaining).toBe(13);
  const s=game();s.players[0].queued=true;expect(adRewardUnavailable(s,'heat','p1')).toBe('missing-player');
  s.players[0].queued=false;s.players[0].level=99;expect(reward(s,'heat').error).toBe('level-cap');
  s.players[0].level=0;s.players[0].heat=10;expect(reward(s,'heat').error).toBe('already-hot');
  s.players[0].heat=0;s.players[0].hotShotsRemaining=2;s.players[0].hotShotsTotal=7;expect(reward(s,'heat').error).toBe('already-hot');
 });
 it('legendary refresh works from month 2, costs no money, does not consume paid/free refresh',()=>{
  const s=game();s.commerce.shop.paidRerolls=2;const r=reward(s,'legendary-shop');expect(r.error).toBeUndefined();
  const offers=r.state.commerce.shop.offers;expect(offers).toHaveLength(3);expect(new Set(offers).size).toBe(3);expect(shopEntry(offers[0])?.rarity).toBe('legendary');
  expect(r.state.cash).toBe(s.cash);expect(r.state.credits).toBe(s.credits);expect(r.state.commerce.shop.paidRerolls).toBe(2);expect(r.state.commerce.shop.freeUsed).toBe(false);
  expect(reward(decodeContract(encodeContract(r.state))!,'legendary-shop').error).toBe('ad-already-used');
  expect(equipmentOfferPrice(r.state,offers[0])).toBe(0);
  const bought=dispatch(r.state,r.state.revision,{type:'buy-equipment',id:offers[0]});expect(bought.error).toBeUndefined();expect(bought.state.credits).toBe(0);expect(bought.state.adRewards?.legendaryOffer).toBeUndefined();
  for(const [month,left] of [[2,3],[3,2],[4,1],[5,0]]){const next=structuredClone(r.state);next.month=month;next.commerce=newCommerce(month,[],3,next.rng.market);expect(legendaryAdCooldown(next)).toBe(left);expect(reward(next,'legendary-shop').error).toBe(left?'ad-already-used':undefined);}
 });
 it('preserves starter gifts and refuses an empty eligible legendary pool',()=>{
  const s=game(1);expect(reward(s,'legendary-shop').error).toBe('no-ad-legendary');expect(s.commerce.shop.giftAvailable).toBe(true);
  const owned=legendaryCandidates(2,[],[]).map(r=>r.id);expect(legendaryCandidates(2,owned,[])).toEqual([]);
  expect(rollLegendaryShop(2,owned,[],s.rng.market)).toEqual([]);
 });
 it('free legendary survives a failed full-bag purchase; only that slot is free, and paid refresh removes it',()=>{
  const s=game(8);s.equipment=['relic_001','relic_002','relic_003','relic_004','relic_006','relic_008','relic_009','relic_010'];
  const g=reward(s,'legendary-shop').state,id=g.adRewards!.legendaryOffer!;
  for(const other of g.commerce.shop.offers.filter(x=>x!==id))expect(equipmentOfferPrice(g,other)).toBe(shopEntry(other)!.price);
  const failed=dispatch(g,g.revision,{type:'buy-equipment',id});expect(failed.error).toBe('equipment-full');expect(failed.state).toBe(g);expect(equipmentOfferPrice(g,id)).toBe(0);
  const loaded=decodeContract(encodeContract(g))!;expect(equipmentOfferPrice(loaded,id)).toBe(0);expect(legendaryAdCooldown(loaded)).toBe(3);
  loaded.cash='999999999';const refreshed=dispatch(loaded,loaded.revision,{type:'reroll'});expect(refreshed.error).toBeUndefined();expect(refreshed.state.adRewards?.legendaryOffer).toBeUndefined();expect(legendaryAdCooldown(refreshed.state)).toBe(3);
 });
 it('guaranteed slot does not change normal rarity probabilities of the other two slots',()=>{
  const counts={common:0,rare:0,legendary:0};
  for(let seed=1;seed<=4000;seed++){
   const offers=rollLegendaryShop(8,[],[],stream(seed,'market'));
   expect(offers).toHaveLength(3);expect(new Set(offers).size).toBe(3);
   for(const id of offers){const e=shopEntry(id)!;expect(e.locked).toBe(false);}
   for(const id of offers.slice(1))counts[shopEntry(id)!.rarity]++;
  }
  const weights=rarityWeights(8),sum=weights.reduce((a,b)=>a+b,0);
  (['common','rare','legendary'] as const).forEach((key,i)=>expect(Math.abs(counts[key]/8000-weights[i]/sum)).toBeLessThan(.04));
 });
 it('scout refresh restocks all offers and resets price markup, once per visit',()=>{
  const s=game(3);for(const o of s.commerce.merchant.offers)o.purchased=o.stock;
  const r=reward(s,'merchant-refresh');expect(r.error).toBeUndefined();expect(r.state.cash).toBe(s.cash);
  for(const o of r.state.commerce.merchant.offers){expect(o.purchased).toBe(0);expect(o.stock).toBeGreaterThan(0);expect(purchasePrice(o)).toBe(o.basePrice);}
  const loaded=decodeContract(encodeContract(r.state))!;expect(reward(loaded,'merchant-refresh').error).toBe('ad-already-used');
  loaded.month=6;loaded.commerce=newCommerce(6,[],loaded.credit,loaded.rng.market);expect(reward(loaded,'merchant-refresh').error).toBeUndefined();
  expect(reward(game(4),'merchant-refresh').error).toBe('merchant-unavailable');
 });
 it('rewinds severe injury without a stopwatch, reverses compensation, preserves RNG and grants 1 shield',()=>{
  const s=game();s.equipment=['relic_001','relic_020'];force(s,'severe');const before=structuredClone(s);
  const injured=shoot(s);expect(injured.events.some(e=>e.type==='departed')).toBe(true);expect(injured.state.adInjury?.playerId).toBe('p1');
  expect(injured.state.undo).toBeNull();const loaded=decodeContract(encodeContract(injured.state))!;expect(loaded).not.toBeNull();
  const r=reward(loaded,'injury-rewind');expect(r.error).toBeUndefined();expect(r.state.players[0]).toEqual(before.players[0]);
  expect(r.state.cash).toBe(before.cash);expect(r.state.scrap).toBe(before.scrap);expect(r.state.totalShots).toBe(before.totalShots);expect(r.state.rng).toEqual(injured.state.rng);
  expect(r.state.adRewards?.injuryUsed).toEqual(['p1']);expect(r.state.adRewards?.shields.p1).toBe(1);expect(r.state.adInjury).toBeNull();expect(r.state.undo).toBeNull();
  expect(validContract(r.state)).toBe(true);expect(reward(r.state,'injury-rewind').error).toBe('no-ad-injury');expect(s).toEqual(before);
 });
 it('only severe results consume shields, then later injury never offers an ad for that player',()=>{
  const s=game();force(s,'severe');let g=reward(shoot(s).state,'injury-rewind').state;
  force(g,'success');g=shoot(g).state;expect(g.adRewards?.shields.p1).toBe(1);
  for(const left of [0]){force(g,'severe');const r=shoot(g);expect(r.events.some(e=>e.type==='shot-blocked')).toBe(true);g=r.state;expect(g.adRewards?.shields.p1).toBe(left);expect(g.adInjury).toBeNull();}
  force(g,'severe');const r=shoot(g);expect(r.events.some(e=>e.type==='departed')).toBe(true);expect(r.state.adInjury).toBeNull();
 });
 it('stopwatch cannot refund ad quotas or consumed shields',()=>{
  const s=game();force(s,'severe');let g=reward(shoot(s).state,'injury-rewind').state;g.commerce.inventory.item_002=1;force(g,'severe');g=shoot(g).state;
  const r=dispatch(g,g.revision,{type:'rewind'});expect(r.error).toBeUndefined();expect(r.state.adRewards?.shields.p1).toBe(0);expect(r.state.adRewards?.injuryUsed).toEqual(['p1']);
 });
 it.each([false,true])('offers a stopwatch before advertising, including after reload (ad used: %s)',used=>{
  const s=game();s.commerce.inventory.item_002=2;if(used)s.adRewards!.injuryUsed=['p1'];force(s,'severe');
  const injured=shoot(s).state,loaded=decodeContract(encodeContract(injured))!;
  expect(injuryRewindOffer(loaded)).toEqual({kind:'stopwatch',playerId:'p1'});
  if(!used)expect(reward(loaded,'injury-rewind').error).toBe('stopwatch-available');
  const r=dispatch(loaded,loaded.revision,{type:'rewind'});
  expect(r.error).toBeUndefined();expect(r.state.players[0]).toEqual(s.players[0]);expect(r.state.commerce.inventory.item_002).toBe(1);
  expect(r.state.adRewards?.injuryUsed).toEqual(used?['p1']:[]);expect(r.state.adRewards?.shields.p1??0).toBe(0);expect(injuryRewindOffer(r.state)).toBeNull();
  // Another injury can consume the remaining stopwatch; the ad quota is independent.
  force(r.state,'severe');expect(injuryRewindOffer(shoot(r.state).state)?.kind).toBe('stopwatch');
 });
 it('dismisses a stopwatch-only offer without spending the item or reopening after reload',()=>{
  const s=game();s.commerce.inventory.item_002=1;s.adRewards!.injuryUsed=['p1'];force(s,'severe');
  const injured=shoot(s).state;expect(injured.adInjury).toBeNull();
  const r=dispatch(injured,injured.revision,{type:'dismiss-ad-injury'});expect(r.error).toBeUndefined();
  expect(r.state.commerce.inventory.item_002).toBe(1);expect(r.state.players.some(p=>p.id==='p1')).toBe(false);
  expect(injuryRewindOffer(decodeContract(encodeContract(r.state))!)).toBeNull();
 });
 it('only offers ads without a stopwatch and an unused ad quota; surviving shots never open the dialog',()=>{
  const s=game();force(s,'severe');expect(injuryRewindOffer(shoot(s).state)).toEqual({kind:'ad',playerId:'p1'});
  s.adRewards!.injuryUsed=['p1'];expect(injuryRewindOffer(shoot(s).state)).toBeNull();
  s.commerce.inventory.item_002=1;force(s,'success');expect(injuryRewindOffer(shoot(s).state)).toBeNull();
 });
 it('an already armed emergency guard takes priority without also consuming an ad shield',()=>{
  const s=game();force(s,'severe');const g=reward(shoot(s).state,'injury-rewind').state;
  g.players[0].armed=['item_001'];force(g,'severe');const r=shoot(g);
  expect(r.events.some(e=>e.type==='shot-blocked')).toBe(true);expect(r.state.adRewards?.shields.p1).toBe(1);expect(r.state.players[0].armed).toEqual([]);
 });
 it('dismissal or later gameplay invalidates an injury snapshot without marking the player used',()=>{
  const s=game();force(s,'severe');const g=shoot(s).state;
  const dismissed=dispatch(g,g.revision,{type:'dismiss-ad-injury'}).state;expect(dismissed.adInjury).toBeNull();expect(dismissed.adRewards?.injuryUsed).toEqual([]);
  const changed=dispatch(g,g.revision,{type:'train',playerId:'p2'}).state;expect(reward(changed,'injury-rewind').error).toBe('no-ad-injury');
 });
 it('revives once per career in the same month, with full credit and exactly 3 new rookies',()=>{
  const s=game(9);s.status='over';s.credit=0;s.delivered='12345';s.cash='456';const ids=s.players.map(p=>p.id);
  const r=reward(s,'revive');expect(r.error).toBeUndefined();expect(r.state.status).toBe('playing');expect(r.state.month).toBe(9);expect(r.state.credit).toBe(3);
  expect(r.state.players).toHaveLength(s.players.length+3);expect(new Set(r.state.players.map(p=>p.id)).size).toBe(r.state.players.length);expect(r.state.players.slice(0,ids.length).map(p=>p.id)).toEqual(ids);
  expect(r.state.delivered).toBe(s.delivered);expect(r.state.cash).toBe(s.cash);expect(r.state.commerce).toEqual(s.commerce);
  const loaded=decodeContract(encodeContract(r.state))!;loaded.status='over';loaded.credit=0;expect(reward(loaded,'revive').error).toBe('ad-already-used');
 });
 it('rejects replayed or stale callbacks with no state or RNG change',()=>{
  const s=game(),action={type:'ad-reward' as const,reward:'heat' as const,careerId:s.careerId!,revision:s.revision,playerId:'p1'};
  const first=dispatch(s,s.revision,action);const again=dispatch(first.state,first.state.revision,action);expect(again.error).toBe('ad-context-changed');expect(again.state).toBe(first.state);
  expect(dispatch(s,s.revision,{...action,careerId:'other'}).error).toBe('ad-context-changed');
 });
 it('rejects corrupt ad state and nested snapshots, while accepting legacy saves',()=>{
  const s=game();delete s.adRewards;expect(validContract(s)).toBe(true);
  const fresh=game();expect(validContract({...fresh,adRewards:{...fresh.adRewards,shields:{p1:3}}})).toBe(false);
  expect(validContract({...fresh,adRewards:{...fresh.adRewards,heatMonth:99}})).toBe(false);
  force(fresh,'severe');const injured=shoot(fresh).state;expect(validContract(injured)).toBe(true);
  injured.adInjury!.before.adInjury=structuredClone(injured.adInjury);expect(validContract(injured)).toBe(false);
 });
 it('anonymous players cannot receive a growth share reward',()=>{
  const s=game(),r=dispatch(s,s.revision,{type:'share-reward',playerId:'p1',careerId:s.careerId!});expect(r.error).toBe('share-no-template');expect(r.state).toBe(s);
 });
});
