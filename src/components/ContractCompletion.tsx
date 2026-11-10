import {useEffect,useState} from 'react';
import type {CompletionRecord} from '../game/contract/engine';
import {equipmentName} from '../game/contract/catalog';
import {BestPlayerCard} from './CareerEndDialog';
import {ProductImage} from './ProductImage';
import {ComicDialog} from './ComicDialog';
import {money} from './ContractPanels';
import {PosterShareDialog} from './PosterShareDialog';
import '../completion.css';

export function ContractCompletion({record,onContinue,onHome}:{record:CompletionRecord;onContinue:()=>void;onHome:()=>void}){
 const [confirm,setConfirm]=useState(false),[poster,setPoster]=useState(false);
 useEffect(()=>{if(confirm)document.querySelector<HTMLButtonElement>('.completion-cancel')?.focus()},[confirm]);
 return <><ComicDialog title="合同圆满完成" subtitle={`第 ${record.month} 月 · 达成生涯里程碑`} variant="career-end" dismissible={false} onClose={()=>{}} className="completion-dialog">
 <div className="career-end-scroll" tabIndex={0} aria-label="通关成绩">
 <dl className="career-end-stats"><div><dt>完成合同</dt><dd>{record.month}<small> 个月</small></dd></div><div><dt>累计交付</dt><dd>{money(record.delivered)}</dd></div><div><dt>累计训练</dt><dd>{record.totalShots.toLocaleString('en-US')}<small> 次</small></dd></div></dl>
 <section className="career-end-section"><h3>本局最高价值球员</h3>{record.bestPlayer?<BestPlayerCard player={record.bestPlayer}/>:<div className="career-best-empty"><strong>尚未发掘球星模板</strong><p>本局暂无可展示的球星记录</p></div>}</section>
 <section className="career-end-section career-equipment"><h3>通关器械 · {record.equipment.length}/8</h3>{record.equipment.length?<div className="career-equipment-grid">{record.equipment.map(id=><div key={id}><ProductImage id={id} name={equipmentName(id)}/><strong>{equipmentName(id)}</strong></div>)}</div>:<p className="career-equipment-empty">本局未持有器械</p>}</section>
 </div>
 <footer className="completion-actions"><button className="completion-endless" onClick={onContinue}><span>开启无尽挑战<small>保留本局进度 · 迎战第{record.month+1}月</small></span><b aria-hidden="true">›</b></button><button className="completion-poster" onClick={()=>setPoster(true)}><svg viewBox="0 0 30 30" aria-hidden="true"><path d="M10 5H4v22h22V17M16 3h11v11M26 4 13 17"/></svg>生成海报发帖</button><button className="completion-home" onClick={()=>setConfirm(true)}>返回首页</button></footer>
 {confirm&&<ComicDialog variant="plain" className="completion-confirm" title="现在返回首页？" subtitle="离开通关结算" onClose={()=>setConfirm(false)}><p>本局进度将保留。下次点击「继续游戏」，仍可开启无尽挑战。</p><div><button className="completion-cancel" onClick={()=>setConfirm(false)}>取消</button><button className="completion-confirm-home" onClick={onHome}>确认返回</button></div></ComicDialog>}
 {poster&&<PosterShareDialog spec={{kind:'completion',record}} onClose={()=>setPoster(false)}/>}
 </ComicDialog></>;
}
