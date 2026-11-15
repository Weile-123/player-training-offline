import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {GymAction, GymAlumnus, GymEvent, GymPlayer, GymState} from '../src/game/gym/engine';

const manifestPath = process.env.FIRST_AUDIT_BASELINE_MANIFEST ?? '.tmp/gym-v8-reward-baseline-frozen-20261115.json';
const production = process.env.FIRST_AUDIT_ENGINE_MODE === 'production';
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const frozen = await import(pathToFileURL(resolve(manifest.output)).href);
const {activePlayers, advanceGym, cooperationOffers, dispatchGym, equipmentCapacity, equipmentCatalog, equipmentEffects,
  equipmentOffer, experienceForLevel, gymUpgrade, newGym, projectCost, projectOffer, projects, recommendation,
  recoverySeconds, staminaMax, trainPlayer, validGym, recentAlumniLimit, gymEconomyVersion, templateById, trainingPlans} = frozen;
assert.equal(gymEconomyVersion, production ? 10 : 8, 'Explicit frozen runtime must match the selected mode');
if (process.env.FIRST_AUDIT_RUN !== '1') {
  console.log(JSON.stringify({ready: true, baseline: manifest.output, version: gymEconomyVersion, run: 'Set FIRST_AUDIT_RUN=1 after choosing the rule'}));
  process.exit(0);
}
type Direction = 'shooting' | 'finishing' | 'interior';
const directions: Direction[] = ['shooting', 'finishing', 'interior'];
const start = 1_800_000_000_000;
const cost = 36;
const seeds = Number(process.env.FIRST_AUDIT_SEEDS ?? 4);
const flowSeeds = Number(process.env.FIRST_AUDIT_FLOW_SEEDS ?? 2);
const output = process.env.FIRST_AUDIT_OUTPUT ?? (production ? `docs/balance/first-template-production-v${gymEconomyVersion}-20261115.json` : 'docs/balance/first-template-candidate-20261115.json');
assert.ok(Number.isInteger(seeds) && seeds >= 1 && seeds <= 8);
assert.ok(Number.isInteger(flowSeeds) && flowSeeds >= 1 && flowSeeds <= seeds);
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
      expectedPayout: production ? frozen.recommendationPayout(this.state, this.state.player).credits : null} : null;
    const result = dispatchGym(this.state, this.state.revision, action, this.now);
    assert.equal(result.error, undefined, JSON.stringify(action));
    this.state = result.state;
    if (beforeRecommendation) {
      const phase = beforeRecommendation.gymLevel === 8;
      const repeatTemplate = phase && !!beforeRecommendation.templateId && this.postgameSeen.has(beforeRecommendation.templateId);
      const isFirstPostgameRecommendation = phase && !!beforeRecommendation.templateId && !repeatTemplate;
      const actual = !phase ? beforeRecommendation.raw : !beforeRecommendation.templateId ? 0 : repeatTemplate ? 1 : beforeRecommendation.raw;
      if (production) {
        assert.equal(this.state.credits - previous, beforeRecommendation.expectedPayout);
        assert.equal(this.state.credits - previous, actual);
        assert.equal(this.state.alumni.at(-1)!.rewardCredits, actual);
      } else {
        assert.equal(this.state.credits - previous, beforeRecommendation.raw, 'Frozen V8 must give original reward');
        this.state.credits -= beforeRecommendation.raw - actual;
        this.state.alumni.at(-1)!.rewardCredits = actual;
      }
      if (phase && beforeRecommendation.templateId) {
        this.postgameSeen.add(beforeRecommendation.templateId);
        if (production) assert.deepEqual([...(this.state.postgameRecommendedTemplates ?? [])].sort(), [...this.postgameSeen].sort());
        else this.state.postgameRecommendedTemplates = [...this.postgameSeen];
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
const boundarySeen = new Set<string>();
const boundaryCases = [{template: 'example-a', raw: 33}, {template: 'example-a', raw: 33},
  {template: 'example-b', raw: 6}, {template: 'example-b', raw: 6}, {template: null, raw: 0}].map(c => {
  const actual = !c.template ? 0 : boundarySeen.has(c.template) ? 1 : c.raw;
  if (c.template) boundarySeen.add(c.template);
  return {...c, actual};
});
assert.deepEqual(boundaryCases.map(c => c.actual), [33, 1, 6, 1, 0]);
const report: any = {date: '2026-11-15', partial: true, productionRulesModified: false, engineMode: production ? 'production-v10' : 'prototype-on-frozen-v8', candidate: 'gym8-template-first-normal-repeat1',
  baseline: manifest, rule: 'Gym1-7 original; in gym8 stage each valid template first pays normal, later recommendations of that template pay1; null pays0; old balance and fame unchanged',
  assumptions: [production ? 'Frozen production V10 including actual recommendationPayout and persisted postgame seen set; no manual cash adjustment.' : 'Frozen V8 engine for real training, matching, RNG, recruitment, charged construction and recommendations; only candidate reward credit adjustment is applied after actual recommendation.',
    'From zero,4 default seeds, free recruitment, exact actual growth and earned cash; no injected currency or templates.',
    'Permanent construction is bought one item at a time using real earned coupons; phase seen records carry through construction and strategy branches.',
    'After each recommendation use history.ts equivalent compaction, keeping all audit archive evidence outside the hot state.',
    'Two seeds clone real paid full-build state for free / affordable half-selected one-hour flows; sequential recruit RNG diverges, not identical-birth pairing.',
    'Continuous online and instant management are pressure tests, not casual calendar-income promises. Repeat rewards remain positive and can still accumulate without spending.'],
  comparisonWindow: 'Only successful valid-template recommendations during gym8 are recorded; pre-gym8 alumni never consume the phase first reward',
  selectedAdmissionEconomics: {price: 36, repeatRecommendationCredits: 1, repeatSelectedNetCost: 35, freeRepeatedRecommendationsToCover: 35},
  itemPrices, maximumSinglePermanentPrice: Math.max(...itemPrices.map(i => i.price)), boundaryCases, progression: [], flows: []};
await mkdir(dirname(output), {recursive: true});
const save = () => writeFile(output, JSON.stringify(report, null, 2) + '\n');
await save();
for (let seed = 1; seed <= seeds; seed++) {
  const base = bootstrap(seed);
  assert.equal(base.summary.actualSpent, 1237);
  report.progression.push(base.summary);
  console.log(JSON.stringify({section: 'progression', seed, seconds: base.summary.seconds, cash: base.summary.credits, firstGym8: base.summary.firstGym8, withheld: base.summary.withheldCredits}));
  if (seed <= flowSeeds) for (const strategy of ['free', 'half-selected'] as const) {
    const result = flow(base.state, base.archiveRecords, strategy);
    report.flows.push(result);
    console.log(JSON.stringify({section: 'flow', seed, strategy, net: result.netCredits, endCredits: result.endCredits, earned: result.grossActualCredits, withheld: result.withheldCredits, paidBirths: result.paidBirths}));
  }
  await save();
}
report.execution = {fromZeroRuns: report.progression.length, fullBuildFlows: report.flows.length,
  progressionShots: report.progression.reduce((sum: number, r: any) => sum + r.shots, 0),
  flowShots: report.flows.reduce((sum: number, r: any) => sum + r.shots, 0)};
report.partial = false;
await save();
console.log(JSON.stringify({execution: report.execution, maximumSinglePermanentPrice: report.maximumSinglePermanentPrice}));



