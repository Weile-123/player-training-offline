import {useEffect, useRef, useState, useSyncExternalStore, type CSSProperties} from 'react';
import {useGym as defaultGym} from '../gymStore';
import {automaticIntervalMs, cooperationStatus, gymUpgrade, offlineBonusExperience, playerLevelCap, playerValue, recommendationPayout, postgameRepeatTemplateCredits, requiredExperience, shotCooldownMs, shotExperience, staminaRewardMethod, trainingStatus, type GymAction, type GymPlayer, type GymResult, type GymState} from '../game/gym/engine';
import {challengeStage, challengeUsesManualMatchups, challengeUsesScheduledRewards, type ChallengeAction} from '../game/gym/challenge';
import {templateById} from '../game/templates';
import {type Player} from '../game/types';
import {gameAudio} from '../presentation/audio';
import {soundEnabled} from '../presentation/sampleAudio';
import {decodePreferences, presentationConfig, type ShotFeedback} from '../presentation/feedback';
import {getAnimationConfig, subscribeAnimationConfig, watchAnimationConfig} from '../presentation/animationConfig';
import {money} from '../presentation/money';
import {useModalAccessibility} from '../presentation/useModalAccessibility';
import {valueTone} from '../presentation/valueTone';
import {ComicDialog} from './ComicDialog';
import {ActionNotice, actionNoticeDurationMs} from './ActionNotice';
import {DockButtonFrame} from './DockButtonFrame';
import {DockIcon} from './DockIcon';
import {GameIcon} from './GameIcon';
import {FittedAmount} from './FittedAmount';
import {PlayerTemplatePanel} from './PlayerTemplatePanel';
import {ShotScene} from './ShotScene';
import {ShotStatusPop} from './ShotStatusPop';
import {ShootButton} from './ShootButton';
import {GymScoreboard, GymStamina} from './GymStatus';
import {GymAlumniPanel, GymClubPanel, GymCollectionPanel, GymCooperationPanel, GymInventoryPanel, GymOfflineReport, GymRecommendPanel, GymRosterPanel, GymShopPanel, GymTrainingPanel} from './GymPanels';
import {GymChallengePanel} from './GymChallengePanel';
import {GymChallengePage} from './GymChallengePage';
import {GymHomeIcon} from './GymHomeArt';
import {trainingGuidance} from '../game/gym/guidance';
import {GymRecruitmentControls} from './GymRecruitmentControls';
import {GymPlayerDetails} from './GymPlayerDetails';
import {GymTrainingToolbar} from './GymTrainingToolbar';
import {useGymShopNotice} from '../presentation/gymShopNotice';
import {gymPlayerName} from '../presentation/gymPlayerName';
import type {GymSharePoster} from '../presentation/gymSharePoster';
import {AutoTrainingBorder} from './AutoTrainingBorder';
import {GymShareDialog} from './GymShareDialog';
import {GymDebugDialog} from './GymDebugDialog';
import {getGymDebug, gymDebugAvailable, useGymDebug} from '../platform/gymDebug';
import {completeRewardedVideo} from '../platform/rewardedVideo';
import {assertHupuProject} from '../platform/hupuProject';
import './GymRewards.css';
import './TrainingLayout.css';
import '../equipment-status.css';
import './GymGame.css';

export type GymGamePanel = 'club' | 'challenge' | 'shop' | 'inventory' | 'recommend' | 'alumni' | 'roster' | 'recruit' | 'collection' | 'player' | 'training' | 'cooperation' | null;
type Panel = GymGamePanel;
const panelTitles = {club: '球馆经营', shop: '器材商店', inventory: '器材背包', recommend: '推荐签约', alumni: '球馆档案', roster: '球员名册', recruit: '新人招生', collection: '收藏图鉴', player: '球员资料', training: '训练计划', cooperation: '赞助合作'};
const outcomeLabels = {hold: '维持', success: '成功', great: '大成功'};
const rewardsUnavailable = '分享和广告奖励暂不可用，请稍后再试。';
type ChallengeRevive = Extract<ChallengeAction,{type:'revive-challenge'}>;
type ShareIntent = {key:string; source:GymSharePoster; action:GymAction; createdAt:number; seed:number; debug:boolean};
function platformRewardsAvailable(current=defaultGym.getState()) {
 if (current.debugSessionActive) return false;
 return !current.authorityMode||current.authorityMode==='local'||current.authorityMode==='timeflow'&&current.authorityCapabilities?.platformRewards===true;
}

function displayedPlayer(player: GymPlayer): Player {
 return {id: player.id, name: gymPlayerName(player), age: 18, height: player.height, stats: player.stats, level: player.level, shots: player.shots, templateId: player.templateId, highPotential: player.highPotential, heat: 0, hotShots: 0, iceShots: 0};
}

