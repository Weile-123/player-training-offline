import { createContext, useContext, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { GameIcon } from './GameIcon';

const DialogDepth=createContext(0);
type Props={title:string;onClose:()=>void;children:ReactNode;footer?:ReactNode;className?:string;subtitle?:string;dismissible?:boolean;priority?:number;variant?:'standard'|'month'|'repay'|'template'|'workshop'|'roster'|'empty'|'album'|'career-end'|'plain'};

/** Shared paper dialog. Portals keep nested confirmations outside clipped panels. */
export function ComicDialog({title,onClose,children,footer,className='',variant='standard',subtitle,dismissible=true,priority=0}:Props){
 const depth=useContext(DialogDepth),titleId=useId(),terminal=variant==='career-end',plain=variant==='plain',effectiveDepth=Math.max(priority,terminal?Math.max(10,depth):depth);
 const content=<DialogDepth.Provider value={effectiveDepth+1}>
  <div className={`game-screen comic-dialog-layer${terminal?' career-end-layer':''}`} style={{zIndex:terminal?100:50+effectiveDepth*10}}>
   <div className={plain?'plain-dialog-backdrop':terminal?'career-end-backdrop':'modal-backdrop game-sheet-backdrop comic-dialog-backdrop'} onClick={event=>event.stopPropagation()}>
    <section className={plain?`plain-dialog ${className}`:terminal?`career-end-dialog ${className}`:`modal game-sheet comic-sheet comic-dialog comic-sheet-${variant} ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} data-dialog-depth={effectiveDepth} onClick={event=>event.stopPropagation()} onKeyDown={event=>{if(event.key==='Escape'&&(event.target as HTMLElement).closest('[role="dialog"]')===event.currentTarget){event.stopPropagation();if(dismissible)onClose();}}}>
     <header className={plain?'plain-dialog-heading':terminal?'career-end-heading':'sheet-heading'}>{plain&&subtitle&&<small>{subtitle}</small>}<h2 id={titleId}>{(variant==='album'||terminal)&&<svg className="album-title-ball" viewBox="0 0 50 50" aria-hidden="true"><circle cx="25" cy="25" r="22" fill="currentColor"/><path d="M3 25h44M25 3v44M9 9q34 16 0 32M41 9q-34 16 0 32" fill="none" stroke="#a32d23" strokeWidth="2"/></svg>}{title}</h2>{!plain&&subtitle&&<p>{subtitle}</p>}{dismissible&&!plain&&<button type="button" className="sheet-close" aria-label="关闭面板" onClick={onClose}><GameIcon name="close"/></button>}</header>
     {terminal||plain?children:<div className="sheet-scroll">{children}</div>}
     {footer}
    </section>
   </div>
  </div>
 </DialogDepth.Provider>;
 return typeof document==='undefined'?content:createPortal(content,document.body);
}
