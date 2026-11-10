import {assetUrl} from '../presentation/assetUrls';
import {useContract} from '../contractStore';
import {useState} from 'react';
import {careerSummary,collectedEquipment} from '../game/contract/careerStats';
import {templateRules} from '../game/contract/templates';
import {shopCatalog} from '../game/contract/commerce';
import {BestPlayerCard} from './CareerEndDialog';
import {money} from './ContractPanels';
import {GameIcon} from './GameIcon';
import {ComicDialog} from './ComicDialog';
import {ContractCollection} from './CollectionAlbum';
import {ProductImage} from './ProductImage';

export function CareerStatistics(){
 const store=useContract(),summary=careerSummary(store.careers);
 const [album,setAlbum]=useState<0|1|null>(null);
 const stars=import.meta.env.DEV&&store.debug.fullCollection?templateRules.length:new Set([...Object.keys(store.profile.collection),...Object.keys(store.legacyCollection)]).size;
 const equipment=import.meta.env.DEV&&store.debug.fullCollection?shopCatalog.length:collectedEquipment(store.careers,store.hasSave?store.state.equipment:[]).length;
 return <article className="career-statistics">
  <header className="career-identity"><GameIcon name="career"/><strong>我的执教档案</strong><span>本地累计记录</span></header>
  <section className="career-month-record"><div className="career-trophy"><img src={assetUrl(`art/career/highest-month.png`)} alt=""/></div><div className="career-month-copy"><h3>最高挑战</h3><strong>{summary.highestMonth?<>第 <b>{summary.highestMonth}</b> 月</>:'等待开启生涯'}</strong><Laurels/></div></section>
  <dl className="career-totals">
   <div><CareerIllustration name="calendar"/><dt>开启生涯</dt><dd>{summary.started}<small> 次</small></dd></div>
   <div><CareerIllustration name="finish"/><dt>结束生涯</dt><dd>{summary.finished}<small> 次</small></dd></div>
   <div><CareerIllustration name="training"/><dt>累计训练</dt><dd>{summary.shots.toLocaleString('en-US')}<small> 次</small></dd></div>
   <div><CareerIllustration name="cash"/><dt>累计交付</dt><dd>{money(summary.delivered)}</dd></div>
  </dl>
  <section className="career-end-section"><h3>生涯最高价值球员</h3>{summary.best?<BestPlayerCard player={summary.best}/>:<p className="career-stat-empty">发掘首个球星模板后，这里将留下你的最高价值球员。</p>}</section>
  <section className="career-collection-progress"><h3>收藏成就</h3><div className="career-collection-links">
   <button onClick={()=>setAlbum(0)} aria-label="打开球星图鉴"><span className="career-collection-art"><img src={assetUrl(`art/career/album.png`)} alt=""/></span><strong>球星图鉴</strong><b>{stars}<small> / {templateRules.length}</small></b><progress aria-label="球星收藏进度" value={stars} max={templateRules.length}/><span className="collection-link-arrow" aria-hidden="true">›</span></button>
   <button onClick={()=>setAlbum(1)} aria-label="打开器械图鉴"><span className="career-collection-art"><ProductImage id="relic_002" name="器械"/></span><strong>器械图鉴</strong><b>{equipment}<small> / {shopCatalog.length}</small></b><progress aria-label="器械收藏进度" value={equipment} max={shopCatalog.length}/><span className="collection-link-arrow" aria-hidden="true">›</span></button>
  </div></section>
  <p className="career-stat-note">包含进行中和已放弃生涯；结束生涯仅计信用耗尽的对局。训练次数按回溯后的有效记录统计。历史缺失的记录不会补算，数据仅保存在当前浏览器。</p>
  {album!==null&&<ComicDialog title="收藏图鉴" variant="album" className="collection-album-dialog" onClose={()=>setAlbum(null)}><div className="contract-panel"><ContractCollection initialTab={album}/></div></ComicDialog>}
 </article>;
}
function CareerIllustration({name}:{name:string}){return <span className="career-stat-illustration"><img src={assetUrl(`art/career/${name}.png`)} alt=""/></span>;}
function Laurels(){return <svg className="career-laurels" viewBox="0 0 240 100" aria-hidden="true"><g fill="#bf8b2f" stroke="#bf8b2f"><path d="M48 95Q2 57 22 9M192 95q46-38 26-86" fill="none" strokeWidth="2"/>{[0,1,2,3,4].map(i=><g key={i}><ellipse cx={17+i*4} cy={20+i*15} rx="4" ry="9" transform={`rotate(-38 ${17+i*4} ${20+i*15})`}/><ellipse cx={31+i*3} cy={25+i*14} rx="4" ry="9" transform={`rotate(35 ${31+i*3} ${25+i*14})`}/><ellipse cx={223-i*4} cy={20+i*15} rx="4" ry="9" transform={`rotate(38 ${223-i*4} ${20+i*15})`}/><ellipse cx={209-i*3} cy={25+i*14} rx="4" ry="9" transform={`rotate(-35 ${209-i*3} ${25+i*14})`}/></g>)}</g></svg>;}
