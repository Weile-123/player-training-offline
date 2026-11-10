import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dispatch, newContract, previewShot, type Contract, type Action, type Options } from '../src/game/contract/engine';
import { match, templateRules, shape, type MatchInput } from '../src/game/contract/templates';
import { rules } from '../src/game/contract/rules';
import { evidence } from '../src/game/contract/reference/evidence';
import { statKeys } from '../src/game/types';
import { simulateCommerce } from '../src/game/contract/simulation';
import { validContract } from '../src/game/contract/save';
import {auditTemplates} from './template-audit';
import {searchTemplatePaths} from './template-search';

const command = process.argv[2] ?? 'simulate';
function arg(name: string, fallback: string) { const i = process.argv.indexOf(`--${name}`); return i < 0 ? fallback : process.argv[i + 1]; }
const dir = resolve(arg('out', 'output/contract'));
mkdirSync(dir, { recursive: true });
function output(name: string, data: unknown) { writeFileSync(resolve(dir, name), JSON.stringify(data, null, 2), 'utf8'); }
function act(s: Contract, action: Action, options: Options = {}) {
  const result = dispatch(s, s.revision, action, options);
  if (result.error) throw new Error(result.error);
  return result.state;
}

if (command === 'economy') {
  const count=Number(arg('runs','1000')), seed=Number(arg('seed','20261019')), months=Number(arg('months','40'));
  if(!Number.isSafeInteger(count)||count<1||count>100000||!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff) throw new Error('无效模拟参数');
  const rows: object[]=[], counters: Record<string,number>={}, failures: object[]=[], frequencies: Record<string,number>={};
  let completed=0, ended=0, censored=0, sumMonths=0;
  for(let i=0;i<count;i++) {
    try {
      const r=simulateCommerce((seed+i)>>>0,months);
      if(!validContract(r.state)) throw new Error('模拟产生无效存档');
      rows.push({run:i,month:r.state.month,status:r.status,credit:r.state.credit,cash:r.state.cash,delivered:r.state.delivered,shots:r.state.totalShots,equipment:r.state.equipment.length});
      completed+=Number(r.state.completed); ended+=Number(r.status==='over'); censored+=Number(r.status!=='over'); sumMonths+=r.state.month;
      for(const [k,v] of Object.entries(r.counters)) counters[k]=(counters[k]??0)+v;
      for(const id of Object.keys(r.state.collection)) frequencies[id]=(frequencies[id]??0)+1;
    } catch(e) { failures.push({run:i,error:e instanceof Error?e.message:String(e)}); }
    if((i+1)%1000===0) console.log(`交易模拟 ${i+1}/${count}`);
  }
  const report={rules:rules.version,seed,count,months,completed,ended,censored,meanEndingMonth:sumMonths/Math.max(1,count-failures.length),failures,counters,frequencies,limitations:['单一启发式策略；94件启用器材、16件按条件永久解锁；支持优先级满槽换装。','所有装备经首月赠礼或实际积分购买，现金仅来自交付和合法效果。','不代表完整原作平衡或最终流派结论。'],evidence};
  output('commerce-simulation.json',report); output('commerce-runs.json',rows); console.log(JSON.stringify(report,null,2));
  if(failures.length) process.exitCode=1;
} else if (command === 'match') {
  const path = arg('input', '');
  if (!path) throw new Error('使用 --input 指定球员JSON（level、height、stats；可选templateId、matchSeed、lastStyle）');
  const input = JSON.parse(readFileSync(path, 'utf8')) as MatchInput;
  input.templateId ??= null; input.matchSeed ??= 1; input.lastStyle ??= shape(input.stats);
  const result = match(input);
  output('match-diagnostics.json', { input, result });
  console.log(JSON.stringify({ templateId: result.templateId, tier: result.tier, report: resolve(dir, 'match-diagnostics.json') }));
} else if (command === 'audit') {
  auditTemplates(dir,arg('witnesses','src/game/contract/fixtures/template-paths.json'),arg('before-level','')?Number(arg('before-level','')):undefined);
} else if (command === 'audit-search') {
  searchTemplatePaths(dir,Number(arg('runs','10000')),Number(arg('seed','40261021')),arg('resume',''),arg('before-level','')?Number(arg('before-level','')):undefined);
} else if (command === 'audit-injected') {
  const count = Number(arg('runs', '1000')), seed = Number(arg('seed', '20261019'));
  const gain = Number(arg('growth', String(rules.growth.gain)));
  if (!Number.isSafeInteger(gain) || gain < 1 || gain > 100) throw new Error('无效成长预算');
  if (!Number.isSafeInteger(count) || count < 1 || count > 100000 || !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('无效路径搜索参数');
  const equipment = ['relic_003', 'relic_060', 'relic_002', 'relic_048', 'relic_026', 'relic_057', 'relic_088', 'relic_095'];
  const witnesses: Record<string, { seed: number; equipment: string[]; growth: number; actions: Action[] }> = {};
  const errors: string[] = [];
  for (let i = 0; i < count; i++) {
    const runSeed = (seed + i) >>> 0;
    let s = newContract(runSeed, equipment), actions: Action[] = [];
    for (let step = 0; step < 160 && s.players.some(p => p.id === 'p1'); step++) {
      if (s.clockMs < s.nextShotAt) { const action: Action = { type: 'advance', milliseconds: s.nextShotAt - s.clockMs }; s = act(s, action); actions.push(action); }
      const action: Action = { type: 'train', playerId: 'p1' };
      const r = dispatch(s, s.revision, action, { gain, loss: gain });
      if (r.error) { errors.push(`${runSeed}:${r.error}`); break; }
      s = r.state; actions.push(action);
      for (const event of r.events) if (event.type === 'unlock' && event.templateId && !witnesses[event.templateId]) witnesses[event.templateId] = { seed: runSeed, equipment, growth: gain, actions: [...actions] };
      if ((s.players.find(p => p.id === 'p1')?.level ?? 0) >= 24) break;
    }
  }
  // 用相同公共dispatch入口重放见证路径，不人工注入属性、等级、结果或手感。
  const replayFailures: string[] = [];
  for (const [id, w] of Object.entries(witnesses)) {
    let s = newContract(w.seed, w.equipment);
    for (const a of w.actions) s = act(s, a, { gain: w.growth, loss: w.growth });
    if (!s.collection[id]) replayFailures.push(id);
  }
  const rows = templateRules.map(t => {
    const input = { level: t.minLevel, height: Math.round((t.height[0] + t.height[1]) / 2), stats: t.stats, templateId: null, matchSeed: 1, lastStyle: shape(t.stats) };
    const result = match(input);
    return { id: t.id, eligible: result.rows.find(r => r.id === t.id)!.eligible, selected: result.templateId === t.id, winner: result.templateId, path: witnesses[t.id] ? 'replayed' : 'not-found-in-budget' };
  });
  output('reachability.json', { seed, count, growth: gain, rules: rules.version, note: '使用免费注入的火热测试装备，定向追求高等级；仅证明给定配置存在合法培养路径，不是自然出现概率或购买可达证明。未找到不等于不可达。', errors, replayFailures, rows });
  output('reachability-witnesses.json', witnesses);
  console.log(JSON.stringify({ templates: rows.length, staticEligible: rows.filter(r => r.eligible).length, staticSelected: rows.filter(r => r.selected).length, replayed: Object.keys(witnesses).length, replayFailures, errors, report: resolve(dir, 'reachability.json') }, null, 2));
} else if (command === 'simulate') {
  const count = Number(arg('runs', '10000')), seed = Number(arg('seed', '20261019')), maxMonths = Number(arg('months', '60'));
  if (!Number.isSafeInteger(count) || count < 1 || count > 100000 || !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff || !Number.isSafeInteger(maxMonths) || maxMonths < 1 || maxMonths > 120) throw new Error('无效模拟参数');
  const builds = [
    { name: 'baseline', equipment: [] as string[], stop: 5 },
    { name: 'steady-test-loadout', equipment: ['relic_003', 'relic_060', 'relic_002'], stop: 7 },
    { name: 'risk-test-loadout', equipment: ['relic_075', 'relic_037'], stop: 7 },
  ];
  const rows: { run: number; build: string; month: number; completed: boolean; status: string; shots: number; cash: string; delivered: string }[] = [];
  const outcomes: Record<string, number> = {}, frequencies: Record<string, number> = {}, groups: Record<string, { runs: number; months: number; completed: number; over: number; censored: number }> = {};
  let cappedStats = 0, statSamples = 0, highLevelLowTier = 0, highLevelSamples = 0;
  let severeChances = 0, trials = 0;
  const start = Date.now();
  for (let run = 0; run < count; run++) {
    const build = builds[run % builds.length];
    let s = newContract((seed + run) >>> 0, build.equipment), limit = '', operations = 0;
    const seen = new Set<string>();
    try {
      while (s.status === 'playing' && s.month <= maxMonths) {
        if (s.totalShots >= 10000 || operations >= 20000 || s.players.length > 1000) { limit = 'technical-limit'; break; }
        const p = s.players.find(p => !p.queued);
        if (!p) { s = act(s, { type: 'settle' }); operations++; continue; }
        // 此策略仅看经济等级与出手次数，模板不影响决策。
        if (p.level >= build.stop || p.shots >= 60) { s = act(s, { type: 'queue', playerId: p.id, queued: true }); operations++; continue; }
        if (s.clockMs < s.nextShotAt) { s = act(s, { type: 'advance', milliseconds: s.nextShotAt - s.clockMs }); operations++; }
        severeChances += previewShot(s, p).tickets.severe / 1000; trials++;
        const result = dispatch(s, s.revision, { type: 'train', playerId: p.id });
        if (result.error) throw new Error(result.error);
        s = result.state; operations++;
        for (const event of result.events) {
          if (event.outcome) outcomes[event.outcome] = (outcomes[event.outcome] ?? 0) + 1;
          if (event.type === 'unlock' && event.templateId) seen.add(event.templateId);
        }
        const after = s.players.find(a => a.id === p.id);
        if (after) {
          statSamples += 6; cappedStats += statKeys.filter(k => after.stats[k] === 99).length;
          if (after.level >= 14) { highLevelSamples++; const t = templateRules.find(t => t.id === after.templateId); if (!t || rules.tiers.findIndex(r => r.id === t.tier) < 3) highLevelLowTier++; }
        }
      }
    } catch (e) { limit = `technical-error:${e instanceof Error ? e.message : String(e)}`; }
    const status = limit || (s.status === 'over' ? 'over' : 'month-limit');
    const row = { run, build: build.name, month: s.month, completed: s.completed, status, shots: s.totalShots, cash: s.cash, delivered: s.delivered };
    rows.push(row);
    const g = groups[build.name] ??= { runs: 0, months: 0, completed: 0, over: 0, censored: 0 };
    g.runs++; g.months += s.month; g.completed += Number(s.completed); g.over += Number(status === 'over'); g.censored += Number(status !== 'over');
    for (const id of seen) frequencies[id] = (frequencies[id] ?? 0) + 1;
    if ((run + 1) % 1000 === 0) console.log(`已模拟 ${run + 1}/${count} 局`);
  }
  const witnesses = templateRules.map(t => {
    const input = { level: t.minLevel, height: Math.round((t.height[0] + t.height[1]) / 2), stats: t.stats, templateId: null, matchSeed: 1, lastStyle: shape(t.stats) };
    const result = match(input);
    return { id: t.id, eligible: result.rows.find(r => r.id === t.id)!.eligible, selected: result.templateId === t.id, winner: result.templateId, naturalRuns: frequencies[t.id] ?? 0, growthPath: 'not-searched' };
  });
  const report = { rules: rules.version, seed, count, maxMonths, elapsedMs: Date.now() - start,
    limitations: ['固定装备对照模式：开局免费注入装备，不包含商店成本，不能据此比较正式流派强度；真实交易请用simulate:economy。', '普通停止等级为5/7，不能据此推断高档模板不可达。静态画像不等于实际成长路径；路径验证请用audit:templates。', '当前引擎已接正式UI与旧档迁移；复杂装备与大成功组合规则仍有未确认项，见evidence。'],
    evidence, groups, outcomes, severeRisk: { expected: severeChances, actual: outcomes.severe ?? 0, trials },
    stats: { cappedStats, statSamples, highLevelLowTier, highLevelSamples }, templateCoverage: witnesses,
    zeroObserved: witnesses.filter(t => !t.naturalRuns).map(t => t.id),
  };
  output('simulation.json', report);
  writeFileSync(resolve(dir, 'runs.csv'), ['run,build,month,completed,status,shots,cash,delivered', ...rows.map(r => Object.values(r).join(','))].join('\n'), 'utf8');
  console.log(JSON.stringify({ count, groups, outcomes, report: resolve(dir, 'simulation.json') }, null, 2));
} else throw new Error(`未知命令: ${command}`);
