import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {statLabels} from '../src/game/config';
import {statKeys, type Stats} from '../src/game/types';
import {
  applyScheduledChallengeMove, challengeAutomaticMove, challengeDraft, challengeEntrant, challengeFixture,
  challengePower, challengeRewardCategories, challengeRewardChoices, challengeRosterCap, challengeRulesVersion,
  challengeScheduledRewards, challengeSeed, scoreChallenge, type ChallengeMove, type ChallengePlayer,
  type ChallengeRewardCategory, type ChallengeSquad,
} from '../src/game/gym/challenge';
import {challengeCards, challengeEquipment, challengeTemplateIds} from '../src/game/gym/challengeCatalog';

const lastStage = Number(process.argv[2] ?? 120);
const gymSeed = Number(process.argv[3] ?? 18201);
if (!Number.isInteger(lastStage) || lastStage < 1 || lastStage > 500 || !Number.isInteger(gymSeed) || gymSeed < 0 || gymSeed > 0xffffffff) {
  throw Error('用法：generate-challenge-balance [关卡数 1–500] [随机种子 0–4294967295]');
}
const seed = challengeSeed(gymSeed, 1);
const version = challengeRulesVersion;
const pool = challengeTemplateIds;
const settings = {projects: {}, referrals: {}};
const labels = {team:'自动属性', swap:'引援', gear:'装备', level:'双人升级'};
const tiers = {rotation:'替补', starter:'首发', star:'全明星', superstar:'巨星', legend:'传奇'};
const fixture = (stage: number) => challengeFixture(seed, stage, version);
const number = new Intl.NumberFormat('zh-CN', {maximumFractionDigits:2});
const fmt = (n: number) => number.format(n);
const safe = (s: string) => s.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]!));

function startingSquad(refreshed: boolean): ChallengeSquad {
  const draft = challengeDraft(seed,pool,pool.length,version,settings,refreshed);
  const boosts = Object.fromEntries(statKeys.map(key => [key, 0])) as Stats;
  let best: ChallengeSquad | undefined, bestValue = -1;
  for (let i=0; i<draft.length-2; i++) for (let j=i+1; j<draft.length-1; j++) for (let k=j+1; k<draft.length; k++) {
    const team = [draft[i],draft[j],draft[k]].map(id=>challengeEntrant(id,settings));
    const candidate = {team,boosts,settings,rulesVersion:version};
    const value = futurePoints(candidate,1);
    if (value>bestValue) {best=candidate;bestValue=value;}
  }
  if (!best) throw Error('无法生成初始阵容');
  return best;
}

function futurePoints(squad: ChallengeSquad, start: number) {
  return [start,start+1,start+2].reduce((total,stage)=>total+scoreChallenge(squad,fixture(stage)).exact,0);
}

