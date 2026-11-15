import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {
  activePlayers, advanceGym, cooperationOffers, dispatchGym, equipmentCapacity,
  equipmentCatalog, equipmentEffects, equipmentOffer, experienceForLevel, gymUpgrade,
  maximumRecommendationCredits, newGym, projectCost, projectOffer, projects,
  recommendation, recommendationPayout, recoverySeconds, staminaMax, trainPlayer,
  type GymAction, type GymAlumnus, type GymEvent, type GymPlayer, type GymState,
} from '../src/game/gym/engine';
import {gymEconomyVersion} from '../src/game/gym/catalog';
import {validGym} from '../src/game/gym/save';
import {trainingPlans} from '../src/game/gym/training';
import {templateById} from '../src/game/templates';
import {statKeys, type Stats, type StatKey} from '../src/game/types';
import {random} from '../src/game/contract/random';
import {recentAlumniLimit} from '../src/game/gym/history';

type Direction = 'shooting' | 'finishing' | 'interior';
type Mode = 'free' | 'selected';
const directions: Direction[] = ['shooting', 'finishing', 'interior'];
const focusKeys = (direction: Direction) => trainingPlans.find(p => p.id === direction)!.focusKeys;
const otherKeys = (direction: Direction) => statKeys.filter(k => !focusKeys(direction).includes(k));
const start = 1_800_000_000_000;
const cost = 36;
const seeds = Number(process.env.SELECTED_AUDIT_SEEDS ?? 128);
const journeySeeds = Number(process.env.SELECTED_AUDIT_JOURNEY_SEEDS ?? 2);
const journeyHours = Number(process.env.SELECTED_AUDIT_JOURNEY_HOURS ?? 1);
const sections = (process.env.SELECTED_AUDIT_SECTIONS ?? 'controlled,journey').split(',');
const output = process.env.SELECTED_AUDIT_OUTPUT ?? `docs/balance/selected-recruitment-v${gymEconomyVersion}-20261115.json`;
assert.ok(Number.isInteger(seeds) && seeds >= 1 && seeds <= 1024);
assert.ok(Number.isInteger(journeySeeds) && journeySeeds >= 1 && journeySeeds <= 8);
assert.ok(journeyHours > 0 && journeyHours <= 24);
assert.ok(sections.length > 0 && sections.every(s => ['controlled', 'journey'].includes(s)));
assert.equal(maximumRecommendationCredits, 33);
const clone = <T>(value: T): T => structuredClone(value);
const tier = (player: GymPlayer) => [null, 'rotation', 'starter', 'star', 'superstar', 'legend'].indexOf(templateById(player.templateId)?.tier ?? null);
const mean = (values: number[]) => values.reduce((sum, n) => sum + n, 0) / values.length;
function distribution(values: number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  return values.length ? {count: values.length, mean: mean(values), min: ordered[0], p50: ordered[Math.ceil(ordered.length * .5) - 1], p90: ordered[Math.ceil(ordered.length * .9) - 1], max: ordered.at(-1)} : null;
}
const desiredKit = ['capacity', 'recovery', 'course', 'experience', 'automation', 'brand', 'cooperation', 'offline']
  .map(family => equipmentCatalog.filter(e => e.family === family).sort((a, b) => b.grade - a.grade)[0].id);

/** Every mutation affecting cash uses the real dispatcher. Training uses its
 * real trainPlayer/advanceGym event path, as offline replay does; no synthetic
 * stats, rewards, matching results or coupon grants are used during careers. */
