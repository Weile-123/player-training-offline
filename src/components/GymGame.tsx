import {useEffect, useRef, useState, useSyncExternalStore, type CSSProperties} from 'react';
import {useGym} from '../gymStore';
import {automaticIntervalMs, cooperationStatus, playerLevelCap, playerValue, recommendationPayout, postgameRepeatTemplateCredits, requiredExperience, shotExperience, trainingShotExperience, trainingStatus, type GymAction, type GymPlayer, type GymResult, type GymState} from '../game/gym/engine';
import {templateById} from '../game/templates';
import {type Player} from '../game/types';
import {gameAudio} from '../presentation/audio';
import {soundEnabled} from '../presentation/sampleAudio';
import {decodePreferences, presentationConfig, type ShotFeedback} from '../presentation/feedback';
import {getAnimationConfig, subscribeAnimationConfig, watchAnimationConfig} from '../presentation/animationConfig';
import {useModalAccessibility} from '../presentation/useModalAccessibility';
import {valueTone} from '../presentation/valueTone';
import {ComicDialog} from './ComicDialog';
import {DockButtonFrame} from './DockButtonFrame';
import {DockIcon} from './DockIcon';
import {GameIcon} from './GameIcon';
import {FittedAmount} from './FittedAmount';
import {PlayerTemplatePanel} from './PlayerTemplatePanel';
import {ShotScene} from './ShotScene';
import {ShotStatusPop} from './ShotStatusPop';
import {ShootButton} from './ShootButton';
import {GymScoreboard, GymStamina} from './GymStatus';
import {GymAlumniPanel, GymClubPanel, GymCollectionPanel, GymCooperationPanel, GymInventoryPanel, GymOfflineReport, GymRecommendPanel, GymRosterPanel, GymShopPanel, GymTrainingPanel, offlineDuration} from './GymPanels';
import {offlineLimitMs} from '../game/gym/offline';
import {trainingGuidance} from '../game/gym/guidance';
import {GymRecruitmentControls} from './GymRecruitmentControls';
import {GymPlayerDetails} from './GymPlayerDetails';
import {GymTrainingToolbar} from './GymTrainingToolbar';
import {useGymShopNotice} from '../presentation/gymShopNotice';
import {gymPlayerName} from '../presentation/gymPlayerName';
import './TrainingLayout.css';
import '../equipment-status.css';
import './GymGame.css';

type Panel = 'club' | 'shop' | 'inventory' | 'recommend' | 'alumni' | 'roster' | 'recruit' | 'collection' | 'experience' | 'player' | 'training' | 'cooperation' | null;
const panelTitles = {club: '球馆经营', shop: '器材商店', inventory: '器材背包', recommend: '推荐签约', alumni: '球馆档案', roster: '球员名册', recruit: '新人招生', collection: '收藏图鉴', experience: '训练经验', player: '球员资料', training: '训练计划', cooperation: '赞助合作'};
const outcomeLabels = {hold: '维持', success: '成功', great: '大成功'};

function displayedPlayer(player: GymPlayer): Player {
 return {id: player.id, name: gymPlayerName(player), age: 18, height: player.height, stats: player.stats, level: player.level, shots: player.shots, templateId: player.templateId, heat: 0, hotShots: 0, iceShots: 0};
}

function formatValue(value: string) {
 const amount = BigInt(value);
 if (amount < 10000n) return amount.toLocaleString();
 if (amount < 100000000n) return `${Number(amount / 100n) / 100}万`;
 if (amount < 1000000000000n) return `${Number(amount / 1000000n) / 100}亿`;
 return `${Number(amount / 10000000000n) / 100}万亿`;
}

