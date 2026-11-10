import {assetUrl} from '../presentation/assetUrls';
import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { getAnimationConfig, subscribeAnimationConfig, watchAnimationConfig } from '../presentation/animationConfig';
import { HeatMeter } from './HeatMeter';
import { useGame } from '../store';
import { config } from '../game/config';
import { loungeCapacity } from '../game/assets';
import { monthlyInterest } from '../game/economy';
import { trainingProbabilities, rating, requiredPayment, gameSaleValue, selectedPlayer } from '../game/engine';
import { type Player } from '../game/types';
import { templateById } from '../game/templates';
import { usePresentation } from '../presentation/usePresentation';
import { CollectionPanel } from './Collection';
import { CreditHearts } from './CreditHearts';
import { ShotScene, ShotResult } from './ShotScene';
import { ExistingCareerWarning, MonthSettlement, RepaymentForm, TemplateDossier } from './ComicDialogContent';
import { Workshop } from './Workshop';
import { ComicDialog as Sheet } from './ComicDialog';
import { GameIcon } from './GameIcon';
import { ProbabilityStrip } from './ProbabilityStrip';
import { PlayerTemplatePanel, StarPortrait } from './PlayerTemplatePanel';
import { usePlayerProfile } from '../platform/usePlayerProfile';
import { ShootButton } from './ShootButton';

const money = (value:number) => '$' + value.toLocaleString('en-US');
export const gameArt = (name:string) => assetUrl('art/game/' + name + '.png');
type Panel = 'recruits'|'lounge'|'logs'|'assets'|'shop'|'collection'|'settings'|'player'|'probability'|null;
type Confirmation = 'month'|'sell'|'repay'|'restart'|null;

function PlayerChip({player,onSelect}:{player:Player;onSelect:()=>void}) {
 const game=useGame(s=>s.game), template=templateById(player.templateId);
 const profile=usePlayerProfile(template?.id),selected=game.selectedId===player.id;
 return <button className={`player-chip ${game.selectedId===player.id?'selected':''}`} onClick={onSelect}>
  <span className="roster-portrait tier-portrait-frame" data-tier={template?.tier??'undiscovered'}><StarPortrait key={profile?.avatar??'unknown'} src={profile?.avatar??null} name={profile?.name??template?.name??'待发掘'}/></span>
  <span className="roster-identity"><strong>{player.name}</strong><small>{player.age} 岁 · {player.height} cm · Lv.{player.level}</small><span className="roster-template">{profile?.name??template?.name??'待发掘'}</span></span><span className="roster-rating"><b>{rating(player).toFixed(1)}</b><small>综合评分</small></span>
  <span className="roster-bottom"><span>球探报价 <b>{money(gameSaleValue(game,player))}</b></span><strong>{selected?'正在训练':'选为训练球员'} ›</strong></span>
 </button>;
}