function reward(squad: ChallengeSquad, stage: number, category: ChallengeRewardCategory, revival = false) {
  if (category==='team') {
    const move=challengeAutomaticMove(seed,stage);
    const after=applyScheduledChallengeMove(squad,seed,stage,move);
    if (!after) throw Error(`第 ${stage} 关自动属性无法结算`);
    const stat=statKeys.find(key=>after.boosts[key]!==squad.boosts[key])!;
    return {after,category,detail:`全队${statLabels[stat]}提升`};
  }
  const offers = challengeRewardChoices(seed,stage,squad.team,pool,pool.length,category,version,settings,revival);
  const choices: {move: ChallengeMove; detail: string}[]=[];
  const categoryIndex=challengeRewardCategories.indexOf(category);
  const name=(id:string)=>challengeCards.get(id)!.name;
  const add=(offer:number,target:number,slot:number,second:number,detail:string) => {
    choices.push({move:[pool.length,categoryIndex,offer,target,slot,second],detail});
  };
  for (const [index,card] of offers.entries()) {
    if (card.kind==='swap') {
      if (revival&&challengeCards.get(card.id)?.tier!=='superstar') continue;
      if(squad.team.length<challengeRosterCap) add(index,-1,-1,-1,`${name(card.id)}加入阵容`);
      else for(const [target,player] of squad.team.entries()) add(index,target,-1,-1,`${name(card.id)}换下${name(player.id)}`);
    }
    if(card.kind==='gear') for(const [target,player] of squad.team.entries()) {
      const item=challengeEquipment.get(card.item.id)!.name;
      const slots=player.gear.length===3?[0,1,2]:[-1];
      for (const slot of slots) add(index,target,slot,-1,`${name(player.id)}获得${item}`);
    }
    if(card.kind==='level') for(const [first,player] of squad.team.entries()) for(let second=first+1; second<squad.team.length; second++) {
      add(index,first,-1,second,`${name(player.id)}、${name(squad.team[second].id)}各升 1 级`);
    }
  }
  if(category==='swap'&&!revival) add(-1,-1,-1,-1,'放弃引援');
  let best: {after:ChallengeSquad; category:ChallengeRewardCategory; detail:string}|undefined, bestValue=-1;
  for(const choice of choices) {
    const after=applyScheduledChallengeMove(squad,seed,stage,choice.move,revival);
    if(!after) continue;
    const value=futurePoints(after,stage+(revival?0:1));
    if(value>bestValue) {best={after,category,detail:choice.detail};bestValue=value;}
  }
  if(!best) throw Error(`第 ${stage} 关找不到合规的${labels[category]}方案`);
  return best;
}

const noRewards = () => ({team:0,swap:0,gear:0,level:0});
function simulate(assisted: boolean) {
  const start=startingSquad(assisted), counts=noRewards();
  let squad=start, revivalUsed=false, failedAt:number|undefined, actualSquad=start, earned=noRewards();
  const rows=[];
  for(let stage=1;stage<=lastStage;stage++) {
    const opponent=fixture(stage), before={...counts};
    let score=scoreChallenge(squad,opponent), intervention='';
    if(!score.won&&failedAt===undefined&&assisted&&!revivalUsed) {
      const help=reward(squad,stage,'swap',true);
      squad=help.after; revivalUsed=true;
      intervention=`${score.home} : ${score.away} 落败后复活 · ${help.detail}`;
      score=scoreChallenge(squad,opponent);
    }
    const ending = !score.won&&failedAt===undefined;
    if(ending) {failedAt=stage;actualSquad=squad;earned=before;}
    const prizes = challengeScheduledRewards(stage).map(category=>{
      const prize=reward(squad,stage,category);
      squad=prize.after;
      counts[category]++;
      return prize;
    });
    rows.push({stage,opponent,score,before,after:{...counts},prizes,squad,intervention,ending,projected:failedAt!==undefined});
  }
  return {rows,final:squad,failedAt,actualSquad:failedAt===undefined?squad:actualSquad,earned:failedAt===undefined?counts:earned};
}

