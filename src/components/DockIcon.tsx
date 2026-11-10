type DockIconName='bag'|'shop'|'month'|'rest';
/** Compact silhouettes with consistent rounded ink strokes for the four dock actions. */
export function DockIcon({name}:{name:DockIconName}){
 return <svg className="game-icon dock-action-icon" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  {name==='bag'&&<><path d="M15 9V7a5 5 0 0 1 10 0v2M10 16a10 10 0 0 1 20 0v18H10Z"/><path d="M10 23H7v10h3m20-10h3v10h-3"/><rect x="14" y="22" width="12" height="9" rx="3"/><path d="M18 26h4M16 14h8"/></>}
  {name==='shop'&&<><path d="M6 16v19h28V16M4 15l3-10h26l3 10"/><path d="M4 15v2a4 4 0 0 0 8 0v-2m0 2a4 4 0 0 0 8 0v-2m0 2a4 4 0 0 0 8 0v-2m0 2a4 4 0 0 0 8 0v-2M14 5l-2 10m8-10v10m6-10 2 10"/><path d="M13 35V25h14v10"/></>}
  {name==='month'&&<><rect x="6" y="8" width="28" height="27" rx="4"/><path d="M13 4v8m14-8v8M6 17h28m-21 9 5 5 10-10"/></>}
  {name==='rest'&&<><path d="M8 20v-7a7 7 0 0 1 7-7h10a7 7 0 0 1 7 7v7M8 20H5v13h30V20h-3M8 25h24M10 33v3m20-3v3M13 13h14"/><path d="M8 20v5m24-5v5"/></>}
 </svg>;
}