class Driver {
  state: GymState;
  now: number;
  matched = new Set<string>();
  shots = 0;
  spent = 0;
  selectedSpent = 0;
  constructionSpent = 0;
  managementActions = 0;
  rawRecommendationCredits = 0;
  withheldRecommendationCredits = 0;
  archivedAlumni: GymAlumnus[];
  transactions: {seconds: number; type: string; amount: number; playerId?: string; id?: string}[] = [];
  constructor(state: GymState, archiveRecords: GymAlumnus[] = []) {
    this.state = clone(state); this.now = state.updatedAt; this.archivedAlumni = clone(archiveRecords);
    assert.equal(this.archivedAlumni.length, state.alumniArchive?.count ?? 0);
  }
  allAlumni() {return [...this.archivedAlumni, ...this.state.alumni];}
  /** The same aggregation as history.ts compact; the audit retains complete
   * archived players outside the hot domain state instead of deleting evidence. */
  compactHistory() {
    const overflow = Math.max(0, this.state.alumni.length - recentAlumniLimit);
    if (!overflow) return;
    const archive = {...(this.state.alumniArchive ?? {id: `${this.state.createdAt}-${this.state.seed}`, count: 0,
      effectiveCount: 0, legendCount: 0, bestTier: 0})};
    const additions = this.state.alumni.slice(0, overflow);
    for (const player of additions) {
      const reward = recommendation(player);
      if (reward.growth > 0 && reward.tier >= 1) {
        archive.effectiveCount++;
        if (reward.tier === 5) archive.legendCount++;
        archive.bestTier = Math.max(archive.bestTier, reward.tier);
      }
    }
    archive.count += overflow;
    this.archivedAlumni.push(...additions);
    this.state = {...this.state, alumniArchive: archive, alumni: this.state.alumni.slice(overflow)};
    assert.equal(this.archivedAlumni.length, archive.count);
    assert.ok(this.state.alumni.length <= recentAlumniLimit);
  }
  command(action: GymAction) {
    const previous = this.state.credits;
    const payout = action.type === 'recommend' ? recommendationPayout(this.state, this.state.player) : null;
    const result = dispatchGym(this.state, this.state.revision, action, this.now);
    assert.equal(result.error, undefined, JSON.stringify(action));
    this.state = result.state;
    if (action.type === 'recommend') this.compactHistory();
    const difference = this.state.credits - previous;
    if (payout) {
      assert.equal(difference, payout.credits);
      this.rawRecommendationCredits += payout.rawCredits;
      this.withheldRecommendationCredits += payout.withheldCredits;
    }
    if (difference < 0) this.spent -= difference;
    if (action.type === 'recruit' && 'mode' in action && action.mode === 'selected') {
      assert.equal(difference, -cost);
      this.selectedSpent -= difference;
    }
    if (action.type === 'upgrade-gym') this.constructionSpent -= difference;
    if (difference) this.transactions.push({seconds: (this.now - start) / 1000, type: action.type, amount: difference,
      ...('id' in action ? {id: String(action.id)} : {}), ...('playerId' in action ? {playerId: action.playerId} : {})});
    if (action.type === 'train') this.shots += result.events.filter(e => e.type === 'trained').length;
    else this.managementActions++;
    assert.ok(this.state.credits >= 0);
  }
  select(player: GymPlayer) {if (this.state.player?.id !== player.id) this.command({type: 'select-player', id: player.id});}
  shoot(horizon: number) {
    const due = Math.min(...activePlayers(this.state).filter(p => p.level < 99).map(p => Math.max(this.now, p.nextShotAt,
      p.stamina < 1 ? this.now + recoverySeconds(this.state) * 1000 - p.recoveryMs : 0)));
    assert.ok(Number.isFinite(due), 'No trainable athlete');
    this.now = Math.min(due, horizon);
    this.state = advanceGym(this.state, this.now);
    if (due > horizon) return false;
    if (this.state.gymLevel === 1) this.command({type: 'train', id: this.state.player!.id});
    else {
      const events: GymEvent[] = [];
      const players = activePlayers(this.state).filter(p => p.autoEnabled && p.level < 99 && p.stamina >= 1 && p.nextShotAt <= this.now)
        .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      assert.ok(players.length, JSON.stringify({reason: 'Event advanced without an enabled player', now: this.now, players: activePlayers(this.state).map(p => ({id: p.id, level: p.level, stamina: p.stamina, auto: p.autoEnabled, next: p.nextShotAt}))}));
      for (const p of players) {trainPlayer(this.state, p, this.now, events, this.matched.has(p.id)); this.matched.add(p.id);}
      this.shots += events.filter(e => e.type === 'trained').length;
    }
    assert.ok(this.shots < 2_000_000, 'Shot safety bound');
    return true;
  }
  initialize(player: GymPlayer, direction?: Direction) {
    this.select(player);
    if (direction && this.state.player!.training.planId !== direction) this.command({type: 'set-training-plan', id: direction, playerId: player.id});
    const offer = cooperationOffers(this.state, this.state.player)[2];
    if (!this.state.player!.cooperation) this.command({type: 'accept-cooperation', id: offer.id, playerId: player.id});
    if (this.state.gymLevel >= 2 && !this.state.player!.autoEnabled && this.state.player!.level < 99) this.command({type: 'set-auto', id: player.id, enabled: true});
  }
}

function birth(player: GymPlayer) {
  return {id: player.id, stats: {...player.stats}, entryStats: {...player.entryStats}, height: player.height,
    bias: {...player.bias}, matchSeed: player.matchSeed, lastStyle: {...player.lastStyle}};
}

function controlledFixture(seed: number, recruitmentProject: number) {
  const state = newGym(start, seed);
  // Explicit laboratory fixture: remove the initial free athlete and provision
  // 36 coupons plus infrastructure. This section tests transaction/value, not
  // acquisition time or whether a new player can afford selected recruitment.
  state.player = null;
  state.gymLevel = 8;
  state.credits = cost;
  state.projects = Object.fromEntries(projects.map(p => [p.id, p.id === 'recruitment' ? recruitmentProject : p.maxLevel])) as GymState['projects'];
  state.ownedEquipment = equipmentCatalog.map(e => e.id);
  state.purchasePrices = Object.fromEntries(equipmentCatalog.map(e => [e.id, e.price]));
  state.collectedEquipment = Object.fromEntries(equipmentCatalog.map(e => [e.id, {firstAt: start}]));
  state.equippedEquipment = [...desiredKit];
  assert.ok(validGym(state));
  return state;
}