export default function Gameplay({onHome}:{onHome?:()=>void}) {
 const visualConfig=useSyncExternalStore(subscribeAnimationConfig,getAnimationConfig,getAnimationConfig);
 useEffect(watchAnimationConfig,[]);
 const store=useGame(), g=store.game, presentation=usePresentation();
 const current=selectedPlayer(g), p=current;
 const [panel,setPanel]=useState<Panel>(null), [modal,setModal]=useState<Confirmation>(null);
 const [repayAmount,setRepayAmount]=useState('50000');
 const [selectionMessage,setSelectionMessage]=useState('');
 const closed=g.status==='over', busy=presentation.busy, locked=busy||closed;
 const noPlayers=!p&&g.recruits.length===0&&g.lounge.length===0;
 const [emptyNotice,setEmptyNotice]=useState(noPlayers&&!closed);
 useEffect(()=>{if(noPlayers&&!closed&&!busy)setEmptyNotice(true);else if(!noPlayers||closed)setEmptyNotice(false);},[noPlayers,closed,busy]);
 const needsMonthEnd=!closed&&noPlayers&&g.cash<requiredPayment(g);
 const chance=p?trainingProbabilities(g,p):null;
 const open=(next:Panel)=>{if(!busy){setSelectionMessage('');setPanel(next);}};
 const choose=(id:string)=>{store.select(id);const next=useGame.getState().game;if(next.activePlayer?.id!==id){setSelectionMessage(next.logs[0]);return;}presentation.clear();setSelectionMessage('');setPanel(null);};
 const clearAfter=(action:()=>void)=>{action();presentation.clear();setModal(null);};
 const resting=!!p&&g.lounge.some(x=>x.id===p.id);
 const title:Record<NonNullable<Panel>,string>={recruits:'本月新人',lounge:'休息室',logs:'训练日志',assets:'资产经营',shop:'经营商店',collection:'球星图鉴',settings:'设置与生涯',player:'球员档案',probability:'训练概率'};

 return <main className={`game-screen ${presentation.reduced?'reduce-motion':''}`} style={{'--game-max-width':`${visualConfig.gameMaxWidthPx}px`} as CSSProperties} aria-label="训练营主界面">
  <div className="game-viewport">
   <header className="game-topbar">
    <div className="cash-display"><GameIcon name="assets"/><span><small>余额</small><b style={{fontSize:`${Math.min(4.4,39.6/money(g.cash).length)}cqw`}} title={money(g.cash)}>{money(g.cash)}</b></span></div>
    <button className="month-stamp" aria-label={`第 ${g.month} 月`} title="打开生涯设置" onClick={()=>open('settings')}><span>第 <b>{g.month}</b> 月</span></button>
    <div className="credit-display"><small>信用</small><CreditHearts credit={g.credit} total={config.initialCredit}/></div>
   </header>

   <section className="game-finance" aria-label="债务与还款">
    <div className="finance-paper paper-panel">
     <GameIcon name="debt"/><div className="debt-amount"><small>{g.debt===0?'自由经营':'剩余债务'}</small><b style={{fontSize:`${Math.min(4.4,42/money(g.debt).length)}cqw`}} title={money(g.debt)}>{money(g.debt)}</b></div>
     <div className="minimum-payment"><small>本月最低还款</small><b>{money(requiredPayment(g))}</b></div>
     <button className="red-stamp repay-button" disabled={locked||g.cash===0||g.debt===0} onClick={()=>setModal('repay')}>上交欠款 <span>›</span></button>
    </div>
   </section>

   <section className="game-player" aria-label="当前球员">
    <PlayerTemplatePanel player={p} feedback={presentation.feedback} reduced={presentation.reduced} disabled={busy} onDetails={()=>open('player')}/>
    <div className="player-shortcuts"><button className="paper-panel" disabled={busy} onClick={()=>open('recruits')}><GameIcon name="people"/><span>新人</span><b>{g.recruits.length}</b></button><button className="paper-panel" disabled={busy} onClick={()=>open('lounge')}><GameIcon name="rest"/><span>休息室</span><b>{g.lounge.length}/{loungeCapacity(g)}</b></button>
     <button className="sell-shortcut red-stamp" disabled={!p||locked} onClick={()=>setModal('sell')}><span><GameIcon name="tag"/>出售</span><b>{p?money(gameSaleValue(g,p)):'—'}</b></button>
    </div>
   </section>

   <section className="game-stage" aria-label="训练球场">
    <ShotScene feedback={presentation.feedback} shots={presentation.shots} busy={busy} reduced={presentation.reduced} hot={!!p&&p.hotShots>0} onFinish={presentation.finish}/>
    <HeatMeter heat={p?.heat??0} maximum={config.feel.maximum} hotShots={p?.hotShots??0}/>
    {presentation.feedback&&!busy&&<div className="stage-result"><ShotResult feedback={presentation.feedback}/></div>}
    {p&&!busy&&p.iceShots>0&&<span className="ice-status">冰敷保护 · {p.iceShots} 次</span>}
    {(closed||(!p&&!noPlayers))&&!busy&&<div className="court-message" role="status"><strong>{closed?'信用归零，训练营关闭':'选择下一位球员'}</strong><p>{closed?`坚持 ${g.month} 个月 · 累计偿还 ${money(g.totalPaid)}`:'从新人或休息室选人，或结束本月迎接新人。'}</p><button className="primary" onClick={()=>closed?setModal('restart'):open(g.recruits.length?'recruits':'lounge')}>{closed?'开启新生涯':'查看球员'}</button></div>}
   </section>

   <ProbabilityStrip chances={chance} onDetails={()=>open('probability')}/>

   <footer className="game-dock">
    <div className="dock-canvas">
     <img className="dock-art" src={gameArt('dock-controls')} alt=""/>
     <button className="dock-control dock-drink" disabled={!p||locked||g.consumables.drink<=0||p.heat>=config.feel.maximum||p.hotShots>0} onClick={()=>store.useConsumable('drink')} aria-label={`使用饮料，库存 ${g.consumables.drink}`}><b className="dock-quantity">×{g.consumables.drink}</b></button>
     <button className="dock-control dock-ice" disabled={!p||locked||g.consumables.ice<=0||p.iceShots>0} onClick={()=>store.useConsumable('ice')} aria-label={`使用冰敷，库存 ${g.consumables.ice}`}><b className="dock-quantity">×{g.consumables.ice}</b></button>
     <button className="dock-control dock-assets" aria-label="资产" disabled={busy} onClick={()=>open('assets')}/>
     <button className="dock-control dock-shop" aria-label="商店" disabled={busy} onClick={()=>open('shop')}/>
     <button className={`dock-control dock-month${needsMonthEnd?' needs-attention':''}`} aria-label={needsMonthEnd?'结束本月：余额不足且无可用球员，点击结算迎接新人':'结束本月'} disabled={locked} onClick={()=>setModal('month')}><span className="month-callout"><GameIcon name="calendar"/><strong>结束本月</strong></span></button>
     <ShootButton disabled={!current||closed} reduced={presentation.reduced} onShoot={presentation.train}/>
     <button className="dock-control dock-rest" aria-label={resting?'已在休息室':g.lounge.length>=loungeCapacity(g)?'休息室已满':'休息'} disabled={!p||locked||resting||g.lounge.length>=loungeCapacity(g)} onClick={()=>p&&clearAfter(()=>store.rest(p.id))}/>
    </div>
    {/失败|受限|损坏/.test(store.saveMessage)&&<p className="save-warning" role="status">{store.saveMessage}</p>}
   </footer>
  </div>

  {panel&&<Sheet title={panel==='player'?'模板档案':title[panel]} variant={panel==='player'?'template':panel==='assets'||panel==='shop'?'workshop':panel==='recruits'||panel==='lounge'?'roster':'standard'} onClose={()=>setPanel(null)}>
   {(panel==='recruits'||panel==='lounge')&&selectionMessage&&<p className="text-red-400" role="status">{selectionMessage}</p>}
   {(panel==='recruits'||panel==='lounge')&&<><p className="shop-help">{panel==='recruits'?'每月 2 名新人。上场后从列表移出；切换时原球员自动进入休息室（需空位）。月底自动出售未休息球员。':`已使用 ${g.lounge.length}/${loungeCapacity(g)} 个位置。属性、等级、模板与手感跨月保留。`}</p><div className="roster-list">{(panel==='recruits'?g.recruits:g.lounge).map(player=><PlayerChip key={player.id} player={player} onSelect={()=>choose(player.id)}/>)}</div>{!(panel==='recruits'?g.recruits:g.lounge).length&&<p className="empty">{panel==='recruits'?'本月新人已全部安置，可查看休息室或结算本月。':'休息室为空。在训练场点击「休息」可将球员留到下月。'}</p>}</>}
   {panel==='player'&&p&&<TemplateDossier player={p} game={g}/>}
   {panel==='collection'&&<CollectionPanel/>}
   {(panel==='assets'||panel==='shop')&&<Workshop key={panel} initialSection={panel==='assets'?'assets':'equipment'}/>}
   {panel==='logs'&&<div className="logs"><div className="metrics"><span>{g.totalShots}<small>总投篮</small></span><span>{g.totalSales}<small>已出售</small></span><span>{money(g.totalPaid)}<small>累计还款</small></span></div>{g.logs.map((line,i)=><p key={`${g.revision}-${i}`}><i/>{line}</p>)}</div>}
   {panel==='settings'&&<><div className="settings-buttons"><button className="secondary" onClick={()=>open('logs')}>训练日志</button><button className="secondary" onClick={()=>open('collection')}>模板图鉴</button></div><div className="settings-buttons"><button className="secondary" aria-pressed={presentation.preferences.sound} onClick={()=>presentation.toggle('sound')}>{presentation.preferences.sound?'音效：开启':'音效：关闭'}</button><button className="secondary" aria-pressed={presentation.reduced} onClick={()=>presentation.toggle('reducedMotion')}>{presentation.reduced?'动画：简化':'动画：完整'}</button></div><p role="status">{presentation.audioMessage||presentation.preferenceMessage||store.saveMessage}</p><p>本机自动存档；图鉴永久保留于当前浏览器。</p><p>本月新增利息 {money(monthlyInterest(g))} · 月息 {(config.economy.monthlyInterestRate*100).toFixed(1)}%</p><button className="secondary" onClick={()=>{setPanel(null);setModal('restart');}}>重新开局</button><button className="secondary mt-3" onClick={onHome}>返回首页</button></>}
   {panel==='probability'&&<><ProbabilityStrip chances={chance} onDetails={()=>{}}/><p>五项固定等宽，数字为实际概率。已计入装备、资产、训练等级和当前保护。</p><p>重伤立即以 {money(config.economy.minimumSale)} 出售。轻伤降低属性；维持不变；成功提升属性及 1 级；大成功大幅提升属性及 2 级。</p><p>手感满 {config.feel.activationCost} 点自动进入火热，接下来 {config.feel.hotShots} 次免疫重伤。火热期间暂停积累，结束后恢复手感条。火热与冰敷将对应伤病概率转为维持。</p></>}
  </Sheet>}

  {modal&&<Sheet title={modal==='month'?'月末结算':modal==='sell'?'交给球探':modal==='repay'?'上交欠款':'重新开局'} variant={modal==='month'?'month':modal==='repay'?'repay':'standard'} onClose={()=>setModal(null)}>
   {modal==='month'?<MonthSettlement game={g}/>:modal==='sell'?<p>{p?.name}将永久离营，获得 {money(p?gameSaleValue(g,p):0)}。</p>:modal==='repay'?<RepaymentForm amount={repayAmount} maximum={Math.min(g.cash,g.debt)} onChange={setRepayAmount}/>:<ExistingCareerWarning game={g}/>}
   <div className="dialog-actions grid grid-cols-2 gap-3 mt-5"><button className="secondary" onClick={()=>setModal(null)}>取消</button><button className="primary" disabled={modal==='repay'&&(!Number.isFinite(Number(repayAmount))||!Number.isSafeInteger(Number(repayAmount))||Number(repayAmount)<=0||Number(repayAmount)>Math.min(g.cash,g.debt))} onClick={()=>clearAfter(()=>{if(modal==='month')store.nextMonth();if(modal==='sell'&&p)store.sell(p.id);if(modal==='repay')store.repay(Number(repayAmount));if(modal==='restart')store.restart();})}>{modal==='month'?'确认结算':modal==='repay'?'确认上交':'确认'}</button></div>
  </Sheet>}
  {emptyNotice&&!panel&&!modal&&!closed&&!busy&&<Sheet title="暂无球员" variant="empty" onClose={()=>setEmptyNotice(false)}><div className="no-players-notice"><GameIcon name="people"/><h3>当前你没有球员了</h3><p>新人和休息室都已空，结束本月后将迎来新人。</p><button className="primary" onClick={()=>{setEmptyNotice(false);setModal('month');}}>前往月末结算</button></div></Sheet>}
 </main>;
}
