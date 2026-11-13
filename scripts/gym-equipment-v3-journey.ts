import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {
  activePlayers, advanceGym, cooperationOffers, dispatchGym, equipmentCapacity,
  equipmentCatalog, equipmentEffects, equipmentOffer, experienceForLevel, gymUpgrade, newGym,
  projectOffer, recoverySeconds, staminaMax, trainPlayer,
  type GymAction, type GymEvent, type GymPlayer, type GymState,
} from '../src/game/gym/engine';
import {equipmentCatalogVersion} from '../src/game/gym/catalog';
import {estimateShotTime} from '../src/game/gym/forecast';
import {validGym} from '../src/game/gym/save';
import {templateById} from '../src/game/templates';

const sampleSize = Number(process.env.GYM_JOURNEY_SEEDS ?? 32);
const horizonSeconds = Number(process.env.GYM_JOURNEY_SECONDS ?? 86_400);
const label = process.env.GYM_JOURNEY_LABEL ?? '';
const start = 1_800_000_000_000;
type Policy = 'none' | 'balanced' | 'supply' | 'business';
const policyNames: Policy[] = ['none', 'balanced', 'supply', 'business'];
const selected = process.env.GYM_JOURNEY_POLICIES ?? process.env.GYM_JOURNEY_POLICY;
const selectedPolicies = selected ? selected.split(',') : policyNames;
if (!Number.isInteger(sampleSize) || sampleSize < 1 || sampleSize > 128
  || !Number.isInteger(horizonSeconds) || horizonSeconds < 60 || horizonSeconds > 86_400
  || !/^[a-z0-9-]*$/.test(label) || selectedPolicies.some(value => !policyNames.includes(value as Policy))
  || new Set(selectedPolicies).size !== selectedPolicies.length) throw new Error('Invalid journey parameters');
const policies = selectedPolicies as Policy[];
type Target = {shots: number; level: number; tier: number};
const targetFor = (gym: number): Target => gym === 1 ? {shots: 30, level: 0, tier: 0}
  : gym === 2 ? {shots: 0, level: 10, tier: 2} : gym === 3 ? {shots: 0, level: 15, tier: 3}
    : gym === 4 ? {shots: 0, level: 20, tier: 4} : {shots: 0, level: 25, tier: 5};
const tierOf = (player: GymPlayer) => [null, 'rotation', 'starter', 'star', 'superstar', 'legend'].indexOf(templateById(player.templateId)?.tier ?? null);
function distribution(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return values.length ? {count: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length,
    p50: sorted[Math.ceil(sorted.length * .5) - 1], p90: sorted[Math.ceil(sorted.length * .9) - 1], min: sorted[0], max: sorted.at(-1)} : null;
}

/** Explicit greedy buying heuristic, not an optimal-play or income guarantee. */
function investmentUtility(state: GymState, policy: Policy): number {
  const effects = equipmentEffects(state);
  const automatic = state.gymLevel >= 2;
  const meanXP = 11.6 + effects.experience + (automatic ? state.projects.automation + effects.automationExperience : 0);
  const target = targetFor(state.gymLevel);
  const shortTargetShots = target.shots || Math.ceil(experienceForLevel(target.level) / meanXP);
  const shots = policy === 'supply' && state.gymLevel >= 3 ? Math.max(300, shortTargetShots) : shortTargetShots;
  const proxy = {...state.player!, stamina: staminaMax(state), recoveryMs: 0, nextShotAt: state.updatedAt, autoEnabled: automatic,
    training: {planId: 'balanced' as const, shots: 0, completedCourses: 0}};
  const seconds = Math.max(1, estimateShotTime(state, proxy, shots) / 1_000);
  const baseCredits = target.level === 0 ? 2 : target.level === 10 ? 6 : target.level === 15 ? 11 : target.level === 20 ? 17 : 24;
  const cashWeight = policy === 'business' ? .55 : policy === 'supply' ? .1 : .3;
  const brandWeight = policy === 'business' ? .8 : policy === 'supply' ? .05 : .25;
  const brand = Math.min(50, effects.valuePercent);
  return (1 + effects.cooperationBonus / baseCredits) ** cashWeight * ((160 + brand) / 160) ** brandWeight
    * (target.shots ? (meanXP / 11.6) ** .5 : 1)
    * (1 + state.projects.recruitment * .025) / seconds;
}

