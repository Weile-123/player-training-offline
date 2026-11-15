import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const input = process.argv[2] ?? '.tmp/v11-economy-production.json';
const output = process.argv[3] ?? '.tmp/v11-economy-production-summary.json';
const report = JSON.parse(await readFile(input, 'utf8'));
assert.equal(report.partial, false);
assert.equal(report.economyVersion, 11);
const {templateById, equipmentCatalog} = await import(pathToFileURL(resolve(report.baseline.output)).href);
const equipment = new Map(equipmentCatalog.map(item => [item.id, item]));
const sourceHashMatchesCurrentFiles = Object.fromEntries(await Promise.all(Object.entries(report.baseline.hashes)
  .map(async ([file, frozenHash]) => [file, createHash('sha256').update(await readFile(file)).digest('hex') === frozenHash])));

function funding(run) {
  const rows = run.recommendationsEvidence;
  const first = rows.filter(row => row.isFirstPostgameRecommendation);
  const repeat = rows.filter(row => row.repeatTemplate);
  const firstCredits = first.reduce((sum, row) => sum + row.actual, 0);
  const repeatCredits = repeat.reduce((sum, row) => sum + row.actual, 0);
  assert.equal(firstCredits + repeatCredits, run.grossCredits);
  assert.equal(repeatCredits, repeat.length);
  const countsByTier = Object.fromEntries(['rotation', 'starter', 'star', 'superstar', 'legend'].map(tier => {
    const matches = first.filter(row => templateById(row.templateId)?.tier === tier);
    return [tier, {templates: matches.length, credits: matches.reduce((sum, row) => sum + row.actual, 0)}];
  }));
  let paidUpgradeTarget = 3, previousPermanentSeconds = 0;
  const recommendationsByPlayer = new Map(rows.map(row => [row.playerId, row]));
  const spendingByGym = Object.fromEntries(Array.from({length: 8}, (_, i) => [i + 1, 0]));
  const projectLevels = {};
  const permanent = [];
  for (const transaction of run.transactions) {
    // G1->G2 costs zero, so it is intentionally absent from cash transactions.
    // Paid upgrade charges belong to the preceding gym; later same-time buys
    // belong to the newly reached gym. Recommendation evidence has exact levels.
    const gym = transaction.type === 'upgrade-gym' ? paidUpgradeTarget - 1
      : transaction.type === 'recommend' ? recommendationsByPlayer.get(transaction.id).gymLevel
        : Math.max(1, ...Object.entries(run.gymMilestones).filter(([, entry]) => entry.seconds <= transaction.seconds).map(([level]) => Number(level)));
    if (transaction.amount < 0) spendingByGym[gym] -= transaction.amount;
    if (['buy-equipment', 'upgrade-project', 'upgrade-gym'].includes(transaction.type)) {
      const projectLevel = transaction.type === 'upgrade-project' ? projectLevels[transaction.id] = (projectLevels[transaction.id] ?? 0) + 1 : undefined;
      const item = transaction.type === 'buy-equipment' ? equipment.get(transaction.id) : undefined;
      permanent.push({...transaction, cost: -transaction.amount, gymBefore: gym,
        projectLevel, name: item?.name, family: item?.family,
        intervalSincePreviousPermanentSeconds: transaction.seconds - previousPermanentSeconds});
      previousPermanentSeconds = transaction.seconds;
    }
    if (transaction.type === 'upgrade-gym') paidUpgradeTarget++;
  }
  const stages = Array.from({length: 8}, (_, i) => {
    const level = i + 1;
    const from = level === 1 ? 0 : run.gymMilestones[level]?.seconds;
    const until = run.gymMilestones[level + 1]?.seconds ?? run.seconds;
    const stageRows = rows.filter(row => row.gymLevel === level);
    const income = stageRows.reduce((sum, row) => sum + row.actual, 0);
    const startCash = level === 1 ? 0 : run.gymMilestones[level]?.credits;
    const endCash = run.gymMilestones[level + 1]?.credits ?? run.credits;
    if (startCash !== undefined) assert.equal(startCash + income - spendingByGym[level], endCash, `Exact stage cash at gym${level}`);
    return {gymLevel: level, startSeconds: from, endSeconds: until, durationSeconds: from === undefined ? null : until - from,
      recommendedPlayers: stageRows.length, firstRecommendations: stageRows.filter(row => row.isFirstPostgameRecommendation).length,
      repeatRecommendations: stageRows.filter(row => row.repeatTemplate).length,
      actualIncome: income, spending: spendingByGym[level], cashAfterEntering: startCash, cashAtStageEnd: endCash,
      templatesAfterEntering: level === 1 ? 0 : run.gymMilestones[level]?.templates};
  });
  return {firstNormal: {recommendations: first.length, credits: firstCredits},
    repeats: {recommendations: repeat.length, credits: repeatCredits},
    unmatchedRecommendations: rows.filter(row => !row.templateId).length,
    firstNormalByTier: countsByTier, stages,
    timeAfterGym8: run.firstGym8 ? {seconds: run.seconds - run.firstGym8.seconds,
      fractionOfConstructionTime: (run.seconds - run.firstGym8.seconds) / run.seconds} : null,
    lastTenPermanentTransactions: permanent.slice(-10),
    highRecoveryInvestments: permanent.filter(tx => (tx.type === 'upgrade-project' && tx.id === 'recovery' && tx.projectLevel >= 7)
      || (tx.family === 'recovery' && tx.cost === 30) || (tx.family === 'course' && tx.cost === 36)),
    timingNote: 'Transaction times and gaps describe this policy order, not causal attribution of total waiting time to one purchase.'};
}

