import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {GymAction, GymAlumnus, GymEvent, GymPlayer, GymState} from '../src/game/gym/engine';
import {statKeys} from '../src/game/types';

const manifest = JSON.parse(await readFile(process.env.V11_AUDIT_MANIFEST!, 'utf8'));
const runtime = await import(pathToFileURL(resolve(manifest.output)).href);
const {activePlayers, advanceGym, cooperationOffers, dispatchGym, equipmentCapacity, equipmentCatalog, equipmentEffects,
  equipmentOffer, experienceForLevel, gymUpgrade, newGym, projectCost, projectOffer, projects, recommendation, recommendationPayout,
  recoverySeconds, staminaMax, trainPlayer, validGym, recentAlumniLimit, gymEconomyVersion, selectedRecruitmentPrice,
  maximumRecommendationCredits, templateById, trainingPlans, random} = runtime;
assert.equal(gymEconomyVersion, 11, 'Audit must execute V11 production');
assert.equal(selectedRecruitmentPrice, 8, 'Audit must execute approved 8-coupon price');

type Direction = 'shooting' | 'finishing' | 'interior';
const directions: Direction[] = ['shooting', 'finishing', 'interior'];
const start = 1_800_000_000_000;
const cost = selectedRecruitmentPrice;
const seeds = Number(process.env.V11_AUDIT_SEEDS ?? 4);
const flowSeeds = Number(process.env.V11_AUDIT_FLOW_SEEDS ?? 2);
const output = process.env.V11_AUDIT_OUTPUT ?? '.tmp/v11-economy-production.json';
const controlledSeeds = Number(process.env.V11_AUDIT_CONTROLLED_SEEDS ?? 128);
const horizonHours = Number(process.env.V11_AUDIT_HORIZON_HOURS ?? 48);
const policy = process.env.V11_AUDIT_POLICY ?? 'staged-legend';
assert.ok(Number.isInteger(controlledSeeds) && controlledSeeds >= 0 && controlledSeeds <= 1024);
assert.ok(horizonHours > 0 && horizonHours <= 48);
assert.ok(['staged-legend', 'turnover25'].includes(policy));
assert.ok(Number.isInteger(seeds) && seeds >= 1 && seeds <= 8);
assert.ok(Number.isInteger(flowSeeds) && flowSeeds >= 0 && flowSeeds <= seeds);
const clone = <T>(value: T): T => structuredClone(value);
const tier = (player: GymPlayer) => [null, 'rotation', 'starter', 'star', 'superstar', 'legend'].indexOf(templateById(player.templateId)?.tier ?? null);
const desiredKit = ['capacity', 'recovery', 'course', 'experience', 'automation', 'brand', 'cooperation', 'offline']
  .map(family => equipmentCatalog.filter(e => e.family === family).sort((a, b) => b.grade - a.grade)[0].id);
function remainingPermanentCost(state: GymState) {
  return equipmentCatalog.filter(e => !state.ownedEquipment.includes(e.id)).reduce((sum, e) => sum + e.price, 0)
    + projects.reduce((sum, p) => sum + Array.from({length: p.maxLevel - state.projects[p.id]}, (_, i) => projectCost(p.id, state.projects[p.id] + i + 1)).reduce((a, b) => a + b, 0), 0);
}