function controlledOne(initial: GymState, mode: Mode, direction: Direction) {
  const d = new Driver(initial);
  const before = clone(d.state.rng);
  d.command(mode === 'selected' ? {type: 'recruit', mode: 'selected', direction, expectedNextPlayer: d.state.nextPlayer} : {type: 'recruit'});
  const initialBirth = birth(d.state.player!);
  const afterRecruit = clone(d.state.rng);
  assert.equal(d.state.credits, mode === 'selected' ? 0 : cost);
  d.initialize(d.state.player!, direction);
  const milestones: Record<number, {level: number; focusMean: number; focusMin: number; otherMean: number; tier: number; templateId: string | null; seconds: number}> = {};
  while (d.state.player!.level < 25) {
    assert.ok(d.shoot(start + 86_400_000));
    const p = d.state.player!;
    for (const level of [10, 15, 20, 25]) if (p.level >= level && !milestones[level]) milestones[level] = {
      level: p.level, focusMean: mean(focusKeys(direction).map(k => p.stats[k])), focusMin: Math.min(...focusKeys(direction).map(k => p.stats[k])),
      otherMean: mean(otherKeys(direction).map(k => p.stats[k])), tier: tier(p), templateId: p.templateId, seconds: (d.now - start) / 1000};
  }
  const player = d.state.player!;
  assert.equal(player.level, 25);
  const result = recommendation(d.state, player), payout = recommendationPayout(d.state, player);
  assert.ok(result.credits <= maximumRecommendationCredits);
  assert.ok(result.credits - (mode === 'selected' ? cost : 0) <= (mode === 'selected' ? -3 : maximumRecommendationCredits));
  const at25 = {stats: {...player.stats}, tier: tier(player), templateId: player.templateId, shots: player.shots,
    experience: player.experience, recommendation: result, payout, templateIds: Object.keys(d.state.collection),
    focusMean: mean(focusKeys(direction).map(k => player.stats[k])), focusMin: Math.min(...focusKeys(direction).map(k => player.stats[k])),
    otherMean: mean(otherKeys(direction).map(k => player.stats[k])), seconds: (d.now - start) / 1000};
  const previous = d.state.credits;
  d.command({type: 'recommend', id: player.id});
  assert.equal(d.state.credits - previous, payout.credits);
  assert.equal(d.state.alumni[0].rewardCredits, payout.credits);
  assert.equal(d.state.credits, cost - d.spent + payout.credits);
  assert.ok(validGym(d.state));
  return {seed: initial.seed, mode, direction, recruitmentProject: initial.projects.recruitment,
    initialBirth, rngBefore: before, rngAfterRecruit: afterRecruit, rngAfterTraining: clone(d.state.rng), milestones, at25,
    actualRecruitmentCharge: d.selectedSpent, rawRecommendationCredits: result.credits, actualRecommendationCredits: payout.credits,
    withheldRecommendationCredits: payout.withheldCredits,
    netCouponConsumption: d.selectedSpent - payout.credits, endCredits: d.state.credits,
    ledger: d.transactions};
}