const summary = {date: report.date, economyVersion: report.economyVersion, partial: report.partial, baseline: report.baseline,
  sourceHashMatchesCurrentFiles, policy: report.policy ?? 'staged-legend',
  source: input, assumptions: report.assumptions, rule: report.rule, selectedAdmissionEconomics: report.selectedAdmissionEconomics,
  execution: report.execution,
  progression: report.progression.map(run => ({seed: run.seed, complete: run.complete, seconds: run.seconds, horizonHours: run.horizonHours,
    gymLevel: run.gymLevel, remainingPermanentCost: run.remainingPermanentCost, grossCredits: run.grossCredits,
    actualSpent: run.actualSpent, constructionSpent: run.constructionSpent, credits: run.credits, shots: run.shots,
    templates: run.templates, recommendations: run.recommendations, firstGym8: run.firstGym8,
    recommendedTemplateCount: run.postgameRecommendedTemplates.length, funding: funding(run)})),
  flows: report.flows.map(run => ({seed: run.seed, strategy: run.strategy, seconds: run.seconds,
    initialCredits: run.initialCredits, endCredits: run.endCredits, actualIncome: run.grossActualCredits,
    actualSelectedSpending: run.actualSelectedSpending, netCredits: run.netCredits, births: run.births, paidBirths: run.paidBirths,
    unaffordablePaidAttempts: run.unaffordablePaidAttempts, recommendations: run.recommendations,
    initialTemplates: run.initialTemplates, finalTemplates: run.finalTemplates, newTemplates: run.newTemplates,
    shots: run.shots, firstRecommendations: run.firstPostgameRecommendations, repeatRecommendations: run.repeatTemplateRecommendations,
    initialRecommendedTemplateCount: run.initialPostgameRecommendedTemplates.length,
    finalRecommendedTemplateCount: run.finalPostgameRecommendedTemplates.length})),
  controlled: report.controlled.summary.map(row => ({direction: row.direction, recruitmentProject: row.recruitmentProject,
    seeds: row.seeds, athletes: row.athletes, free: row.free, selected: row.selected, effect: row.effect, milestones: row.milestones}))};
await mkdir(dirname(output), {recursive: true});
await writeFile(output, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({output, bytes: Buffer.byteLength(JSON.stringify(summary)), progression: summary.progression.map(run => ({seed: run.seed,
  hours: run.seconds / 3600, gross: run.grossCredits, first: run.funding.firstNormal, repeats: run.funding.repeats,
  after8Hours: run.funding.timeAfterGym8 ? run.funding.timeAfterGym8.seconds / 3600 : null,
  after8Fraction: run.funding.timeAfterGym8?.fractionOfConstructionTime ?? null,
  recovery: run.funding.highRecoveryInvestments.map(tx => ({type: tx.type, id: tx.id, level: tx.projectLevel, cost: tx.cost, atHours: tx.seconds / 3600})),
  lastPurchase: run.funding.lastTenPermanentTransactions.at(-1)}))}, null, 2));