class Driver {
  state: GymState;
  now: number;
  matched = new Set<string>();
  shots = 0;
  spent = 0;
  selectedSpent = 0;
  constructionSpent = 0;
  managementActions = 0;
  archivedAlumni: GymAlumnus[];
  postgameSeen = new Set<string>();
  grossRawCredits = 0;
  withheldCredits = 0;
  maxPost8Credits = 0;
  gymMilestones: Record<number, {seconds: number; credits: number; spent: number; templates: number}> = {};
  firstGym8: {seconds: number; credits: number; remainingPermanentCost: number} | null = null;
  recommendationsEvidence: {playerId: string; templateId: string | null; level: number; gymLevel: number; raw: number; actual: number; repeatTemplate: boolean; isFirstPostgameRecommendation: boolean; beforeCredits: number; afterCredits: number}[] = [];
  transactions: {seconds: number; type: string; amount: number; playerId?: string; id?: string}[] = [];
  constructor(state: GymState, archiveRecords: GymAlumnus[] = []) {
    this.state = clone(state); this.now = state.updatedAt; this.archivedAlumni = clone(archiveRecords);
    assert.equal(this.archivedAlumni.length, state.alumniArchive?.count ?? 0);
    this.postgameSeen = new Set(state.postgameRecommendedTemplates ?? []);
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
    const beforeRecommendation = action.type === 'recommend' ? {playerId: this.state.player!.id, templateId: this.state.player!.templateId,
      level: this.state.player!.level, gymLevel: this.state.gymLevel, raw: recommendation(this.state, this.state.player).credits,
      expectedPayout: recommendationPayout(this.state, this.state.player).credits} : null;
    const result = dispatchGym(this.state, this.state.revision, action, this.now);
    assert.equal(result.error, undefined, JSON.stringify(action));
    this.state = result.state;
    if (beforeRecommendation) {
      const repeatTemplate = !!beforeRecommendation.templateId && this.postgameSeen.has(beforeRecommendation.templateId);
      const isFirstPostgameRecommendation = !!beforeRecommendation.templateId && !repeatTemplate;
      const actual = !beforeRecommendation.templateId ? 0 : repeatTemplate ? 1 : beforeRecommendation.raw;
      assert.equal(this.state.credits - previous, beforeRecommendation.expectedPayout);
      assert.equal(this.state.credits - previous, actual, 'All gym levels use independent template ledger');
      assert.equal(this.state.alumni.at(-1)!.rewardCredits, actual);
      const event = result.events.find(event => event.type === 'recommended')!;
      assert.equal(event.repeatTemplate, repeatTemplate);
      assert.equal(event.isFirstPostgameRecommendation, isFirstPostgameRecommendation);
      if (beforeRecommendation.templateId) {
        this.postgameSeen.add(beforeRecommendation.templateId);
        assert.deepEqual([...(this.state.postgameRecommendedTemplates ?? [])].sort(), [...this.postgameSeen].sort());
      }
      this.grossRawCredits += beforeRecommendation.raw;
      this.withheldCredits += beforeRecommendation.raw - actual;
      this.recommendationsEvidence.push({...beforeRecommendation, repeatTemplate, isFirstPostgameRecommendation, actual, beforeCredits: previous, afterCredits: this.state.credits});
    }
    if (this.state.gymLevel === 8) {
      this.maxPost8Credits = Math.max(this.maxPost8Credits, this.state.credits);
      this.firstGym8 ??= {seconds: (this.now - start) / 1000, credits: this.state.credits, remainingPermanentCost: remainingPermanentCost(this.state)};
    }
    if (action.type === 'recommend') this.compactHistory();
    const difference = this.state.credits - previous;
    if (difference < 0) this.spent -= difference;
    if (action.type === 'recruit' && 'mode' in action && action.mode === 'selected') {
      assert.equal(difference, -cost);
      this.selectedSpent -= difference;
    }
    if (action.type === 'upgrade-gym') {
      this.constructionSpent -= difference;
      this.gymMilestones[this.state.gymLevel] = {seconds: (this.now - start) / 1000, credits: this.state.credits, spent: this.spent, templates: Object.keys(this.state.collection).length};
    }
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

function bootstrap(seed: number) {
  const d = new Driver(newGym(start, seed));
  const targets = new Map<string, {shots: number; level: number; tier: number}>();
  let lastInvestmentKey = '';
  let completeAt = 0;
  const target = () => d.state.gymLevel === 1 ? {shots: 30, level: 0, tier: 0}
    : d.state.gymLevel === 2 ? {shots: 0, level: 10, tier: 2}
      : d.state.gymLevel === 3 ? {shots: 0, level: 15, tier: 3}
        : d.state.gymLevel === 4 ? {shots: 0, level: 20, tier: 4} : {shots: 0, level: 25, tier: policy === 'turnover25' ? 0 : 5};
  const utility = (state: GymState) => {
    const effects = equipmentEffects(state);
    const auto = state.gymLevel >= 2;
    const xp = 11.6 + effects.experience + (auto ? state.projects.automation + effects.automationExperience : 0);
    const t = target();
    const shots = t.shots || Math.ceil(experienceForLevel(t.level) / xp);
    const recovery = recoverySeconds(state);
    const course = 4 + effects.courseRecovery;
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
    // Purchase permanent items separately using the real earned balance.
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
    if (remainingPermanentCost(d.state) !== 0) return false;
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
  while (!done && d.now < start + horizonHours * 3_600_000) {
    if (!d.shoot(start + horizonHours * 3_600_000)) break;
    done = manage();
  }
  // The report preserves bounded non-completion instead of hiding it with grants.

  assert.ok(validGym(d.state));
  const gross = d.allAlumni().reduce((sum, p) => sum + p.rewardCredits, 0);
  assert.equal(d.state.credits, gross - d.spent);
  if (done) {
    assert.equal(d.constructionSpent, 510);
    assert.equal(d.state.ownedEquipment.length, 35);
    assert.ok(projects.every(p => d.state.projects[p.id] === p.maxLevel));
  }
  return {state: clone(d.state), archiveRecords: clone(d.archivedAlumni), summary: {seed, complete: done, seconds: ((done ? completeAt : d.now) - start) / 1000, horizonHours, gymLevel: d.state.gymLevel, remainingPermanentCost: remainingPermanentCost(d.state), gymMilestones: d.gymMilestones, grossCredits: gross, actualSpent: d.spent,
    constructionSpent: d.constructionSpent, credits: d.state.credits, shots: d.shots, templates: Object.keys(d.state.collection).length,
    recommendations: d.allAlumni().length, transactions: d.transactions, archivedAlumniEvidence: clone(d.archivedAlumni),
    firstGym8: d.firstGym8, grossRawCredits: d.grossRawCredits, withheldCredits: d.withheldCredits, maxPost8Credits: d.maxPost8Credits,
    recommendationsEvidence: d.recommendationsEvidence, postgameRecommendedTemplates: [...d.postgameSeen]}};
}


function flow(initial: GymState, archiveRecords: GymAlumnus[], strategy: 'free' | 'half-selected') {
  const d = new Driver(initial, archiveRecords);
  const begin = d.now, end = begin + 3_600_000;
  const baseline = {credits: initial.credits, count: d.allAlumni().length, templates: Object.keys(initial.collection)};
  const assigned = new Set<string>();
  let births = 0, paidBirths = 0, unaffordablePaidAttempts = 0;
  const initialize = (p: GymPlayer, direction: Direction) => {assigned.add(p.id); d.initialize(p, direction);};
  for (const [i, p] of activePlayers(d.state).entries()) initialize(p, directions[i % directions.length]);
  function manage() {
    for (const p of activePlayers(d.state)) if (p.level >= 25) {d.select(p); d.command({type: 'recommend', id: p.id});}
    while (activePlayers(d.state).length < 8) {
      const direction = directions[births % directions.length];
      const wantsPaid = strategy === 'half-selected' && births % 2 === 0;
      const paid = wantsPaid && d.state.credits >= cost;
      if (wantsPaid && !paid) unaffordablePaidAttempts++;
      const id = d.state.nextPlayer;
      d.command(paid ? {type: 'recruit', mode: 'selected', direction, expectedNextPlayer: id} : {type: 'recruit'});
      const p = activePlayers(d.state).find(p => p.id === `gym-p${id}`)!;
      initialize(p, direction); births++; if (paid) paidBirths++;
    }
  }
  manage();
  while (d.now < end) {if (!d.shoot(end)) break; manage();}
  assert.ok(validGym(d.state));
  assert.equal(d.now, end);
  const gross = d.allAlumni().slice(baseline.count).reduce((sum, p) => sum + p.rewardCredits, 0);
  assert.equal(d.state.credits, baseline.credits + gross - d.spent);
  assert.equal(d.spent, paidBirths * cost);
  return {seed: initial.seed, strategy, seconds: 3600, initialCredits: baseline.credits, endCredits: d.state.credits,
    grossRawCredits: d.grossRawCredits, grossActualCredits: gross, withheldCredits: d.withheldCredits,
    actualSelectedSpending: d.selectedSpent, netCredits: d.state.credits - baseline.credits,
    births, paidBirths, unaffordablePaidAttempts, recommendations: d.allAlumni().length - baseline.count,
    initialTemplates: baseline.templates.length, finalTemplates: Object.keys(d.state.collection).length,
    newTemplates: Object.keys(d.state.collection).filter(id => !baseline.templates.includes(id)),
    shots: d.shots, maxPost8Credits: d.maxPost8Credits, transactions: d.transactions,
    recommendationsEvidence: d.recommendationsEvidence, recentAlumniCount: d.state.alumni.length,
    archive: d.state.alumniArchive, archivedAlumniEvidence: d.archivedAlumni,
    initialPostgameRecommendedTemplates: [...(initial.postgameRecommendedTemplates ?? [])],
    finalPostgameRecommendedTemplates: [...d.postgameSeen],
    firstPostgameRecommendations: d.recommendationsEvidence.filter(e => e.isFirstPostgameRecommendation).length,
    repeatTemplateRecommendations: d.recommendationsEvidence.filter(e => e.repeatTemplate).length};
}

const itemPrices = [...equipmentCatalog.map(e => ({type: 'equipment', id: e.id, price: e.price})),
  ...projects.flatMap(p => Array.from({length: p.maxLevel}, (_, i) => ({type: 'project', id: p.id + ':' + (i + 1), price: projectCost(p.id, i + 1)})))];

type Mode = 'free' | 'selected';
const focusKeys = (direction: Direction): (keyof GymPlayer['stats'])[] => trainingPlans.find((p: any) => p.id === direction)!.focusKeys;
const otherKeys = (direction: Direction) => statKeys.filter(k => !focusKeys(direction).includes(k));
const mean = (values: number[]) => values.reduce((sum, n) => sum + n, 0) / values.length;
function distribution(values: number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  return values.length ? {count: values.length, mean: mean(values), min: ordered[0], p50: ordered[Math.ceil(ordered.length * .5) - 1], p90: ordered[Math.ceil(ordered.length * .9) - 1], max: ordered.at(-1)} : null;
}
function birth(player: GymPlayer) {
  return {id: player.id, stats: {...player.stats}, entryStats: {...player.entryStats}, height: player.height,
    bias: {...player.bias}, matchSeed: player.matchSeed, lastStyle: {...player.lastStyle}};
}

function controlledFixture(seed: number, recruitmentProject: number) {
  const state = newGym(start, seed);
  // Explicit laboratory fixture: remove the initial free athlete and provision
  // 8 coupons plus infrastructure. This section tests transaction/value, not
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
  assert.ok(result.credits - (mode === 'selected' ? cost : 0) <= maximumRecommendationCredits - (mode === 'selected' ? cost : 0));
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


const report: any = {date: '2026-11-15', partial: true, productionRulesModified: false, engineMode: 'production-v11',
  baseline: manifest, economyVersion: gymEconomyVersion, policy,
  rule: 'All gym levels share a template recommendation counter: first normal, repeats1, unmatched0; gym upgrades do not reset; no cash adjustment.',
  assumptions: [
    'Frozen current production engine, real growth/RNG/matching and actual recommendationPayout; independent seen ledger checks every recommendation from gym1 onward.',
    'From-zero careers start newGym with zero coupons; free recruitment, no injected templates/cash or post-settlement balance changes.',
    `Player turnover policy ${policy}: gym1 after30 shots, gym2 Lv10+starter, gym3 Lv15+star, gym4 Lv20+super; later ${policy === 'turnover25' ? 'Lv25 regardless of tier' : 'Lv25+legend'} (or Lv99 terminal). Investment uses an explicit approximate heuristic, not an optimal policy.`,
    'Construction purchases use actual prices, gates, replacements and earned balances; recorded first-template IDs carry through upgrades, compaction and post-build branches.',
    'Continuous online instant management is a pressure test, not a casual player calendar-time or hourly-income promise.',
    'Free and half-selected flows clone each real fully paid state; sequential recruit RNG diverges and they are not identical-birth controlled pairs.',
    'Controlled laboratory fixtures alone provision8 coupons, gym8/max infrastructure and an empty roster; they test birth improvement and transaction value, not from-zero affordability.',
    'Controlled pairs share pre-recruit RNG and non-direction birth stats, height, bias and matchSeed;0..2 selected recruit-stream draws are verified. No artificial growth/templates are used.',
    'Controlled recommendations are previously unseen templates in each fresh lab state; they are not an unlimited normal-reward income claim.'
  ],
  selectedAdmissionEconomics: {price: cost, repeatRecommendationCredits: 1, repeatSelectedNetCost: cost - 1},
  itemPrices, maximumSinglePermanentPrice: Math.max(...itemPrices.map(i => i.price)),
  progression: [], flows: [], controlled: {seeds: controlledSeeds, runs: [], comparisons: [], summary: []}};
await mkdir(dirname(output), {recursive: true});
const save = () => writeFile(output, JSON.stringify(report, null, 2) + '\n');
await save();
for (let seed = 1; seed <= seeds; seed++) {
  const base = bootstrap(seed);
  if (base.summary.complete) assert.equal(base.summary.actualSpent, 1237);
  report.progression.push(base.summary);
  console.log(JSON.stringify({section: 'progression', seed, complete: base.summary.complete, seconds: base.summary.seconds, cash: base.summary.credits, remainingPermanentCost: base.summary.remainingPermanentCost, firstGym8: base.summary.firstGym8, withheld: base.summary.withheldCredits}));
  await save();
  if (base.summary.complete && seed <= flowSeeds) for (const strategy of ['free', 'half-selected'] as const) {
    const result = flow(base.state, base.archiveRecords, strategy);
    report.flows.push(result);
    console.log(JSON.stringify({section: 'flow', seed, strategy, net: result.netCredits, endCredits: result.endCredits, earned: result.grossActualCredits, withheld: result.withheldCredits, paidBirths: result.paidBirths, newTemplates: result.newTemplates.length}));
    await save();
  }
}
if (controlledSeeds > 0) {
  for (const recruitmentProject of [0, 6]) for (const direction of directions) {
    const runs: ReturnType<typeof controlledOne>[] = [];
    const comparisons: ReturnType<typeof controlledComparison>[] = [];
    for (let seed = 1; seed <= controlledSeeds; seed++) {
      const initial = controlledFixture(seed, recruitmentProject);
      const free = controlledOne(initial, 'free', direction);
      const selected = controlledOne(initial, 'selected', direction);
      runs.push(free, selected);
      comparisons.push(controlledComparison(free, selected));
    }
    report.controlled.runs.push(...runs);
    report.controlled.comparisons.push(...comparisons);
    const summary = {direction, recruitmentProject, seeds: controlledSeeds, athletes: runs.length,
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

report.execution = {fromZeroRuns: report.progression.length, completedBuilds: report.progression.filter((r: any) => r.complete).length,
  fullBuildFlows: report.flows.length, progressionShots: report.progression.reduce((sum: number, r: any) => sum + r.shots, 0),
  flowShots: report.flows.reduce((sum: number, r: any) => sum + r.shots, 0), controlledAthletes: report.controlled.runs.length,
  controlledShots: report.controlled.runs.reduce((sum: number, r: any) => sum + r.at25.shots, 0)};
report.partial = false;
await save();
console.log(JSON.stringify({execution: report.execution, output}));
