import {mkdir, writeFile} from 'node:fs/promises';
import {
  activePlayers, advanceGym, automaticIntervalMs, consumableUseReason, dispatchGym, equipmentCapacity,
  equipmentCatalog, experienceForLevel, guaranteedGreatShots, newGym, playerLevelCap,
  projectCap, recoverySeconds, staminaMax, trainPlayer, trainingShotExperience, trainingStatus,
  type GymEvent, type GymPlayer, type GymState,
} from '../src/game/gym/engine';
import {chalkTrainingShots, consumableById, type GymConsumableId} from '../src/game/gym/consumables';
import {validGym} from '../src/game/gym/save';
import {templateRules} from '../src/game/contract/templates';

const at = 1_800_000_000_000;
const seeds = 32;
const horizonMs = 300_000;
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const round = (value: number) => Math.round(value * 100) / 100;

function fixture(gymLevel: number, built: boolean, automatic: boolean, seed: number): GymState {
  const state = newGym(at, seed);
  state.gymLevel = gymLevel;
  state.credits = 1_000;
  state.player!.autoEnabled = automatic;
  state.player!.level = state.player!.peakLevel = [0, 5, 10, 15, 20, 25, 40, 55][gymLevel - 1];
  state.player!.stamina = 0;
  if (built) {
    if (gymLevel >= 6) for (const template of templateRules.slice(0, 8)) state.collection[template.id] = {firstAt: at, highestRating: 80, highestValue: '1000000'};
    for (const key of Object.keys(state.projects) as (keyof GymState['projects'])[]) state.projects[key] = projectCap(key, gymLevel);
    const families = ['recovery', 'course', 'experience', 'automation', 'capacity'];
    const selected = families.map(family => equipmentCatalog.filter(item => item.family === family && item.unlockLevel <= gymLevel)
      .sort((first, second) => second.grade - first.grade)[0]).filter(Boolean).slice(0, equipmentCapacity(state));
    state.equippedEquipment = selected.map(item => item.id);
    state.ownedEquipment = [...state.equippedEquipment];
    for (const item of selected) {state.purchasePrices[item.id] = item.price; state.collectedEquipment[item.id] = {firstAt: at};}
  }
  if (!validGym(state)) throw new Error(`Invalid audit state: gym ${gymLevel} built ${built} auto ${automatic}`);
  return state;
}

function apply(state: GymState, id: GymConsumableId): GymState {
  const stocked = structuredClone(state);
  stocked.inventory[id] = 1;
  const result = dispatchGym(stocked, stocked.revision, {type: 'use-consumable', id, playerId: stocked.player!.id}, at);
  if (result.error) throw new Error(result.error);
  return result.state;
}

/** The same event scheduling as offline replay, with the production shot implementation. */
function replay(initial: GymState, options: {targetLevel?: number; elapsedMs?: number}) {
  let state = structuredClone(initial), elapsed = 0, first = true;
  const baselineXp = experienceForLevel(initial.player!.level) + initial.player!.experience;
  const initialShots = initial.player!.shots;
  const deadline = options.elapsedMs === undefined ? Infinity : at + options.elapsedMs;
  let guard = 0;
  for (;;) {
    const player = state.player!;
    if (player.level >= (options.targetLevel ?? playerLevelCap)) break;
    const earliestStamina = player.stamina >= 1 ? state.updatedAt : state.updatedAt + recoverySeconds(state) * 1_000 - player.recoveryMs;
    const nextAt = Math.max(state.updatedAt, player.nextShotAt, earliestStamina);
    if (nextAt > deadline) break;
    state = advanceGym(state, nextAt);
    const events: GymEvent[] = [];
    trainPlayer(state, state.player!, nextAt, events, !first);
    first = false;
    elapsed = nextAt - at;
    if (++guard > 50_000) throw new Error('Audit guard reached');
  }
  if (Number.isFinite(deadline)) state = advanceGym(state, deadline);
  const player = state.player!;
  return {elapsedMs: elapsed, shots: player.shots - initialShots,
    xp: experienceForLevel(player.level) + player.experience - baselineXp,
    remainingChalk: guaranteedGreatShots(player), state};
}

