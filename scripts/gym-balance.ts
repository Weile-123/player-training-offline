import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {advanceGym, automaticIntervalMs, dispatchGym, equipmentCapacity, equipmentCatalog, equipmentEffects,
  newGym, playerValue, projectCost, recoverySeconds, staminaMax, type GymAction, type GymState} from '../src/game/gym/engine';
import {experienceForLevel, requiredExperience} from '../src/game/gym/progression';
import {templateById} from '../src/game/templates';
import {templateRules} from '../src/game/contract/templates';
import {validGym} from '../src/game/gym/save';

const sampleSize = Number(process.env.GYM_BALANCE_SEEDS ?? 100);
if (!Number.isInteger(sampleSize) || sampleSize < 1 || sampleSize > 1000) throw new Error('GYM_BALANCE_SEEDS must be 1..1000');
const milestones = [1, 5, 10, 18, 30];
const epoch = 1_800_000_000_000;
const tiers = ['rotation', 'starter', 'star', 'superstar', 'legend'];
type Profile = {id: string; name: string; gym: number; mode: 'manual' | 'auto'; endurance: number; recovery: number; automation: number; equipment: number; kit: boolean};
const profiles: Profile[] = [
  {id: 'base-manual', name: 'Lv1 手动·零加成', gym: 1, mode: 'manual', endurance: 0, recovery: 0, automation: 0, equipment: 0, kit: false},
  {id: 'base-auto', name: 'Lv2 自动·零加成', gym: 2, mode: 'auto', endurance: 0, recovery: 0, automation: 0, equipment: 0, kit: false},
  {id: 'early-manual', name: 'Lv2 手动·初级器材', gym: 2, mode: 'manual', endurance: 1, recovery: 1, automation: 0, equipment: 0, kit: true},
  {id: 'early-auto', name: 'Lv2 自动·初级器材', gym: 2, mode: 'auto', endurance: 1, recovery: 1, automation: 0, equipment: 0, kit: true},
  {id: 'mid-auto', name: 'Lv4 自动·中期配置', gym: 4, mode: 'auto', endurance: 4, recovery: 4, automation: 3, equipment: 3, kit: true},
  {id: 'late-auto', name: 'Lv8 自动·满级配置', gym: 8, mode: 'auto', endurance: 8, recovery: 8, automation: 5, equipment: 4, kit: true},
];

function command(state: GymState, action: GymAction, at = state.updatedAt): GymState {
  const result = dispatchGym(state, state.revision, action, at);
  if (result.error) throw new Error(action.type + ': ' + result.error);
  return result.state;
}

// Select real catalog items by marginal improvement in the three existing stamina
// systems. Collection prerequisites are assumed already earned, never bypassed in UI.
function chooseKit(state: GymState): string[] {
  const candidates = equipmentCatalog.filter(item => item.unlockLevel <= state.gymLevel);
  const utility = (s: GymState) => {
    const effects = equipmentEffects(s);
    return effects.courseRecovery * 10 + effects.recovery * 7 + effects.stamina;
  };
  while (state.equippedEquipment.length < equipmentCapacity(state)) {
    const before = utility(state);
    const next = candidates.filter(item => !state.equippedEquipment.includes(item.id)).map(item => ({item,
      gain: utility({...state, equippedEquipment: [...state.equippedEquipment, item.id], ownedEquipment: [...state.ownedEquipment, item.id]}) - before}))
      .sort((a, b) => b.gain - a.gain || a.item.price - b.item.price || a.item.id.localeCompare(b.item.id))[0];
    if (!next || next.gain <= 0) break;
    state.equippedEquipment.push(next.item.id);
    state.ownedEquipment.push(next.item.id);
    state.collectedEquipment[next.item.id] = {firstAt: epoch};
  }
  return state.equippedEquipment;
}

function fixture(profile: Profile, seed: number): GymState {
  const state = newGym(epoch, seed);
  state.gymLevel = profile.gym;
  Object.assign(state.projects, {endurance: profile.endurance, recovery: profile.recovery, automation: profile.automation, equipment: profile.equipment});
  if (profile.kit) chooseKit(state);
  state.player!.stamina = staminaMax(state);
  finalizeFixture(state);
  if (profile.mode === 'auto') return command(state, {type: 'set-auto', id: state.player!.id, enabled: true});
  return state;
}

function finalizeFixture(state: GymState) {
  state.purchasePrices = Object.fromEntries(state.ownedEquipment.map(id => [id,
    state.purchasePrices[id] ?? equipmentCatalog.find(item => item.id === id)!.price]));
  const required = Math.max(0, ...state.ownedEquipment.map(id => equipmentCatalog.find(item => item.id === id)!.requiredTemplates));
  for (const template of templateRules.slice(0, required)) state.collection[template.id] ??= {firstAt: epoch, highestRating: 0, highestValue: '0'};
  for (const id of state.ownedEquipment) state.collectedEquipment[id] ??= {firstAt: epoch};
  if (!validGym(state)) throw new Error('invalid controlled simulation fixture');
}