type Route=ReturnType<typeof simulate>;
function roster(squad:ChallengeSquad) {
  const cell=(player:ChallengePlayer,key:typeof statKeys[number])=>fmt(challengePower(player,key,squad.boosts,squad.settings,version)/100);
  return `<div class="scroll"><table class="roster"><thead><tr><th>球员</th><th>等级</th>${statKeys.map(key=>`<th>${statLabels[key]}</th>`).join('')}<th>装备</th></tr></thead><tbody>${squad.team.map(player=>{
    const card=challengeCards.get(player.id)!;
    const loadout=player.gear.map(gear=>`${challengeEquipment.get(gear.id)!.name}${gear.band?`（${gear.band}阶）`:''}`).join('、');
    return `<tr><th>${safe(card.name)} <small>${tiers[card.tier]}</small></th><td>${player.level}</td>${statKeys.map(key=>`<td>${cell(player,key)}</td>`).join('')}<td>${safe(loadout||'—')}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function totals(counts:ReturnType<typeof noRewards>) {
  const count=Object.values(counts).reduce((sum,value)=>sum+value,0);
  return `${count} 次（属性 ${counts.team} · 引援 ${counts.swap} · 装备 ${counts.gear} · 双人升级 ${counts.level}）`;
}
function renderRows(route:Route, id:string) {
  return route.rows.map(row=>`<tr id="${id}-${row.stage}" class="${row.projected?'projected':''}">
    <th scope="row">${row.stage}<small>${safe(row.opponent.club)}</small></th>
    <td>${row.opponent.lanes.map(lane=>`<span class="lane">${safe(challengeCards.get(lane.id)!.name)} <small>${statLabels[lane.key]}</small> <b>${fmt(lane.power)}</b></span>`).join('')}</td>
    <td><b class="score ${row.score.won?'win':'loss'}">${row.score.home} : ${row.score.away}</b>${row.intervention?`<small>${safe(row.intervention)}</small>`:''}<small>${row.ending?'落败 · 本局终点':row.projected?'假定通关的投影':'通过'}</small></td>
    <td><small>进关前 ${totals(row.before)}</small>${row.prizes.map(prize=>`<div><b>${labels[prize.category]} · ${safe(prize.detail)}</b></div>`).join('')}<small>过关后 ${totals(row.after)}</small></td>
    <td><details><summary>赛前三项对位</summary><ul class="matchups">${row.score.lanes.map(lane=>`<li>${safe(challengeCards.get(lane.player.id)!.name)} · ${statLabels[lane.rival.key]} <b>${fmt(lane.power)}</b></li>`).join('')}</ul></details><details><summary>过关后全队六维</summary>${roster(row.squad)}</details></td>
  </tr>`).join('\n');
}
function renderRoute(route:Route,id:string,title:string,description:string) {
  const goal=route.failedAt===undefined?`通过观测的 ${lastStage} 关`:`通过 ${route.failedAt-1} 关，第 ${route.failedAt} 关停止`;
  return `<section id="${id}" class="scenario"><h2>${title}</h2><p class="description">${description}</p>
    <p class="headline"><strong>${goal}</strong><span>实际取得 ${totals(route.earned)}</span></p>
    <details><summary>查看实际终点阵容</summary>${roster(route.actualSquad)}</details>
    <details><summary>查看第 ${lastStage} 关投影阵容</summary>${roster(route.final)}</details>
    <nav aria-label="关卡索引">${route.rows.filter(row=>row.stage===1||row.stage%10===0).map(row=>`<a href="#${id}-${row.stage}">第 ${row.stage} 关</a>`).join('')}</nav>
    <div class="scroll"><table class="stages"><colgroup><col class="stage-column"><col class="rivals-column"><col class="score-column"><col class="rewards-column"><col></colgroup><thead><tr><th scope="col">关卡</th><th scope="col">三个对手与本项能力</th><th scope="col">比分</th><th scope="col">过关奖励与累计次数</th><th scope="col">球员数值</th></tr></thead><tbody>${renderRows(route,id)}</tbody></table></div>
  </section>`;
}

const ordinary=simulate(false), helped=simulate(true);
const rewardTable=ordinary.rows.filter(row=>row.stage%10===0).map(row=>`<tr><th>第 ${row.stage} 关</th><td>第 ${row.stage+1} 关</td><td>${row.after.swap+row.after.gear+row.after.level} 次</td><td>${totals(row.after)}</td></tr>`).join('');
const html=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>传奇球馆 · 闯关数值测试</title><style>
  :root{font-family:system-ui,"Microsoft YaHei",sans-serif;color:#173846;background:#f5e8ce;font-variant-numeric:tabular-nums}
  *{box-sizing:border-box}
  body{margin:0}
  header{padding:2.1rem max(1.1rem,calc((100vw - 1260px)/2));color:#fff0ca;background:#143341;border-bottom:5px solid #b63c2b}
  h1{margin:.2rem 0 .5rem;font-size:clamp(1.75rem,5vw,2.85rem)}
  header p{margin:.3rem 0;color:#ebd4a4}
  main{max-width:1280px;margin:auto;padding:1rem}
  h2{margin:0 0 .4rem} p{line-height:1.6}
  .description,small{color:#634e35}
  .scenario,.checkpoint{margin:1.25rem 0 2rem;padding:1.15rem;background:#fffaec;border:1px solid #bb9e69;border-radius:8px}
  .headline{display:flex;flex-wrap:wrap;gap:.4rem 1.1rem;padding:.7rem 1rem;background:#e9efd9;border:1px solid #a2aa81}
  .headline strong{color:#215743}
  nav{display:flex;flex-wrap:wrap;gap:.45rem;margin:1rem 0}
  a{color:#225a54;text-underline-offset:3px}
  nav a{padding:.28rem .55rem;background:#f4e5c1;border:1px solid #cab385;border-radius:4px}
  summary{cursor:pointer;color:#225a54;font-weight:700}
  details{padding:.28rem 0} details[open]>summary{margin-bottom:.55rem}
  .scroll{max-width:100%;overflow-x:auto}
  table{width:100%;border-collapse:collapse;text-align:left;font-size:.88rem}
  th,td{padding:.6rem .65rem;border-bottom:1px solid #d7c49d;vertical-align:top}
  thead th{background:#173846;color:#fff0ca;white-space:nowrap}
  tbody tr:nth-child(even){background:#f9edce}
  tr.projected{background:#eee5d3} tr.projected:nth-child(even){background:#ebe1ce}
  tr:target>th{background:#ebc97d}
  .stages{min-width:830px;table-layout:fixed}
  .stage-column{width:5.8rem} .rivals-column{width:14rem} .score-column{width:7.1rem} .rewards-column{width:27%}
  .stages small{display:block;margin-top:.2rem}
  .lane{display:block;white-space:nowrap;line-height:1.65} .lane small,.roster small{display:inline}
  .score{display:block;font-size:1.06rem;white-space:nowrap} .win{color:#235f45} .loss{color:#a72d24}
  .roster{min-width:530px;margin:.25rem 0} .roster th:first-child{min-width:7rem} .roster th,.roster td{padding:.35rem}
  .matchups{margin:.3rem 0;padding-left:1.2rem}
  footer{color:#634e35;margin-bottom:1.5rem}
  @media(max-width:620px){main{padding:.55rem}.scenario,.checkpoint{padding:.7rem}header{padding:1.4rem 1rem}}
</style></head><body><header><h1>球馆挑战 · 逐关数值测试</h1><p>规则 V${version} · 固定种子 ${gymSeed} · 第 1–${lastStage} 关</p><nav aria-label="报告目录"><a href="#ordinary">普通开局</a><a href="#helped">广告与复活</a><a href="#checkpoints">快进节点</a></nav></header><main>
<p>两条路线都使用游戏的真实对手、计分和奖励计算，且挑战项目与校友等级加成均为零。每关挑选得分最高的三人上场。选择开局和奖励时，以接下来三关的原始合计能力为准。</p>
<p>灰色行表示当局已经落败，继续假设过关来查看后续奖励和数值变化。真实结算在首次未复活的落败处停止。复活引援单独标在比分下方，平分按过关处理。</p>
${renderRoute(ordinary,'ordinary','普通开局','使用普通的五名候选选出三人，落败后结束。')}
${renderRoute(helped,'helped','广告与复活','开局使用一次巨星刷新，首次落败时使用发帖复活并选择巨星援手。')}
<section id="checkpoints" class="checkpoint"><h2>快进奖励</h2><p>以已通关的最高十关节点计算。随机属性自动到账，其余奖励按关卡顺序处理。已有的首通声望不重复发放。</p><div class="scroll"><table><thead><tr><th>跳过至</th><th>重新开打</th><th>需手选奖励</th><th>累计可得</th></tr></thead><tbody>${rewardTable}</tbody></table></div></section>
<footer>当前观测范围为 ${lastStage} 关，挑战没有固定关数上限。</footer></main></body></html>`;

const file=resolve('outputs','challenge-balance.html');
mkdirSync(dirname(file),{recursive:true});
writeFileSync(file,html);
console.log(JSON.stringify({file, stages:lastStage, ordinaryCleared:(ordinary.failedAt??lastStage+1)-1, assistedCleared:(helped.failedAt??lastStage+1)-1, projectedTotals:ordinary.rows.at(-1)!.after}));
