/** Keep scrolling, keyboard navigation, editable fields and rapid game clicks native. */
export function installGameInteractions(root:Document):()=>void {
 const block=(event:Event)=>{
  const target=event.target as Element|null;
  const element=target?.nodeType===1?target:target?.parentElement;
  if(element?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[data-allow-native]'))return;
  event.preventDefault();
 };
 const events=['contextmenu','selectstart','dragstart','dblclick'] as const;
 for(const name of events)root.addEventListener(name,block,true);
 return ()=>{for(const name of events)root.removeEventListener(name,block,true);};
}
