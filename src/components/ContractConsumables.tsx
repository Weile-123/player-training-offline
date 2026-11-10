import {assetUrl} from '../presentation/assetUrls';
import {isHighPotential} from '../game/contract/recruits';
import {useState} from 'react';
import {useContract} from '../contractStore';
import {dispatch,type Contract} from '../game/contract/engine';
import {type ItemId} from '../game/contract/commerce';
import {itemCatalog} from '../game/contract/catalog';
import {templateById} from '../game/templates';
import {ComicDialog} from './ComicDialog';
import {StarPortrait,templatePortrait} from './PlayerTemplatePanel';

export function ConsumableIcon({id}:{id:ItemId}){
 const item=itemCatalog.find(i=>i.id===id)!;
 return <img className="consumable-icon" src={assetUrl(`art/consumables/${item.icon}.png`)} alt="" aria-hidden="true" draggable={false}/>;
}
export function itemAction(id:ItemId,playerId:string|null){return id==='item_002'?{type:'rewind' as const}:{type:'use-item' as const,id,playerId:playerId??''};}
export function itemUseBlock(g:Contract,id:ItemId,playerId:string|null){
 if(g.status==='over')return '本局已结束';if(!g.commerce.inventory[id])return '库存不足';
 if(id!=='item_002'&&!g.players.some(p=>p.id===playerId&&!p.queued))return '请先选择上场球员';
 const result=dispatch(g,g.revision,itemAction(id,playerId));
 const reasons:Record<string,string>={'level-cap':'训练已达99级，无需继续使用训练物品','no-rewind':'没有可回溯的投篮，需在投篮前持有本物品','item-blocked-during-frenzy':'火热或满手感期间不可使用','item-already-armed':'此物品已为球员预备','normal-shot-item-already-armed':'已预备普通训练物品，暂不能补满手感'};
 return result.error?reasons[result.error]??'当前状态不可使用':'';
}
export function ItemDetail({id,onClose}:{id:ItemId;onClose:()=>void}){
 const store=useContract(),g=store.state,item=itemCatalog.find(i=>i.id===id)!,p=g.players.find(p=>p.id===store.selectedId&&!p.queued),block=itemUseBlock(g,id,store.selectedId),[error,setError]=useState('');
 const target=id==='item_002'?g.undo?.before.players.find(v=>v.id===g.undo?.playerId):p;
 const name=target?templateById(target.templateId)?.name??'待发掘球员':id==='item_002'?'暂无可回溯球员':'尚未选择';
 const departed=id==='item_002'&&target&&!g.players.some(v=>v.id===target.id);
 return <ComicDialog title="使用物品" className="commerce-dialog item-use-dialog" onClose={onClose}>
  <div className={`contract-panel item-use ${id==='item_004'?'item-risk':''}`}>
   <div className="item-use-hero"><div className="item-use-art"><ConsumableIcon id={id}/></div><div><small>一次性物品</small><h3>{item.name}</h3><span className="item-stock">持有 <b>×{g.commerce.inventory[id]}</b></span></div></div>
   <section className="item-effect"><h4>使用效果</h4><p>{item.description}</p>{id==='item_004'&&<strong className="item-risk-note">其余结果会变为重伤，请谨慎使用</strong>}{id==='item_005'&&p&&<div className="item-heat-preview">手感 <b>{p.heat}<span>→</span>{Math.min(10,p.heat+3)}</b><small>/10</small></div>}</section>
   <section className="item-target"><span className="item-target-portrait tier-portrait-frame" data-tier={templateById(target?.templateId)?.tier??'undiscovered'}><StarPortrait src={templatePortrait(target?.templateId)} highPotential={isHighPotential(target)} name={name}/></span><div><small>{id==='item_002'?'回溯目标 · 上次出手球员':'作用球员'}</small><strong>{name}</strong><span>{target?`训练 ${target.level}${id==='item_002'?' · 恢复上次投篮前状态':''}`:id==='item_002'?'需要在投篮前持有秒表':'返回训练场选择球员后即可使用'}</span></div>{departed&&<b className="item-recovery-tag">可恢复上场</b>}</section>
   {(block||error)&&<p className="item-use-block" role="status">{block||error}</p>}
   <div className="item-use-footer"><div className="item-detail-actions"><button className="secondary" onClick={onClose}>取消</button><button className="primary" disabled={!!block} onClick={()=>{const r=store.act(itemAction(id,store.selectedId));if(r.error)setError(useContract.getState().actionError);else onClose();}}>{id==='item_002'?'确认回溯':'确认使用'}</button></div></div>
  </div>
 </ComicDialog>;
}
export function ConsumableBar({onItem,practiceInventory}:{onItem:(id:ItemId)=>void;practiceInventory?:Contract['commerce']['inventory']}){
 const savedInventory=useContract(s=>s.state.commerce.inventory),inventory=practiceInventory??savedInventory,ids=['item_005','item_001','item_002','item_003','item_004'] as const;
 return <div className="consumable-bar"><div className="consumable-grid" role="group" aria-label="一次性物品，固定五格">
 {ids.map(id=>{const item=itemCatalog.find(i=>i.id===id)!;return <button key={id} className="consumable-slot" disabled={inventory[id]===0} title={item.name} aria-label={`查看${item.name}，数量${inventory[id]}`} onClick={()=>onItem(id)}><ConsumableIcon id={id}/><span><strong>{item.shortName}</strong><b>×{inventory[id]}</b></span></button>;})}
 </div></div>;
}
