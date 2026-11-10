import type {Contract,Event} from '../game/contract/engine';
import {equipmentName} from '../game/contract/catalog';
import {templateById} from '../game/templates';
import {ComicDialog} from './ComicDialog';
import {ProductImage} from './ProductImage';
import './EquipmentTriggerDialog.css';

export function EquipmentTriggerDialog({event,game,onClose,onView}:{event:Event;game:Contract;onClose:()=>void;onView:()=>void}){
 const copied=event.type==='duplicate',id=copied?'relic_093':'relic_077',player=game.players.find(p=>p.id===event.playerId);
 return <ComicDialog title={copied?'复制球员已生成':'信用保障已生效'} className="equipment-trigger-dialog" onClose={onClose}>
  <div className="equipment-trigger-hero"><ProductImage id={id} name={equipmentName(id)}/><div><small>器械效果触发</small><h3>{equipmentName(id)}</h3><strong>{copied?'新增 1 名球员':'信用恢复至 1 点'}</strong></div></div>
  {copied?<p>已生成一名{player?`${templateById(player.templateId)?.name??'待发掘球员'}的`:''}复制球员，继承原球员的属性、估值和已使用的保护次数，已进入休息室。</p>:<p>本次信用归零已被抵消，你可以继续挑战。<b>信用紧急保障已消耗，并从背包中移除。</b></p>}
  <div className="equipment-trigger-actions"><button className={copied?'secondary':'primary'} onClick={onClose}>知道了</button>{copied&&<button className="primary" onClick={onView}>前往查看</button>}</div>
 </ComicDialog>;
}
