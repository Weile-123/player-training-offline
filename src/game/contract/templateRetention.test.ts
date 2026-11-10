import {describe,it,expect} from 'vitest';
import {match,shape,templateRules,grow} from './templates';
import {stream} from './random';
import {statKeys,type Stats} from '../types';
import {newContract,dispatch} from './engine';
import {writeContract,readContract} from './save';

const curry=templateRules.find(t=>t.id==='curry')!;
const uniform=(n:number)=>Object.fromEntries(statKeys.map(k=>[k,n])) as Stats;
const input={level:18,peakLevel:18,height:190,stats:curry.stats,templateId:'curry',matchSeed:1,lastStyle:shape(curry.stats)};
describe('历史模板外观',()=>{
 it('成功成长改变相对风格，也不丢失已获得外观',()=>{
  const catalog=[curry];
  const stats=grow(curry.stats,uniform(1),'success',1,stream(9,'stats'));
  const result=match({...input,stats,level:19,peakLevel:19},catalog);
  expect(statKeys.some(k=>stats[k]>curry.stats[k])).toBe(true);
  expect(result.rows[0].styleScore).toBeLessThan(1);
  expect(result.rows[0].score).toBe(1);
  expect(result.rows[0].reasons).not.toContain('aptitude');
  expect(result.templateId).toBe('curry');
  expect(result.retained).toBe(true);
 });
 it('最低等级使用历史峰值，首次获取仍需满足核心属性和风格',()=>{
  expect(match({...input,level:2,templateId:null}).templateId).toBe('curry');
  expect(match({...input,level:2,templateId:null,stats:uniform(1)}).templateId).toBeNull();
  expect(match({...input,level:0,stats:uniform(1)}).templateId).toBe('curry');
 });
 it('只在追平峰值后获取更高档外观，不同档位不会反复横跳',()=>{
  const old={...curry,id:'old',tier:'rotation' as const,minLevel:2};
  const p={...input,templateId:'old',level:17};
  expect(match(p,[old,curry]).templateId).toBe('old');
  expect(match({...p,level:18},[old,curry]).templateId).toBe('curry');
  expect(match({...p,templateId:'curry',level:1,stats:uniform(20)},[old,curry]).templateId).toBe('curry');
 });
 it('引擎刷新和存档往返均保留受伤后的外观，经济等级不被抬高',()=>{
  const g=newContract(10,['relic_001']),p=g.players[0];
  Object.assign(p,input,{level:3,stats:uniform(20),highestTier:'legend'});
  const result=dispatch(g,g.revision,{type:'discard-equipment',id:'relic_001'});
  expect(result.error).toBeUndefined();
  const refreshed=result.state;
  const data=new Map<string,string>(),storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
  expect(writeContract(storage,refreshed).ok).toBe(true);
  const restored=readContract(storage).state!.players[0];
  expect(restored.templateId).toBe('curry');expect(restored.level).toBe(3);expect(restored.peakLevel).toBe(18);
 });
 it('旧档中偏科未匹配球员加载即补齐身份，保留经济、已获身份和随机流',()=>{
  const g=newContract(44),p=g.players[0];
  Object.assign(p,{height:178,level:33,peakLevel:33,stats:{three:28,mid:55,drive:99,inside:99,handle:36,defense:43},peakValue:'1234'});
  Object.assign(g.players[1],input);
  const data=new Map<string,string>(),storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
  expect(writeContract(storage,g).ok).toBe(true);
  const restored=readContract(storage).state!;
  expect(restored.players[0].templateId).not.toBeNull();
  expect(restored.players[0].highestTier).toBe(templateRules.find(t=>t.id===restored.players[0].templateId)!.tier);
  expect(restored.players[0].stats).toEqual(p.stats);expect(restored.players[0].peakValue).toBe('1234');
  expect(restored.players[1].templateId).toBe('curry');expect(restored.rng).toEqual(g.rng);expect(restored.cash).toBe(g.cash);
  expect(restored.collection[restored.players[0].templateId!]).toBeDefined();
 });
});
