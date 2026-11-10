import {soundEnabled} from '../presentation/sampleAudio';
import {templateById} from '../game/templates';
import {valueTone} from '../presentation/valueTone';
import {FittedAmount} from './FittedAmount';
import './TrainingLayout.css';
import {ProbabilityDetails} from './ProbabilityDetails';
import {cloneData} from '../utils/cloneData';
import {HeatBoostDialog} from './HeatBoostDialog';
import {InjuryRewindDialog} from './InjuryRewindDialog';
import {MonthTransitionDialog} from './MonthTransitionDialog';
import {monthChange,type MonthChange} from '../presentation/monthTransition';
import {trainingNotice} from '../presentation/trainingNotice';
import {PlayerShareDialog} from './PosterShareDialog';
import {assetUrl} from '../presentation/assetUrls';
import {ContractHeatMeter} from './ContractHeatMeter';
import {EquipmentTriggerDialog} from './EquipmentTriggerDialog';
import {TrainingCapDialog} from './TrainingCapDialog';
import {ContractCompletion} from './ContractCompletion';
import {rules} from '../game/contract/rules';
import {EquipmentStatus} from './EquipmentStatus';
import {isHighPotential} from '../game/contract/recruits';
import {lazy,Suspense,useEffect,useLayoutEffect,useRef,useState,useMemo,useSyncExternalStore,type CSSProperties} from 'react';
import {useContract} from '../contractStore';
import {adRewardUnavailable,injuryRewindOffer,playerValue,previewSettlement,previewShot,type Athlete,type Contract} from '../game/contract/engine';
import {statKeys,type Player} from '../game/types';
import {getAnimationConfig,subscribeAnimationConfig,watchAnimationConfig} from '../presentation/animationConfig';
import {decodePreferences,presentationConfig,type ShotFeedback} from '../presentation/feedback';
import {gameAudio} from '../presentation/audio';
import {useModalAccessibility} from '../presentation/useModalAccessibility';
import {PlayerTemplatePanel} from './PlayerTemplatePanel';
import {ShotScene} from './ShotScene';
import {ShotStatusPop} from './ShotStatusPop';
import {ShootButton} from './ShootButton';
import {DockIcon} from './DockIcon';
import {DockButtonFrame} from './DockButtonFrame';
import {courtNextAction} from '../presentation/courtState';
import {GameIcon} from './GameIcon';
import {rosterPlayers} from '../presentation/roster';
import {CreditHearts} from './CreditHearts';
import {ProbabilityStrip} from './ProbabilityStrip';
import {ComicDialog} from './ComicDialog';
import {FirstMonthGift} from './FirstMonthGift';
import {TutorialSpotlight} from './TutorialSpotlight';
import type {TutorialState,TutorialStep} from '../presentation/tutorial';
import {CareerEndDialog} from './CareerEndDialog';
import {ContractRoster,ContractCollection,money,playerName} from './ContractPanels';
import {ContractShop,ContractMerchant,ContractInventory} from './CommercePanels';
import {DeliveryScoreboard} from './DeliveryScoreboard';
import {ContractSettlement} from './ContractSettlement';
import {ConsumableBar,ItemDetail} from './ContractConsumables';
import type {ItemId} from '../game/contract/commerce';
import {heatMeter} from '../presentation/heatMeter';
import {canBuyMerchantOffer} from '../presentation/merchant';
const DevConsole=import.meta.env.DEV?lazy(()=>import('./DevConsole')):null;
type Panel='加速火热'|'测试控制台'|'球探到访'|'球员名单'|'休息室'|'交付确认'|'器材商店'|'外部球探'|'器材与背包'|'球星图鉴'|'概率说明'|null;
export const displayPlayer=(p:Athlete):Player=>({id:p.id,highPotential:isHighPotential(p),name:playerName(p),age:18,height:p.height,stats:p.stats,level:p.level,shots:p.shots,templateId:p.templateId,heat:p.heat,hotShots:0,iceShots:0});
const labels={severe:'重伤 · 球员离营',minor:'轻伤 · 状态受损',hold:'维持 · 保持节奏',success:'成功 · 训练成长',great:'大成功 · 潜力爆发'};
export type GameTutorial={lesson:TutorialState;advance:(step:TutorialStep)=>TutorialState;skip:()=>void};
export default function ContractGame({onHome,tutorial}:{onHome:()=>void;tutorial?:GameTutorial}){
 const store=useContract(),g=tutorial?.lesson.game??store.state,p=g.players.find(p=>p.id===(tutorial?'p1':store.selectedId)&&!p.queued),visual=useSyncExternalStore(subscribeAnimationConfig,getAnimationConfig,getAnimationConfig);
 const [savedPanel,setPanelState]=useState<Panel>(null),[feedback,setFeedback]=useState<ShotFeedback|null>(null),[shots,setShots]=useState<ShotFeedback[]>([]);
 const severeShotId=useRef<number|null>(null),severeAnimating=shots.some(shot=>shot.outcome==='severe');
 useLayoutEffect(()=>{
  // Capture events at document level, including portals and WebViews without inert.
  // Set the ref in train() synchronously so rapid second clicks cannot slip through.
  const block=(event:Event)=>{if(severeShotId.current!==null){event.preventDefault();event.stopImmediatePropagation();}};
  const events=['click','dblclick','contextmenu','pointerdown','pointerup','mousedown','mouseup','touchstart','touchend','keydown','keyup'];
  for(const name of events)document.addEventListener(name,block,{capture:true,passive:false});
  return()=>{severeShotId.current=null;for(const name of events)document.removeEventListener(name,block,true);};
 },[]);
 const panel=tutorial?(tutorial.lesson.step==='confirm'?'交付确认':null):savedPanel;
 const [activeItem,setActiveItem]=useState<ItemId|null>(null);
 const [sharingPlayer,setSharingPlayer]=useState<{game:Contract;player:Athlete}|null>(null);
 const [monthTransition,setMonthTransition]=useState<MonthChange|null>(null);
 const [capDismissed,setCapDismissed]=useState<string|null>(null);
 useEffect(()=>setCapDismissed(null),[p?.id]);
 const injuryOffer=tutorial?null:injuryRewindOffer(g),injuryPending=!!injuryOffer;
 const completionPending=!tutorial&&g.status==='playing'&&!!g.completion&&!g.completion.acknowledged;
 const monthTransitionVisible=!!monthTransition&&!completionPending&&g.status==='playing';
 const giftPending=!tutorial&&g.status==='playing'&&g.month===1&&g.commerce.shop.giftAvailable;
 useEffect(()=>{if(store.lastEvents.some(e=>e.type==='rewound')){severeShotId.current=null;setFeedback(null);setShots([]);gameAudio.mute();}},[store.lastEvents]);
 const setPanel=(next:Panel)=>{if(tutorial){if(next==='交付确认')tutorial.advance('month');return;}store.clearNotice();setPanelState(next);};
 const openItem=(id:ItemId)=>{if(tutorial)return;store.clearNotice();setActiveItem(id);};
 useEffect(()=>{if(!monthTransitionVisible&&!tutorial&&g.month===3&&g.status==='playing'&&!store.scoutNoticeSeen&&!panel&&!activeItem&&!sharingPlayer&&!store.equipmentNotices.length){store.markScoutNoticeSeen();setPanelState('球探到访');}},[g.month,g.status,store.scoutNoticeSeen,panel,activeItem,sharingPlayer,store.equipmentNotices.length,monthTransitionVisible]);
 const [preferences]=useState(()=>{try{return decodePreferences(localStorage.getItem(presentationConfig.preferenceKey));}catch{return decodePreferences(null);}});
 const [systemReduced]=useState(()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches);
 const reduced=preferences.reducedMotion||systemReduced;
 useModalAccessibility();useEffect(watchAnimationConfig,[]);
 useEffect(()=>{
  if(tutorial)return;
  const visibility=()=>{if(document.hidden)store.flush();};
  document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',store.flush);
  return()=>{document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',store.flush);store.flush();};
 },[]);
 useEffect(()=>()=>{gameAudio.mute();},[]);
 useEffect(()=>{if(tutorial?.lesson.step==='flight'&&reduced)tutorial.advance('flight');},[tutorial?.lesson.step,reduced]);
 const train=()=>{
  if(severeShotId.current!==null)return;
  if(tutorial){
   if(tutorial.lesson.step!=='train')return;
   const before=g.players[0],next=tutorial.advance('train'),after=next.game.players[0];
   const f:ShotFeedback={id:1,player:displayPlayer(after),outcome:'success',changes:Object.fromEntries(statKeys.map(k=>[k,after.stats[k]-before.stats[k]])),levelGain:after.level-before.level,heatGain:after.heat-before.heat,saleIncome:0,message:'成功 · 训练成长',evolution:null};
   setFeedback(f);if(!reduced)setShots([f]);void gameAudio.play('success',soundEnabled());return;
  }
  if(giftPending)return;if(p&&p.level>=rules.trainingLevelCap){setCapDismissed(null);return;}const before=useContract.getState(),player=before.state.players.find(p=>p.id===before.selectedId);if(!player)return;
  const r=before.act({type:'train',playerId:player.id}),shot=r.events.find(e=>e.type==='shot'||e.type==='shot-blocked');if(r.error)return;
  const after=r.state.players.find(p=>p.id===player.id);
  // Inheritance can reach the cap without producing a shot event.
  if(after&&after.level>=rules.trainingLevelCap)setShots([]);
  if(!shot?.outcome)return;
  const outcome=shot.type==='shot-blocked'?'hold':shot.outcome;
  const f:ShotFeedback={id:r.state.revision,player:displayPlayer(after??player),outcome,changes:after?Object.fromEntries(statKeys.map(k=>[k,after.stats[k]-player.stats[k]])):{},levelGain:after?after.level-player.level:0,heatGain:after?after.heat-player.heat:0,saleIncome:0,message:shot.type==='shot-blocked'?'重伤被保护阻止，球员留营':labels[outcome],evolution:null};
  setFeedback(f);if(!reduced&&(!after||after.level<rules.trainingLevelCap)){
   if(outcome==='severe')severeShotId.current=f.id;
   setShots(old=>[...old,f]);
  }void gameAudio.play(outcome,soundEnabled());
 };
 const meter=heatMeter(g,p),{hot}=meter,summary=useMemo(()=>previewSettlement(g),[g]),closed=g.status==='over';
 const nextAction=courtNextAction(g.players,tutorial?[]:store.restingIds,summary.met),scoutOpen=g.month>=3&&g.month%3===0&&!closed;
 const scoutReminder=scoutOpen&&g.commerce.merchant.offers.some(o=>canBuyMerchantOffer(g,o));
 const chance=useMemo(()=>p?Object.fromEntries(Object.entries(previewShot(g,p,!tutorial&&import.meta.env.DEV?{noSevere:store.debug.noSevere}:{}).tickets).map(([k,v])=>[k,v/1000])) as Record<keyof typeof labels,number>:null,[g,p,!!tutorial,store.debug.noSevere]);
 const notice=trainingNotice({player:p,dismissedId:capDismissed,blocked:!!(injuryPending||monthTransitionVisible||sharingPlayer||tutorial||closed||giftPending||panel||activeItem),equipmentCount:store.equipmentNotices.length,animationsPending:shots.length>0});
 const capPending=!completionPending&&notice==='cap';
 const equipmentNotice=notice==='equipment'?store.equipmentNotices[0]:undefined;
 const viewportRef=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{if(viewportRef.current)viewportRef.current.inert=severeAnimating||injuryPending||monthTransitionVisible||closed||giftPending||completionPending||capPending||!!equipmentNotice||!!sharingPlayer;},[severeAnimating,injuryPending,closed,giftPending,completionPending,capPending,equipmentNotice,sharingPlayer,monthTransitionVisible]);
 return <main className={`game-screen contract-game training-layout ${reduced?'reduce-motion':''}`} style={{'--game-max-width':`${visual.gameMaxWidthPx}px`,'--shoot-button-scale':visual.shootButtonScale} as CSSProperties} aria-label="球员交付制训练营" data-tutorial-step={tutorial?.lesson.step}>
 <div className="game-viewport" ref={viewportRef}><header className="game-topbar"><div className="cash-display"><GameIcon name="assets"/><span><small>经营经费</small><b title={money(g.cash)}>{money(g.cash)}</b></span></div><div className="month-stamp"><span>第 <b>{g.month}</b> 月</span></div><div className="credit-display"><small>信用</small><CreditHearts credit={g.credit} total={3}/></div></header>
 <DeliveryScoreboard value={summary.value} required={summary.required} credits={g.credits} rosterControls={<div className="player-shortcuts"><button className="paper-panel" onClick={()=>setPanel('球员名单')}><GameIcon name="people"/><span>球员</span><b>{rosterPlayers(g.players,tutorial?[]:store.restingIds).filter(p=>!p.queued).length}</b></button><button className="paper-panel" aria-label="休息室" onClick={()=>setPanel('休息室')}><GameIcon name="rest"/><span>休息室</span><b>{tutorial?0:store.restingIds.length}</b></button></div>}/>
 <section className="game-player"><div className="player-value-card" data-tier={templateById(p?.templateId)?.tier??'undiscovered'}><PlayerTemplatePanel player={p?displayPlayer(p):undefined} feedback={feedback} reduced={reduced} disabled={!!tutorial||closed} onShare={!tutorial?()=>{if(p){setFeedback(null);setShots([]);setSharingPlayer({game:cloneData(g),player:cloneData(p)});}}:undefined}/><div className="player-value-footer"><div className={`player-value-amount value-tone-${valueTone(templateById(p?.templateId)?.tier)}`}><small>价值</small><FittedAmount fitHeight text={p?money(playerValue(g,p)):'—'}/></div><button className="sell-shortcut red-stamp" aria-label="加入交付" disabled={!p||closed} onClick={()=>tutorial?tutorial.advance('deliver'):p&&store.act({type:'queue',playerId:p.id,queued:true})}><span>加入交付</span><i aria-hidden="true">›</i></button></div></div></section>
 <ProbabilityStrip chances={chance} supplement={p?.armed.includes('item_004')} onDetails={()=>setPanel('概率说明')}/>
 <section className="game-stage"><ShotScene feedback={feedback} shots={shots} hot={hot} busy={shots.length>0} reduced={reduced} hideOutcomeLabel onFinish={id=>{if(id===undefined||id===severeShotId.current)severeShotId.current=null;setShots(old=>id===undefined?[]:old.filter(s=>s.id!==id));if(tutorial?.lesson.step==='flight')tutorial.advance('flight');}}/>
 <EquipmentStatus game={g} player={p} onInventory={()=>setPanel('器材与背包')}/>
 <ShotStatusPop active={!injuryPending&&!monthTransitionVisible&&!!p&&!panel&&!activeItem&&!closed&&!giftPending&&!completionPending&&!capPending&&!equipmentNotice} feedback={feedback} hoopScale={visual.hoopScale} reduced={reduced}/>
 {p&&(g.adRewards?.shields[p.id]??0)>0&&<div className="ad-shield-status" role="status">免重伤保护 · 剩余 {g.adRewards!.shields[p.id]} 次</div>}
 <ContractHeatMeter meter={meter} heat={p?.heat??0} action={!tutorial&&p&&!closed&&g.adRewards?.heatMonth!==g.month?<span className="reward-ad-control is-gold"><button type="button" className="reward-ad-button" disabled={!!adRewardUnavailable(g,'heat',p.id)} onClick={()=>setPanel('加速火热')}>加速</button></span>:undefined}/>
 <div className="stage-navigation"><div className="contract-stage-tools"><button className="stage-collection-button" onClick={()=>setPanel('球星图鉴')} aria-label="打开图鉴"><span>图鉴</span></button></div><div className="scout-entry"><button className={scoutReminder?'scout-shop is-open':'scout-shop'} disabled={!scoutOpen} aria-label="球探商店" onClick={()=>setPanel('外部球探')}><img src={assetUrl('art/scout/'+(scoutOpen?'shop-color.png':'shop-gray.png'))} alt="球探商店"/>{scoutReminder&&<i className="scout-dot"/>}</button>{!scoutOpen&&<small>{closed?'生涯已结束':'第'+Math.max(3,Math.ceil((g.month+1)/3)*3)+'月开启'}</small>}</div></div>
 {!p&&!closed&&shots.length===0&&<><div className="court-state-shade" aria-hidden="true"/><div className="court-state-overlay"><div className="court-message"><strong>{nextAction.title}</strong><p>{nextAction.description}</p><div className="court-message-actions"><button className="primary" onClick={()=>setPanel(nextAction.panel)}>{nextAction.label}</button>{nextAction.canSettle&&<button className="secondary" onClick={()=>setPanel('交付确认')}>结束本月</button>}</div></div></div></>}
 </section>
 <footer className="game-dock contract-clean-dock"><div className="dock-canvas">
 <ConsumableBar onItem={openItem} practiceInventory={tutorial?g.commerce.inventory:undefined}/>
 <div className="dock-side dock-side-left">
 <button className="dock-control dock-bag css-dock-button" aria-label="打开背包" onClick={()=>setPanel('器材与背包')}><DockButtonFrame/><DockIcon name="bag"/><strong>背包</strong></button>
 <button className="dock-control dock-month css-dock-button" aria-label="结束本月" disabled={closed} onClick={()=>setPanel('交付确认')}><DockButtonFrame/><DockIcon name="month"/><strong>结束本月</strong></button>
 </div><ShootButton disabled={!p||closed||(tutorial?tutorial.lesson.step!=='train':false)} reduced={reduced} onShoot={train}/><div className="dock-side dock-side-right">
 <button className="dock-control dock-shop css-dock-button" aria-label="器材商店" onClick={()=>setPanel('器材商店')}><DockButtonFrame/><DockIcon name="shop"/><strong>商店</strong></button>
 <button className="dock-control dock-rest css-dock-button" aria-label="保留球员并休息" disabled={!p||closed} onClick={()=>{if(tutorial)return;store.select(null);setFeedback(null);setShots([]);}}><DockButtonFrame/><DockIcon name="rest"/><strong>球员休息</strong></button></div>
 </div></footer></div>
 {import.meta.env.DEV&&!monthTransitionVisible&&!tutorial&&!closed&&!giftPending&&!completionPending&&!capPending&&<button className="dev-console-trigger" style={{position:'fixed',right:`max(10px, calc((100vw - ${visual.gameMaxWidthPx}px)/2 + 10px))`,bottom:1,zIndex:40,padding:'3px 8px',border:'1px solid #eacb86',background:'#102a38',color:'#f7e6be',fontSize:10,lineHeight:1,borderRadius:4}} onClick={()=>setPanel('测试控制台')}>测试</button>}
 {monthTransitionVisible&&monthTransition&&<MonthTransitionDialog key={`${monthTransition.from}-${monthTransition.to}`} change={monthTransition} reduced={reduced} onComplete={()=>setMonthTransition(null)}/>}
 {giftPending&&<FirstMonthGift/>}
 {!monthTransitionVisible&&tutorial&&tutorial.lesson.step!=='intro'&&tutorial.lesson.step!=='complete'&&<TutorialSpotlight lesson={tutorial.lesson} advance={tutorial.advance} onSkip={tutorial.skip}/>}
 {completionPending&&!equipmentNotice&&<ContractCompletion record={g.completion!} onHome={onHome} onContinue={()=>{const from=g.completion!.month;const r=store.act({type:'continue-endless'});if(!r.error){setMonthTransition(monthChange(from,r.state.month,r.state.status));setPanelState(null);setFeedback(null);setShots([]);}}}/>}
 {capPending&&p&&<TrainingCapDialog game={g} player={p} onClose={()=>setCapDismissed(p.id)} onQueue={()=>{const r=store.act({type:'queue',playerId:p.id,queued:true});if(!r.error){setFeedback(null);setShots([]);}}} onRest={()=>{store.select(null);setFeedback(null);setShots([]);setPanel('休息室');}}/>}
 {sharingPlayer&&<PlayerShareDialog game={sharingPlayer.game} player={sharingPlayer.player} onClose={()=>setSharingPlayer(null)}/>}
 {closed&&<CareerEndDialog career={g} onHome={onHome} reduced={reduced}/>}
 {!monthTransitionVisible&&!closed&&!giftPending&&!completionPending&&activeItem&&<ItemDetail id={activeItem} onClose={()=>{store.clearNotice();setActiveItem(null);}}/>}
 {!monthTransitionVisible&&!closed&&!giftPending&&!completionPending&&panel&&panel!=='加速火热'&&<ComicDialog title={panel==='概率说明'?'训练概率':panel==='球星图鉴'?'收藏图鉴':panel==='外部球探'?'球探商店':panel==='球探到访'?'球探商店已开启':panel} onClose={()=>setPanel(null)} dismissible={!tutorial} className={panel==='球星图鉴'?'collection-album-dialog':panel==='球员名单'||panel==='休息室'?'scheme-roster-dialog':panel==='交付确认'?'settlement-dialog':panel==='器材商店'?'commerce-dialog equipment-dialog':panel==='外部球探'?'commerce-dialog scout-dialog':panel==='器材与背包'?'commerce-dialog inventory-dialog':''} variant={panel==='球星图鉴'?'album':panel==='球员名单'||panel==='休息室'?'roster':panel==='交付确认'?'month':'standard'}><div className="contract-panel">
 {panel==='测试控制台'&&DevConsole&&<Suspense fallback={<p>加载控制台…</p>}><DevConsole/></Suspense>}
 {!tutorial&&store.actionError&&<p className="contract-notice" role="alert">{store.actionError}</p>}
 {panel==='球员名单'&&<ContractRoster onLounge={()=>setPanel('休息室')} onChoose={()=>{setFeedback(null);setPanel(null);}}/>}{panel==='休息室'&&<ContractRoster lounge onChoose={()=>{setFeedback(null);setPanel(null);}}/>}{panel==='器材商店'&&<ContractShop/>}{panel==='外部球探'&&<ContractMerchant/>}{panel==='器材与背包'&&<><ContractInventory/><button className="secondary inventory-home-button" onClick={onHome}><GameIcon name="home"/>保存并返回首页</button></>}{panel==='球星图鉴'&&<ContractCollection/>}
 {panel==='球探到访'&&<div className="scout-arrival"><img src={assetUrl('art/scout/shop-color.png')} alt="球探商店"/><h3>球探首次到访！</h3><p>每3个月来访一次，本月可用经营经费招募新人、购买一次性物品。</p><button className="primary" onClick={()=>setPanel('外部球探')}>去球探商店看看</button></div>}
 {panel==='交付确认'&&<ContractSettlement practice={tutorial?.lesson.game} onAdjust={()=>setPanel('球员名单')} onContinue={()=>setPanel(null)} onConfirm={()=>{const from=g.month;if(tutorial){const next=tutorial.advance('confirm');setMonthTransition(monthChange(from,next.game.month,next.game.status));return;}const r=store.act({type:'settle'});if(!r.error){setMonthTransition(monthChange(from,r.state.month,r.state.status));setFeedback(null);setShots([]);setPanel(null);}}}/>}
 {panel==='概率说明'&&<ProbabilityDetails game={g} player={p} noSevere={!tutorial&&import.meta.env.DEV&&store.debug.noSevere} onClose={()=>setPanel(null)}/>}
 </div></ComicDialog>}
 {equipmentNotice&&<EquipmentTriggerDialog event={equipmentNotice} game={g} onClose={store.dismissEquipmentNotice} onView={()=>{store.dismissEquipmentNotice();setPanel('休息室');}}/>}
 {injuryOffer&&!severeAnimating&&<InjuryRewindDialog kind={injuryOffer.kind} playerId={injuryOffer.playerId} onClose={()=>store.act({type:'dismiss-ad-injury'})}/>}
 {severeAnimating&&<div className="severe-shot-input-lock" role="status" aria-label="重伤动画播放中，操作暂时锁定"/>}
 {!tutorial&&!monthTransitionVisible&&!closed&&!giftPending&&!completionPending&&panel==='加速火热'&&p&&<HeatBoostDialog playerId={p.id} heat={p.heat} onClose={()=>setPanel(null)}/>}
 </main>;
}