function simulate(policy: Policy, seed: number) {
  let state = newGym(start, seed);
  let now = start;
  let grossSpent = 0;
  let saleCredits = 0;
  let totalShots = 0;
  let manualClicks = 0;
  let autoSteps = 0;
  let managementActions = 0;
  let lastInvestmentKey = '';
  const counts: Record<string, number> = {};
  const targets = new Map<string, Target>();
  const matched = new Set<string>();
  const milestones: Record<number, ReturnType<typeof snapshot>> = {};
  const transactions: {seconds: number; type: string; id: string; cost: number; replaceId?: string}[] = [];
  const command = (action: GymAction) => {
    const result = dispatchGym(state, state.revision, action, now);
    if (result.error) throw new Error(`${policy}/seed${seed}/${action.type}: ${result.error}`);
    state = result.state;
    counts[action.type] = (counts[action.type] ?? 0) + 1;
    if (action.type === 'train') {manualClicks++; totalShots += result.events.filter(e => e.type === 'trained').length;}
    else managementActions++;
  };
  function snapshot() {
    return {seconds: (now - start) / 1_000, gym: state.gymLevel, fame: state.fame,
      templates: Object.keys(state.collection).length, recommendations: state.alumni.length,
      legends: state.alumni.filter(p => tierOf(p) === 5).length,
      recruits: state.nextPlayer - 1, recruitActions: counts.recruit ?? 0,
      shots: totalShots, manualClicks, autoSteps, managementActions,
      grossCredits: state.alumni.reduce((sum, p) => sum + p.rewardCredits, 0),
      grossSpent, saleCredits, netSpent: grossSpent - saleCredits, credits: state.credits,
      equipmentPurchaseCount: counts['buy-equipment'] ?? 0, projectUpgrades: counts['upgrade-project'] ?? 0,
      projects: {...state.projects}, equipment: [...state.equippedEquipment],
      owned: [...state.ownedEquipment], active: activePlayers(state).map(p => ({id: p.id, level: p.level,
        tier: tierOf(p), shots: p.shots, target: targets.get(p.id)}))};
  }
  const buy = (action: GymAction, id: string, type: string) => {
    const before = state.credits;
    command(action);
    const cost = before - state.credits;
    grossSpent += cost;
    transactions.push({seconds: (now - start) / 1_000, id, type, cost,
      ...('replaceId' in action && action.replaceId ? {replaceId: action.replaceId} : {})});
    if ('replaceId' in action && action.replaceId) {
      const previous = equipmentCatalog.find(e => e.id === action.replaceId)!;
      const next = equipmentCatalog.find(e => e.id === id)!;
      if (previous.family === next.family && previous.grade < next.grade) {
        const saleBefore = state.credits;
        command({type: 'sell-equipment', id: previous.id});
        const income = state.credits - saleBefore;
        saleCredits += income;
        transactions.push({seconds: (now - start) / 1_000, id: previous.id, type: 'sale', cost: -income});
      }
    }
  };
  type Candidate = {actions: {action: GymAction; id: string; type: string}[]; score: number; tie: string};
  const invest = () => {
    for (let loop = 0; loop < 100; loop++) {
      if (gymUpgrade(state).canUpgrade) {
        command({type: 'upgrade-gym'});
        milestones[state.gymLevel] = snapshot();
        if (state.gymLevel === 8) return;
        continue;
      }
      const beforeValue = investmentUtility(state, policy);
      const candidates: Candidate[] = [];
      for (const id of ['recovery', 'endurance', 'automation', 'recruitment'] as const) {
        const offer = projectOffer(state, id);
        if (offer.price === null || offer.price > state.credits) continue;
        const probe = {...state, projects: {...state.projects, [id]: state.projects[id] + 1}};
        const gain = investmentUtility(probe, policy) / beforeValue - 1;
        if (gain > 1e-10) candidates.push({actions: [{action: {type: 'upgrade-project', id}, id, type: 'project'}],
          score: gain / offer.price, tie: id});
      }
      if (policy !== 'none') for (const item of equipmentCatalog) {
        // Continuous online scenario: offline time and unmodelled focus are not
        // given invented monetary utility. Their separate balance audit applies.
        if (item.family === 'offline' || item.family.startsWith('focus-')) continue;
        const owned = state.ownedEquipment.includes(item.id);
        if (state.equippedEquipment.includes(item.id)) continue;
        const offer = equipmentOffer(state, item.id);
        if (!owned && offer.price === null) continue;
        const price = owned ? 0 : item.price;
        if (price > state.credits) continue;
        const sameFamily = state.equippedEquipment.find(id => equipmentCatalog.find(e => e.id === id)!.family === item.family);
        if (sameFamily && equipmentCatalog.find(e => e.id === sameFamily)!.grade >= item.grade) continue;
        const slots = equipmentCapacity(state);
        const replacements: (string | undefined)[] = sameFamily ? [sameFamily]
          : state.equippedEquipment.length < slots ? [undefined] : [...state.equippedEquipment];
        const addCandidate = (replaceId?: string, extraSlotCost = 0) => {
          const probe = {...state, ownedEquipment: owned ? state.ownedEquipment : [...state.ownedEquipment, item.id],
            equippedEquipment: [...state.equippedEquipment.filter(id => id !== replaceId), item.id]};
          const gain = investmentUtility(probe, policy) / beforeValue - 1;
          if (gain <= 1e-10) return;
          const actions: Candidate['actions'] = extraSlotCost ? [{action: {type: 'upgrade-project', id: 'equipment'}, id: 'equipment', type: 'project'}] : [];
          actions.push({action: {type: owned ? 'equip' : 'buy-equipment', id: item.id, ...(replaceId ? {replaceId} : {})}, id: item.id, type: owned ? 'install' : 'equipment'});
          candidates.push({actions, score: gain / Math.max(.01, price + extraSlotCost), tie: item.id + ':' + (replaceId ?? '')});
        };
        for (const replacement of replacements) addCandidate(replacement);
        if (!sameFamily && state.equippedEquipment.length >= slots) {
          const capacity = projectOffer(state, 'equipment');
          if (capacity.price !== null && capacity.price + price <= state.credits) addCandidate(undefined, capacity.price);
        }
      }
      const selected = candidates.sort((a, b) => b.score - a.score || a.tie.localeCompare(b.tie))[0];
      if (!selected) return;
      for (const entry of selected.actions) buy(entry.action, entry.id, entry.type);
    }
    throw new Error('Investment loop did not converge');
  };
  const ready = (p: GymPlayer) => {
    const target = targets.get(p.id)!;
    return p.level === 99 || (target.shots ? p.shots >= target.shots : p.level >= target.level && tierOf(p) >= target.tier);
  };
  const manage = () => {
    for (const p of [...activePlayers(state)]) if (targets.has(p.id) && ready(p)) {
      if (state.player!.id !== p.id) command({type: 'select-player', id: p.id});
      command({type: 'recommend', id: p.id});
    }
    const investmentKey = [state.credits, state.fame, Object.keys(state.collection).length, state.gymLevel].join(':');
    if (lastInvestmentKey !== investmentKey) {
      invest();
      lastInvestmentKey = [state.credits, state.fame, Object.keys(state.collection).length, state.gymLevel].join(':');
    }
    if (state.gymLevel === 8) return;
    while (activePlayers(state).length < state.gymLevel) command({type: 'recruit'});
    for (const p of activePlayers(state)) if (!targets.has(p.id)) {
      targets.set(p.id, targetFor(state.gymLevel));
      if (state.player!.id !== p.id) command({type: 'select-player', id: p.id});
      command({type: 'accept-cooperation', id: cooperationOffers(state, p)[0].id, playerId: p.id});
    }
    if (state.gymLevel >= 2) for (const p of activePlayers(state)) if (!p.autoEnabled && p.level < 99) command({type: 'set-auto', id: p.id, enabled: true});
  };
  manage();
  const horizon = start + horizonSeconds * 1_000;
  while (now < horizon && state.gymLevel < 8) {
    const due = Math.min(...activePlayers(state).filter(p => p.level < 99).map(p => Math.max(now, p.nextShotAt,
      p.stamina < 1 ? now + recoverySeconds(state) * 1_000 - p.recoveryMs : 0)));
    if (!Number.isFinite(due)) throw new Error('No trainable athlete and no recommendation');
    now = Math.min(due, horizon);
    state = advanceGym(state, now);
    if (due > horizon) break;
    if (state.gymLevel === 1) command({type: 'train', id: state.player!.id});
    else {
      const duePlayers = activePlayers(state).filter(p => p.autoEnabled && p.level < 99 && p.stamina >= 1 && p.nextShotAt <= now)
        .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      const events: GymEvent[] = [];
      for (const p of duePlayers) {trainPlayer(state, p, now, events, matched.has(p.id)); matched.add(p.id);}
      totalShots += events.filter(e => e.type === 'trained').length;
      autoSteps++;
    }
    manage();
    if (totalShots > 1_000_000) throw new Error('Journey shot safety limit exceeded');
  }
  if (!validGym(state)) throw new Error('Invalid final save: ' + policy + '/' + seed);
  const final = snapshot();
  if (final.grossCredits + saleCredits - grossSpent !== state.credits
    || state.alumni.reduce((sum, p) => sum + p.rewardFame, 0) !== state.fame) throw new Error('Journey ledger mismatch');
  return {seed, reached8: state.gymLevel === 8, milestones, final, actionCounts: counts, transactions,
    blocked: gymUpgrade(state).requirements.filter(r => !r.met)};
}