function formatValue(value: string) {
 const amount = BigInt(value);
 if (amount < 10000n) return amount.toLocaleString();
 if (amount < 100000000n) return `${Number(amount / 100n) / 100}万`;
 if (amount < 1000000000000n) return `${Number(amount / 1000000n) / 100}亿`;
 return money(amount).slice(1);
}

export default function GymGame({onHome,storeHook,tutorial=false,onTutorialAction,onTutorialPanel}: {onHome: () => void;storeHook?:typeof defaultGym;tutorial?:boolean;onTutorialAction?:(action:GymAction,result:GymResult)=>void;onTutorialPanel?:(panel:Panel)=>void}) {
 const useGym=storeHook??defaultGym;
 const store = useGym();
 const state = store.state;
 const challengeRun = state.challenge?.run;
 const rewardsEnabled = !tutorial&&platformRewardsAvailable(store);
 const debugOptions = useGymDebug();
 const mockChallengeReward = challengeRun?.phase==='draft'?debugOptions.skipAds:debugOptions.skipPosting;
 const challengeRewardAvailable = !tutorial&&(mockChallengeReward||rewardsEnabled);
 // Empty positions are a court view, never a player=null save with occupied
 // bench entries. Every real athlete stays in the authoritative game state.
 const trainees = (state.player ? [state.player, ...state.bench] : state.bench).slice().sort((first, second) => first.enteredAt - second.enteredAt || first.id.localeCompare(second.id));
 const [emptyCourtSlot, setEmptyCourtSlot] = useState<number | null>(null);
 const viewingEmptySlot = emptyCourtSlot !== null && emptyCourtSlot >= trainees.length && emptyCourtSlot < state.gymLevel;
 const player = viewingEmptySlot ? null : state.player;
 const courtState = player ? state : {...state, player: null};
 const [panel, setPanel] = useState<Panel>(tutorial || player ? null : 'recruit');
 const challengeOpen = panel === 'challenge';
 const courtChallengeButton = useRef<HTMLButtonElement>(null);
 const returningFromChallenge = useRef(false);
 const [featureTutorialActive, setFeatureTutorialActive] = useState(false);
 const shopHasNewEquipment = useGymShopNotice(state, panel === 'shop',!tutorial);
 const tutorialCallbacks=useRef({onTutorialAction,onTutorialPanel});
 tutorialCallbacks.current={onTutorialAction,onTutorialPanel};
 useEffect(()=>{if(tutorial)tutorialCallbacks.current.onTutorialPanel?.(panel);},[tutorial,panel]);
 const [busy, setBusy] = useState(false);
 const [feedback, setFeedback] = useState<ShotFeedback | null>(null);
 const [shots, setShots] = useState<ShotFeedback[]>([]);
 const [notice, setNotice] = useState('');
 const [operationError, setOperationError] = useState('');
 const [platformWarning, setPlatformWarning] = useState('');
 const [share, setShare] = useState<ShareIntent | null>(null);
 const [debugOpen, setDebugOpen] = useState(false);
 const [adAction, setAdAction] = useState<GymAction | null>(null);
 const upgradePrompted = useRef(new Set<number>());
 const busyRef = useRef(false);
 const challengeTestSwitching = useRef(false);
 const shareRewardProof=useRef<{challengeId:string;confirmation:'native-sdk-confirmation'}>();
 const sequence = useRef(0);
 const resultPresenter = useRef<(result: GymResult, previous: GymState) => void>(() => {});
 const visual = useSyncExternalStore(subscribeAnimationConfig, getAnimationConfig, getAnimationConfig);
 const viewport = useRef<HTMLDivElement>(null);
 const reduced = (() => {
  try { return decodePreferences(localStorage.getItem(presentationConfig.preferenceKey)).reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
 })();
 useModalAccessibility();
 useEffect(() => {if(!tutorial)return watchAnimationConfig();}, [tutorial]);
 useEffect(() => {if(!rewardsEnabled&&!challengeRewardAvailable)setShare(null);}, [rewardsEnabled,challengeRewardAvailable]);
 useEffect(() => {
  if(tutorial)return;
  let disposed = false;
  let ticking = false;
  let needsResume = true;
  let lastAdvance = 0;
  const advance = async () => {
   if (disposed || document.visibilityState !== 'visible' || ticking || challengeTestSwitching.current) return;
   const current = useGym.getState();
   const automatic = [current.state.player, ...current.state.bench].some(entry => entry?.autoEnabled);
   const now = Date.now();
   if (!needsResume && !current.isSuspended && now - lastAdvance < (automatic ? 200 : 1000)) return;
   lastAdvance = now;
   ticking = true;
   try {
    if (needsResume || current.isSuspended) {
     needsResume = false;
     const resumed = await current.resume();
     if (resumed.error) {needsResume = true; return;}
     // Resume saves one aggregate report. Do not replay offline shot animations.
     if (disposed || document.visibilityState !== 'visible') return;
    }
    const active = useGym.getState();
    const previous = active.state;
    const result = await active.tick();
    if (!disposed && document.visibilityState === 'visible') resultPresenter.current(result, previous);
   } catch {needsResume = true;}
   finally {ticking = false;}
  };
  const timer = setInterval(advance, 200);
  const save = () => {needsResume = true; void useGym.getState().suspend();};
  const visibility = () => {if (document.visibilityState === 'hidden') save(); else void advance();};
  window.addEventListener('focus', advance);
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', visibility);
  void advance();
  return () => {
   disposed = true;
   clearInterval(timer);
   window.removeEventListener('focus', advance);
   window.removeEventListener('pagehide', save);
   document.removeEventListener('visibilitychange', visibility);
   save();
  };
 }, [tutorial,useGym]);
 useEffect(() => {if (viewport.current) viewport.current.inert = panel !== null || !!store.pendingOfflineReport || !!share || debugOpen;}, [panel, store.pendingOfflineReport, share, debugOpen]);
 useEffect(() => {
  if (!challengeOpen && returningFromChallenge.current) {
   returningFromChallenge.current = false;
   courtChallengeButton.current?.focus();
  }
 }, [challengeOpen]);
 const upgradeReady = gymUpgrade(state).canUpgrade;
 useEffect(() => {
  if (tutorial || featureTutorialActive || !upgradeReady || upgradePrompted.current.has(state.gymLevel) || busy || panel || share || debugOpen || store.pendingOfflineReport) return;
  upgradePrompted.current.add(state.gymLevel);
  setPanel('club');
 }, [tutorial,featureTutorialActive,upgradeReady, state.gymLevel, busy, panel, share, debugOpen, store.pendingOfflineReport]);
 useEffect(() => {setFeedback(null); setShots([]);}, [player?.id]);
 useEffect(() => {setEmptyCourtSlot(null);}, [state.createdAt, state.seed]);
 useEffect(() => {if (emptyCourtSlot !== null && !viewingEmptySlot) setEmptyCourtSlot(null);}, [emptyCourtSlot, viewingEmptySlot]);
 useEffect(() => {if (panel) {setNotice(''); setPlatformWarning(''); setOperationError('');}}, [panel]);
 useEffect(() => {
  if (!notice) return;
  const timer = setTimeout(() => setNotice(''), actionNoticeDurationMs);
  return () => clearTimeout(timer);
 }, [notice]);

 resultPresenter.current = (result, previous) => {
  if (result.error) return;
  const next = result.state.player;
  const sameSelection = !!player && player.id === next?.id && useGym.getState().state.player?.id === next?.id;
  const trained = sameSelection ? result.events.find(event => event.type === 'trained' && event.playerId === next?.id) : undefined;
  if (trained?.outcome && next) {
   const nextFeedback: ShotFeedback = {
    id: ++sequence.current, player: displayedPlayer(next), outcome: trained.outcome,
    changes: trained.changes ?? {}, levelGain: trained.levelGain ?? 0, heatGain: 0, saleIncome: 0,
    message: `${outcomeLabels[trained.outcome]} · 经验 +${trained.experienceGain ?? shotExperience(trained.outcome)}`, evolution: null,
   };
   setFeedback(nextFeedback);
   if (!reduced && !panel) setShots(old => [...old.slice(-3), nextFeedback]);
   if (!panel) void gameAudio.play(trained.outcome, soundEnabled());
  }
  const completedCourse = sameSelection ? result.events.find(event => event.type === 'course-completed' && event.playerId === next?.id) : undefined;
  const onCourt = !panel && !share && !debugOpen && !store.pendingOfflineReport;
  if (completedCourse && onCourt) {
   setNotice(`训练课完成 · 恢复 ${completedCourse.restoredStamina ?? 0} 点体力 · 可以复盘或调整专项`);
   if (!panel) void gameAudio.play('evolution', soundEnabled());
  }
  if (next && trained && onCourt) {
   const old = [previous.player, ...previous.bench].find(entry => entry?.id === next.id);
   const before = cooperationStatus(previous, old ?? null);
   const after = cooperationStatus(result.state, next);
   if (!before.complete && after.complete) setNotice(`合作目标达成 · 推荐签约可额外获得 ${after.rewardCredits} 券`);
  }
 };

 const enterChallengeTestGym = async () => {
  const current = useGym.getState();
  if (current.debugSessionActive) return;
  if (!current.debugForkGym) throw Error('测试球馆暂不可用');
  challengeTestSwitching.current = true;
  try {await current.debugForkGym();}
  finally {challengeTestSwitching.current = false;}
 };

 const perform = async (action: GymAction, withAd = false, preparedProof?:{challengeId:string;confirmation:'native-sdk-confirmation'}): Promise<boolean> => {
  const challengeAd = action.type==='refresh-challenge-draft';
  const challengePost = action.type==='revive-challenge';
  const rewardStore = useGym.getState();
  const debug = getGymDebug();
  const challengeTest = challengeAd&&debug.skipAds||challengePost&&rewardStore.debugSessionActive===true&&debug.skipPosting;
  withAd ||= challengeAd;
  if ((challengeAd||challengePost)&&(tutorial||(!challengeTest&&!platformRewardsAvailable(rewardStore)))) {setPlatformWarning(rewardsUnavailable);return false;}
  if (['share-player-levels','restore-stamina-reward','complete-cooperation-ad','double-offline-experience'].includes(action.type)&&(tutorial||!platformRewardsAvailable(useGym.getState()))) {setPlatformWarning(rewardsUnavailable);return false;}
  if (busyRef.current) return false;
  if (action.type === 'recruit' && !player) action = {...action, selectRecruited: true};
  if (action.type === 'select-player' && viewingEmptySlot && action.id === state.player?.id) {
   setEmptyCourtSlot(null); setPanel(null); setFeedback(null); setShots([]); return true;
  }
  busyRef.current = true;
  setBusy(true);
  setNotice('');
  setOperationError('');
  setPlatformWarning('');
  if (withAd) setAdAction(action);
  try {
   if (challengeAd&&challengeTest) await enterChallengeTestGym();
   const sourceStore = useGym.getState();
   const origin = sourceStore.state;
   let rewardProof=preparedProof;
   if (withAd) {
    rewardProof=challengeTest?undefined:await sourceStore.preparePlatformReward?.(action);
    // The platform's rewarded acknowledgement, not the bridge-start acknowledgement, grants access.
    const confirmation=await completeRewardedVideo(() => {}, {mock: debug.skipAds, onTaskStateError: setPlatformWarning});
    if(rewardProof&&confirmation?.confirmation!=='native-sdk-confirmation')throw Error('测试广告不能领取线上奖励');
    if(!challengeTest&&!platformRewardsAvailable(useGym.getState())){setOperationError(rewardsUnavailable);return false;}
    if(!challengeTest)assertHupuProject();
    const current = useGym.getState().state;
    if (current.createdAt !== origin.createdAt || current.seed !== origin.seed || useGym.getState().debugSessionActive !== sourceStore.debugSessionActive) {setOperationError('本局游戏已变化，未发放旧奖励'); return false;}
   }
   const previous = useGym.getState().state;
   const result = await useGym.getState().act(action,rewardProof);
   if (result.error) return false;
   resultPresenter.current(result, previous);
   if (action.type === 'recommend') {
    const reward = result.events.find(event => event.type === 'recommended');
    setNotice(`推荐成功 · 赞助券 +${reward?.credits ?? 0} · 声望 +${reward?.fame ?? 0}${reward?.repeatTemplate ? ' · 重复模板奖励' : reward?.isFirstPostgameRecommendation ? ' · 模板首次推荐奖励' : ''}`);
    setPanel(null);
    const remaining = (result.state.player ? 1 : 0) + result.state.bench.length;
    setEmptyCourtSlot(remaining < result.state.gymLevel ? remaining : null);
    setFeedback(null);
    setShots([]);
   }
   if (action.type === 'recruit') {setEmptyCourtSlot(null); if (panel === 'recruit') setPanel(null); setFeedback(null); setShots([]); setNotice(action.mode === 'selected' ? '精选新人已入馆，可选择训练计划并开始培养' : '新人已入馆，可以开始培养');}
   if (action.type === 'select-player') {setEmptyCourtSlot(null); setPanel(null); setFeedback(null); setShots([]);}
   if (action.type === 'set-training-plan' && action.scope !== 'roster') {
    setPanel(null);
    setNotice(`已开始${trainingStatus(result.state).plan.name}，每 10 球完成一课`);
   }
   if (action.type === 'accept-cooperation' && action.scope !== 'roster') {
    setPanel(null);
    setNotice('赞助合作已接取，培养进度从现在开始累计');
   }
   if (action.type === 'upgrade-gym') {setPanel(null); setNotice('球馆晋级，新的项目与器材已开放'); void gameAudio.play('evolution', soundEnabled());}
   if (action.type === 'share-player-levels') setNotice(`分享奖励到账 · 等级 +${result.events.find(event => event.type === 'player-share-rewarded')?.levelGain ?? 0}`);
   if (action.type === 'restore-stamina-reward') setNotice('体力已回满');
   if (action.type === 'complete-cooperation-ad') setNotice('合作已完成 · 推荐签约时领取奖励');
   if(tutorial)tutorialCallbacks.current.onTutorialAction?.(action,result);
   return true;
  } catch (error) {
   setOperationError(withAd && error instanceof Error ? error.message : '操作暂未保存，请稍后重试');
   return false;
  } finally {
   busyRef.current = false;
   setBusy(false);
   setAdAction(null);
  }
 };
 const onAction = (action: GymAction) => {void perform(action);};
 const onAdAction = (action: GymAction) => {void perform(action, true);};
 const openShare = (reason: 'levels' | 'stamina') => {
  if(tutorial||!platformRewardsAvailable(useGym.getState())){setPlatformWarning(rewardsUnavailable);return;}
  if (!player||busy) return;
  const action:GymAction=reason==='levels'?{type:'share-player-levels',playerId:player.id}:
   {type:'restore-stamina-reward',playerId:player.id,method:'share',expectedCount:state.staminaRewardCount??0};
  setShare({key:`${player.id}:${reason}`,source:{player,reason,value:playerValue(state,player)},action,createdAt:state.createdAt,seed:state.seed,debug:false});
 };
 const openReviveShare = async (action:ChallengeRevive) => {
  const current=useGym.getState(), origin=current.state, run=origin.challenge?.run;
  const simulate = getGymDebug().skipPosting;
  if (tutorial||(!simulate&&!platformRewardsAvailable(current))) {setPlatformWarning(rewardsUnavailable);return;}
  if (busyRef.current||!run||run.phase!=='lost'||run.retired||run.revival||run.attempt!==action.attempt||challengeStage(run)!==action.stage) return;
  if (simulate&&!current.debugSessionActive) {
   busyRef.current=true;setBusy(true);setOperationError('');
   try {await enterChallengeTestGym();}
   catch(error) {setOperationError(error instanceof Error?error.message:'测试球馆切换失败');return;}
   finally {busyRef.current=false;setBusy(false);}
  }
  const active=useGym.getState();
  const intent:ShareIntent={key:`revive:${run.attempt}:${action.stage}`,source:{reason:'revive',stage:action.stage,roster:run.team},action,
   createdAt:origin.createdAt,seed:origin.seed,debug:active.debugSessionActive===true};
  if (simulate&&!intent.debug||!currentShare(intent)) return;
  setShare(intent);
 };
 const currentShare = (intent:ShareIntent) => {
  const current=useGym.getState();
  if (current.state.createdAt!==intent.createdAt||current.state.seed!==intent.seed||Boolean(current.debugSessionActive)!==intent.debug) return false;
  if (intent.action.type!=='revive-challenge') return true;
  const run=current.state.challenge?.run;
  return run?.phase==='lost'&&!run.retired&&!run.revival&&run.attempt===intent.action.attempt&&challengeStage(run)===intent.action.stage;
 };
 const restoreStamina = () => {
  if(tutorial||!platformRewardsAvailable(useGym.getState())){setPlatformWarning(rewardsUnavailable);return;}
  if (!player || busy) return;
  if (staminaRewardMethod(state) === 'share') openShare('stamina');
  else onAdAction({type: 'restore-stamina-reward', playerId: player.id, method: 'ad', expectedCount: state.staminaRewardCount ?? 0});
 };
 const training = trainingStatus(courtState);
 const cooperation = cooperationStatus(courtState);
 const experienceRequired = requiredExperience(player?.level ?? 0);
 const atCap = !!player && player.level >= playerLevelCap;
 const canSharePlayerLevels = !tutorial&&!!player && !!templateById(player.templateId) && !player.shareLevelClaimed && !atCap;
 const guidance = player ? trainingGuidance(state) : null;
 const currentIndex = viewingEmptySlot ? emptyCourtSlot! : Math.max(0, trainees.findIndex(trainee => trainee.id === player?.id));
 const nextIndex = (currentIndex + 1) % state.gymLevel;
 const nextTrainee = trainees[nextIndex];
 const switchCourt = () => {
  if (busyRef.current) return;
  if (nextTrainee && nextTrainee.id !== state.player?.id) {onAction({type: 'select-player', id: nextTrainee.id}); return;}
  setEmptyCourtSlot(nextTrainee ? null : nextIndex);
  setFeedback(null); setShots([]); setNotice(''); setOperationError(''); setPlatformWarning('');
 };

 const openChallenge = () => {
  setFeedback(null); setShots([]); setPanel('challenge');
 };
 const returnToTraining = () => {
  returningFromChallenge.current = true;
  setPanel(null);
 };
 const abandonChallenge = async () => {
  if (!challengeRun||challengeRun.retired) return;
  const ended=await perform({type:'retire-challenge-run',attempt:challengeRun.attempt,stage:challengeStage(challengeRun)});
  if (ended) returnToTraining();
 };
 const challengeKey = `${state.createdAt}:${state.seed}:${state.challenge?.run.attempt??0}`;

 return <>
 {challengeOpen && <GymChallengePage blocked={!!store.pendingOfflineReport}
   busy={busy} reduced={reduced} manualMatchups={!challengeRun||challengeUsesManualMatchups(challengeRun.rulesVersion)}
   scheduledRewards={!challengeRun||challengeUsesScheduledRewards(challengeRun.rulesVersion)||!!challengeRun.retired}
   lossLocked={challengeUsesScheduledRewards(challengeRun?.rulesVersion)&&challengeRun?.phase==='lost'&&!challengeRun.retired} onBack={returnToTraining}
   onAbandon={challengeRun&&!challengeRun.retired?abandonChallenge:undefined} abandonError={store.actionError||operationError}>
   {showRules=><GymChallengePanel key={challengeKey} state={state} act={perform} busy={busy} reduced={reduced} testRun={store.debugSessionActive} showRules={showRules}
     onReturnToGym={returnToTraining} onRevive={openReviveShare} rewardAvailable={challengeRewardAvailable} adLoading={adAction?.type==='refresh-challenge-draft'}
     reviveDialogOpen={share?.action.type==='revive-challenge'}
     error={store.pendingOfflineReport?'':store.actionError||operationError||platformWarning}/>}
 </GymChallengePage>}
 <main className={`game-screen contract-game training-layout gym-game${reduced ? ' reduce-motion' : ''}${tutorial?' gym-tutorial-practice':''}`} hidden={challengeOpen} aria-label="篮球训练馆" style={{'--game-max-width': `${visual.gameMaxWidthPx}px`, '--shoot-button-scale': visual.shootButtonScale} as CSSProperties}>
  <div className="game-viewport" ref={viewport}>
   <header className="game-topbar">
    <div className="cash-display"><GameIcon name="assets"/><span><small>赞助券</small><b>{state.credits}</b></span></div>
    <button className="month-stamp" aria-label="查看球馆经营" onClick={() => setPanel('club')}><span>球馆 <b>Lv.{state.gymLevel}</b></span></button>
    <button className="credit-display gym-home-control" aria-label="保存并返回首页" onClick={onHome}><small>返回首页</small><GameIcon name="home"/></button>
   </header>
   <GymScoreboard state={state} upgradeReady={upgradeReady} onClub={() => setPanel('club')} onPlayer={() => setPanel('roster')}/>
   <section className="game-player"><div className="player-value-card" data-tier={templateById(player?.templateId)?.tier ?? 'undiscovered'}>
    <PlayerTemplatePanel player={player ? displayedPlayer(player) : undefined} feedback={feedback} reduced={reduced} disabled={!player} showTrainingLevel={false} showLevelBeforeTier={!canSharePlayerLevels} showPosition={false} onDetails={() => setPanel('player')} identityAction={canSharePlayerLevels ? <button type="button" className="gym-player-share" aria-label={rewardsEnabled?'分享·等级+3':'分享奖励暂不可用'} title={rewardsEnabled?undefined:rewardsUnavailable} disabled={busy||!rewardsEnabled} onClick={event => {event.stopPropagation(); openShare('levels');}}>{rewardsEnabled?'分享·等级+3':'分享暂不可用'}</button> : undefined}/>
    <div className="player-value-footer"><div className={`player-value-amount value-tone-${valueTone(templateById(player?.templateId)?.tier)}`}><small>身价</small><FittedAmount fitHeight text={player ? formatValue(playerValue(state, player)) : '—'}/></div>
     <div className="gym-player-actions"><button className="sell-shortcut red-stamp" disabled={!player || busy} onClick={() => setPanel('recommend')}><span>推荐签约</span></button>
      {player && state.gymLevel >= 2 && <button type="button" className={`sell-shortcut gym-court-auto${player.autoEnabled ? ' is-active' : ''}`} role="switch" aria-label="当前球员自动训练" aria-checked={player.autoEnabled} disabled={busy || atCap && !player.autoEnabled} onClick={() => onAction({type: 'set-auto', id: player.id, enabled: !player.autoEnabled})}><span>{player.autoEnabled ? '暂停自动' : atCap ? '已满级' : '开启自动'}</span>{player.autoEnabled && <AutoTrainingBorder/>}</button>}
     </div>
    </div>
   </div></section>
   <GymTrainingToolbar playerId={player?.id} reducedMotion={reduced} level={player?.level ?? 0} experience={player?.experience ?? 0} required={experienceRequired} atCap={atCap} cooperationReady={cooperation.complete} empty={!player} onTraining={() => setPanel('training')} onCooperation={() => setPanel('cooperation')}/>
   <section className="game-stage">
    <ShotScene feedback={feedback} shots={shots} hot={false} busy={shots.length > 0} reduced={reduced} hideOutcomeLabel onFinish={id => setShots(previous => id === undefined ? [] : previous.filter(shot => shot.id !== id))}/>
    <ShotStatusPop active={!!player && !panel} feedback={feedback} hoopScale={visual.hoopScale} reduced={reduced}/>
    <GymStamina state={courtState}/>
    {!tutorial&&gymDebugAvailable() && <button type="button" className="gym-local-test" onClick={() => setDebugOpen(true)}>{store.debugSessionActive ? `测试球馆 Lv.${state.gymLevel}` : '本地测试'}</button>}
    <div className="stage-navigation">
     <div className="contract-stage-tools">
      {!tutorial && <button type="button" className="stage-challenge-button" ref={courtChallengeButton} onClick={openChallenge}>
       <GymHomeIcon name="rank"/><span>球馆挑战</span>
      </button>}
      <button className="stage-collection-button" onClick={() => setPanel('collection')} aria-label="打开图鉴"><span>图鉴</span></button>
     </div>
    </div>
    {player && <button className="court-equipment-status" aria-label="查看当前训练课程" onClick={() => setPanel('training')}>
     <span className="equipment-status-heading">{training.plan.name} <i>›</i></span>
     <span className="equipment-status-mini charge"><span>本课训练</span><b>{training.shots}/10 球</b></span>
     <span className="equipment-status-mini"><span>复盘恢复</span><b>最多 +{training.nextRecovery}</b></span>
     <small>已完成 {training.completedCourses} 课 · {atCap ? '等级已满' : player.autoEnabled ? `自动 ${automaticIntervalMs(state) / 1000}秒/球` : `手动 ${shotCooldownMs / 1000}秒/球`}</small>
     {guidance && <small>{atCap ? '训练已结束，按当前模板推荐结算' : guidance.allStatsMax ? '六维已满，可核对奖金后推荐' : guidance.nextBonus ? `下个奖金节点 Lv.${guidance.nextBonus.level}＋${guidance.nextBonus.tierName}` : '最高培养奖金已达成，可推荐兑现'}</small>}
    </button>}
    <ActionNotice className="contract-status" role={store.actionError||operationError||platformWarning?'alert':'status'} message={!panel&&!share&&!debugOpen&&!store.pendingOfflineReport?store.actionError||operationError||platformWarning||notice:''}/>
    <div className="gym-court-quick-actions">{state.gymLevel > 1 && <button type="button" className="gym-court-switch" aria-label="切换训练球员" title={nextTrainee ? `下一位：${gymPlayerName(nextTrainee)}` : `下一位：空训练位 ${nextIndex + 1}`} disabled={busy} onClick={switchCourt}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h16m-4-4 4 4-4 4M21 17H5m4-4-4 4 4 4"/></svg><span>切换球员<small>{currentIndex + 1}/{state.gymLevel}</small></span></button>}{player && player.stamina === 0 && !atCap && <button type="button" className="gym-stamina-restore" aria-label={!rewardsEnabled?'体力奖励暂不可用':staminaRewardMethod(state) === 'share' ? '分享发帖，体力回满' : '看广告，体力回满'} title={rewardsEnabled?undefined:rewardsUnavailable} disabled={busy||!rewardsEnabled} aria-busy={adAction?.type === 'restore-stamina-reward'} onClick={restoreStamina}>{adAction?.type === 'restore-stamina-reward' ? <><i className="gym-button-spinner" aria-hidden="true"/>加载中…</> : rewardsEnabled?'体力回满':'奖励暂不可用'}</button>}</div>
   </section>
   <footer className="game-dock contract-clean-dock"><div className="dock-canvas">
    <div className="dock-side dock-side-left">
     <button className="dock-control dock-bag css-dock-button" aria-label="打开背包" onClick={() => setPanel('inventory')}><DockButtonFrame/><DockIcon name="bag"/><strong>背包</strong></button>
     <button className="dock-control dock-month css-dock-button" aria-label="球馆经营" onClick={() => setPanel('club')}><DockButtonFrame/><DockIcon name="month"/><strong>球馆</strong></button>
    </div>
    <ShootButton mode={player ? 'shoot' : 'recruit'} disabled={!!player && (player.autoEnabled || player.stamina < 1 || player.level >= playerLevelCap) || busy || !!panel} reduced={reduced} cooldownUntil={player?.autoEnabled ? undefined : player?.nextShotAt ?? 0} cooldownDurationMs={shotCooldownMs} onShoot={() => {if (player) onAction({type: 'train', id: player.id}); else setPanel('recruit');}}/>
    <div className="dock-side dock-side-right">
     <button className="dock-control dock-shop css-dock-button" aria-label="器材商店" onClick={() => setPanel('shop')}><DockButtonFrame/><DockIcon name="shop"/><strong>商店</strong>{shopHasNewEquipment && <i className="gym-shop-new-dot" role="img" aria-label="新器材可购买"/>}</button>
     <button className="dock-control dock-rest css-dock-button" aria-label="推荐球员签约" disabled={!player || busy} onClick={() => setPanel('recommend')}><DockButtonFrame/><DockIcon name="rest"/><strong>推荐签约</strong></button>
    </div>
   </div></footer>
  </div>
  {panel && panel !== 'challenge' && <ComicDialog title={panelTitles[panel]} dismissible={!featureTutorialActive} onClose={() => {if (!featureTutorialActive) setPanel(null);}} variant={panel === 'collection' ? 'album' : panel === 'roster' ? 'roster' : 'standard'} className={panel === 'collection' ? 'collection-album-dialog' : panel === 'roster' ? 'scheme-roster-dialog' : panel === 'shop' ? 'gym-management-dialog gym-shop-dialog' : panel === 'inventory' ? 'gym-management-dialog gym-inventory-dialog' : 'gym-management-dialog'}><div className="contract-panel">
   <ActionNotice message={!store.pendingOfflineReport?store.actionError||operationError||platformWarning:''} role="alert" className="contract-notice"/>
   <div aria-busy={busy} className={busy && !adAction ? 'gym-action-pending' : ''}>
    {panel === 'club' && <GymClubPanel state={state} onAction={onAction} busy={busy} onChallenge={tutorial?undefined:openChallenge}/>}
    {panel === 'training' && <GymTrainingPanel key={player?.id} state={state} onAction={onAction} tutorialEnabled={!tutorial} onTutorialActiveChange={setFeatureTutorialActive}/>}
    {panel === 'cooperation' && <GymCooperationPanel key={player?.id} state={state} onAction={onAction} onAdAction={rewardsEnabled?onAdAction:undefined} busy={busy} adAction={adAction} tutorialEnabled={!tutorial} onTutorialActiveChange={setFeatureTutorialActive}/>}
    {panel === 'shop' && <GymShopPanel state={state} onAction={onAction} busy={busy}/>}
    {panel === 'inventory' && <GymInventoryPanel state={state} onAction={onAction} busy={busy}/>}
    {panel === 'recommend' && <GymRecommendPanel state={state} onAction={onAction} onClose={() => setPanel(null)}/>}
    {panel === 'alumni' && <GymAlumniPanel state={state} onAction={onAction} loadAlumni={store.loadAlumni}/>}
    {panel === 'roster' && <GymRosterPanel state={state} selectedPlayerId={viewingEmptySlot ? null : state.player?.id} onAction={onAction} onAdAction={rewardsEnabled?onAdAction:undefined} busy={busy} adAction={adAction} onAlumni={() => setPanel('alumni')} tutorialEnabled={!tutorial} onTutorialActiveChange={setFeatureTutorialActive}/>}
    {panel === 'recruit' && <GymRecruitmentControls state={state} onAction={onAction} busy={busy} emptyCourt/>}
    {panel === 'collection' && <GymCollectionPanel state={state} onAction={onAction} busy={busy}/>}
    {panel === 'player' && player && <GymPlayerDetails player={player} onTraining={() => setPanel('training')}/>}
   </div>
  </div></ComicDialog>}
 </main>
  {store.pendingOfflineReport && <GymOfflineReport report={store.pendingOfflineReport} onClose={store.dismissOfflineReport}
    bonusExperience={offlineBonusExperience(store.state,store.pendingOfflineReport)}
    doubleExperienceClaimed={store.state.offlineReward?.report.reportId===store.pendingOfflineReport.reportId&&store.state.offlineReward?.claimed===true}
    doubleExperiencePending={busy&&adAction?.type==='double-offline-experience'}
    doubleExperienceError={operationError||store.actionError}
    onDoubleExperience={rewardsEnabled&&store.pendingOfflineReport.reportId?()=>perform({type:'double-offline-experience',reportId:store.pendingOfflineReport!.reportId!},true):undefined}/>}
  {share && <GymShareDialog key={share.key} {...share.source} allowSimulated={share.source.reason!=='revive'||share.debug} onClose={() => {shareRewardProof.current=undefined;setShare(null);}} onBeforeOpen={async()=>{
    shareRewardProof.current=undefined;
    if(!currentShare(share))throw Error('本局游戏已变化，请返回球场重新分享');
    if(share.source.reason==='revive'&&share.debug){
     if(!getGymDebug().skipPosting)throw Error(rewardsUnavailable);
     return;
    }
    shareRewardProof.current=await useGym.getState().preparePlatformReward?.(share.action);
  }} onGranted={async () => {
   if (!currentShare(share)) return false;
   return perform(share.action,false,shareRewardProof.current);
  }}/>}
  {debugOpen && <GymDebugDialog onClose={() => setDebugOpen(false)} onLevelChange={openChallenge => {
   setFeatureTutorialActive(false); setEmptyCourtSlot(null); setPanel(openChallenge ? 'challenge' : null); setDebugOpen(false);
  }}/>}
 </>;
}
