import { useEffect } from 'react';
// Shared by asset, collection, unlock and settlement dialogs without changing game actions.
export function useModalAccessibility(enabled=true){
 useEffect(()=>{
  if(!enabled)return;
  let active:HTMLElement|null=null,previous:HTMLElement|null=null,overflow='';
  const candidates=(dialog:HTMLElement)=>Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')).filter(el=>el.getClientRects().length);
  const update=()=>{
   const dialogs=Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).sort((a,b)=>Number(a.dataset.dialogDepth??0)-Number(b.dataset.dialogDepth??0));
   const next=dialogs[dialogs.length-1]??null;if(next===active)return;
   if(next){if(!active){previous=document.activeElement instanceof HTMLElement?document.activeElement:null;overflow=document.body.style.overflow;document.body.style.overflow='hidden';}active=next;candidates(next)[0]?.focus();}
   else if(active){active=null;document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();}
  };
  const keydown=(event:KeyboardEvent)=>{
   if(!active||event.key!=='Tab')return;
   const items=candidates(active);if(!items.length){event.preventDefault();return;}
   const index=items.indexOf(document.activeElement as HTMLElement);
   if(event.shiftKey&&(index<=0)){event.preventDefault();items[items.length-1]?.focus();}
   else if(!event.shiftKey&&(index===items.length-1||index===-1)){event.preventDefault();items[0].focus();}
  };
  const observer=new MutationObserver(update);observer.observe(document.body,{childList:true,subtree:true});document.addEventListener('keydown',keydown);update();
  return()=>{observer.disconnect();document.removeEventListener('keydown',keydown);if(active)document.body.style.overflow=overflow;};
 },[enabled]);
}
