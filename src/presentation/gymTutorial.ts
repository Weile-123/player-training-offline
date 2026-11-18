import {create, type StoreApi, type UseBoundStore} from 'zustand';
import type {ReactNode} from 'react';
import type {GymStore} from '../gymStore';
import {dispatchGym, newGym, requiredExperience, type GymAction, type GymResult, type GymState} from '../game/gym/engine';
import {templateRules, shape} from '../game/contract/templates';
import {statKeys} from '../game/types';

export const gymTutorialSteps = ['intro', 'recruit-open', 'recruit-height', 'recruit-confirm', 'xp-first', 'train-first', 'growth-first', 'xp-second', 'train-second', 'growth-template', 'recommend-open', 'recommend-confirm', 'rewards', 'club-open', 'club', 'complete'] as const;
export type GymTutorialStep = typeof gymTutorialSteps[number];
export type GymPracticeStore = UseBoundStore<StoreApi<GymStore>>;
const firstTemplateLevel = Math.min(...templateRules.map(template => template.minLevel));

/** A disposable, empty Lv.1 gym. Recruitment still uses the actual engine. */
export function createGymTutorialState(now = Date.now()): GymState {
 const state = newGym(now, 20261117);
 state.player = null; state.nextPlayer = 1;
 return state;
}

/** Prepare two short level-ups; matching, growth and payouts remain real engine results. */
function preparePracticeRecruit(state: GymState): void {
 const player = state.player;
 if (!player) return;
 // All 48s are within the real birth-stat range and cover a rotation entry at every recruit height.
 player.stats = Object.fromEntries(statKeys.map(key => [key, 48])) as typeof player.stats;
 player.entryStats = {...player.stats}; player.lastStyle = shape(player.stats);
 player.level = player.peakLevel = Math.max(0, firstTemplateLevel - 2);
 player.experience = requiredExperience(player.level) - 1;
}

/** Only the practice XP changes between demonstrations; no real gym is referenced. */
export function prepareGymTutorialSecondUpgrade(practice: GymPracticeStore): void {
 const state = practice.getState().state, player = state.player;
 if (!player || player.templateId || player.level !== firstTemplateLevel - 1) return;
 practice.setState({state: {...state, player: {...player, experience: requiredExperience(player.level) - 1}}});
}

/** No repository, cloud transport, SDK, shared writer or real game subscription. */
export function createGymTutorialStore(now: () => number = Date.now): GymPracticeStore {
 const initial = createGymTutorialState(now());
 return create<GymStore>((set, get) => {
  const idle = async (): Promise<GymResult> => ({state: get().state, events: []});
  return {
   state: initial, hasSave: true, hydrating: false, authorityMode: 'local', authorityMessage: '',
   authorityCapabilities: {platformRewards: false, legacyAdoption: false}, actionError: '', saveMessage: '', isSuspended: false, pendingOfflineReport: null,
   hydrate: async () => {}, start: idle, tick: idle, resume: idle, suspend: async () => {}, flush: async () => {}, dismissOfflineReport: () => {},
   loadAlumni: async (offset = 0, limit = 20) => ({players: get().state.alumni.slice().reverse().slice(offset, offset + limit), total: get().state.alumni.length}),
   act: async action => {
    if (!['recruit', 'train', 'recommend'].includes(action.type)) return {state: get().state, events: [], error: '请按引导完成当前练习'};
    const result = dispatchGym(get().state, get().state.revision, action, Math.max(now(), get().state.updatedAt));
    if (!result.error && action.type === 'recruit') preparePracticeRecruit(result.state);
    set({state: result.state, actionError: result.error ?? ''});
    return result;
   },
  };
 });
}

export function gymTutorialAfterPanel(step: GymTutorialStep, panel: string | null): GymTutorialStep {
 if (step === 'recruit-open' && panel === 'recruit') return 'recruit-height';
 if (step === 'recommend-open' && panel === 'recommend') return 'recommend-confirm';
 if (step === 'club-open' && panel === 'club') return 'club';
 return step;
}

export function gymTutorialAfterAction(step: GymTutorialStep, action: GymAction, result: GymResult): GymTutorialStep {
 if (result.error) return step;
 if (step === 'recruit-confirm' && action.type === 'recruit' && result.events.some(event => event.type === 'recruited')) return 'xp-first';
 if (step === 'train-first' && action.type === 'train' && result.events.some(event => event.type === 'trained' && (event.levelGain ?? 0) > 0) && !result.state.player?.templateId) return 'growth-first';
 if (step === 'train-second' && action.type === 'train' && result.events.some(event => event.type === 'template-unlocked')) return 'growth-template';
 if (step === 'recommend-confirm' && action.type === 'recommend' && result.events.some(event => event.type === 'recommended')) return 'rewards';
 return step;
}

