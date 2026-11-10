import {useState} from 'react';
import {GameIcon} from './GameIcon';
import type {Athlete,Contract} from '../game/contract/engine';
import {contextualHelp,helpCopy,helpKey} from '../presentation/contextualHelp';
import './ContextualHelp.css';
export function ContextualHelp({game,player,panel,blocked}:{game:Contract;player?:Athlete;panel:string|null;blocked:boolean}){
 const [seen,setSeen]=useState<string[]>(()=>{try{const v=JSON.parse(localStorage.getItem(helpKey)??'[]');return Array.isArray(v)?v.filter(x=>typeof x==='string'):[];}catch{return [];}});
 const [expandedId,setExpandedId]=useState<string|null>(null);
 const id=blocked?null:contextualHelp(game,player,panel,seen);
 if(!id)return null;
 const expanded=expandedId===id;
 const icons={template:'people',heat:'train',signing:'handshake',shop:'cart',scout:'bag',shortfall:'announcement'} as const;
 const dismiss=()=>{const next=[...seen,id];setSeen(next);setExpandedId(null);try{localStorage.setItem(helpKey,JSON.stringify(next));}catch{/* tips never block gameplay */}};
 return <aside className={`context-help context-help-${id}`} aria-label="首次操作提示" key={id}><div><button className="context-help-title" aria-expanded={expanded} onClick={()=>setExpandedId(expanded?null:id)}><GameIcon name={icons[id]}/><strong>{helpCopy[id][0]}</strong><span aria-hidden="true">{expanded?'⌃':'⌄'}</span></button><button className="context-help-close" aria-label="不再提示此内容" onClick={dismiss}>×</button></div>{expanded&&<p>{helpCopy[id][1]}</p>}</aside>;
}
