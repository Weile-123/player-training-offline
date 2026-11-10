import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {dispatch,newContract,type Action,type Result} from '../src/game/contract/engine';
import {templateRules} from '../src/game/contract/templates';
import {replayTemplateWitness,type TemplateWitness} from '../src/game/contract/templateWitness';
import {statKeys} from '../src/game/types';
import {rules} from '../src/game/contract/rules';

/** Offline existence search with lookahead. Only committed public actions enter a witness.
 * Evaluating alternatives is not RNG mutation, and is NOT a natural-odds simulation. */
export function searchTemplatePaths(out:string,count:number,seed:number,resume:string,beforeLevel?:number){
 if(!Number.isSafeInteger(count)||count<1||count>100000||!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw new Error('无效路径搜索参数');
 if(beforeLevel!==undefined&&(!Number.isSafeInteger(beforeLevel)||beforeLevel<2||beforeLevel>100))throw new Error('无效等级上界');
 mkdirSync(out,{recursive:true});
 const witnesses:Record<string,TemplateWitness>=resume?JSON.parse(readFileSync(resume,'utf8')):{};
 // Never let a stale input witness count as a discovered path.
 for(const [id,w] of Object.entries(witnesses)){
  const replay=replayTemplateWitness(id,w);
  if(beforeLevel!==undefined&&replay.acquisition.peakLevel>=beforeLevel)delete witnesses[id];
 }
 const pref=['relic_041','relic_036','relic_002','relic_012','relic_003','relic_017','relic_011','relic_009'];
 let searched=0;
 const save=()=>writeFileSync(resolve(out,'template-paths.json'),JSON.stringify(witnesses,null,2));
 outer:for(let i=0;i<count;i++){
  if(Object.keys(witnesses).length===templateRules.length)break;
  searched=i+1;
  for(const main of ['p1','p2','p3']){
   const runSeed=(seed+i)>>>0;let state=newContract(runSeed);const actions:Action[]=[];
   const missing=templateRules.filter(t=>!witnesses[t.id]);
   if(missing.every(t=>t.tier==='legend')){
    // Search heuristic only: focus late searches on prospects whose projected core
    // arrival times could beat the other legends. Never edit their actual stats/bias.
    const p=state.players.find(p=>p.id===main)!;
    const weights=statKeys.map(k=>rules.growth.epsilon+p.bias[k]),sum=weights.reduce((a,b)=>a+b,0);
    const levels=templateRules.filter(t=>t.tier==='legend'&&p.height>=t.height[0]&&p.height<=t.height[1]).map(t=>({id:t.id,level:Math.max(t.minLevel,...statKeys.map((k,n)=>Math.max(0,(t.coreMinimums[k]??0)-p.stats[k])/(rules.growth.gain*weights[n]/sum)))}));
    const first=Math.min(...levels.map(t=>t.level));
    if(!levels.some(t=>!witnesses[t.id]&&t.level<=first+5&&t.level<=Math.min(65,beforeLevel===undefined?65:beforeLevel+3)))continue;
   }
   const commit=(action:Action,prepared?:Result)=>{
    const r=prepared??dispatch(state,state.revision,action);
    if(r.error)throw new Error(`${runSeed}/${actions.length}: ${r.error}`);
    state=r.state;actions.push(action);
    for(const event of r.events)if(event.type==='unlock'&&event.templateId&&!witnesses[event.templateId]&&(beforeLevel===undefined||state.players.find(p=>p.id===event.playerId)!.peakLevel<beforeLevel)){
     witnesses[event.templateId]={seed:runSeed,actions:[...actions]};
     console.log(`找到 ${event.templateId}，累计 ${Object.keys(witnesses).length}/${templateRules.length}`);
    }
   };
   const gift=[...state.commerce.shop.offers].sort((a,b)=>pref.indexOf(a)-pref.indexOf(b))[0];
   commit({type:'buy-equipment',id:gift});
   for(let step=0;step<300;step++){
    const p=state.players.find(p=>p.id===main);
    if(!p||(beforeLevel===undefined?p.level>=90:p.peakLevel>=beforeLevel-1)||templateRules.find(t=>t.id===p.templateId)?.tier==='legend')break;
    if(state.clockMs<state.nextShotAt)commit({type:'advance',milliseconds:state.nextShotAt-state.clockMs});
    const action:Action={type:'train',playerId:main},result=dispatch(state,state.revision,action);
    if(result.error)throw new Error(result.error);
    if(result.state.players.some(p=>p.id===main)){commit(action,result);continue;}
    const choices=state.players.filter(p=>p.id!==main).sort((a,b)=>b.heat-a.heat||a.level-b.level).map(p=>{
     const action:Action={type:'train',playerId:p.id};return {id:p.id,action,result:dispatch(state,state.revision,action)};
    });
    const chosen=choices.find(c=>!c.result.error&&c.result.state.players.some(p=>p.id===c.id))??choices[choices.length-1];
    if(!chosen)break;
    commit(chosen.action,chosen.result);
   }
   if(Object.keys(witnesses).length===templateRules.length)break outer;
  }
  if((i+1)%100===0){save();console.log(`搜索 ${i+1}/${count}，覆盖 ${Object.keys(witnesses).length}`);}
 }
 save();
 const missing=templateRules.filter(t=>!witnesses[t.id]).map(t=>t.id);
 const report={seed,searched,beforeLevel:beforeLevel??null,found:Object.keys(witnesses).length,missing,scope:'离线分支前瞻搜索；正式新局、默认规则、仅执行公共动作；证明存在可重放路径，不估算自然出现概率。等级上界检查历史最高等级，严格小于指定值；未找到不等于不可达。'};
 writeFileSync(resolve(out,'template-search.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
 if(missing.length)process.exitCode=1;
}
