import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useGym} from '../../src/gymStore';
import {dispatchGym, newGym, playerValue, type GymAction, type GymAlumnus, type GymPlayer, type GymResult, type GymState} from '../../src/game/gym/engine';
import {validGym} from '../../src/game/gym/save';
import {settleOfflineGym, type OfflineTrainingReport} from '../../src/game/gym/offline';
import {equipmentCatalog} from '../../src/game/gym/catalog';
import {templateById} from '../../src/game/templates';
import {statKeys} from '../../src/game/types';
import {installGameInteractions} from '../../src/presentation/browserInteractions';
import {useModalAccessibility} from '../../src/presentation/useModalAccessibility';
import GymGame from '../../src/components/GymGame';
import {GymAlumniPanel, GymInventoryPanel, GymRosterPanel} from '../../src/components/GymPanels';
import {GymCareerPanel} from '../../src/components/GymCareerPanel';
import {GymOfflineReport} from '../../src/components/GymOfflineReport';
import {ComicDialog} from '../../src/components/ComicDialog';
import {HomeSettings} from '../../src/components/HomeSettings';
import '../../src/fonts/fonts.css';
import '../../src/styles.css';
import '../../src/home.css';
import '../../src/gameplay.css';
import '../../src/components/ComicDialog.css';
import '../../src/contract.css';
import '../../src/scheme-a.css';
import '../../src/commerce.css';
import '../../src/collection-album.css';
import '../../src/career-dialogs.css';
import '../../src/leaderboard.css';
import '../../src/career-collection.css';
import '../../src/player-tiers.css';
import '../../src/fonts/typography.css';

function fixture(): GymState {
  const now = Date.now();
  const state = newGym(now - 86_400_000, 20261116);
  state.updatedAt = now;
  state.gymLevel = 3;
  state.credits = 180;
  state.fame = 860;
  state.projects = {endurance: 1, recovery: 1, recruitment: 1, equipment: 0, automation: 1, offline: 1};
  state.inventory = {drink: 2, brace: 0, timer: 0, chalk: 2, supplement: 2};
  state.ownedEquipment = ['relic_014', 'relic_002', 'relic_017', 'relic_007', 'relic_034', 'relic_006'];
  state.equippedEquipment = state.ownedEquipment.slice(0, 4);
  for (const id of state.ownedEquipment) {
    state.purchasePrices[id] = equipmentCatalog.find(item => item.id === id)!.price;
    state.collectedEquipment[id] = {firstAt: state.createdAt};
  }
  const makePlayer = (number: number, templateId: string, level: number, shots: number, stamina: number): GymPlayer => {
    const template = templateById(templateId)!;
    const player = newGym(state.createdAt + number * 1_000, number + 70).player!;
    player.id = `gym-p${number}`;
    player.name = `新秀 ${number}`;
    player.enteredGymLevel = 3;
    player.height = Math.ceil((template.height[0] + template.height[1]) / 2);
    player.stats = {...template.stats};
    player.entryStats = Object.fromEntries(statKeys.map(key => [key, 24])) as GymPlayer['entryStats'];
    player.level = player.peakLevel = level;
    player.templateId = templateId;
    player.highestTier = template.tier;
    player.experience = 42;
    player.shots = shots;
    player.training = {planId: 'balanced', shots: shots % 10, completedCourses: Math.floor(shots / 10)};
    player.stamina = stamina;
    player.autoEnabled = false;
    player.nextShotAt = now;
    return player;
  };
  state.player = makePlayer(1, 'jason-terry', 18, 187, 12);
  state.player.cooperation = {id: `${state.player.id}:basic`, playerId: state.player.id, acceptedShots: 167, acceptedCourses: 16};
  state.bench = [makePlayer(2, 'conley', 12, 123, 7), makePlayer(3, 'caruso', 8, 85, 18)];
  for (const [index, templateId] of ['jason-terry', 'jason-terry', 'jordan', 'caruso', 'jason-terry'].entries()) {
    const player = makePlayer(index + 4, templateId, templateId === 'jordan' ? 36 : 20 + index, templateId === 'jordan' ? 400 : 240 + index * 10, 10);
    const alumnus: GymAlumnus = {...player, recommendedAt: now - (5 - index) * 3_600_000, rewardCredits: index > 0 ? 1 : 6, rewardFame: 80 + index * 10, finalValue: playerValue(state, player)};
    state.alumni.push(alumnus);
  }
  state.nextPlayer = 9;
  for (const player of [state.player, ...state.bench, ...state.alumni]) {
    state.collection[player.templateId!] = {firstAt: state.createdAt + 100_000, highestRating: 80, highestValue: playerValue(state, player)};
  }
  state.postgameRecommendedTemplates = ['jason-terry', 'jordan', 'caruso'];
  if (!validGym(state)) throw new Error('Preview fixture does not match the current game schema');
  return state;
}

/** A genuine three-player settlement, simulated in its own memory state. */
function offlineSample(): OfflineTrainingReport {
  const state = fixture();
  for (const player of [state.player!, ...state.bench]) player.autoEnabled = true;
  const settled = settleOfflineGym(state, state.updatedAt + 2 * 3_600_000, 45 * 60_000);
  if (!settled.report || settled.report.players.length !== 3) throw new Error('Preview offline sample must settle all three trainees');
  return settled.report;
}
const sampleReport = offlineSample();

