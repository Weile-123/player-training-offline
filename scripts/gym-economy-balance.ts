import {mkdir, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {activePlayers, advanceGym, automaticIntervalMs, cooperationOffers, dispatchGym, equipmentCapacity,
  equipmentCatalog, equipmentEffects, equipmentOffer, gymUpgrade, newGym, projectCost, projectOffer, projects, recommendation, recoverySeconds, trainingCreditMilestones, courseRecoveryCap, staminaMax,
  type GymAction, type GymState} from '../src/game/gym/engine';
import {encodeGym, validGym} from '../src/game/gym/save';
import {templateById} from '../src/game/templates';

const sampleSize = Number(process.env.GYM_ECONOMY_SEEDS ?? 20);
const horizonSeconds = Number(process.env.GYM_ECONOMY_SECONDS ?? 3_600);
const stopAtGym = process.env.GYM_ECONOMY_STOP_AT_GYM === undefined ? null : Number(process.env.GYM_ECONOMY_STOP_AT_GYM);
if (!Number.isInteger(sampleSize) || sampleSize < 1 || sampleSize > 200 || !Number.isInteger(horizonSeconds) || horizonSeconds < 60 || horizonSeconds > 21_600)
  throw new Error('Invalid economy sample settings');
if (stopAtGym !== null && (!Number.isInteger(stopAtGym) || stopAtGym < 1 || stopAtGym > 8)) throw new Error('Invalid target gym level');
const start = 1_800_000_000_000;
type Policy = 'short30' | 'level18' | 'level30' | 'mixed' | 'staged' | 'bonus10' | 'bonus15' | 'milestone';
type Target = 'short30' | 'level18' | 'level30' | 'bonus10' | 'bonus15' | 'bonus20' | 'bonus25';
const allPolicies: Policy[] = ['short30', 'level18', 'level30', 'mixed', 'staged', 'bonus10', 'bonus15', 'milestone'];
const selectedPolicy = process.env.GYM_ECONOMY_POLICY;
if (selectedPolicy && !allPolicies.includes(selectedPolicy as Policy)) throw new Error('Unknown economy policy');
const policies = selectedPolicy ? [selectedPolicy as Policy] : allPolicies;
const exportSaves = process.env.GYM_ECONOMY_EXPORT_SAVES === '1' && stopAtGym !== null;
if (exportSaves && (sampleSize !== 1 || policies.length !== 1 || stopAtGym! < 2)) throw new Error('Save export requires one seed, one policy, and a target gym upgrade');
let exportedStates: {beforeUpgrade: GymState | null; final: GymState} | null = null;
const checkpoints = [600, 1_800, 3_600, 7_200, 21_600].filter(time => time <= horizonSeconds);
if (!checkpoints.includes(horizonSeconds)) checkpoints.push(horizonSeconds);
const tierNames = ['rotation', 'starter', 'star', 'superstar', 'legend'];

function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return {mean: values.reduce((a, b) => a + b, 0) / values.length,
    p50: sorted[Math.ceil(sorted.length * .5) - 1], p90: sorted[Math.ceil(sorted.length * .9) - 1], min: sorted[0], max: sorted.at(-1)};
}

