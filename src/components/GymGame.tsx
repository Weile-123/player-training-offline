import {useEffect, useRef, useState, useSyncExternalStore, type CSSProperties} from 'react';
import {useGym} from '../gymStore';
import {automaticIntervalMs, cooperationStatus, playerLevelCap, playerValue, requiredExperience, shotExperience, staminaMax, trainingShotExperience, trainingStatus, type GymAction, type GymPlayer, type GymResult, type GymState} from '../game/gym/engine';
import {templateById} from '../game/templates';
import {match, templateRules} from '../game/contract/templates';
import {overallRating} from '../game/matching';
import {statKeys, type Player} from '../game/types';
import {statLabels} from '../game/config';
import {gameAudio} from '../presentation/audio';
import {soundEnabled} from '../presentation/sampleAudio';
import {decodePreferences, presentationConfig, type ShotFeedback} from '../presentation/feedback';
import {getAnimationConfig, subscribeAnimationConfig, watchAnimationConfig} from '../presentation/animationConfig';
import {useModalAccessibility} from '../presentation/useModalAccessibility';
import {valueTone} from '../presentation/valueTone';
import {assetUrl} from '../presentation/assetUrls';
import {itemCatalog} from '../game/contract/catalog';
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
import './TrainingLayout.css';
import '../equipment-status.css';
import './GymGame.css';

type Panel = 'club' | 'shop' | 'inventory' | 'recommend' | 'alumni' | 'roster' | 'collection' | 'experience' | 'player' | 'training' | 'cooperation' | null;
const panelTitles = {club: '球馆经营', shop: '器材商店', inventory: '器材与背包', recommend: '推荐签约', alumni: '球馆档案', roster: '球员名册', collection: '收藏图鉴', experience: '训练经验', player: '球员与模板目标', training: '训练计划', cooperation: '赞助合作'};
const outcomeLabels = {hold: '维持', success: '成功', great: '大成功'};
const tierNames = ['待发掘', '替补', '首发', '全明星', '巨星', '传奇'];
const tierIds = ['rotation', 'starter', 'star', 'superstar', 'legend'];
const supplyIds = ['item_005', 'item_001', 'item_002', 'item_003', 'item_004'] as const;

function displayedPlayer(player: GymPlayer): Player {
 return {id: player.id, name: player.name, age: 18, height: player.height, stats: player.stats, level: player.level, shots: player.shots, templateId: player.templateId, heat: 0, hotShots: 0, iceShots: 0};
}

function formatValue(value: string) {
 const amount = BigInt(value);
 if (amount < 10000n) return amount.toLocaleString();
 if (amount < 100000000n) return `${Number(amount / 100n) / 100}万`;
 if (amount < 1000000000000n) return `${Number(amount / 1000000n) / 100}亿`;
 return `${Number(amount / 10000000000n) / 100}万亿`;
}