export default function GymGame({onHome}: {onHome: () => void}) {
 const store = useGym();
 const state = store.state;
 const player = state.player;
 const [panel, setPanel] = useState<Panel>(player ? null : 'recruit');
 const shopHasNewEquipment = useGymShopNotice(state, panel === 'shop');
 const [busy, setBusy] = useState(false);
 const [feedback, setFeedback] = useState<ShotFeedback | null>(null);
 const [shots, setShots] = useState<ShotFeedback[]>([]);
 const [notice, setNotice] = useState('');
 const busyRef = useRef(false);
 const sequence = useRef(0);
 const resultPresenter = useRef<(result: GymResult, previous: GymState) => void>(() => {});
 const visual = useSyncExternalStore(subscribeAnimationConfig, getAnimationConfig, getAnimationConfig);
 const viewport = useRef<HTMLDivElement>(null);
 const reduced = (() => {
  try { return decodePreferences(localStorage.getItem(presentationConfig.preferenceKey)).reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
 })();
 useModalAccessibility();
 useEffect(() => watchAnimationConfig(), []);
 useEffect(() => {
  let disposed = false;
  let ticking = false;
  let needsResume = true;
  let lastAdvance = 0;
  const advance = async () => {
   if (disposed || document.visibilityState !== 'visible' || ticking) return;
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
 }, []);
 useEffect(() => {if (viewport.current) viewport.current.inert = panel !== null || !!store.pendingOfflineReport;}, [panel, store.pendingOfflineReport]);
 useEffect(() => {setFeedback(null); setShots([]);}, [player?.id]);
 useEffect(() => {
  if (!notice) return;
  const timer = setTimeout(() => setNotice(''), 4_000);
  return () => clearTimeout(timer);
 }, [notice]);

 resultPresenter.current = (result, previous) => {
  if (result.error) return;
  const next = result.state.player;
  const sameSelection = useGym.getState().state.player?.id === next?.id;
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
  if (completedCourse) {
   setNotice(`训练课完成 · 恢复 ${completedCourse.restoredStamina ?? 0} 点体力 · 可以复盘或调整专项`);
   if (!panel) void gameAudio.play('evolution', soundEnabled());
  }
  if (next && trained) {
   const old = [previous.player, ...previous.bench].find(entry => entry?.id === next.id);
   const before = cooperationStatus(previous, old ?? null);
   const after = cooperationStatus(result.state, next);
   if (!before.complete && after.complete) setNotice(recommendationPayout(result.state, next).repeatTemplate ? `合作目标达成 · 声望照常，重复模板推荐合计 ${postgameRepeatTemplateCredits} 券` : `合作目标达成 · 推荐签约可额外获得 ${after.rewardCredits} 券`);
  }
 };

 const perform = async (action: GymAction) => {
  if (busyRef.current) return;
  busyRef.current = true;
  setBusy(true);
  setNotice('');
  try {
   const previous = useGym.getState().state;
   const result = await useGym.getState().act(action);
   if (result.error) return;
   resultPresenter.current(result, previous);
   if (action.type === 'recommend') {
    const reward = result.events.find(event => event.type === 'recommended');
    setNotice(`推荐成功 · 赞助券 +${reward?.credits ?? 0} · 声望 +${reward?.fame ?? 0}${reward?.repeatTemplate ? ' · 重复模板奖励' : reward?.isFirstPostgameRecommendation ? ' · 模板首次推荐奖励' : ''}`);
    setPanel(result.state.player ? null : 'recruit');
    setFeedback(null);
    setShots([]);
   }
   if (action.type === 'recruit') {if (panel === 'recruit') setPanel(null); setFeedback(null); setShots([]); setNotice(action.mode === 'selected' ? '精选新人已入馆，可选择训练计划并开始培养' : '新人已入馆，可以开始培养');}
   if (action.type === 'select-player') {setPanel(null); setFeedback(null); setShots([]);}
   if (action.type === 'set-training-plan') {
    setPanel(null);
    setNotice(`已开始${trainingStatus(result.state).plan.name}，每 10 球完成一课`);
   }
   if (action.type === 'accept-cooperation') {
    setPanel(null);
    setNotice('赞助合作已接取，培养进度从现在开始累计');
   }
   if (action.type === 'upgrade-gym') {setNotice('球馆晋级，新的项目与器材已开放'); void gameAudio.play('evolution', soundEnabled());}
  } catch {
   setNotice('操作暂未保存，请稍后重试');
  } finally {
   busyRef.current = false;
   setBusy(false);
  }
 };
 const onAction = (action: GymAction) => {void perform(action);};
 const training = trainingStatus(state);
 const cooperation = cooperationStatus(state);
 const experienceRequired = requiredExperience(player?.level ?? 0);
 const atCap = !!player && player.level >= playerLevelCap;
 const guidance = trainingGuidance(state);
 const offlineHint = state.gymLevel < 2 ? '离线训练将在球馆 Lv.2 开放，基础上限 30分钟。' : `离开或关闭页面后，仅开启自动的球员继续按体力、器材、专项和课程规则训练，每次最多结算 ${offlineDuration(offlineLimitMs(state))}，超出部分仅恢复体力。可升级离线课表延长上限。`;

 return <main className={`game-screen contract-game training-layout gym-game${reduced ? ' reduce-motion' : ''}`} aria-label="篮球训练馆" style={{'--game-max-width': `${visual.gameMaxWidthPx}px`, '--shoot-button-scale': visual.shootButtonScale} as CSSProperties}>
  <div className="game-viewport" ref={viewport}>
   <header className="game-topbar">
    <div className="cash-display"><GameIcon name="assets"/><span><small>赞助券</small><b>{state.credits}</b></span></div>
    <button className="month-stamp" aria-label="查看球馆经营" onClick={() => setPanel('club')}><span>球馆 <b>Lv.{state.gymLevel}</b></span></button>
    <button className="credit-display gym-home-control" aria-label="保存并返回首页" onClick={onHome}><small>返回首页</small><GameIcon name="home"/></button>
   </header>
   <GymScoreboard state={state} onClub={() => setPanel('club')} onPlayer={() => setPanel('roster')}/>
   <section className="game-player"><div className="player-value-card" data-tier={templateById(player?.templateId)?.tier ?? 'undiscovered'}>
    <PlayerTemplatePanel player={player ? displayedPlayer(player) : undefined} feedback={feedback} reduced={reduced} disabled={!player} showTrainingLevel={false} onDetails={() => setPanel('player')}/>
    <div className="player-value-footer"><div className={`player-value-amount value-tone-${valueTone(templateById(player?.templateId)?.tier)}`}><small>身价</small><FittedAmount fitHeight text={player ? formatValue(playerValue(state, player)) : '—'}/></div>
     <button className="sell-shortcut red-stamp" disabled={!player || busy} onClick={() => setPanel('recommend')}><span>推荐签约</span><i>›</i></button>
    </div>
   </div></section>
   <GymTrainingToolbar level={player?.level ?? 0} experience={player?.experience ?? 0} required={experienceRequired} atCap={atCap} cooperationReady={cooperation.complete} onExperience={() => setPanel('experience')} onTraining={() => setPanel('training')} onCooperation={() => setPanel('cooperation')}/>
   <section className="game-stage">
    <ShotScene feedback={feedback} shots={shots} hot={false} busy={shots.length > 0} reduced={reduced} hideOutcomeLabel onFinish={id => setShots(previous => id === undefined ? [] : previous.filter(shot => shot.id !== id))}/>
    <ShotStatusPop active={!!player && !panel} feedback={feedback} hoopScale={visual.hoopScale} reduced={reduced}/>
    <GymStamina state={state}/>
    <div className="stage-navigation">
     <div className="contract-stage-tools"><button className="stage-collection-button" onClick={() => setPanel('collection')} aria-label="打开图鉴"><span>图鉴</span></button></div>
    </div>
    {player && !notice && !store.actionError && <button className="court-equipment-status" aria-label="查看当前训练课程" onClick={() => setPanel('training')}>
     <span className="equipment-status-heading">{training.plan.name} <i>›</i></span>
     <span className="equipment-status-mini charge"><span>本课训练</span><b>{training.shots}/10 球</b></span>
     <span className="equipment-status-mini"><span>复盘恢复</span><b>最多 +{training.nextRecovery}</b></span>
     <small>已完成 {training.completedCourses} 课 · {atCap ? '等级已满' : player.autoEnabled ? `自动 ${automaticIntervalMs(state) / 1000}秒/球` : '手动 1秒/球'}</small>
     {guidance && <small>{atCap ? '训练已结束，按当前模板推荐结算' : recommendationPayout(state).repeatTemplate ? `重复模板推荐合计 ${postgameRepeatTemplateCredits} 券，声望照常` : guidance.allStatsMax ? '六维已满，可核对奖金后推荐' : guidance.nextBonus ? `下个奖金节点 Lv.${guidance.nextBonus.level}＋${guidance.nextBonus.tierName}` : '最高培养奖金已达成，可推荐兑现'}</small>}
    </button>}
    {(store.actionError || notice) && <div className="contract-status" role="status">{store.actionError || notice}</div>}
   </section>
   <footer className="game-dock contract-clean-dock"><div className="dock-canvas">
    <div className="dock-side dock-side-left">
     <button className="dock-control dock-bag css-dock-button" aria-label="打开背包" onClick={() => setPanel('inventory')}><DockButtonFrame/><DockIcon name="bag"/><strong>背包</strong></button>
     <button className="dock-control dock-month css-dock-button" aria-label="球馆经营" onClick={() => setPanel('club')}><DockButtonFrame/><DockIcon name="month"/><strong>球馆</strong></button>
    </div>
    <ShootButton mode={player ? 'shoot' : 'recruit'} disabled={!!player && (player.autoEnabled || player.stamina < 1 || player.level >= playerLevelCap) || busy || !!panel} reduced={reduced} cooldownUntil={player?.autoEnabled ? undefined : player?.nextShotAt ?? 0} cooldownDurationMs={1000} onShoot={() => {if (player) onAction({type: 'train', id: player.id}); else setPanel('recruit');}}/>
    <div className="dock-side dock-side-right">
     <button className="dock-control dock-shop css-dock-button" aria-label="器材商店" onClick={() => setPanel('shop')}><DockButtonFrame/><DockIcon name="shop"/><strong>商店</strong>{shopHasNewEquipment && <i className="gym-shop-new-dot" role="img" aria-label="新器材可购买"/>}</button>
     <button className="dock-control dock-rest css-dock-button" aria-label="推荐球员签约" disabled={!player || busy} onClick={() => setPanel('recommend')}><DockButtonFrame/><DockIcon name="rest"/><strong>推荐签约</strong></button>
    </div>
   </div></footer>
  </div>
  {panel && <ComicDialog title={panelTitles[panel]} onClose={() => setPanel(null)} variant={panel === 'collection' ? 'album' : panel === 'roster' ? 'roster' : 'standard'} className={panel === 'collection' ? 'collection-album-dialog' : panel === 'roster' ? 'scheme-roster-dialog' : panel === 'shop' ? 'gym-management-dialog gym-shop-dialog' : panel === 'inventory' ? 'gym-management-dialog gym-inventory-dialog' : 'gym-management-dialog'}><div className="contract-panel">
   {store.actionError && <p className="contract-notice" role="alert">{store.actionError}</p>}
   <div aria-busy={busy} className={busy ? 'gym-action-pending' : ''}>
    {panel === 'club' && <GymClubPanel state={state} onAction={onAction}/>}
    {panel === 'training' && <GymTrainingPanel key={player?.id} state={state} onAction={onAction}/>}
    {panel === 'cooperation' && <GymCooperationPanel key={player?.id} state={state} onAction={onAction}/>}
    {panel === 'shop' && <GymShopPanel state={state} onAction={onAction} busy={busy}/>}
    {panel === 'inventory' && <GymInventoryPanel state={state} onAction={onAction} busy={busy}/>}
    {panel === 'recommend' && <GymRecommendPanel state={state} onAction={onAction} onClose={() => setPanel(null)}/>}
    {panel === 'alumni' && <GymAlumniPanel state={state} onAction={onAction} loadAlumni={store.loadAlumni}/>}
    {panel === 'roster' && <GymRosterPanel state={state} onAction={onAction} busy={busy} onAlumni={() => setPanel('alumni')}/>}
    {panel === 'recruit' && <GymRecruitmentControls state={state} onAction={onAction} busy={busy} emptyCourt/>}
    {panel === 'collection' && <GymCollectionPanel state={state} onAction={onAction} busy={busy}/>}
    {panel === 'player' && player && <GymPlayerDetails player={player} onTraining={() => setPanel('training')}/>}
    {panel === 'experience' && <><h3>训练积累经验，升满后升级</h3><p>当前 Lv.{player?.level ?? 0} → {atCap ? '已达到等级上限' : `Lv.${(player?.level ?? 0) + 1} 需要 ${experienceRequired} 经验`}。{!atCap && `已积累 ${player?.experience ?? 0} 经验。`}</p><p>当前模式：维持 30% 获得 {trainingShotExperience(state, 'hold')} 经验，成功 60% 获得 {trainingShotExperience(state, 'success')} 经验，大成功 10% 获得 {trainingShotExperience(state, 'great')} 经验。剩余经验会保留到下一级。</p><p>手动基础为8／12／20经验；自动项目每级使每次自动投篮额外 +1 经验，在线与离线共同生效。只有升级时获得属性成长机会，天赋、训练专项与馆内器材共同影响成长方向；原球星模板规则保持不变。</p><p>每球消耗 1 体力，手动投篮冷却 1 秒，仅训练当前选中的球员。球馆 Lv.2 免费开放每人独立自动与离线训练，当前 {automaticIntervalMs(state) / 1000} 秒/球，可在球员名册中启停；自动中的球员暂停手动投篮。</p><p>{offlineHint}每 10 球完成一课，推荐时按培养成果与合作结算奖励。训练计划与推荐面板可查看培养奖金条件和预计训练时间。</p></>}
   </div>
  </div></ComicDialog>}
  {store.pendingOfflineReport && <GymOfflineReport report={store.pendingOfflineReport} onClose={store.dismissOfflineReport}/>}
 </main>;
}