function simulate(policy: Policy, seed: number) {
  let state = newGym(start, seed);
  let now = start;
  let totalShots = 0;
  let spent = 0;
  let trainingCredits = 0;
  let cooperationCredits = 0;
  const firstGym: Record<number, number> = {1: 0};
  let firstPurchase: number | null = null;
  const purchases: {seconds: number; type: string; id: string; cost: number}[] = [];
  const samples: any[] = [];
  const targets = new Map<string, Target>();
  let actions = 0;
  let managementActions = 0;
  let manualTrainActions = 0;
  let automaticStepActions = 0;
  const actionCounts: Record<string, number> = {};
  let lastInvestmentKey = '';
  let beforeTargetUpgrade: GymState | null = null;
  const reachedTarget = () => stopAtGym !== null && state.gymLevel >= stopAtGym;
  const command = (action: GymAction) => {
    const beforeCommand = state;
    const result = dispatchGym(state, state.revision, action, now);
    if (result.error) throw new Error(policy + ': ' + action.type + ': ' + result.error);
    actions++;
    actionCounts[action.type] = (actionCounts[action.type] ?? 0) + 1;
    if (action.type === 'train') manualTrainActions++;
    else if (action.type === 'auto-step') automaticStepActions++;
    else managementActions++;
    state = result.state;
    if (exportSaves && action.type === 'upgrade-gym' && reachedTarget()) beforeTargetUpgrade = beforeCommand;
    totalShots += result.events.filter(event => event.type === 'trained').length;
    return result;
  };
  const assign = () => {
    for (const player of activePlayers(state)) if (!targets.has(player.id)) {
      const deepCount = activePlayers(state).filter(entry => targets.get(entry.id) === 'level30').length;
      const target: Target = state.gymLevel < 2 ? 'short30' : policy === 'mixed'
        ? deepCount < Math.ceil(state.gymLevel / 3) ? 'level30' : 'short30'
        : policy === 'staged' ? state.gymLevel >= 3 && deepCount < Math.ceil(state.gymLevel / 3) ? 'level30' : 'level18'
        : policy === 'milestone' ? state.gymLevel < 3 ? 'bonus10' : state.gymLevel < 4 ? 'bonus15' : state.gymLevel < 5 ? 'bonus20' : 'bonus25' : policy;
      targets.set(player.id, target);
      if (player.id !== state.player!.id) command({type: 'select-player', id: player.id});
      command({type: 'accept-cooperation', id: cooperationOffers(state)[0].id, playerId: player.id});
    }
    if (state.gymLevel >= 2) for (const player of activePlayers(state)) if (!player.autoEnabled) command({type: 'set-auto', id: player.id, enabled: true});
  };
  const ready = (id: string) => {
    const player = activePlayers(state).find(player => player.id === id)!;
    const target = targets.get(id);
    if (!target) return false;
    if (target === 'short30') return player.shots >= 30;
    if (target === 'level18' || target === 'level30') return player.level >= (target === 'level18' ? 18 : 30);
    const [level, tier] = {bonus10: [10, 2], bonus15: [15, 3], bonus20: [20, 4], bonus25: [25, 5]}[target];
    return player.level === 99 || player.level >= level && recommendation(state, player).tier >= tier;
  };
  const resourceScore = (candidate: GymState) => {
    const effects = equipmentEffects(candidate);
    return effects.courseRecovery * 10 + effects.recovery * 7 + effects.stamina;
  };
  const invest = () => {
    for (let step = 0; step < 80; step++) {
      if (gymUpgrade(state).canUpgrade) {
        command({type: 'upgrade-gym'});
        firstGym[state.gymLevel] ??= (now - start) / 1000;
        if (stopAtGym !== null) console.log('Seed ' + seed + ': gym ' + state.gymLevel + ' at ' + ((now - start) / 1000) + 's');
        if (reachedTarget()) return;
        continue;
      }
      const before = state.credits;
      let bought = false;
      // Same transparent purchase policy for every training strategy.
      for (const id of ['recovery', 'endurance'] as const) {
        const offer = projectOffer(state, id);
        if (offer.price !== null && offer.price <= state.credits) {
          command({type: 'upgrade-project', id});
          purchases.push({seconds: (now - start) / 1000, type: 'project', id, cost: before - state.credits});
          bought = true;
          break;
        }
      }
      if (!bought) {
        const replace = state.equippedEquipment.length < equipmentCapacity(state) ? [null] : state.equippedEquipment;
        const equipment = equipmentCatalog.filter(item => equipmentOffer(state, item.id).price !== null && item.price <= state.credits)
          .flatMap(item => replace.map(removed => ({item, removed,
            gain: resourceScore({...state, ownedEquipment: [...state.ownedEquipment, item.id], equippedEquipment: [...state.equippedEquipment.filter(id => id !== removed), item.id]}) - resourceScore(state)})))
          .filter(entry => entry.gain > 0).sort((a, b) => b.gain / b.item.price - a.gain / a.item.price || a.item.id.localeCompare(b.item.id))[0];
        if (equipment) {
          command({type: 'buy-equipment', id: equipment.item.id, ...(equipment.removed ? {replaceId: equipment.removed} : {})});
          purchases.push({seconds: (now - start) / 1000, type: 'equipment', id: equipment.item.id, cost: before - state.credits});
          bought = true;
        }
      }
      if (!bought) for (const id of ['automation', 'recruitment', 'equipment'] as const) {
        const offer = projectOffer(state, id);
        if (offer.price !== null && offer.price <= state.credits) {
          command({type: 'upgrade-project', id});
          purchases.push({seconds: (now - start) / 1000, type: 'project', id, cost: before - state.credits});
          bought = true;
          break;
        }
      }
      if (!bought) break;
      spent += before - state.credits;
      firstPurchase ??= (now - start) / 1000;
    }
  };
  const manage = () => {
    if (reachedTarget()) return;
    for (const player of [...activePlayers(state)]) if (ready(player.id)) {
      if (state.player!.id !== player.id) command({type: 'select-player', id: player.id});
      command({type: 'recommend', id: player.id});
    }
    const investmentKey = state.credits + ':' + state.fame + ':' + Object.keys(state.collection).length;
    if (investmentKey !== lastInvestmentKey) {
      invest();
      lastInvestmentKey = state.credits + ':' + state.fame + ':' + Object.keys(state.collection).length;
    }
    if (reachedTarget()) return;
    while (activePlayers(state).length < state.gymLevel) command({type: 'recruit'});
    assign();
  };
  const snapshot = (seconds: number) => {
    const alumni = state.alumni;
    const tiers = [0, 1, 2, 3, 4, 5].map(tier => alumni.filter(player => tierNames.indexOf(templateById(player.templateId)?.tier ?? '') + 1 === tier).length);
    return {seconds, shots: totalShots, recommendations: alumni.length, tiers, grossCredits: state.credits + spent,
      managementActions, manualTrainActions, automaticStepActions, actionCounts: {...actionCounts},
      credits: state.credits, spent, fame: state.fame, gymLevel: state.gymLevel, collection: Object.keys(state.collection).length,
      active: activePlayers(state).length, projects: {...state.projects}, equipment: [...state.equippedEquipment],
      averageRecommendedLevel: alumni.length ? alumni.reduce((sum, player) => sum + player.level, 0) / alumni.length : 0,
      pendingCredits: activePlayers(state).reduce((sum, player) => sum + recommendation(state, player).credits, 0),
      pendingFame: activePlayers(state).reduce((sum, player) => sum + recommendation(state, player).fame, 0),
      pendingPlayers: activePlayers(state).map(player => ({id: player.id, level: player.level, experience: player.experience,
        shots: player.shots, templateId: player.templateId, credits: recommendation(state, player).credits, fame: recommendation(state, player).fame}))};
  };
  manage();
  while (now < start + horizonSeconds * 1000 && !reachedTarget()) {
    const next = Math.min(...activePlayers(state).map(player => {
      const due = Math.max(now, player.nextShotAt, player.stamina < 1 ? now + recoverySeconds(state) * 1000 - player.recoveryMs : 0);
      return player.autoEnabled ? start + Math.ceil((due - start) / 200) * 200 : due;
    }));
    const boundary = start + (checkpoints[samples.length] ?? horizonSeconds) * 1000;
    if (next > boundary) {
      now = boundary;
      state = advanceGym(state, now);
      samples.push(snapshot((now - start) / 1000));
      if (now >= start + horizonSeconds * 1000) break;
      continue;
    }
    now = next;
    state = advanceGym(state, now);
    if (state.gymLevel >= 2) command({type: 'auto-step'});
    else command({type: 'train', id: state.player!.id});
    manage();
    if (now === boundary) samples.push(snapshot((now - start) / 1000));
    if (actions > 100_000) throw new Error('Economy loop failed to advance');
  }
  if (!validGym(state)) throw new Error('Economy produced an invalid save');
  const gross = state.alumni.reduce((sum, player) => sum + player.rewardCredits, 0);
  if (gross !== state.credits + spent || state.fame !== state.alumni.reduce((sum, player) => sum + player.rewardFame, 0)) throw new Error('Economy ledger mismatch');
  const stoppedAtSeconds = (now - start) / 1000;
  if (exportSaves) exportedStates = {beforeUpgrade: beforeTargetUpgrade, final: state};
  return {seed, firstGym, firstPurchase, purchases, actions, managementActions, manualTrainActions, automaticStepActions, actionCounts, samples, stoppedAtSeconds,
    reachedTarget: reachedTarget(), finalSnapshot: snapshot(stoppedAtSeconds)};
}