function controlledComparison(free: ReturnType<typeof controlledOne>, selected: ReturnType<typeof controlledOne>) {
  const keys = focusKeys(free.direction);
  const nonFocus = otherKeys(free.direction);
  const controls = {
    nonDirectionBirthStats: nonFocus.every(k => free.initialBirth.stats[k] === selected.initialBirth.stats[k]),
    height: free.initialBirth.height === selected.initialBirth.height,
    bias: statKeys.every(k => free.initialBirth.bias[k] === selected.initialBirth.bias[k]),
    matchSeed: free.initialBirth.matchSeed === selected.initialBirth.matchSeed,
    economyRngAfterRecruit: free.rngAfterRecruit.economy.state === selected.rngAfterRecruit.economy.state,
    attributeRngAfterRecruit: free.rngAfterRecruit.attributes.state === selected.rngAfterRecruit.attributes.state,
    recruitRngAfterRecruit: free.rngAfterRecruit.recruits.state === selected.rngAfterRecruit.recruits.state,
  };
  assert.ok(Object.entries(controls).filter(([k]) => k !== 'recruitRngAfterRecruit').every(([, ok]) => ok));
  let draws = 0;
  const stream = clone(free.rngAfterRecruit.recruits);
  for (const key of keys) {
    const originalBase = free.initialBirth.stats[key] - free.recruitmentProject;
    const selectedBase = selected.initialBirth.stats[key] - selected.recruitmentProject;
    if (originalBase >= 46) assert.equal(selectedBase, originalBase);
    else {assert.equal(selectedBase, 46 + Math.floor(random(stream) * 3)); draws++;}
    assert.ok(selectedBase >= 46 && selectedBase <= 48);
  }
  assert.equal(stream.state, selected.rngAfterRecruit.recruits.state);
  return {seed: free.seed, direction: free.direction, recruitmentProject: free.recruitmentProject, controls,
    extraRecruitDraws: draws, comparisonScope: 'same pre-recruit state and verified birth controls; subsequent sequential recruits use diverging recruit RNG',
    birthFocusGain: mean(keys.map(k => selected.initialBirth.stats[k] - free.initialBirth.stats[k])),
    at25FocusMeanGain: selected.at25.focusMean - free.at25.focusMean,
    at25FocusMinGain: selected.at25.focusMin - free.at25.focusMin,
    at25OtherMeanGain: selected.at25.otherMean - free.at25.otherMean,
    tierGain: selected.at25.tier - free.at25.tier,
    sameFinalTemplate: selected.at25.templateId === free.at25.templateId,
    additionalCollectedTemplates: selected.at25.templateIds.filter(id => !free.at25.templateIds.includes(id)),
    lostCollectedTemplates: free.at25.templateIds.filter(id => !selected.at25.templateIds.includes(id)),
    rewardGain: selected.actualRecommendationCredits - free.actualRecommendationCredits,
    rawRewardGain: selected.rawRecommendationCredits - free.rawRecommendationCredits,
    additionalNetConsumption: selected.netCouponConsumption - free.netCouponConsumption};
}

/** A deliberately modest, fully charged bootstrap heuristic. This is not an
 * optimal progression claim. Coupons, templates, shots and expansion gates all
 * come from a real free-recruit career starting at newGym with zero coupons. */