function PlayerGoals({player, onTraining}: {player: GymPlayer; onTraining: () => void}) {
 const current = templateById(player.templateId);
 const currentTier = current ? tierIds.indexOf(current.tier) : -1;
 const diagnostic = match(player);
 const reasons = (row: typeof diagnostic.rows[number]) => {
  const rule = templateRules.find(template => template.id === row.id);
  const descriptions: Record<string, string> = {
   height: `身高不符：需要 ${row.height[0]}–${row.height[1]} cm，当前 ${player.height} cm`,
   level: `历史最高等级不足：需要 Lv.${row.minLevel}，当前 Lv.${player.peakLevel}`,
   core: `核心属性不足：${row.gaps.filter(gap => gap.gap > 0).map(gap => `${statLabels[gap.key]} ${gap.actual}/${gap.required}`).join('、')}`,
   aptitude: `能力覆盖不足：当前 ${(row.score * 100).toFixed(1)}%，需要 ${(row.threshold * 100).toFixed(0)}%`,
   'rating-floor': `综合评分不足：当前 ${overallRating(player.stats).toFixed(1)}，需要 ${rule?.ratingFloor ?? '达标'}`,
   'stat-floor': `单项属性下限不足：${statKeys.filter(key => player.stats[key] < (rule?.statFloor ?? 0)).map(key => `${statLabels[key]} ${player.stats[key]}/${rule?.statFloor}`).join('、')}`,
   'specialist-entry': '已符合专长匹配通道',
   'earned-appearance': '已获得此模板，保留历史外观',
   'lower-tier': '已有更高档候选，此模板暂不优先',
   stability: '保留当前稳定模板',
   rank: '其他候选匹配更优',
  };
  return row.reasons.map(reason => descriptions[reason] ?? '尚有其他匹配条件未满足').join('；');
 };
 const candidates = diagnostic.rows
  .filter(row => tierIds.indexOf(row.tier) > currentTier)
  .sort((a, b) => Number(a.reasons.includes('height')) - Number(b.reasons.includes('height')) || a.minLevel - b.minLevel || a.gaps.reduce((sum, item) => sum + item.gap, 0) - b.gaps.reduce((sum, item) => sum + item.gap, 0))
  .slice(0, 8);
 const retained = diagnostic.rows.find(row => row.id === player.templateId && row.reasons.includes('earned-appearance'));
 return <div className="gym-player-goals">
  <h3>{player.name} · {player.height} cm</h3>
  <p>训练 Lv.{player.level} · 已投篮 {player.shots} 次 · 当前模板 {current?.name ?? '待发掘'}</p>
  <p className="gym-muted">按原版身高、等级、核心能力与风格规则匹配。经验升满后升级并检查模板。</p>
  {retained && <p className="gym-muted">{reasons(retained)}</p>}
  <button className="secondary" onClick={onTraining}>调整训练计划，补强目标能力</button>
  <h3>{currentTier === 4 ? '已获得传奇模板' : '下一档模板目标'}</h3>
  {candidates.map(row => <article className="gym-goal-card" key={row.id}>
   <strong>{row.name} <small>{tierNames[tierIds.indexOf(row.tier) + 1]}</small></strong>
   <p>等级 {player.peakLevel}/{row.minLevel} · 身高 {row.height[0]}–{row.height[1]} cm · 能力覆盖 {(row.score * 100).toFixed(1)}% / {(row.threshold * 100).toFixed(0)}% · 风格相似度 {(row.styleScore * 100).toFixed(1)}%</p>
   <div>{row.gaps.map(gap => <span key={gap.key} className={gap.gap ? '' : 'is-met'}>{statLabels[gap.key]} {gap.actual}/{gap.required}</span>)}</div>
   <p className="gym-muted">{row.eligible ? '基础条件已满足。' : ''}{reasons(row) || '已满足此模板的匹配条件。'}</p>
  </article>)}
  {!candidates.length && <p>可继续培养当前球员，或推荐签约后选择不同身高的新人，收集其他球星模板。</p>}
 </div>;
}

