import {useState} from 'react';
import {assetUrl} from '../presentation/assetUrls';
import {landscapeHomeBackground,portraitHomeBackground} from '../presentation/startupAssets';

/** The background owns the viewport; foreground content never follows its crop. */
export function GymHomeBackground() {
 const [failed,setFailed]=useState<string[]>([]);
 const portrait=assetUrl(portraitHomeBackground),landscape=assetUrl(landscapeHomeBackground);
 const usable=(url:string)=>typeof document==='undefined'||!failed.includes(new URL(url,document.baseURI).href);
 const portraitUrl=usable(portrait)?portrait:usable(landscape)?landscape:undefined;
 const landscapeUrl=usable(landscape)?landscape:portraitUrl;
 return <div className="gym-home-backdrop" aria-hidden="true">
  {portraitUrl&&<picture className="gym-home-background"><source media="(min-aspect-ratio: 1/1)" srcSet={landscapeUrl}/><img src={portraitUrl} alt="" onError={event=>{
   const {currentSrc,src}=event.currentTarget;
   const failedUrl=currentSrc||src;
   setFailed(previous=>previous.includes(failedUrl)?previous:[...previous,failedUrl]);
  }}/></picture>}
  <div className="b-ink-side"/>
 </div>;
}

/** Shared title only: Loading never imports the gym store or game screen. */
export function GymHomeArt() {
 return <header className="b-masthead"><span className="micro b-micro">THE HOME OF LEGENDS</span><h1 className="home-design-title"><span>传奇</span><b>球馆</b></h1><p>从训练球星开始</p></header>;
}

export function GymHomeFooter() {
 return <div className="b-bottom-line" aria-hidden="true"><span>LEGEND GYM</span><i/></div>;
}

export function GymHomeIcon({name}: {name: 'book' | 'rank' | 'career' | 'settings' | 'new' | 'arrow'}) {
 const paths = {
  book: <path d="M22 7Q12 2 4 7v34q9-4 18 1 11-6 22-1V7Q32 2 22 7Zm0 0v35M9 14h7M9 21h7M29 14h8M29 21h8"/>,
  rank: <><path d="M14 5h20v12c0 10-20 10-20 0ZM24 25v11M15 41h18M19 36h10M14 9H6v6c0 6 5 9 11 9M34 9h8v6c0 6-5 9-11 9"/><path d="m24 8 1.5 4.5H30l-3.5 3 1.5 4.5-4-2.8-4 2.8 1.5-4.5-3.5-3h4.5Z" fill="currentColor" strokeWidth="1"/></>,
  career: <path d="M14 9H7v35h31V9h-8M15 4h14v11H15ZM14 23h16M14 30h11M14 37h7M34 27l10 7-5 9h-9l-4-6 8-10Z"/>,
  settings: <path d="m18 4-2 7-7-1-5 8 5 5-5 6 5 8 7-1 2 8h12l2-8 7 1 5-8-5-6 5-5-5-8-7 1-2-7ZM32 24a8 8 0 1 0-16 0 8 8 0 0 0 16 0Z" fill="currentColor" fillRule="evenodd" stroke="none"/>,
  new: <path d="M10 4h21l9 10v29H10ZM30 4v12h10M17 28h16M25 20v16"/>,
  arrow: <path d="M6 24h34M27 10l14 14-14 14" strokeWidth="5"/>,
 };
 return <svg viewBox="0 0 48 48" aria-hidden="true">{paths[name]}</svg>;
}