function bootstrap(seed: number) {
  const d = new Driver(newGym(start, seed));
  const targets = new Map<string, {shots: number; level: number; tier: number}>();
  let lastInvestmentKey = '';
  let completeAt = 0;
  const target = () => d.state.gymLevel === 1 ? {shots: 30, level: 0, tier: 0}
    : d.state.gymLevel === 2 ? {shots: 0, level: 10, tier: 2}
      : d.state.gymLevel === 3 ? {shots: 0, level: 15, tier: 3}
        : d.state.gymLevel === 4 ? {shots: 0, level: 20, tier: 4} : {shots: 0, level: 25, tier: 5};
  const utility = (state: GymState) => {
    const effects = equipmentEffects(state);
    const auto = state.gymLevel >= 2;
    const xp = 11.6 + effects.experience + (auto ? state.projects.automation + effects.automationExperience : 0);
    const t = target();
    const shots = t.shots || Math.ceil(experienceForLevel(t.level) / xp);
    const recovery = recoverySeconds(state);
    const course = Math.min(9, 4 + state.projects.recovery / 2 + effects.courseRecovery);
    const effectiveSeconds = Math.max(auto ? 1 : 1, shots * Math.max(auto ? 1 : 1, (1 - course / 10) * recovery));
    return (1 + state.projects.recruitment * .025) * (1 + effects.cooperationBonus / 20) ** .3
      * (1 + effects.valuePercent / 160) ** .25 * (1 + staminaMax(state) / Math.max(100, shots) * .1) / effectiveSeconds;
  };
  function invest() {
    for (let loop = 0; loop < 100; loop++) {
      if (gymUpgrade(d.state).canUpgrade) {d.command({type: 'upgrade-gym'}); if (d.state.gymLevel === 8) return; continue;}
      const base = utility(d.state);
      const candidates: {score: number; id: string; actions: GymAction[]}[] = [];
      for (const id of ['recovery', 'endurance', 'automation', 'recruitment'] as const) {
        const price = projectOffer(d.state, id).price;
        if (price === null || price > d.state.credits) continue;
        const gain = utility({...d.state, projects: {...d.state.projects, [id]: d.state.projects[id] + 1}}) / base - 1;
        if (gain > 1e-10) candidates.push({score: gain / price, id, actions: [{type: 'upgrade-project', id}]});
      }
      for (const item of equipmentCatalog) {
        if (item.family === 'offline' || item.family.startsWith('focus-') || d.state.equippedEquipment.includes(item.id)) continue;
        const owned = d.state.ownedEquipment.includes(item.id);
        const price = owned ? 0 : equipmentOffer(d.state, item.id).price;
        if (price === null || price > d.state.credits) continue;
        const same = d.state.equippedEquipment.find(id => equipmentCatalog.find(e => e.id === id)!.family === item.family);
        if (same && equipmentCatalog.find(e => e.id === same)!.grade >= item.grade) continue;
        const replacements: (string | undefined)[] = same ? [same] : d.state.equippedEquipment.length < equipmentCapacity(d.state) ? [undefined] : [...d.state.equippedEquipment];
        const add = (replaceId?: string, slotCost = 0) => {
          const probe = {...d.state, equippedEquipment: [...d.state.equippedEquipment.filter(id => id !== replaceId), item.id],
            ownedEquipment: owned ? d.state.ownedEquipment : [...d.state.ownedEquipment, item.id]};
          const gain = utility(probe) / base - 1;
          if (gain <= 1e-10) return;
          const actions: GymAction[] = slotCost ? [{type: 'upgrade-project', id: 'equipment'}] : [];
          actions.push({type: owned ? 'equip' : 'buy-equipment', id: item.id, ...(replaceId ? {replaceId} : {})});
          candidates.push({score: gain / Math.max(.01, price + slotCost), id: item.id, actions});
        };
        for (const replace of replacements) add(replace);
        const slot = projectOffer(d.state, 'equipment');
        if (!same && d.state.equippedEquipment.length >= equipmentCapacity(d.state) && slot.price !== null && slot.price + price <= d.state.credits) add(undefined, slot.price);
      }
      const winner = candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))[0];
      if (!winner) return;
      for (const action of winner.actions) d.command(action);
    }
    throw Error('Bootstrap investment loop');
  }
  function complete() {
    if (d.state.gymLevel !== 8) return false;
    const before = d.state.credits;
    let actualCost = 0;
    // Buy separately: the G8 wallet line does not limit cumulative lifetime
    // spending, and all single permanent purchases fit below that line.
    for (const p of projects) while (d.state.projects[p.id] < p.maxLevel) {
      const price = projectOffer(d.state, p.id).price;
      if (price === null || price > d.state.credits) break;
      actualCost += price; d.command({type: 'upgrade-project', id: p.id});
    }
    for (const item of equipmentCatalog) if (!d.state.ownedEquipment.includes(item.id)) {
      const price = equipmentOffer(d.state, item.id).price;
      if (price === null || price > d.state.credits) continue;
      const same = d.state.equippedEquipment.find(id => equipmentCatalog.find(e => e.id === id)!.family === item.family);
      const replaceId = same ?? (d.state.equippedEquipment.length >= equipmentCapacity(d.state) ? d.state.equippedEquipment[0] : undefined);
      actualCost += price;
      d.command({type: 'buy-equipment', id: item.id, ...(replaceId ? {replaceId} : {})});
    }
    assert.equal(before - d.state.credits, actualCost);
    if (projects.some(p => d.state.projects[p.id] < p.maxLevel) || d.state.ownedEquipment.length !== equipmentCatalog.length) return false;
    for (const id of [...d.state.equippedEquipment]) if (!desiredKit.includes(id)) d.command({type: 'unequip', id});
    for (const id of desiredKit) if (!d.state.equippedEquipment.includes(id)) d.command({type: 'equip', id});
    completeAt = d.now;
    return true;
  }
  function manage() {
    for (const p of activePlayers(d.state)) {
      const t = targets.get(p.id);
      if (t && (p.level === 99 || (t.shots ? p.shots >= t.shots : p.level >= t.level && tier(p) >= t.tier))) {
        d.select(p); d.command({type: 'recommend', id: p.id});
      }
    }
    const key = [d.state.credits, d.state.fame, Object.keys(d.state.collection).length, d.state.gymLevel].join(':');
    if (key !== lastInvestmentKey) {invest(); lastInvestmentKey = [d.state.credits, d.state.fame, Object.keys(d.state.collection).length, d.state.gymLevel].join(':');}
    if (complete()) return true;
    while (activePlayers(d.state).length < d.state.gymLevel) d.command({type: 'recruit'});
    for (const p of activePlayers(d.state)) if (!targets.has(p.id)) {targets.set(p.id, target()); d.initialize(p);}
    return false;
  }
  let done = manage();
  while (!done && d.now < start + 172_800_000) {assert.ok(d.shoot(start + 172_800_000)); done = manage();}
  assert.ok(done, 'Bootstrap did not fully build within48h');
  assert.ok(validGym(d.state));
  const gross = d.allAlumni().reduce((sum, p) => sum + p.rewardCredits, 0);
  assert.equal(d.state.credits, gross - d.spent);
  assert.equal(d.constructionSpent, 510);
  assert.equal(d.state.ownedEquipment.length, 35);
  assert.ok(projects.every(p => d.state.projects[p.id] === p.maxLevel));
  return {state: clone(d.state), archiveRecords: clone(d.archivedAlumni), summary: {seed, seconds: (completeAt - start) / 1000, grossCredits: gross, actualSpent: d.spent,
    constructionSpent: d.constructionSpent, credits: d.state.credits, shots: d.shots, templates: Object.keys(d.state.collection).length,
    recommendations: d.allAlumni().length, rawRecommendationCredits: d.rawRecommendationCredits, withheldRecommendationCredits: d.withheldRecommendationCredits,
    transactions: d.transactions, archivedAlumniEvidence: clone(d.archivedAlumni)}};
}