export default function GymGame({onHome}: {onHome: () => void}) {
 const store = useGym();
 const state = store.state;
 const player = state.player;
 const [panel, setPanel] = useState<Panel>(null);
 const [busy, setBusy] = useState(false);
 const [feedback, setFeedback] = useState<ShotFeedback | null>(null);
 const [shots, setShots] = useState<ShotFeedback[]>([]);
 const [notice, setNotice] = useState('');
 const [preference, setPreference] = useState<'any' | 'guard' | 'forward' | 'center'>('any');
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
   if (!before.complete && after.complete) setNotice(`合作目标达成 · 推荐签约可额外获得 ${after.rewardCredits} 券`);
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
    setNotice(`推荐成功 · 赞助券 +${reward?.credits ?? 0} · 声望 +${reward?.fame ?? 0}`);
    setPanel(null);
    setFeedback(null);
    setShots([]);
   }
   if (action.type === 'recruit') {setFeedback(null); setShots([]);}
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
 const capacity = staminaMax(state);
 const training = trainingStatus(state);
 const cooperation = cooperationStatus(state);
 const cooperationShots = cooperation.requirements[0];
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
    <PlayerTemplatePanel player={player ? displayedPlayer(player) : undefined} feedback={feedback} reduced={reduced} disabled={!player} onDetails={() => setPanel('player')}/>
    <div className="player-value-footer"><div className={`player-value-amount value-tone-${valueTone(templateById(player?.templateId)?.tier)}`}><small>身价</small><FittedAmount fitHeight text={player ? formatValue(playerValue(state, player)) : '—'}/></div>
     <button className="sell-shortcut red-stamp" disabled={!player || busy} onClick={() => setPanel('recommend')}><span>推荐签约</span><i>›</i></button>
    </div>
   </div></section>
   <button className="probability-panel gym-experience" onClick={() => setPanel('experience')} aria-label="查看训练经验">
    <div className="probability-frame"><div className="gym-experience-inner"><span className="gym-experience-label"><b>Lv.{player?.level ?? 0}</b><small>训练经验</small></span><div className="gym-experience-track" role="progressbar" aria-label="当前球员训练经验" aria-valuemin={0} aria-valuemax={atCap ? 1 : experienceRequired} aria-valuenow={atCap ? 1 : player?.experience ?? 0} aria-valuetext={atCap ? '已满级' : `${player?.experience ?? 0}/${experienceRequired} 经验`}><i style={{width: `${atCap ? 100 : Math.min(100, (player?.experience ?? 0) / experienceRequired * 100)}%`}}/></div><span className="gym-experience-readout"><b>{atCap ? '已满级' : `${player?.experience ?? 0}/${experienceRequired}`}</b><small aria-live="polite">{feedback?.player.id === player?.id ? feedback?.message : '点击查看升级需求'}</small></span></div></div>
   </button>
   <section className="game-stage">
    <ShotScene feedback={feedback} shots={shots} hot={false} busy={shots.length > 0} reduced={reduced} hideOutcomeLabel onFinish={id => setShots(previous => id === undefined ? [] : previous.filter(shot => shot.id !== id))}/>
    <ShotStatusPop active={!!player && !panel} feedback={feedback} hoopScale={visual.hoopScale} reduced={reduced}/>
    <GymStamina state={state}/>
    <div className="stage-navigation">
     <div className="contract-stage-tools"><button className="stage-collection-button" onClick={() => setPanel('collection')} aria-label="打开图鉴"><span>图鉴</span></button></div>
     <div className="contract-stage-tools gym-training-tools">
      <button className="stage-collection-button" onClick={() => setPanel('training')} aria-label="选择训练计划">训练计划</button>
      <button className="stage-collection-button" data-ready={cooperation.complete} onClick={() => setPanel('cooperation')} aria-label="赞助合作">{cooperation.complete ? '合作已达成' : cooperation.offer && cooperationShots ? `合作 ${cooperationShots.current}/${cooperationShots.required}` : '赞助合作'}</button>
     </div>
    </div>
    {player && !notice && !store.actionError && <button className="court-equipment-status" aria-label="查看当前训练课程" onClick={() => setPanel('training')}>
     <span className="equipment-status-heading">{training.plan.name} <i>›</i></span>
     <span className="equipment-status-mini charge"><span>本课训练</span><b>{training.shots}/10 球</b></span>
     <span className="equipment-status-mini"><span>复盘恢复</span><b>最多 +{training.nextRecovery}</b></span>
     <small>已完成 {training.completedCourses} 课 · {atCap ? '等级已满' : player.autoEnabled ? `自动 ${automaticIntervalMs(state) / 1000}秒/球` : '手动 1秒/球'}</small>
     {guidance && <small>{atCap ? '训练已结束，按当前模板推荐结算' : guidance.allStatsMax ? '六维已满，可核对奖金后推荐' : guidance.nextBonus ? `下个奖金节点 Lv.${guidance.nextBonus.level}＋${guidance.nextBonus.tierName}` : '最高培养奖金已达成，可推荐兑现'}</small>}
    </button>}
    {(store.actionError || notice) && <div className="contract-status" role="status">{store.actionError || notice}</div>}
    {!player && <div className="gym-empty-court"><div><h2>下一位新星，等你发掘</h2><p>当前球馆有 {state.gymLevel} 个训练位，新人带着满体力入馆。</p>{state.gymLevel >= 2 && <select aria-label="新人身高偏好" value={preference} onChange={event => setPreference(event.target.value as typeof preference)}><option value="any">不限身高</option><option value="guard">后卫型 178–194 cm</option><option value="forward">锋线型 195–205 cm</option><option value="center">内线型 206–218 cm</option></select>}<button className="primary" disabled={busy} onClick={() => onAction({type: 'recruit', preference})}>免费招募下一位</button></div></div>}
   </section>
   <footer className="game-dock contract-clean-dock"><div className="dock-canvas">
    <div className="consumable-bar"><div className="consumable-grid" role="group" aria-label="一次性物品，固定五格">
     {supplyIds.map(id => {
      const item = itemCatalog.find(entry => entry.id === id)!;
      const available = id === 'item_005';
      const quantity = available ? state.inventory.drink : 0;
      return <button key={id} className="consumable-slot" disabled={!available || !player || quantity < 1 || player.stamina >= capacity || busy} title={available ? '恢复 10 点体力' : `${item.name} · 后续开放`} aria-label={available ? `使用运动饮料，数量${quantity}` : `${item.name}，后续开放`} onClick={() => {if (player && available) onAction({type: 'use-drink', id: player.id});}}><img className="consumable-icon" src={assetUrl(`art/consumables/${item.icon}.png`)} alt="" aria-hidden="true" draggable={false}/><span><strong>{item.shortName}</strong><b>×{quantity}</b></span></button>;
     })}
    </div></div>
    <div className="dock-side dock-side-left">
     <button className="dock-control dock-bag css-dock-button" aria-label="打开背包" onClick={() => setPanel('inventory')}><DockButtonFrame/><DockIcon name="bag"/><strong>背包</strong></button>
     <button className="dock-control dock-month css-dock-button" aria-label="球馆经营" onClick={() => setPanel('club')}><DockButtonFrame/><DockIcon name="month"/><strong>球馆</strong></button>
    </div>
    <ShootButton disabled={!player || player.autoEnabled || player.stamina < 1 || player.level >= playerLevelCap || busy || !!panel} reduced={reduced} cooldownUntil={player?.autoEnabled ? undefined : player?.nextShotAt ?? 0} cooldownDurationMs={1000} onShoot={() => {if (player) onAction({type: 'train', id: player.id});}}/>
    <div className="dock-side dock-side-right">
     <button className="dock-control dock-shop css-dock-button" aria-label="器材商店" onClick={() => setPanel('shop')}><DockButtonFrame/><DockIcon name="shop"/><strong>商店</strong></button>
     <button className="dock-control dock-rest css-dock-button" aria-label="推荐球员签约" disabled={!player || busy} onClick={() => setPanel('recommend')}><DockButtonFrame/><DockIcon name="rest"/><strong>推荐签约</strong></button>
    </div>
   </div></footer>
  </div>
  {panel && <ComicDialog title={panelTitles[panel]} onClose={() => setPanel(null)} variant={panel === 'collection' ? 'album' : panel === 'roster' ? 'roster' : 'standard'} className={panel === 'collection' ? 'collection-album-dialog' : panel === 'roster' ? 'scheme-roster-dialog' : 'gym-management-dialog'}><div className="contract-panel">
   {store.actionError && <p className="contract-notice" role="alert">{store.actionError}</p>}
   <div aria-busy={busy} className={busy ? 'gym-action-pending' : ''}>
    {panel === 'club' && <GymClubPanel state={state} onAction={onAction}/>}
    {panel === 'training' && <GymTrainingPanel key={player?.id} state={state} onAction={onAction}/>}
    {panel === 'cooperation' && <GymCooperationPanel key={player?.id} state={state} onAction={onAction}/>}
    {panel === 'shop' && <GymShopPanel state={state} onAction={onAction} busy={busy}/>}
    {panel === 'inventory' && <><GymInventoryPanel state={state} onAction={onAction} busy={busy}/><button className="secondary inventory-home-button" onClick={onHome}><GameIcon name="home"/>保存并返回首页</button></>}
    {panel === 'recommend' && <GymRecommendPanel state={state} onAction={onAction} onClose={() => setPanel(null)}/>}
    {panel === 'alumni' && <GymAlumniPanel state={state} onAction={onAction}/>}
    {panel === 'roster' && <GymRosterPanel state={state} onAction={onAction} onAlumni={() => setPanel('alumni')}/>}
    {panel === 'collection' && <GymCollectionPanel state={state} onAction={onAction}/>}
    {panel === 'player' && player && <PlayerGoals player={player} onTraining={() => setPanel('training')}/>}
    {panel === 'experience' && <><h3>训练积累经验，升满后升级</h3><p>当前 Lv.{player?.level ?? 0} → {atCap ? '已达到等级上限' : `Lv.${(player?.level ?? 0) + 1} 需要 ${experienceRequired} 经验`}。{!atCap && `已积累 ${player?.experience ?? 0} 经验。`}</p><p>当前模式：维持 30% 获得 {trainingShotExperience(state, 'hold')} 经验，成功 60% 获得 {trainingShotExperience(state, 'success')} 经验，大成功 10% 获得 {trainingShotExperience(state, 'great')} 经验。剩余经验会保留到下一级。</p><p>手动基础为8／12／20经验；自动项目每级使每次自动投篮额外 +1 经验，在线与离线共同生效。只有升级时获得属性成长机会，天赋、训练专项与馆内器材共同影响成长方向；原球星模板规则保持不变。</p><p>每球消耗 1 体力，手动投篮冷却 1 秒，仅训练当前选中的球员。球馆 Lv.2 免费开放每人独立自动与离线训练，当前 {automaticIntervalMs(state) / 1000} 秒/球，可在球员名册中启停；自动中的球员暂停手动投篮。</p><p>{offlineHint}每 10 球完成一课，推荐时按培养成果与合作结算奖励。训练计划与推荐面板可查看下一奖金节点、模板缺口和预计训练时间。</p></>}
   </div>
  </div></ComicDialog>}
  {store.pendingOfflineReport && <GymOfflineReport report={store.pendingOfflineReport} onClose={store.dismissOfflineReport}/>}
 </main>;
}