const current = () => useGym.getState().state;
const result = (): GymResult => ({state: current(), events: []});
const act = async (action: GymAction) => {
  const state = current();
  const outcome = dispatchGym(state, state.revision, action, Math.max(Date.now(), state.updatedAt));
  useGym.setState({state: outcome.state, actionError: outcome.error ?? ''});
  return outcome;
};
const reset = () => useGym.setState({state: fixture(), hasSave: true, hydrating: false, actionError: '', saveMessage: '测试样例，不写存档', isSuspended: false, pendingOfflineReport: null});
useGym.setState({
  hydrate: async () => {},
  loadAlumni: async (offset = 0, limit = 20) => ({players: current().alumni.slice().reverse().slice(offset, offset + limit), total: current().alumni.length}),
  act,
  tick: () => act({type: 'auto-step'}),
  resume: async () => {useGym.setState({isSuspended: false}); return result();},
  suspend: async () => {useGym.setState({isSuspended: true});},
  flush: async () => {},
  start: async () => {reset(); return result();},
  dismissOfflineReport: () => useGym.setState({pendingOfflineReport: null}),
});
reset();
// Only this storage-isolated QA page exposes fixture controls; the game entry does not import it.
Object.assign(window, {__gymPreviewSetStamina: (stamina: number) => {
  const state = current();
  useGym.setState({state: {...state, updatedAt: Date.now(), player: state.player ? {...state.player, stamina, recoveryMs: 0} : null}});
  return {stamina: current().player?.stamina, count: current().staminaRewardCount ?? 0, level: current().player?.level};
}});
const stopInteractions = installGameInteractions(document);
import.meta.hot?.dispose(stopInteractions);

type View = 'court' | 'inventory' | 'roster' | 'alumni' | 'career' | 'offline' | 'settings';
const viewLabels: Record<View, string> = {court: '主场', inventory: '背包', roster: '名册', alumni: '校友', career: '球馆档案', offline: '离线报告', settings: '设置'};
function Preview() {
  const store = useGym();
  const [view, setView] = useState<View>('court');
  const [generation, setGeneration] = useState(0);
  useModalAccessibility();
  const onAction = (action: GymAction) => {void act(action);};
  return <>
    <header className="preview-toolbar"><strong>测试样例，不写存档</strong><nav aria-label="验收预览"><div>{(Object.keys(viewLabels) as View[]).map(key => <button type="button" key={key} aria-pressed={view === key} onClick={() => setView(key)}>{viewLabels[key]}</button>)}</div><button type="button" onClick={() => {reset(); setView('court'); setGeneration(old => old + 1);}}>重置样例</button></nav></header>
    <div id="preview-app"><GymGame key={generation} onHome={() => setView('settings')}/></div>
    {view === 'settings' && <HomeSettings cloudEnabled={false} onClose={() => setView('court')}/>}
    {view === 'offline' && <GymOfflineReport report={sampleReport} onClose={() => setView('court')}/>}
    {view !== 'court' && view !== 'settings' && view !== 'offline' && <ComicDialog title={view === 'inventory' ? '器材背包' : view === 'roster' ? '球员名册' : view === 'career' ? '球馆档案' : '校友档案'} variant={view === 'roster' ? 'roster' : view === 'career' ? 'album' : 'standard'} className={view === 'inventory' ? 'gym-management-dialog gym-inventory-dialog' : view === 'roster' ? 'scheme-roster-dialog' : view === 'career' ? 'career-statistics-dialog gym-career-dialog gym-design-dialog' : 'gym-management-dialog'} onClose={() => setView('court')}><div className="contract-panel"><div aria-busy={false}>
      {view === 'inventory' && <GymInventoryPanel state={store.state} onAction={onAction} busy={false}/>}
      {view === 'roster' && <GymRosterPanel state={store.state} onAction={onAction} busy={false} onAlumni={() => setView('alumni')}/>}
      {view === 'alumni' && <GymAlumniPanel state={store.state} onAction={onAction} loadAlumni={store.loadAlumni}/>}
      {view === 'career' && <GymCareerPanel state={store.state} loadAlumni={store.loadAlumni}/>}
    </div></div></ComicDialog>}
    <style>{`
      html,body,#root{width:100%;height:100%;margin:0;overflow:hidden;--preview-toolbar-height:76px}
      body.ui-test-preview{background:#091c28}
      .preview-toolbar{position:relative;z-index:1000;height:var(--preview-toolbar-height);display:flex;flex-direction:column;justify-content:center;gap:4px;padding:4px 8px;border-bottom:1px solid #a99260;background:#102c38;color:#f8e7bf;font-family:'Microsoft YaHei',sans-serif;box-sizing:border-box}
      .preview-toolbar>strong{font-size:10px;line-height:1.1;color:#edc26b;letter-spacing:.4px}
      .preview-toolbar nav,.preview-toolbar nav>div{display:flex;align-items:center;gap:5px}
      .preview-toolbar nav{justify-content:space-between;align-items:flex-start}
      .preview-toolbar nav>div{flex:1;min-width:0;flex-wrap:wrap}
      .preview-toolbar button{padding:2px 9px;min-width:0;min-height:21px;border:1px solid #ad976a;background:#264452;color:#f7e7c4;font:11px/1.2 'Microsoft YaHei',sans-serif;border-radius:2px}
      .preview-toolbar button[aria-pressed=true]{background:#b53227}
      #preview-app{height:calc(100dvh - var(--preview-toolbar-height));width:100%}
      .ui-test-preview .game-screen.comic-dialog-layer{inset:var(--preview-toolbar-height) 0 0;height:calc(100dvh - var(--preview-toolbar-height))}
      .ui-test-preview .game-screen.comic-dialog-layer .comic-dialog{max-height:calc(100dvh - var(--preview-toolbar-height) - 32px)}
      .ui-test-preview .game-screen.comic-dialog-layer .comic-dialog.gym-inventory-dialog{height:min(820px,calc(100dvh - var(--preview-toolbar-height) - 32px))}
    `}</style>
  </>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
