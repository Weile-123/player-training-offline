import {assetUrl} from '../presentation/assetUrls';
import { useId, type ReactNode } from 'react';

type Name = 'announcement'|'feedback'|'career'|'cash'|'assets'|'debt'|'home'|'more'|'people'|'rest'|'tag'|'log'|'book'|'settings'|'cart'|'calendar'|'close'|'bag'|'train'|'handoff'|'handshake'|'bed'|'folder';
const paths: Record<Name, ReactNode> = {
 announcement:<><path d="M7 19h10L35 8v32L17 29H7ZM13 29l4 13h8l-5-12M41 16l5-4M41 24h6M41 32l5 4"/></>,
 feedback:<><path d="M5 6h38v28H22L11 43v-9H5ZM13 15h22M13 23h16"/></>,
 career:<><path d="M14 8H7v36h30V8h-8M15 4h13v10H15ZM14 22h15M14 29h10M14 36h6M35 28l9 5-4 8h-8l-5-5 8-8Z"/></>,
 train:<><path d="M3 20v8M10 14v20M17 9v30M31 9v30M38 14v20M45 20v8M17 24h14" strokeWidth="5"/></>,
 handoff:<><path d="M10 4h20l9 10v29H10ZM29 4v11h10M16 25h13M22 19v12M16 36h13"/></>,
 handshake:<><path d="m3 22 10-16 8 3 6-2 9 2 10 15-6 5-5-1M3 22l8 7 4-3 4 3 4 3 4 3 4-4 5-3-11-12-6 6-5-4 7-9M11 29l-4 4 5 5 3-3M15 30l-4 7 5 5 5-7M22 33l-5 8 5 3 5-6M27 35l-3 6 5 2 5-6"/></>,
 bed:<><path d="M5 8v33M5 30h39v11M44 30V19H23v11" strokeWidth="5"/><rect x="9" y="19" width="11" height="8" rx="3" fill="currentColor"/></>,
 folder:<><path d="M4 38V7h14l5 6h18v6M4 39l6-20h35l-6 20Z" fill="currentColor"/></>,
 bag:<><path d="M12 15c0-7 24-7 24 0l4 25H8ZM18 11V5h12v6M8 25h32M17 28h14v10H17Z"/><path d="M5 19v17M43 19v17"/></>,
 assets:null,
 cash:<><path d="m3 17 21-13 21 13-21 13ZM3 24l21 13 21-13M3 31l21 13 21-13M15 10l21 13M12 26l21-13"/><path d="m20 14 9 5-5 4-8-5Z"/></>,
 debt:<><path d="M9 4h23l8 9v31H9ZM31 4v11h9M15 23h18M15 30h18M15 37h12M15 11h9"/></>,
 home:<path d="m3 23 21-19 21 19h-7v21H28V29h-8v15H10V23Z"/>,
 more:<>{[9,24,39].map(x=><circle key={x} cx={x} cy="24" r="3" fill="currentColor"/>)}</>,
 people:<><circle cx="18" cy="13" r="7" fill="currentColor"/><circle cx="34" cy="15" r="5"/><path d="M4 40V32a14 14 0 0 1 28 0v8ZM34 25q11 0 11 15h-9" fill="currentColor"/></>,
 rest:<><path d="M9 25V8h30v17M6 22H3v18h42V22h-4M10 40v5M38 40v5M9 26h30v10H9Z" fill="currentColor"/></>,
 tag:<><path d="m5 26 21-21h16v16L21 42Z" fill="currentColor"/><circle cx="34" cy="13" r="3" fill="#b3372b" stroke="none"/></>,
 log:<><path d="M9 4h27v39H9ZM15 12h15M15 20h15M15 28h9M15 35h8M28 34l13-19 4 3-13 19-6 3Z"/></>,
 book:<><path d="M24 9Q14 2 3 6v34q11-4 21 2 10-6 21-2V6Q34 2 24 9Zm0 0v33"/></>,
 settings:<><path d="m18 4-2 7-7-1-5 8 5 5-5 6 5 8 7-1 2 8h12l2-8 7 1 5-8-5-6 5-5-5-8-7 1-2-7Z" fill="currentColor"/><circle cx="24" cy="24" r="8" fill="#10202a" stroke="none"/></>,
 cart:<><path d="M3 5h6l7 28h24l5-20H12M19 13v20M29 13v20M39 13v20M14 23h29"/>{[20,38].map(x=><circle key={x} cx={x} cy="41" r="3" fill="currentColor"/>)}</>,
 calendar:<><rect x="5" y="9" width="38" height="34" rx="1"/><path d="M5 20h38M15 3v12M33 3v12M14 27h3M23 27h3M32 27h3M14 35h3M23 35h3M32 35h3"/></>,
 close:<path d="m10 10 28 28M38 10 10 38"/>,
};
export function GameIcon({name}:{name:Name}) {
 const assetFilter=useId();
 // 直接复用操作区资产原图：只提取深色线稿为透明蒙版，避免带入纸张底色。
 if(name==='assets')return <svg viewBox="0 0 80 72" className="game-icon" aria-hidden="true">
  <defs><filter id={assetFilter} x="0" y="0" width="80" height="72" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
   <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1 -1 -1 0 1.4"/>
   <feComponentTransfer result="inkMask"><feFuncA type="linear" slope="2" intercept="0"/></feComponentTransfer>
   <feFlood floodColor="currentColor" result="inkColor"/><feComposite in="inkColor" in2="inkMask" operator="in"/>
  </filter></defs>
  <image href={assetUrl(`art/game/dock-controls.png`)} x="-474" y="-35" width="887" height="442" filter={`url(#${assetFilter})`}/>
 </svg>;
 return <svg viewBox="0 0 48 48" className="game-icon" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">{paths[name]}</svg>;
}
