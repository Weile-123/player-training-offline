import {describe,it,expect} from 'vitest';
import {newGame,select,selectedPlayer,players,rest,train,sell,nextMonth,monthPreview,gameSaleValue,seededRandom} from './engine';
import {decodeSave} from './save';
import {shotFeedback} from '../presentation/feedback';
import {observeCollection,updateCollection} from './collection';
import {loungeCapacity} from './assets';

const fresh=()=>newGame(seededRandom(5));
const active=()=>{const game=fresh();return select(game,game.selectedId!);};
describe('independent on-court player',()=>{
 it('moves the selected recruit on court and automatically rests the previous trainee without duplicating either',()=>{
  const game=active(),first=selectedPlayer(game)!;
  expect(game.recruits).toHaveLength(1);expect(game.recruits.some(p=>p.id===first.id)).toBe(false);
  const second=game.recruits[0],changed=select(game,second.id);
  expect(selectedPlayer(changed)).toEqual(second);expect(changed.recruits).toEqual([]);expect(changed.lounge).toEqual([first]);
  expect(new Set(players(changed).map(p=>p.id)).size).toBe(2);
  expect(game.activePlayer).toEqual(first);
 });
 it('withdraws a lounge player to train, freeing the slot, and rest places them back',()=>{
  let game=active();const id=game.selectedId!;
  game=rest(game,id);
  expect(selectedPlayer(game)).toBeUndefined();expect(game.activePlayer).toBeNull();expect(game.lounge).toHaveLength(1);
  const withdrawn=select(game,id);
  expect(withdrawn.lounge).toHaveLength(0);expect(withdrawn.activeSource).toBe('lounge');expect(selectedPlayer(withdrawn)?.id).toBe(id);
  const trained=train(withdrawn,()=>.99);
  expect(trained.activePlayer?.level).toBe(2);expect(trained.lounge).toHaveLength(0);
  const feedback=shotFeedback(withdrawn,trained);expect(feedback?.levelGain).toBe(2);
  expect(rest(trained,id).lounge[0]).toEqual(trained.activePlayer);
 });
 it('counts an on-court player in monthly sales exactly once, but preserves a rested player',()=>{
  const game=active(),p=selectedPlayer(game)!,report=monthPreview(game);
  expect(report.autoSales).toBe(2);
  expect(report.saleIncome).toBe(players(game).reduce((sum,p)=>sum+gameSaleValue(game,p),0));
  const rested=rest(game,p.id),restedReport=monthPreview(rested);
  expect(restedReport.autoSales).toBe(1);expect(restedReport.saleIncome+gameSaleValue(game,p)).toBe(report.saleIncome);
  const after=nextMonth({...game,cash:1000000},seededRandom(8));
  expect(after.activePlayer).toBeNull();expect(players(after).some(candidate=>candidate.id===p.id)).toBe(false);expect(after.totalSales).toBe(2);
 });
 it('removes a sold/injured trainee without silently selecting a waiting player or paying twice',()=>{
  const game=active(),id=game.selectedId!;
  const sold=sell(game,id);expect(selectedPlayer(sold)).toBeUndefined();expect(sold.recruits).toHaveLength(1);expect(sell(sold,id)).toBe(sold);
  const injured=train(game,()=>0);expect(selectedPlayer(injured)).toBeUndefined();expect(injured.lastOutcome).toBe('severe');expect(injured.totalSales).toBe(1);
 });
 it('persists the on-court player and source, accepts legacy saves, and rejects duplicate or mismatched identities',()=>{
  const game=active(),p=game.activePlayer!;
  expect(decodeSave(JSON.stringify(game))).toEqual(game);
  const legacy=decodeSave(JSON.stringify(fresh()))!;expect(legacy).not.toBeNull();expect(select(legacy,legacy.selectedId!).activePlayer?.id).toBe(legacy.selectedId);
  expect(decodeSave(JSON.stringify({...game,recruits:[p]}))).toBeNull();
  expect(decodeSave(JSON.stringify({...game,selectedId:game.recruits[0].id}))).toBeNull();
  expect(decodeSave(JSON.stringify({...game,activePlayer:{...p,heat:999}}))).toBeNull();
 });
 it.each(['recruits','lounge'] as const)('keeps the %s trainee on court when a recruit cannot replace them because the lounge is full',source=>{
  let game=active();const id=game.selectedId!;if(source==='lounge')game=select(rest(game,id),id);
  const capacity=loungeCapacity(game);
  game={...game,lounge:Array.from({length:capacity},(_,i)=>({...fresh().recruits[0],id:`reserve-${i}`}))};
  const changed=select(game,game.recruits[0].id);
  expect(changed.activePlayer).toEqual(game.activePlayer);expect(changed.recruits).toEqual(game.recruits);expect(changed.lounge).toEqual(game.lounge);
  expect(changed.logs[0]).toContain('休息室已满');
 });
 it('allows swapping with a player from a full lounge because that player frees a slot',()=>{
  const game=active(),first=game.activePlayer!,capacity=loungeCapacity(game);
  const full={...game,lounge:Array.from({length:capacity},(_,i)=>({...fresh().recruits[0],id:`reserve-${i}`}))};
  const next=full.lounge[0],swapped=select(full,next.id);
  expect(swapped.activePlayer).toEqual(next);expect(swapped.lounge).toHaveLength(capacity);
  expect(swapped.lounge).toContainEqual(first);expect(swapped.lounge.some(p=>p.id===next.id)).toBe(false);
  expect(new Set(players(swapped).map(p=>p.id)).size).toBe(players(full).length);
 });
 it('records the on-court template and real sale proceeds in the permanent collection',()=>{
  const game=active(),p={...game.activePlayer!,height:190,templateId:'curry',stats:{three:99,mid:99,drive:99,inside:99,handle:99,defense:99}};
  const known={...game,activePlayer:p};
  expect(observeCollection({},known).curry).toBeDefined();
  expect(updateCollection({},known,sell(known,p.id),'sell').curry.bestSale).toBe(gameSaleValue(known,p));
 });
});
