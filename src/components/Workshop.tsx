import {GameIcon} from './GameIcon';
import { useState } from 'react';
import { ComicDialog } from './ComicDialog';
import { config } from '../game/config';
import { assetCatalog, assetEffects, upgradeCost } from '../game/assets';
import { monthPreview, upgradeAsset } from '../game/engine';
import { equipmentCatalog, equipmentById } from '../game/equipment';
import type { AssetId, ConsumableId } from '../game/types';
import { useGame } from '../store';
const money=(value:number)=>'$'+value.toLocaleString('en-US');
export function WorkshopArt({name,className=''}:{name:string;className?:string}){
 const icons={cash:'cash',income:'assets',debt:'debt',gym:'home',rehab:'rest',scout:'people',lounge:'bed',rental:'home',shoes:'train',brace:'bag',drink:'bag',ice:'rest',plus:'more',warning:'announcement',crown:'tag',close:'close',vest:'bag',glove:'bag',tablet:'book','smart-ball':'train'} as const;
 return <span className={`workshop-art ${className}`} aria-hidden="true"><GameIcon name={icons[name as keyof typeof icons]??'bag'}/></span>;
}
export function Workshop({initialSection='assets'}:{initialSection?:'assets'|'equipment'|'supplies'}={}){
 const store=useGame(),game=store.game,closed=game.status==='over';
 const [section,setSection]=useState(initialSection),[quantity,setQuantity]=useState(1),[pending,setPending]=useState<AssetId|null>(null);
 const budget=monthPreview(game),effects=assetEffects(game.assetLevels),asset=assetCatalog.find(a=>a.id===pending);
 const projected=pending?monthPreview(upgradeAsset(game,pending)):budget;
 const assets=initialSection==='assets';
 return <section className={`workshop comic-workshop ${assets?'asset-workshop':'equipment-workshop'}`} aria-label={assets?'资产经营':'经营商店'}>
  <div className="workshop-wallet"><WorkshopArt name="cash"/><span>可用现金</span><b>{money(game.cash)}</b></div>
  {assets?<>
   <div className="workshop-summary"><div><WorkshopArt name="income"/><span>月租收入<b>{money(effects.monthlyIncome)}</b></span></div><div><WorkshopArt name="debt"/><span>本月还款<b>{money(budget.payment)}</b></span></div></div>
   <p className={`workshop-budget ${budget.canPay?'sufficient':'shortfall'}`}><WorkshopArt name="warning"/>{budget.canPay?`月底预计结余 ${money(budget.cashAfter)}`:`本月还款缺口 ${money(budget.shortfall)}`}</p>
   <div className="workshop-products asset-products">{assetCatalog.map(item=>{
    const level=game.assetLevels[item.id],cost=upgradeCost(game.assetLevels,item.id);
    return <article className={`workshop-product asset-product ${item.id==='rental'?'rental-product':''}`} key={item.id}>
     <header><h3>{item.name}</h3><span>Lv.{level}<small>/{item.costs.length}</small></span></header>
     <div className="workshop-levels" aria-label={`等级 ${level}/${item.costs.length}`}>{item.costs.map((_,i)=><i className={i<level?'filled':''} key={i}/>)}</div>
     <WorkshopArt name={item.id}/><p>{item.description}</p><div className="product-price"><span>升级费用</span><b>{cost===null?'已满级':money(cost)}</b></div>
     <button className="product-action" disabled={closed||cost===null||game.cash<cost} onClick={()=>setPending(item.id)}>{cost===null?'已满级':'升级'}</button>
    </article>;
   })}</div><p className="workshop-footnote"><WorkshopArt name="crown"/>永久经营加成 · 本局有效</p>
  </>:<>
   <nav className="workshop-tabs" aria-label="商店分类"><button className={section==='equipment'?'active':''} onClick={()=>setSection('equipment')}>装备</button><button className={section==='supplies'?'active':''} onClick={()=>setSection('supplies')}>补给</button></nav>
   {section==='equipment'?<>
    <div className="workshop-loadout"><h3>当前装配 <b>{game.equippedEquipment.length}/{config.equipment.slots}</b></h3><div>{Array.from({length:config.equipment.slots},(_,i)=>{
     const item=equipmentById(game.equippedEquipment[i]);
     return <div className="equipment-slot" key={i}>{item?<><WorkshopArt name={item.id}/><strong>{item.name}</strong><button disabled={closed} onClick={()=>store.toggleEquipment(item.id)}>卸下</button></>:<><WorkshopArt name="plus"/><span>空装备槽</span></>}</div>;
    })}</div></div>
    <div className="workshop-products equipment-products">{equipmentCatalog.map(item=>{
     const owned=game.ownedEquipment.includes(item.id),active=game.equippedEquipment.includes(item.id),full=!active&&game.equippedEquipment.length>=config.equipment.slots;
     return <article className="workshop-product equipment-product" key={item.id}><WorkshopArt name={item.id}/><h3>{item.name}</h3><span className="product-build">{item.build}</span><p>{item.description}</p><b className="equipment-price">{money(item.price)}</b><button className={`product-action ${active?'equipped':''}`} disabled={closed||(owned?full:game.cash<item.price)} onClick={()=>owned?store.toggleEquipment(item.id):store.buyEquipment(item.id)}>{active?'已装备 · 卸下':owned?full?'槽位已满':'装配':'购买'}</button></article>;
    })}</div>
   </>:<>
    <div className="workshop-quantity"><span>购买数量</span>{[1,5,10].map(n=><button className={quantity===n?'active':''} onClick={()=>setQuantity(n)} key={n}>×{n}</button>)}</div>
    <div className="workshop-products">{(['drink','ice'] as ConsumableId[]).map(id=><article className="workshop-product equipment-product" key={id}><WorkshopArt name={id}/><h3>{config.consumables[id].name}</h3><span className="product-build">库存 {game.consumables[id]}/{config.consumables.maximumStock}</span><p>{config.consumables[id].description}</p><b className="equipment-price">{money(config.consumables[id].price*quantity)}</b><button className="product-action" disabled={closed||game.cash<config.consumables[id].price*quantity||game.consumables[id]+quantity>config.consumables.maximumStock} onClick={()=>store.buyConsumable(id,quantity)}>购买 ×{quantity}</button></article>)}</div>
    <p className="workshop-help">购买后不会自动使用，请在训练场物品栏中使用。</p>
   </>}
   <p className="workshop-budget"><WorkshopArt name="warning"/>购买后仍需预留本月最低还款 <b>{money(budget.payment)}</b></p>
  </>}
  <p className="workshop-notice" role="status">{game.logs[0]}</p>
  {asset&&pending&&<ComicDialog title={`升级${asset.name}`} className="asset-confirm" onClose={()=>setPending(null)}><WorkshopArt className="asset-confirm-art" name={pending}/><p>Lv.{game.assetLevels[pending]} → Lv.{game.assetLevels[pending]+1} · {asset.description}</p><dl><dt>升级费用</dt><dd>{money(upgradeCost(game.assetLevels,pending)??0)}</dd><dt>升级后现金</dt><dd>{money(game.cash-(upgradeCost(game.assetLevels,pending)??0))}</dd><dt>预计月底租金</dt><dd>{money(projected.passiveIncome)}</dd><dt>预计还款缺口</dt><dd>{money(projected.shortfall)}</dd></dl><p className={projected.canPay?'text-emerald-400':'text-red-400'}>{projected.canPay?'本月仍能完成还款。':`升级后预计还款不足，将扣除信用${game.credit===1?'并结束游戏':''}。`}</p><div className="grid grid-cols-2 gap-3 mt-5"><button className="secondary" onClick={()=>setPending(null)}>取消</button><button className="primary" disabled={closed||upgradeCost(game.assetLevels,pending)===null||game.cash<(upgradeCost(game.assetLevels,pending)??0)} onClick={()=>{store.upgradeAsset(pending);setPending(null);}}>确认升级</button></div></ComicDialog>}
 </section>;
}
