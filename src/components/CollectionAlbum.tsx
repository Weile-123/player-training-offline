import {EquipmentMystery} from './EquipmentMystery';
import {useState,type CSSProperties} from 'react';
import {useContract} from '../contractStore';
import {templateRules} from '../game/contract/templates';
import {positionLabels,type TemplateTier} from '../game/templates';
import {rules} from '../game/contract/rules';
import {statKeys,type StatKey} from '../game/types';
import {statLabels} from '../game/config';
import {usePlayerProfile} from '../platform/usePlayerProfile';
import {StarPortrait,templatePortrait} from './PlayerTemplatePanel';
import {ComicDialog} from './ComicDialog';
import {SlidingTabs} from './SlidingTabs';
import {TierBadge} from './TierBadge';
import {shopCatalog} from '../game/contract/commerce';
import {EquipmentDetailDialog} from './EquipmentDetailDialog';
import {collectedEquipment} from '../game/contract/careerStats';
import {ProductImage} from './ProductImage';

type IconName=StatKey|'level'|'height'|'position'|'star';
export function AlbumIcon({name}:{name:IconName}){
 const paths={
  three:<><circle cx="24" cy="24" r="19"/><path d="M5 24h38M24 5v38M10 10q28 14 0 28M38 10q-28 14 0 28"/></>,
  mid:<><path d="M4 5h40v22H4zM16 14h16v13M13 29h22l-5 14H18zM16 30l14 13M32 30 18 43"/></>,
  drive:<><circle cx="30" cy="7" r="4" fill="currentColor"/><path d="m27 14-9 10 12 5-3 14M21 22l-9-5-7 7M30 16l8 9 7-2M21 29 9 41" strokeWidth="5"/></>,
  inside:<><path d="M3 5h42v23H3zM17 15h14v13M14 29h20l-5 14H19zM24 29v14"/></>,
  handle:<><circle cx="29" cy="17" r="12"/><path d="M17 17h24M29 5v24M21 8q15 9 0 18M5 29l-3 10m11-13-4 18m12-12-3 12"/></>,
  defense:<path d="m24 3 17 7-3 21-14 14-14-14-3-21Z M15 23l6 7 13-15"/>,
  level:<path d="m8 12 10 5 10-8 6 16 11 7v8H4V29l8-5-4-12Zm9 9 7 3m0-8 7 4M4 34h40"/>,
  height:<><path d="M6 3h8v42H6zM7 10h5M7 18h5M7 26h5M7 34h5"/><circle cx="31" cy="8" r="5" fill="currentColor"/><path d="M22 30V20q9-8 18 0v10M27 18v27M35 18v27"/></>,
  position:<><path d="M4 3h40v42H4zM4 25h40M16 3v12h16V3M16 45V33h16v12"/><circle cx="24" cy="25" r="6"/></>,
  star:<path d="m24 3 6 13 15 2-11 11 3 16-13-8-13 8 3-16L3 18l15-2Z" fill="currentColor"/>
 };
 return <svg className="album-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
const statColors=['#e65c21','#e1ac23','#ed712a','#25886b','#2788ac','#b82e27'];
const albumTemplates=[...templateRules].sort((a,b)=>rules.tiers.findIndex(t=>t.id===a.tier)-rules.tiers.findIndex(t=>t.id===b.tier));
export function ContractCollection({initialTab=0}:{initialTab?:0|1}){
 const [tab,setTab]=useState<number>(initialTab);
 return <SlidingTabs labels={['球星图鉴','器械图鉴']} label="图鉴分类" index={tab} onChange={setTab}>{tab===0?<StarCollection/>:<EquipmentCollection/>}</SlidingTabs>;
}
function EquipmentCollection(){
 const store=useContract(),[selected,setSelected]=useState<string|null>(null);
 const owned=new Set(import.meta.env.DEV&&store.debug.fullCollection?shopCatalog.map(t=>t.id):collectedEquipment(store.careers,store.hasSave?store.state.equipment:[]));
 const available=shopCatalog.filter(t=>owned.has(t.id)),chosen=available.find(t=>t.id===selected);
 return <div className="album-view equipment-album">
  <div className="album-progress"><strong>收集进度</strong><progress aria-label="器械收集进度" value={available.length} max={shopCatalog.length}/><b>{available.length} / {shopCatalog.length}</b></div>
  <div className="equipment-album-grid" role="region" aria-label="全部器械图鉴" tabIndex={0}>{shopCatalog.map(t=>{
   const discovered=owned.has(t.id);
   return <button key={t.id} className={`equipment-album-card ${discovered?`is-unlocked rarity-${t.rarity}`:'is-unknown'}`} disabled={!discovered} onClick={()=>setSelected(t.id)} aria-label={discovered?`查看${t.name}器械档案`:'未知器械'}>
    {discovered?<ProductImage id={t.id} name={t.name}/>:<EquipmentMystery/>}<strong>{discovered?t.name:'未知器械'}</strong>
   </button>;
  })}</div>
  {chosen&&<EquipmentDetailDialog ids={[chosen.id]} collected backLabel="返回器械图鉴" onClose={()=>setSelected(null)}/>}
 </div>;
}
function StarCollection(){
 const store=useContract(),[selected,setSelected]=useState<string|null>(null);
 const unlocked=new Set(import.meta.env.DEV&&store.debug.fullCollection?templateRules.map(t=>t.id):[...Object.keys(store.profile.collection),...Object.keys(store.legacyCollection)]);
 const chosen=templateRules.find(t=>t.id===selected),profile=usePlayerProfile(chosen?.id);
 return <div className="album-view">
  <div className="album-progress"><strong>收集进度</strong><progress aria-label="球星收集进度" value={unlocked.size} max={templateRules.length}/><b>{unlocked.size} / {templateRules.length}</b></div>
  <div className="album-grid contract-collection" role="region" aria-label="全部球星图鉴" tabIndex={0}>{albumTemplates.map(t=><AlbumEntry key={t.id} id={t.id} name={t.name} tier={t.tier} unlocked={unlocked.has(t.id)} onSelect={()=>setSelected(t.id)}/>)}</div>
  {chosen&&unlocked.has(chosen.id)&&<ComicDialog title="球星档案" variant="album" className="collection-detail-dialog album-detail-dialog" onClose={()=>setSelected(null)}>
   <article className="album-detail">
    <header className="album-hero">
     <div className="album-hero-photo tier-portrait-frame" data-tier={chosen.tier}><div className="collection-photo"><StarPortrait key={profile?.avatar} src={profile?.avatar??templatePortrait(chosen.id)} name={chosen.name}/></div></div>
     <div className="album-hero-info"><h3>{chosen.name} <TierBadge tier={chosen.tier} className="album-tier"/></h3><p className="album-style">{chosen.style}</p>
      <dl className="album-requirements"><div><dt>最低等级</dt><dd><AlbumIcon name="level"/><span>训练</span><b>+{chosen.minLevel}</b></dd></div><div><dt>身高要求</dt><dd><AlbumIcon name="height"/><b>{chosen.height[0]}–{chosen.height[1]}</b><span>cm</span></dd></div><div><dt>位置</dt><dd><AlbumIcon name="position"/><strong>{positionLabels[chosen.position]}</strong></dd></div></dl>
     </div>
    </header>
    <MatchingRequirements template={chosen}/>
    <section className="album-section"><h3>标准六维</h3><div className="album-stats">{statKeys.map((key,index)=><div key={key} style={{'--stat-color':statColors[index]} as CSSProperties}><AlbumIcon name={key}/><span>{statLabels[key]}</span><b>{chosen.stats[key]}</b><div className="album-stat-track" role="meter" aria-label={statLabels[key]} aria-valuenow={chosen.stats[key]} aria-valuemin={0} aria-valuemax={99}><i style={{width:`${chosen.stats[key]/99*100}%`}}/></div></div>)}</div></section>
    <button className="album-back" aria-label="返回图鉴" onClick={()=>setSelected(null)}><span aria-hidden="true">‹</span> 返回图鉴</button>
   </article>
  </ComicDialog>}
 </div>;
}
export function MatchingRequirements({template}:{template:typeof templateRules[number]}){
 const branches=template.branches??[],routeCount=branches.length+1;
 return <section className="album-section album-matching"><h3>匹配门槛</h3>
  <p className="album-route-intro"><span aria-hidden="true">★</span>{routeCount===1?'满足以下条件，即可参与匹配。':`${routeCount===2?'两':routeCount}条路线，满足任意一条即可。`}<span aria-hidden="true">★</span></p>
  <div className="album-route"><header><h4>常规路线</h4><span>均需达标</span></header><TemplateThresholds core={template.coreMinimums} enter={template.enter}/></div>
  {branches.map((branch,index)=><div className="album-route-alternative" key={index}><div className="album-route-or"><span>或</span></div><div className="album-route is-specialist"><header><h4>专长路线{branches.length>1?` ${index+1}`:''}</h4><span>{branch.keys.map(k=>statLabels[k]).join('＋')}</span></header><TemplateThresholds core={branch.coreMinimums} enter={branch.enter}/></div></div>)}
  {template.ratingFloor!==undefined&&<p className="album-route-floor">同时要求综合评分 ≥ {template.ratingFloor}，每项属性 ≥ {template.statFloor}。</p>}
 </section>;
}
function TemplateThresholds({core,enter}:{core:Partial<Record<StatKey,number>>;enter:number}){
 return <div className="album-thresholds" data-count={Object.keys(core).length+1}>{Object.entries(core).map(([key,value])=><div key={key}><span><AlbumIcon name={key as StatKey}/>{statLabels[key as StatKey]}</span><strong><i>≥</i>{value}</strong></div>)}<div><span><AlbumIcon name="star"/>模板适配度</span><strong><i>≥</i>{Math.round(enter*100)}<em>%</em></strong></div></div>;
}
function AlbumEntry({id,name,tier,unlocked,onSelect}:{id:string;name:string;tier:TemplateTier;unlocked:boolean;onSelect:()=>void}){
 const profile=usePlayerProfile(unlocked?id:null);
 return <button data-tier={tier} className={`album-card ${unlocked?'discovered':'collection-locked'}`} disabled={!unlocked} onClick={onSelect} aria-label={unlocked?`查看${name}档案`:'未知球星'}><span className="collection-photo tier-portrait-frame" data-tier={tier}>{unlocked?<StarPortrait key={profile?.avatar} src={profile?.avatar??templatePortrait(id)} name={name}/>:<svg className="album-unknown" viewBox="0 0 120 130" aria-hidden="true"><path d="m7 130 3-22q1-10 19-16l16-9V72q-8-8-9-22-6-2-5-10l3-3q-3-27 12-29 22-15 35 6 9 9 5 23l3 4q1 8-6 10-1 13-9 21v11l17 9q19 5 20 16l3 22Z"/><text x="60" y="81" textAnchor="middle">?</text></svg>}</span><b><span>{unlocked?name:'未知球星'}</span></b></button>;
}
