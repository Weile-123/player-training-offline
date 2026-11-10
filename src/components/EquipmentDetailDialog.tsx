import {ComicDialog} from './ComicDialog';
import {ProductImage} from './ProductImage';
import {shopCatalog} from '../game/contract/commerce';
import {equipmentDescription,itemCatalog} from '../game/contract/catalog';

/** Shared by the collection and live status, including consumables and combined sources. */
export function EquipmentDetailDialog({ids,onClose,backLabel='返回器械状态',collected=false,note}:{ids:readonly string[];onClose:()=>void;backLabel?:string;collected?:boolean;note?:string}){
 const products=[...new Set(ids)].flatMap(id=>{
  const equipment=shopCatalog.find(p=>p.id===id);
  if(equipment)return [{id,name:equipment.name,rarity:equipment.rarity,label:({common:'普通',rare:'稀有',epic:'史诗',legendary:'传说'})[equipment.rarity],description:equipmentDescription(id)}];
  const item=itemCatalog.find(p=>p.id===id);
  return item?[{id,name:item.name,rarity:'common',label:'一次性物品',description:item.description}]:[];
 });
 return <ComicDialog title="器械档案" variant="album" className="equipment-detail-dialog" onClose={onClose}>
  <div className="equipment-detail">
   {products.map(product=><article className="equipment-detail-source" key={product.id}>
    <div className="equipment-display"><span className="equipment-rarity" data-rarity={product.rarity}>{product.label}</span><ProductImage id={product.id} name={product.name}/></div>
    <h3>{product.name}</h3><div className="equipment-name-rule" aria-hidden="true"><i/>◆<i/></div>
    <section className="equipment-effect"><h4>{product.id.startsWith('item_')?'物品效果':'器械效果'}</h4><div><svg viewBox="0 0 40 48" aria-hidden="true"><path d="M24 2 3 27h14l-3 19 23-28H23Z"/></svg><div><p>{product.description.split(/([+＋−-]?\d+(?:\.\d+)?%?)/g).map((part,i)=>i%2?<b key={i}>{part}</b>:part)}</p>{product.id==='relic_002'&&<small>普通投篮更容易获得成功</small>}</div></div></section>
   </article>)}
   {!products.length&&<p>旧存档未记录这项状态的器械来源，历史奖励仍然有效。</p>}
   {note&&<p className="equipment-source-note">{note}</p>}
   {collected&&<p className="equipment-collected">已收集 · 跨生涯保留图鉴</p>}
   <button type="button" className="album-back" onClick={onClose}>‹ {backLabel}</button>
  </div>
 </ComicDialog>;
}