function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1)] ?? null;
  return {count: sorted.length, mean: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : null,
    min: sorted[0] ?? null, p50: p(.5), p90: p(.9), max: sorted[sorted.length - 1] ?? null};
}

type Point = {level: number; shots: number; seconds: number; tier: number; value: string};
function simulate(profile: Profile, seed: number, maxLevel = 30, specific?: string) {
  let state = fixture(profile, seed);
  if (specific) {
    state.ownedEquipment = state.equippedEquipment = [specific];
    state.player!.stamina = staminaMax(state);
    finalizeFixture(state);
  }
  const points: Point[] = [];
  const firstTiers: Record<string, Point> = {};
  const snapshots: Record<number, Point> = {};
  let now = epoch;
  let iterations = 0;
  while (state.player!.level < maxLevel) {
    if (++iterations > 1_000_000) throw new Error('simulation did not terminate');
    const athlete = state.player!;
    let due = Math.max(state.updatedAt, athlete.nextShotAt);
    if (athlete.stamina < 1) due = Math.max(due, state.updatedAt + recoverySeconds(state) * 1000 - athlete.recoveryMs);
    // Browser auto scheduler polls every 200ms. Manual input is assumed prompt.
    now = profile.mode === 'auto' ? epoch + Math.ceil((due - epoch) / 200) * 200 : due;
    state = advanceGym(state, now);
    const before = state.player!.shots;
    state = command(state, profile.mode === 'auto' ? {type: 'auto-step'} : {type: 'train', id: state.player!.id}, now);
    if (state.player!.shots === before) {now += 200; state = advanceGym(state, now); continue;}
    const tier = tiers.indexOf(templateById(state.player!.templateId)?.tier ?? '') + 1;
    const point = {level: state.player!.level, shots: state.player!.shots, seconds: (now - epoch) / 1000, tier, value: playerValue(state)};
    if ([30, 50, 100].includes(point.shots)) snapshots[point.shots] = point;
    for (let index = 1; index <= tier; index++) firstTiers[index] ??= point;
    if (milestones.includes(point.level) && !points.some(existing => existing.level === point.level)) points.push(point);
  }
  return {points, firstTiers, snapshots, final: state.player!};
}

const maximumXP = experienceForLevel(99);
if (process.env.GYM_BALANCE_VALIDATE_ONLY === '1') {
  for (const profile of profiles) finalizeFixture(fixture(profile, 17));
  for (const item of equipmentCatalog) {
    const state = fixture({...profiles[0], gym: 8}, 17);
    state.ownedEquipment = state.equippedEquipment = [item.id];
    state.player!.stamina = staminaMax(state);
    finalizeFixture(state);
  }
  console.log(`All six profiles and ${equipmentCatalog.length} single-item fixtures pass production save validation.`);
  process.exit(0);
}
// Renewal equation: expected additional shots for remaining XP, including overshoot.
// XP comes in multiples of 4, so using ceil(XP/4) preserves exact stopping rules.
const expected = new Float64Array(Math.ceil(maximumXP / 4) + 1);
for (let n = 1; n < expected.length; n++) expected[n] = 1 + .3 * expected[Math.max(0, n - 2)]
  + .6 * expected[Math.max(0, n - 3)] + .1 * expected[Math.max(0, n - 5)];
const curve = Array.from({length: 100}, (_, level) => {
  const cumulativeXP = experienceForLevel(level);
  return {level, nextLevelXP: level === 99 ? null : requiredExperience(level), cumulativeXP,
    expectedShots: expected[Math.ceil(cumulativeXP / 4)], bestShots: Math.ceil(cumulativeXP / 20), worstShots: Math.ceil(cumulativeXP / 8)};
});

const scenarios: any[] = [];
for (const profile of profiles) {
  console.log('Simulating ' + profile.id + ' (' + sampleSize + ' seeds)...');
  const base = fixture(profile, 1);
  const samples = Array.from({length: sampleSize}, (_, index) => simulate(profile, index + 1));
  const projectInvestment = Object.entries(base.projects).reduce((cost, [id, level]) => cost
    + Array.from({length: level}, (_, i) => projectCost(id, i + 1)).reduce((a, b) => a + b, 0), 0);
  const equipment = base.equippedEquipment.map(id => equipmentCatalog.find(item => item.id === id)!);
  scenarios.push({profile, config: {capacity: staminaMax(base), recoverySeconds: recoverySeconds(base),
    courseRecovery: 4 + equipmentEffects(base).courseRecovery, automaticSeconds: profile.mode === 'auto' ? automaticIntervalMs(base) / 1000 : null,
    projectInvestment, equipmentInvestment: equipment.reduce((total, item) => total + item.price, 0), equipment: equipment.map(item => ({id: item.id, name: item.name, description: item.description}))},
    milestones: milestones.map(level => ({level, shots: summary(samples.map(sample => sample.points.find(p => p.level === level)!.shots)),
      seconds: summary(samples.map(sample => sample.points.find(p => p.level === level)!.seconds))})),
    shotSnapshots: [30, 50, 100].map(shots => ({shots,
      levels: summary(samples.map(sample => sample.snapshots[shots].level)),
      seconds: summary(samples.map(sample => sample.snapshots[shots].seconds)),
      tiers: [0, 1, 2, 3, 4, 5].map(tier => samples.filter(sample => sample.snapshots[shots].tier === tier).length)})),
    templateAttainmentByLevel30: [1, 2, 3, 4, 5].map(tier => ({tier,
      shots: summary(samples.flatMap(sample => sample.firstTiers[tier] ? [sample.firstTiers[tier].shots] : [])),
      seconds: summary(samples.flatMap(sample => sample.firstTiers[tier] ? [sample.firstTiers[tier].seconds] : []))}))});
}