const results = [];
for (const policy of policies) {
  const runs: ReturnType<typeof simulate>[] = [];
  console.log('Journey ' + policy + ': ' + sampleSize + ' seeds');
  for (let seed = 1; seed <= sampleSize; seed++) {
    const run = simulate(policy, seed);
    runs.push(run);
    console.log(`${policy} seed ${seed}: G${run.final.gym} at ${Math.round(run.final.seconds)}s; ${run.final.recommendations} recommendations, ${run.final.templates} templates`);
  }
  results.push({policy, milestones: [2, 3, 5, 6, 8].map(gym => ({gym,
    attained: runs.filter(r => r.milestones[gym]).length, rate: runs.filter(r => r.milestones[gym]).length / sampleSize,
    seconds: distribution(runs.flatMap(r => r.milestones[gym] ? [r.milestones[gym].seconds] : [])),
    recommendations: distribution(runs.flatMap(r => r.milestones[gym] ? [r.milestones[gym].recommendations] : [])),
    manualClicks: distribution(runs.flatMap(r => r.milestones[gym] ? [r.milestones[gym].manualClicks] : [])),
    managementActions: distribution(runs.flatMap(r => r.milestones[gym] ? [r.milestones[gym].managementActions] : []))})),
    final: Object.fromEntries(['seconds', 'gym', 'fame', 'templates', 'recommendations', 'recruits', 'shots', 'grossCredits', 'grossSpent', 'saleCredits', 'netSpent', 'credits', 'manualClicks', 'managementActions'].map(key =>
      [key, distribution(runs.map(r => r.final[key as keyof typeof r.final] as number))])), runs});
  // Preserve each completed policy during long batches; these are explicitly
  // partial results until the final report below is written.
  await mkdir(join(process.cwd(), '.tmp'), {recursive: true});
  await writeFile(join(process.cwd(), '.tmp/equipment-v3-journey-progress' + (label ? '-' + label : '') + '.json'),
    JSON.stringify({partial: true, sampleSize, horizonSeconds, completedPolicies: results.map(r => r.policy), results}, null, 2) + '\n');
}
await mkdir(join(process.cwd(), 'docs/balance'), {recursive: true});
await writeFile(join(process.cwd(), 'docs/balance/equipment-v3-journey' + (label ? '-' + label : '') + '.json'), JSON.stringify({
  schema: 1, equipmentCatalogVersion, source: 'actual-engine-from-zero', sampleSize, horizonSeconds,
  assumptions: ['same-milestone-training-targets-for-all-policies', 'basic-cooperation-accepted-on-recruitment-never-switched',
    'instant-management-with-action-counts-no-human-reaction-delay', 'auto-all-athletes-from-gym2', 'continuous-online', 'no-drinks',
    'no-template-injection', 'natural-any-height-recruitment', 'balanced-training-plan', 'greedy-heuristic-not-global-optimum',
    'new-grade-buy-at-full-price-before-half-price-selling-replaced-lower-grade', 'offline-and-focus-gear-not-assigned-invented-online-utility',
    'training-uses-real-trainPlayer-and-exact-event-time-without-200ms-UI-poll-rounding', 'mean-XP-only-for-investment-heuristic-outcomes-use-real-RNG',
    'integer-rational-brand-fame-with-one-final-floor'],
  investmentModel: {meanBaseXP: 11.6, targetCreditsProxy: [2, 6, 11, 17, 24], recruitmentUtilityPerLevel: .025,
    cashWeight: {none: .3, balanced: .3, supply: .1, business: .55},
    brandWeight: {none: .25, balanced: .25, supply: .05, business: .8},
    targetShots: '30 until gym2; then fresh-recruit expected shots to target level; supply uses at least 300 shots from gym3', scoring: 'relative modeled utility increase / actual upfront price'},
  equipment: equipmentCatalog.map(({id, name, family, grade, price, unlockLevel, requiredTemplates, effects}) => ({id, name, family, grade, price, unlockLevel, requiredTemplates, effects})),
  results,
}, null, 2) + '\n');
console.log(JSON.stringify(results.map(({policy, milestones, final}) => ({policy, milestones, final})), null, 2));