const scenarios = [];
for (let gymLevel = 1; gymLevel <= 8; gymLevel++) for (const built of [false, true]) for (const automatic of gymLevel === 1 ? [false] : [false, true]) {
  const results = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const initial = fixture(gymLevel, built, automatic, seed);
    const targetLevel = initial.player!.level + 10;
    const baseTarget = replay(initial, {targetLevel});
    const baseWindow = replay(initial, {elapsedMs: horizonMs});
    for (const id of ['drink', ...(gymLevel >= 3 ? ['chalk'] : [])] as GymConsumableId[]) {
      const item = consumableById.get(id)!;
      const modified = apply(initial, id);
      const target = replay(modified, {targetLevel});
      const window = replay(modified, {elapsedMs: horizonMs});
      results.push({id, price: item.price, targetSecondsSaved: (baseTarget.elapsedMs - target.elapsedMs) / 1_000,
        targetShotsSaved: baseTarget.shots - target.shots, windowExtraXp: window.xp - baseWindow.xp,
        windowExtraShots: window.shots - baseWindow.shots, remainingChalk: window.remainingChalk});
    }
  }
  const sample = fixture(gymLevel, built, automatic, 1);
  const ids = ['drink', ...(gymLevel >= 3 ? ['chalk'] : [])];
  scenarios.push({gymLevel, built, mode: automatic ? 'automatic' : 'manual', startLevel: sample.player!.level,
    targetLevel: sample.player!.level + 10, startStamina: 0, staminaCap: staminaMax(sample),
    recoverySeconds: recoverySeconds(sample), courseRecovery: trainingStatus(sample).recovery,
    intervalSeconds: automatic ? automaticIntervalMs(sample) / 1_000 : 1,
    expectedXpPerShot: round(.3 * trainingShotExperience(sample, 'hold') + .6 * trainingShotExperience(sample, 'success') + .1 * trainingShotExperience(sample, 'great')),
    items: ids.map(id => {const rows = results.filter(row => row.id === id), price = rows[0].price; return {id, price,
      meanTargetSecondsSaved: round(mean(rows.map(row => row.targetSecondsSaved))),
      meanSecondsSavedPerCoupon: round(mean(rows.map(row => row.targetSecondsSaved)) / price),
      meanTargetShotsSaved: round(mean(rows.map(row => row.targetShotsSaved))),
      meanWindowExtraXp: round(mean(rows.map(row => row.windowExtraXp))),
      meanWindowExtraXpPerCoupon: round(mean(rows.map(row => row.windowExtraXp)) / price),
      meanWindowExtraShots: round(mean(rows.map(row => row.windowExtraShots))),
      meanChalkRemainingAfterWindow: round(mean(rows.map(row => row.remainingChalk)))};})});
}