function journey(initial: GymState, strategy: 'free' | 'half-selected', archiveRecords: GymAlumnus[]) {
  const d = new Driver(initial, archiveRecords);
  const baseline = {credits: initial.credits, fame: initial.fame, alumni: d.allAlumni().length, templates: Object.keys(initial.collection),
    legendaryTemplates: Object.keys(initial.collection).filter(id => templateById(id)?.tier === 'legend')};
  const begin = initial.updatedAt;
  const end = begin + journeyHours * 3_600_000;
  const assignments = new Map<string, {direction: Direction; paid: boolean}>();
  const recommended: {id: string; paid: boolean; direction: Direction; tier: number; templateId: string | null; reward: number; rawReward: number; withheldCredits: number; focusMean: number}[] = [];
  let births = 0, paidBirths = 0, wantedPaidButUnaffordable = 0;
  const initialize = (p: GymPlayer, direction: Direction, paid: boolean) => {assignments.set(p.id, {direction, paid}); d.initialize(p, direction);};
  // Existing athletes are identical real-career carryover in both branches.
  for (const [i, p] of activePlayers(d.state).entries()) initialize(p, directions[i % directions.length], false);
  function manage() {
    for (const p of activePlayers(d.state)) if (p.level >= 25) {
      const a = assignments.get(p.id)!;
      const reward = recommendationPayout(d.state, p);
      assert.ok(reward.credits <= maximumRecommendationCredits);
      recommended.push({id: p.id, paid: a.paid, direction: a.direction, tier: tier(p), templateId: p.templateId,
        reward: reward.credits, rawReward: reward.rawCredits, withheldCredits: reward.withheldCredits, focusMean: mean(focusKeys(a.direction).map(k => p.stats[k]))});
      d.select(p); d.command({type: 'recommend', id: p.id});
    }
    while (activePlayers(d.state).length < d.state.gymLevel) {
      const direction = directions[births % directions.length];
      const wantsPaid = strategy === 'half-selected' && births % 2 === 0;
      const paid = wantsPaid && d.state.credits >= cost;
      if (wantsPaid && !paid) wantedPaidButUnaffordable++;
      const previousId = d.state.nextPlayer;
      d.command(paid ? {type: 'recruit', mode: 'selected', direction, expectedNextPlayer: previousId} : {type: 'recruit'});
      const p = activePlayers(d.state).find(p => p.id === `gym-p${previousId}`)!;
      assert.ok(p);
      births++; if (paid) paidBirths++;
      initialize(p, direction, paid);
    }
  }
  manage();
  let loggedHour = 0;
  while (d.now < end) {
    if (!d.shoot(end)) break;
    manage();
    const hour = Math.floor((d.now - begin) / 3_600_000);
    if (hour > loggedHour) {loggedHour = hour; console.log(JSON.stringify({section: 'journey-progress', seed: initial.seed, strategy, hour, births, paidBirths, cash: d.state.credits}));}
  }
  assert.ok(validGym(d.state));
  assert.equal(d.now, end);
  const gross = d.allAlumni().slice(baseline.alumni).reduce((sum, p) => sum + p.rewardCredits, 0);
  assert.equal(d.spent, d.selectedSpent);
  assert.equal(d.state.credits, baseline.credits + gross - d.spent);
  assert.equal(d.spent, paidBirths * cost);
  const collected = Object.keys(d.state.collection);
  return {seed: initial.seed, strategy, seconds: (d.now - begin) / 1000, initialCredits: baseline.credits, endCredits: d.state.credits,
    netCredits: d.state.credits - baseline.credits, grossCredits: gross, rawRecommendationCredits: d.rawRecommendationCredits,
    withheldRecommendationCredits: d.withheldRecommendationCredits, actualSelectedSpending: d.selectedSpent,
    newBirths: births, paidBirths, wantedPaidButUnaffordable, recommendations: recommended.length,
    paidRecommended: recommended.filter(p => p.paid).length, unretiredPaid: activePlayers(d.state).filter(p => assignments.get(p.id)?.paid).length,
    initialTemplates: baseline.templates.length, finalTemplates: collected.length,
    newTemplates: collected.filter(id => !baseline.templates.includes(id)),
    newLegendaryTemplates: collected.filter(id => templateById(id)?.tier === 'legend' && !baseline.legendaryTemplates.includes(id)),
    shots: d.shots, managementActions: d.managementActions, minimumCreditBalance: Math.min(initial.credits, ...d.transactions.map((_, i) => initial.credits + d.transactions.slice(0, i + 1).reduce((sum, t) => sum + t.amount, 0))),
    paidResults: {count: recommended.filter(p => p.paid).length, reward: distribution(recommended.filter(p => p.paid).map(p => p.reward)), focusMean: distribution(recommended.filter(p => p.paid).map(p => p.focusMean))},
    freeResults: {count: recommended.filter(p => !p.paid).length, reward: distribution(recommended.filter(p => !p.paid).map(p => p.reward)), focusMean: distribution(recommended.filter(p => !p.paid).map(p => p.focusMean))},
    rngStart: clone(initial.rng), rngEnd: clone(d.state.rng), recommended, transactions: d.transactions,
    recentAlumniCount: d.state.alumni.length, alumniArchive: clone(d.state.alumniArchive), archivedAlumniEvidence: clone(d.archivedAlumni)};
}