export type GymTutorialGuide = {selector: string; actionSelector?: string; label?: string; chapter: string; title: string; description: ReactNode; action?: boolean; next?: string};
export function gymTutorialGuide(step: GymTutorialStep, state: GymState): GymTutorialGuide | null {
 const player = state.player, alumnus = state.alumni.at(-1);
 const guides: Partial<Record<GymTutorialStep, GymTutorialGuide>> = {
  'recruit-open': {selector: '.gym-game .dock-shoot', chapter: '1 / 4 · 招募新人', title: '先招募第一位新人', description: '点击中间的「招募」，为球馆补充一位训练球员。', action: true},
  'recruit-height': {selector: '.gm-recruitment .gm-recruit-height', chapter: '1 / 4 · 招募新人', title: '选择新人的身高范围', description: '身高会影响可解锁的球星模板。点击任意一个选项，试试你想培养的类型。', action: true},
  'recruit-confirm': {selector: '.gm-recruitment .gm-recruit-submit', chapter: '1 / 4 · 招募新人', title: '确认招募，让新人入馆', description: '普通招募免费。练习会准备好接近升级的经验，方便你观察两次真实成长。', action: true},
  'xp-first': {selector: '.gym-game .gym-experience', chapter: '2 / 4 · 训练与成长', title: '经验满了，球员就会升级', description: `每次有效投篮都会获得经验。练习已准备好升级经验，现在距离 Lv.${(player?.level ?? 0) + 1} 只差一点。`, next: '开始投篮'},
  'train-first': {selector: '.gym-game .gym-experience', actionSelector: '.gym-game .dock-shoot', chapter: '2 / 4 · 训练与成长', title: '投一球，完成第一次升级', description: '点击下方「投篮」，观察经验条升级，再看看球员的成长。', action: true},
  'growth-first': {selector: '.gym-game .player-value-card', chapter: '2 / 4 · 训练与成长', title: '升级带来属性和身价成长', description: `球员已升至 Lv.${player?.level ?? 1}，属性、综合评分和身价随之提升。当前还未达到模板等级门槛，所以仍是待发掘新人。`, next: '再看一次升级'},
  'xp-second': {selector: '.gym-game .gym-experience', chapter: '2 / 4 · 训练与成长', title: '再升一级，看看模板变化', description: '练习已补齐下一次升级所需的经验。属性和身高也已满足入门模板要求，接下来仍由真实训练规则判断。', next: '继续投篮'},
  'train-second': {selector: '.gym-game .gym-experience', actionSelector: '.gym-game .dock-shoot', chapter: '2 / 4 · 训练与成长', title: '投出第二球，解锁球星模板', description: '等级、身高和属性同时达标时，球员会解锁对应模板。点击下方「投篮」完成这次升级。', action: true},
  'growth-template': {selector: '.gym-game .player-value-card', chapter: '2 / 4 · 训练与成长', title: '球星模板解锁了', description: '升级提高了身价，模板带来了球星头像、名字和级别。不是每次升级都会解锁模板，等级、身高和属性同时达标才会解锁。', next: '学习推荐签约'},
  'recommend-open': {selector: '.gym-game .gym-player-actions > button:first-child', chapter: '3 / 4 · 推荐签约', title: '培养完成，推荐签约', description: '推荐会让球员离馆，并按培养成果获得声望和赞助券。先打开结算，查看这次的奖励。', action: true},
  'recommend-confirm': {selector: '.gm-recommend-panel .gm-sheet-footer .gm-primary', chapter: '3 / 4 · 推荐签约', title: '确认推荐，领取奖励', description: '模板球员会留下校友档案，收藏也会保留。确认推荐后，训练位空出，可以免费补招下一位新人。', action: true},
  rewards: {selector: '.gym-game .gym-scoreboard', chapter: '3 / 4 · 推荐签约', title: '培养成果变成经营资源', description: `本次获得 ${alumnus?.rewardCredits ?? 0} 张赞助券、${alumnus?.rewardFame ?? 0} 点声望。赞助券用于建设和器材，声望推动球馆升级。`, next: '查看球馆成长'},
  'club-open': {selector: '.gym-game .gym-score-club', chapter: '4 / 4 · 经营球馆', title: '查看球馆的升级条件', description: '达到声望和培养成果要求后，就可以升级球馆，逐步开放更多经营功能。', action: true},
  club: {selector: '.gm-club-expansion', chapter: '4 / 4 · 经营球馆', title: '从小球馆，培养出传奇', description: '升级球馆会逐步开放更多功能。现在可以开始经营自己的传奇球馆了。', next: '开始经营'},
 };
 return guides[step] ?? null;
}