console.log('Auditing all ' + equipmentCatalog.length + ' single-item effects...');
const individualEquipment = equipmentCatalog.map(item => {
  const profile: Profile = {id: item.id, name: item.name, gym: 8, mode: 'manual', endurance: 0, recovery: 0, automation: 0, equipment: 0, kit: false};
  const result = simulate(profile, 17, 18, item.id);
  return {id: item.id, name: item.name, unlockLevel: item.unlockLevel, price: item.price,
    shotsTo18: result.final.shots, secondsTo18: result.points.find(p => p.level === 18)!.seconds, effects: item.effects};
});

function simulateParallel(count: number, seed: number) {
  let state = fixture({...profiles[1], gym: 8}, seed);
  while (1 + state.bench.length < count) state = command(state, {type: 'recruit'});
  for (const player of state.bench) state = command(state, {type: 'set-auto', id: player.id, enabled: true});
  let now = epoch;
  while ([state.player!, ...state.bench].some(player => player.level < 10)) {
    const candidates = [state.player!, ...state.bench].filter(player => player.level < 10);
    const due = Math.min(...candidates.map(player => Math.max(player.nextShotAt, state.updatedAt,
      player.stamina < 1 ? state.updatedAt + recoverySeconds(state) * 1000 - player.recoveryMs : 0)));
    now = epoch + Math.ceil((due - epoch) / 200) * 200;
    state = advanceGym(state, now);
    state = command(state, {type: 'auto-step'}, now);
    // Stop a completed trainee through the same supported toggle, so all slots
    // are measured to Lv10 rather than silently continuing to consume RNG.
    for (const player of [state.player!, ...state.bench]) if (player.level >= 10 && player.autoEnabled)
      state = command(state, {type: 'set-auto', id: player.id, enabled: false}, now);
  }
  return {seconds: (now - epoch) / 1000, totalShots: [state.player!, ...state.bench].reduce((total, player) => total + player.shots, 0)};
}
console.log('Simulating parallel training at equal zero-gear rates...');
const parallelTraining = [1, 2, 4, 8].map(count => {
  const samples = Array.from({length: Math.min(25, sampleSize)}, (_, i) => simulateParallel(count, i + 1));
  return {count, gym: 8, sampleSize: samples.length, targetLevel: 10, automaticSeconds: 2,
    seconds: summary(samples.map(sample => sample.seconds)), totalShots: summary(samples.map(sample => sample.totalShots))};
});

const output = join(process.cwd(), 'docs', 'balance');
await mkdir(output, {recursive: true});
await writeFile(join(output, 'experience-curve.csv'), 'level,nextLevelXP,cumulativeXP,expectedShots,bestShots,worstShots\n'
  + curve.map(row => [row.level, row.nextLevelXP ?? '', row.cumulativeXP, row.expectedShots.toFixed(6), row.bestShots, row.worstShots].join(',')).join('\n') + '\n');
await writeFile(join(output, 'equipment-timing.csv'), 'id,name,unlockLevel,price,shotsTo18,secondsTo18\n'
  + individualEquipment.map(row => [row.id, row.name, row.unlockLevel, row.price, row.shotsTo18, row.secondsTo18].join(',')).join('\n') + '\n');
await writeFile(join(output, 'gym-balance.json'), JSON.stringify({schema: 1, balanceVersion: newGym(epoch, 1).balanceVersion, sampleSize, seeds: [1, sampleSize],
  maxSimulatedLevel: 30, automaticPollingMs: 200, curve, scenarios, individualEquipment, parallelTraining}, null, 2) + '\n');
console.log(JSON.stringify(scenarios.map(s => ({name: s.profile.name,
  milestones: s.milestones.map((m: any) => ({level: m.level, shots: m.shots.mean, seconds: m.seconds.mean})),
  legendaryBy30: s.templateAttainmentByLevel30[4].shots.count})), null, 2));
console.log('Wrote docs/balance/experience-curve.csv, equipment-timing.csv and gym-balance.json');