const report: any = {date: '2026-11-15', source: 'actual-selected-recruitment-engine', economyVersion: gymEconomyVersion,
  selectedRecruitmentCost: cost, maximumRecommendationCredits, seeds, journeySeeds, journeyHours, sections, partial: true,
  assumptions: [
    'Controlled fixtures explicitly provision36 starting coupons, max infrastructure and an empty roster; they are transaction/value experiments, not from-zero acquisition claims.',
    'Controlled experiment crosses128 seeds,3 directions, free/selected and recruitment-project0/6; both branches train with the same direction to actualLv25 and actually recommend.',
    'recommendation/rawRecommendationCredits are uncapped theoretical rewards; payout/actualRecommendationCredits and grossCredits are actual wallet income under the current catalog economy version.',
    'Same pre-recruit state is cloned. Non-direction entry stats, height, bias, matchSeed and independent streams are verified; selected consumes0..2 additional recruit-stream draws only for low base direction stats.',
    'The first controlled recruitment can have verified birth controls. Sequential long-run births diverge in recruit RNG and must not be described as identical-birth paired samples.',
    'No synthetic templates, rewards or training growth; actual event-time advanceGym/trainPlayer with original matcher, real dispatcher for cash and decisions.',
    'Real-career journeys start with newGym and zero coupons; all construction, equipment and project costs are really paid. Branches clone the same paid full-build state.',
    'Both journey branches rotate directional plans, accept the legendary cooperation and recommend atLv25. Half-selected attempts every other new birth, falling back to free if cash<36. These are explicit heuristics, not optimal strategies.',
    'Journeys are continuous-online instant-management pressure tests, not casual play calendar estimates; paid selected recruitment cannot eliminate the still-available free coupon faucet.',
    'After each recommendation, history.ts compact aggregation is reproduced exactly and hot alumni are limited to100; full archived players remain in the separate audit evidence array.',
  ], controlled: {runs: [], comparisons: [], summary: []}, journeys: {bootstraps: [], runs: [], summary: []}};