const team = [];
for (let gymLevel = 3; gymLevel <= 8; gymLevel++) {
  let state = fixture(gymLevel, true, true, 81);
  for (let index = 1; index < gymLevel; index++) state.bench.push({...structuredClone(state.player!), id: `audit-${index}`});
  const before = [state.player!, ...state.bench].map(player => player.stamina);
  const after = apply(state, 'supplement');
  const restored = [after.player!, ...after.bench].reduce((sum, player, index) => sum + player.stamina - before[index], 0);
  team.push({gymLevel, injuredPlayers: gymLevel, restored, price: 2, staminaPerCoupon: restored / 2,
    singleDrinkCostForSameStamina: gymLevel, discountPercent: round((1 - 2 / gymLevel) * 100)});
}
function replayTeam(initial: GymState, targetLevel: number) {
  let state = structuredClone(initial);
  const reached = new Map<string, number>();
  for (let guard = 0; guard < 50_000; guard++) {
    const players = activePlayers(state).filter(player => player.autoEnabled && player.level < 99);
    const nextAt = Math.min(...players.map(player => Math.max(state.updatedAt, player.nextShotAt,
      player.stamina >= 1 ? state.updatedAt : state.updatedAt + recoverySeconds(state) * 1_000 - player.recoveryMs)));
    state = advanceGym(state, nextAt);
    const due = activePlayers(state).filter(player => player.autoEnabled && player.level < 99 && player.nextShotAt <= nextAt && player.stamina >= 1)
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const player of due) {
      trainPlayer(state, player, nextAt, [], player.shots > 0);
      if (player.level >= targetLevel && !reached.has(player.id)) reached.set(player.id, (nextAt - at) / 1_000);
    }
    if (reached.size === activePlayers(initial).length) return {allSeconds: Math.max(...reached.values()), playerSeconds: [...reached.values()].reduce((sum, value) => sum + value, 0)};
  }
  throw new Error('Team target did not finish');
}
const teamPerformance = [];
for (const gymLevel of [3, 5, 8]) {
  const rows = [];
  for (let seed = 1; seed <= 16; seed++) {
    const initial = fixture(gymLevel, true, true, seed);
    initial.player!.level = initial.player!.peakLevel = 20;
    for (let index = 1; index < gymLevel; index++) initial.bench.push({...structuredClone(initial.player!), id: `audit-${index}`});
    const baseline = replayTeam(initial, 30);
    const variants = [{name: 'one-drink', price: 1, state: apply(initial, 'drink')}, {name: 'team-supply', price: 2, state: apply(initial, 'supplement')}];
    for (const variant of variants) {
      const result = replayTeam(variant.state, 30);
      rows.push({name: variant.name, price: variant.price, allSecondsSaved: baseline.allSeconds - result.allSeconds,
        playerSecondsSaved: baseline.playerSeconds - result.playerSeconds});
    }
  }
  teamPerformance.push({gymLevel, injuredPlayers: gymLevel, startLevel: 20, targetLevel: 30, seedCount: 16,
    items: ['one-drink', 'team-supply'].map(name => {const list = rows.filter(row => row.name === name), price = list[0].price; return {name, price,
      meanAllFinishedSecondsSaved: round(mean(list.map(row => row.allSecondsSaved))),
      meanAllFinishedSecondsSavedPerCoupon: round(mean(list.map(row => row.allSecondsSaved)) / price),
      meanTotalPlayerSecondsSaved: round(mean(list.map(row => row.playerSecondsSaved))),
      meanTotalPlayerSecondsSavedPerCoupon: round(mean(list.map(row => row.playerSecondsSaved)) / price)};})});
}
const sensitivity = [];
for (const gymLevel of [3, 8]) for (const startLevel of [0, 20, 98]) for (const supply of ['empty', 'half', 'full'] as const) {
  const rows = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const initial = fixture(gymLevel, true, true, seed);
    initial.player!.level = initial.player!.peakLevel = startLevel;
    const cap = staminaMax(initial);
    initial.player!.stamina = supply === 'full' ? cap : supply === 'half' ? Math.floor(cap / 2) : 0;
    const targetLevel = Math.min(99, startLevel + 10);
    const baseline = replay(initial, {targetLevel});
    for (const id of ['drink', 'chalk'] as const) {
      const stocked = structuredClone(initial); stocked.inventory[id] = 1;
      const reason = consumableUseReason(stocked, id);
      if (reason) {rows.push({id, reason, saved: 0, consumedChalk: 0}); continue;}
      const finish = replay(apply(initial, id), {targetLevel});
      rows.push({id, reason: '', saved: (baseline.elapsedMs - finish.elapsedMs) / 1_000,
        consumedChalk: id === 'chalk' ? chalkTrainingShots - finish.remainingChalk : 0});
    }
  }
  sensitivity.push({gymLevel, startLevel, targetLevel: Math.min(99, startLevel + 10), initialStamina: supply,
    items: (['drink', 'chalk'] as const).map(id => {const list = rows.filter(row => row.id === id); return {id, refused: list[0].reason || null,
      meanSecondsSaved: round(mean(list.map(row => row.saved))), meanChalkShotsConsumed: round(mean(list.map(row => row.consumedChalk)))};})});
}
const capped = fixture(8, true, true, 83); capped.player!.level = capped.player!.peakLevel = 99; capped.inventory.chalk = 1;
const full = fixture(8, true, true, 84); full.player!.stamina = staminaMax(full); full.inventory.drink = 1; full.inventory.supplement = 1;
const safeguards = {cappedChalk: consumableUseReason(capped, 'chalk'), fullDrink: consumableUseReason(full, 'drink'), fullTeam: consumableUseReason(full, 'supplement')};
const output = {version: 1, basis: 'production-engine-event-replay', seedCount: seeds, fixedHorizonSeconds: horizonMs / 1_000,
  targetRule: 'start level + 10', assumptions: 'Zero starting stamina; bare vs fully purchased currently unlocked projects and utility equipment; one item only; no fake elapsed time or extra courses; paired seeds.',
  chalkGuaranteedShots: chalkTrainingShots, scenarios, team, teamPerformance, sensitivity, safeguards};
await mkdir('docs/balance', {recursive: true});
await writeFile('docs/balance/consumables-value-20261116.json', JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({scenarios: scenarios.length, seedCount: seeds, fixedHorizonSeconds: horizonMs / 1_000,
  representative: scenarios.filter(row => [1,3,5,8].includes(row.gymLevel) && (row.gymLevel === 1 || row.mode === 'automatic')), team, teamPerformance, sensitivity, safeguards}, null, 2));
