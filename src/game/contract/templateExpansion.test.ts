import {describe,it,expect} from 'vitest';
import {match,shape,templateRules,specialistAptitude} from './templates';
import {statKeys,type Stats} from '../types';
import {specialistTemplates} from '../specialistTemplates';
import identities from '../../data/nba-identities.json';
import oldCatalog from '../../../scripts/fixtures/pre-expansion-catalog.json';
import oldPaths from '../../../scripts/fixtures/pre-expansion-paths.json';
import {dispatch,newContract,type Action} from './engine';
const uniform=(n:number)=>Object.fromEntries(statKeys.map(k=>[k,n])) as Stats;
const input=(stats:Stats,height:number)=>({level:29,height,stats,templateId:null,matchSeed:17,lastStyle:shape(stats)});
describe('扩展名单的专长覆盖和旧路线竞争',()=>{
 it('指定六人的档次正确，新人均有独立资料头像，标准画像无重复',()=>{
  for(const [id,tier]of Object.entries({'ray-allen':'superstar','reggie-miller':'superstar',pippen:'superstar',bryant:'legend',durant:'legend','pau-gasol':'star'}))expect(templateRules.find(t=>t.id===id)?.tier).toBe(tier);
  for(const t of specialistTemplates)expect((identities as Record<string,{fallbackAvatar:string}>)[t.id].fallbackAvatar).toMatch(/^https:\/\/(cdn\.nba\.com\/headshots\/|a\.espncdn\.com\/i\/headshots\/nba\/)/);
  expect(new Set(templateRules.map(t=>JSON.stringify(t.stats))).size).toBe(templateRules.length);
 });
 it('615种成熟双专长画像都有正常准入，不能用弱兜底冒充覆盖',()=>{
  for(let a=0;a<6;a++)for(let b=a+1;b<6;b++)for(let height=178;height<=218;height++){
   const stats={...uniform(35),[statKeys[a]]:90,[statKeys[b]]:90};
   const r=match(input(stats,height)),row=r.rows.find(x=>x.id===r.templateId);
   expect(row,`${statKeys[a]}+${statKeys[b]}/${height}`).toBeDefined();
   expect(row!.eligible).toBe(true);expect(row!.reasons).not.toContain('specialist-entry');
  }
 });
 it('190cm双99中投篮下的原反例能匹配背身技术后卫',()=>{
  const r=match(input({...uniform(25),mid:99,inside:99},190));
  expect(r.templateId).toBe('andre-miller');
 });
 it('更极端的双99、其余25在全部身高也有正常模板',()=>{
  for(let a=0;a<6;a++)for(let b=a+1;b<6;b++)for(let height=178;height<=218;height++){
   const stats={...uniform(25),[statKeys[a]]:99,[statKeys[b]]:99};
   const r=match(input(stats,height)),row=r.rows.find(x=>x.id===r.templateId);
   expect(row,`${statKeys[a]}+${statKeys[b]}/${height}`).toBeDefined();
   expect(row!.eligible).toBe(true);expect(row!.reasons).not.toContain('specialist-entry');
  }
 });
 it('专长资格及适配度随每项属性成长不倒退',()=>{
  for(const t of templateRules)for(const branch of t.branches??[]){
   const base={...uniform(40),...Object.fromEntries(branch.keys.map(k=>[k,Math.max(t.stats[k],branch.coreMinimums[k]??0)]))};
   expect(match({...input(base,t.height[0]),level:99},[t]).rows[0].eligible).toBe(true);
   for(const key of statKeys){let previous=-1;for(let n=base[key];n<=99;n++){
    const stats={...base,[key]:n},score=specialistAptitude(stats,t.stats,branch.keys);
    expect(score).toBeGreaterThanOrEqual(previous);previous=score;
    expect(match({...input(stats,t.height[0]),level:99},[t]).rows[0].eligible).toBe(true);
   }}
  }
 });
 it('新增球员不再破坏调整后100人中已可重放的旧获取路线',()=>{
  const adjusted=templateRules.filter(t=>oldCatalog.some(o=>o.id===t.id));
  const replay=(id:string,catalog:typeof templateRules)=>{
   const w=(oldPaths as Record<string,{seed:number;actions:Action[]}>)[id];let s=newContract(w.seed);
   for(const action of w.actions){const r=dispatch(s,s.revision,action,{catalog});expect(r.error).toBeUndefined();s=r.state;}
   return !!s.collection[id];
  };
  for(const id of Object.keys(oldPaths))if(replay(id,adjusted))expect(replay(id,templateRules),id).toBe(true);
 },15000);
});