async function save() {await mkdir(dirname(output), {recursive: true}); await writeFile(output, JSON.stringify(report, null, 2) + '\n');}
await save();
if (sections.includes('controlled')) {
  for (const recruitmentProject of [0, 6]) for (const direction of directions) {
    const runs: ReturnType<typeof controlledOne>[] = [];
    const comparisons: ReturnType<typeof controlledComparison>[] = [];
    for (let seed = 1; seed <= seeds; seed++) {
      const initial = controlledFixture(seed, recruitmentProject);
      const free = controlledOne(initial, 'free', direction);
      const selected = controlledOne(initial, 'selected', direction);
      runs.push(free, selected);
      comparisons.push(controlledComparison(free, selected));
    }
    report.controlled.runs.push(...runs);
    report.controlled.comparisons.push(...comparisons);
    const summary = {direction, recruitmentProject, seeds, athletes: runs.length,
      free: {birthFocusMean: distribution(runs.filter(r => r.mode === 'free').map(r => mean(focusKeys(direction).map(k => r.initialBirth.stats[k])))), focusMean: distribution(runs.filter(r => r.mode === 'free').map(r => r.at25.focusMean)),
        reward: distribution(runs.filter(r => r.mode === 'free').map(r => r.actualRecommendationCredits)), rawReward: distribution(runs.filter(r => r.mode === 'free').map(r => r.rawRecommendationCredits)), netConsumption: distribution(runs.filter(r => r.mode === 'free').map(r => r.netCouponConsumption)),
        legendaryAt25: runs.filter(r => r.mode === 'free' && r.at25.tier === 5).length, collectedUnion: [...new Set(runs.filter(r => r.mode === 'free').flatMap(r => r.at25.templateIds))]},
      selected: {birthFocusMean: distribution(runs.filter(r => r.mode === 'selected').map(r => mean(focusKeys(direction).map(k => r.initialBirth.stats[k])))), focusMean: distribution(runs.filter(r => r.mode === 'selected').map(r => r.at25.focusMean)),
        reward: distribution(runs.filter(r => r.mode === 'selected').map(r => r.actualRecommendationCredits)), rawReward: distribution(runs.filter(r => r.mode === 'selected').map(r => r.rawRecommendationCredits)), netConsumption: distribution(runs.filter(r => r.mode === 'selected').map(r => r.netCouponConsumption)),
        legendaryAt25: runs.filter(r => r.mode === 'selected' && r.at25.tier === 5).length, collectedUnion: [...new Set(runs.filter(r => r.mode === 'selected').flatMap(r => r.at25.templateIds))]},
      effect: {birthFocusGain: distribution(comparisons.map(r => r.birthFocusGain)), focusMeanGain: distribution(comparisons.map(r => r.at25FocusMeanGain)),
        focusMinGain: distribution(comparisons.map(r => r.at25FocusMinGain)), otherMeanGain: distribution(comparisons.map(r => r.at25OtherMeanGain)),
        tierGain: distribution(comparisons.map(r => r.tierGain)), rewardGain: distribution(comparisons.map(r => r.rewardGain)), rawRewardGain: distribution(comparisons.map(r => r.rawRewardGain)), additionalNetConsumption: distribution(comparisons.map(r => r.additionalNetConsumption)),
        additionalRecruitDraws: distribution(comparisons.map(r => r.extraRecruitDraws)), sameFinalTemplate: comparisons.filter(r => r.sameFinalTemplate).length,
        lowerFinalTier: comparisons.filter(r => r.tierGain < 0).length},
      milestones: [10, 15, 20, 25].map(level => {
        const free = runs.filter(r => r.mode === 'free');
        const selected = runs.filter(r => r.mode === 'selected');
        return {level, freeFocusMean: distribution(free.map(r => r.milestones[level].focusMean)),
          selectedFocusMean: distribution(selected.map(r => r.milestones[level].focusMean)),
          focusMeanGain: distribution(selected.map((r, i) => r.milestones[level].focusMean - free[i].milestones[level].focusMean))};
      })};
    report.controlled.summary.push(summary);
    console.log(JSON.stringify({section: 'controlled', direction, recruitmentProject, focusGain: summary.effect.focusMeanGain, freeReward: summary.free.reward, selectedReward: summary.selected.reward}));
    await save();
  }
}
if (sections.includes('journey')) for (let seed = 1; seed <= journeySeeds; seed++) {
  const base = bootstrap(seed);
  report.journeys.bootstraps.push(base.summary);
  console.log(JSON.stringify({section: 'bootstrap', seed, seconds: base.summary.seconds, cash: base.summary.credits}));
  for (const strategy of ['free', 'half-selected'] as const) {
    const result = journey(base.state, strategy, base.archiveRecords);
    report.journeys.runs.push(result);
    console.log(JSON.stringify({section: 'journey', seed, strategy, netCredits: result.netCredits, paid: result.paidBirths, newTemplates: result.newTemplates.length}));
    await save();
  }
}
report.journeys.summary = ['free', 'half-selected'].map(strategy => {
  const runs = report.journeys.runs.filter((r: any) => r.strategy === strategy);
  return {strategy, seeds: runs.length, netCredits: distribution(runs.map((r: any) => r.netCredits)), grossCredits: distribution(runs.map((r: any) => r.grossCredits)),
    rawRecommendationCredits: distribution(runs.map((r: any) => r.rawRecommendationCredits)), withheldRecommendationCredits: distribution(runs.map((r: any) => r.withheldRecommendationCredits)),
    actualSelectedSpending: distribution(runs.map((r: any) => r.actualSelectedSpending)), paidBirths: distribution(runs.map((r: any) => r.paidBirths)),
    newTemplates: distribution(runs.map((r: any) => r.newTemplates.length)), newLegendaryTemplates: distribution(runs.map((r: any) => r.newLegendaryTemplates.length)),
    minimumCreditBalance: distribution(runs.map((r: any) => r.minimumCreditBalance))};
});
report.execution = {controlledAthletes: report.controlled.runs.length, controlledComparisons: report.controlled.comparisons.length,
  actualControlledShots: report.controlled.runs.reduce((sum: number, r: any) => sum + r.at25.shots, 0),
  fromZeroBootstraps: report.journeys.bootstraps.length, fullBuildJourneyRuns: report.journeys.runs.length,
  actualBootstrapShots: report.journeys.bootstraps.reduce((sum: number, r: any) => sum + r.shots, 0),
  actualJourneyShots: report.journeys.runs.reduce((sum: number, r: any) => sum + r.shots, 0)};
report.partial = false;
await save();
console.log(JSON.stringify({execution: report.execution, journeys: report.journeys.summary}, null, 2));
