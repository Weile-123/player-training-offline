import {useId} from 'react';
import {assetUrl} from '../presentation/assetUrls';

const entries={
 collection:{label:'图鉴',aria:'球星图鉴',viewBox:'7 9 84 90'},
 rank:{label:'排行榜',aria:'排行榜',viewBox:'17 17 72 75'},
 career:{label:'生涯',aria:'生涯',viewBox:'20 13 72 74'},
};

/** Keep the original ink icons, with independent labels sharing one font size. */
export function HomeMenuButton({kind,onClick}:{kind:keyof typeof entries;onClick:()=>void}){
 const entry=entries[kind],filter=useId();
 return <button className="art-button home-menu-button" aria-label={entry.aria} onClick={onClick}>
  <svg className="home-menu-ink" viewBox={entry.viewBox} aria-hidden="true">
   <defs><filter id={filter} x="0" y="0" width="245" height="107" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
    <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1 -1 -1 0 1.4"/>
    <feComponentTransfer result="ink"><feFuncA type="linear" slope="2" intercept="0"/></feComponentTransfer>
    <feFlood floodColor="currentColor"/><feComposite in2="ink" operator="in"/>
   </filter></defs>
   <image href={assetUrl(`art/home/button-${kind}.png`)} width="245" height="107" preserveAspectRatio="none" filter={`url(#${filter})`}/>
  </svg>
  <span className="home-menu-label">{entry.label}</span>
  <svg className="home-menu-chevron" viewBox="0 0 12 20" aria-hidden="true"><path d="m3 3 7 7-7 7" fill="none" stroke="currentColor" strokeWidth="3"/></svg>
 </button>;
}
