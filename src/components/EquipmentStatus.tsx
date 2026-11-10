import {useState} from 'react';
import type {Athlete,Contract} from '../game/contract/engine';
import {equipmentStates,sourceName,type EquipmentState} from '../presentation/equipmentStatus';
import {ComicDialog} from './ComicDialog';
import {ProductImage} from './ProductImage';
import {EquipmentDetailDialog} from './EquipmentDetailDialog';
import '../equipment-status.css';

export function EquipmentStatus({game,player,onInventory}:{game:Contract;player?:Athlete;onInventory:()=>void}){
 const [open,setOpen]=useState(false),[selected,setSelected]=useState<EquipmentState|null>(null),rows=equipmentStates(game,player);
 if(!rows.length)return null;
 const featured=[rows.find(r=>r.tone==='guard'),rows.find(r=>r.tone==='charge')].filter((r):r is typeof rows[number]=>!!r);
 for(const row of rows)if(featured.length<2&&!featured.includes(row))featured.push(row);
 return <><button className="court-equipment-status" aria-label="查看器械实时状态" onClick={()=>setOpen(true)}>
  <span className="equipment-status-heading">器械状态 <i>›</i></span>
  {featured.map(row=><span className={`equipment-status-mini ${row.tone}`} key={row.id}><span>{row.label}</span><b>{row.value}</b></span>)}
  <small>{rows.length>2?`全部 ${rows.length} 项状态`:'点击查看详情'}</small>
 </button>{open&&<ComicDialog title="器械实时状态" onClose={()=>setOpen(false)} className="equipment-status-dialog" footer={<div className="equipment-status-notice"><details><summary>多种保护同时生效时，先用哪一种？</summary><p>按顺序使用：一次性护具 → 月度保护 → 球员首次保护 → 轻伤积攒的护盾 → 保命机会。每次只消耗实际生效的保护。</p></details><p>这里只显示会变化的状态；完整器械效果可在背包查看。</p><button type="button" className="primary equipment-status-inventory" onClick={()=>{setSelected(null);setOpen(false);onInventory();}}>前往背包 <span aria-hidden="true">›</span></button></div>}>
  <div className="equipment-status-intro"><b>{rows.length} 项器械状态</b><span>投篮、换人后自动更新</span></div>
  <div className="equipment-state-list">{rows.map(row=><article key={row.id} className={row.tone}>
   <div className="equipment-state-identity"><div className={`equipment-state-picture ${(row.sources?.length??0)>1?'multiple':''}`}>
    {row.sources?.length?row.sources.map(id=><ProductImage key={id} id={id} name={sourceName(id)}/>):<span aria-label="旧存档未记录来源">?</span>}
   </div><div className="equipment-state-info"><div className="equipment-state-topline"><h3>{row.name}</h3><button type="button" className="equipment-state-details" aria-label={`查看${row.name}详情`} onClick={()=>setSelected(row)}>查看详情 <span aria-hidden="true">›</span></button></div>
   <div className="equipment-state-statusline"><span>{row.label}</span><b>{row.displayValue??row.value}</b></div></div></div>
   {row.progress?<div className="equipment-state-meter" role="progressbar" aria-label={row.label} aria-valuemin={0} aria-valuemax={row.progress.total} aria-valuenow={Math.min(row.progress.current,row.progress.total)}>{Array.from({length:row.progress.total},(_,i)=><i key={i} className={i<row.progress!.current?'on':''}/>)}</div>:<div className="equipment-state-divider"/>}
   <p className="equipment-state-detail">{row.detail}</p>{row.rule&&<p className="equipment-state-rule">{row.rule}</p>}
  </article>)}</div>
  {selected&&<EquipmentDetailDialog ids={selected.sources??[]} onClose={()=>setSelected(null)} note={[selected.scope&&selected.scope!=='当前球员'?`适用范围：${selected.scope}`:'',selected.legacySource?'旧存档未记录全部来源，历史合计仍然有效。':''].filter(Boolean).join('；')}/>}
 </ComicDialog>}</>;
}