const results = [];
for (const policy of policies) {
  console.log('Closed-loop ' + policy + ': ' + sampleSize + ' seeds, ' + horizonSeconds + 's');
  const runs = Array.from({length: sampleSize}, (_, i) => simulate(policy, i + 1));
  results.push({policy, runs, checkpoints: checkpoints.flatMap(seconds => {
    const samples = runs.flatMap(run => run.samples.filter(sample => sample.seconds === seconds));
    if (!samples.length) return [];
    return [{seconds, sampleSize: samples.length, ...Object.fromEntries(['shots', 'recommendations', 'grossCredits', 'credits', 'spent', 'fame', 'gymLevel', 'collection', 'averageRecommendedLevel', 'pendingCredits', 'pendingFame', 'managementActions', 'manualTrainActions', 'automaticStepActions'].map(key => [key, summary(samples.map(sample => sample[key]))])),
      legends: summary(samples.map(sample => sample.tiers[5]))}];
  }), gym2: {attained: runs.filter(run => run.firstGym[2] !== undefined).length,
    seconds: runs.some(run => run.firstGym[2] !== undefined) ? summary(runs.flatMap(run => run.firstGym[2] === undefined ? [] : [run.firstGym[2]])) : null}});
}
if (exportSaves && exportedStates) {
  const states = exportedStates as {beforeUpgrade: GymState | null; final: GymState};
  const saveDirectory = join(process.cwd(), '.tmp');
  const beforePath = join(saveDirectory, 'endgame-before-upgrade.save.json');
  const finalPath = join(saveDirectory, 'endgame-final.save.json');
  await mkdir(saveDirectory, {recursive: true});
  if (states.beforeUpgrade) await writeFile(beforePath, encodeGym(states.beforeUpgrade) + '\n');
  else await rm(beforePath, {force: true});
  await writeFile(finalPath, encodeGym(states.final) + '\n');
  console.log(states.beforeUpgrade ? 'Exported synthetic pre-upgrade and final saves to .tmp/' : 'Target not reached; exported final synthetic save only');
}
const output = join(process.cwd(), 'docs/balance');
await mkdir(output, {recursive: true});
const suffix = process.env.GYM_ECONOMY_LABEL ?? 'current';
if (!/^[a-z0-9-]+$/.test(suffix)) throw new Error('Invalid output label');
const parameters = {baseStamina: staminaMax(newGym(start, 1)), rewardProfile: process.env.GYM_ECONOMY_REWARD_PROFILE ?? 'current',
  automaticExperience: 'base-outcome-XP + automation-project-level, only when autoEnabled and offlineRulesVersion=2',
  trainingCreditMilestones, basicCooperationFame: cooperationOffers(newGym(start, 1))[0].fame,
  projectCosts: Object.fromEntries(projects.filter(project => project.available)
  .map(project => [project.id, Array.from({length: project.maxLevel}, (_, i) => projectCost(project.id, i + 1))])),
  extraCourseRecoveryCaps: Array.from({length: 8}, (_, i) => courseRecoveryCap({...newGym(start, 1), gymLevel: i + 1}))};
await writeFile(join(output, 'economy-' + suffix + '.json'), JSON.stringify({schema: 1, balanceVersion: newGym(start, 1).balanceVersion, sampleSize, horizonSeconds, stopAtGym, parameters,
  source: 'actual-engine-from-zero', assumptions: ['short30-until-gym2-for-all', 'basic-cooperation-for-all', 'instant-management-actions', 'all-auto-after-gym2', 'same-purchase-priority', 'no-drinks', 'no-specialized-plans'], results}, null, 2) + '\n');
console.log(JSON.stringify(results.map(result => ({policy: result.policy, gym2: result.gym2,
  reachedTarget: result.runs.filter(run => run.reachedTarget).length,
  stoppedAtSeconds: summary(result.runs.map(run => run.stoppedAtSeconds)),
  final: Object.fromEntries((['grossCredits', 'spent', 'fame', 'gymLevel', 'recommendations', 'legends'] as const).map(key => [key,
    summary(result.runs.map(run => key === 'legends' ? run.finalSnapshot.tiers[5] : run.finalSnapshot[key])).mean])),
  managementActions: summary(result.runs.map(run => run.managementActions)).mean})), null, 2));
