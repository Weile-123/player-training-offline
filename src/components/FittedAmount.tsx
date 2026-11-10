import {useLayoutEffect,useRef,type CSSProperties} from 'react';

/** Keep the entire formatted amount on one line, including very large units. */
export function FittedAmount({text,style,fitHeight=false}:{text:string;style?:CSSProperties;fitHeight?:boolean}){
 const root=useRef<HTMLElement>(null);
 useLayoutEffect(()=>{
  const el=root.current;if(!el)return;
  const label=el.firstElementChild as HTMLElement;
  let active=true,lastWidth=-1,lastMax=-1,lastHeight=-1;
  const fit=(force=false)=>{
   if(!active)return;
   const max=fitHeight?Math.min(parseFloat(getComputedStyle(el).fontSize),Math.max(1,(el.clientHeight-6)/1.2)):parseFloat(getComputedStyle(el).fontSize);
   if(!force&&el.clientWidth===lastWidth&&el.clientHeight===lastHeight&&max===lastMax)return;
   lastHeight=el.clientHeight;
   lastWidth=el.clientWidth;
   lastMax=max;
   if(!lastWidth)return;
   label.style.fontSize=`${max}px`;
   const natural=label.getBoundingClientRect().width;
   label.style.fontSize=`${Math.min(max,max*(lastWidth-(fitHeight?6:1))/Math.max(1,natural))}px`;
  };
  const observer=new ResizeObserver(()=>fit());observer.observe(el);if(el.parentElement)observer.observe(el.parentElement);fit(true);
  void document.fonts.ready.then(()=>fit(true));
  return()=>{active=false;observer.disconnect();};
 },[text,fitHeight]);
 return <b className="fitted-amount" ref={root} title={text} style={style}><span>{text}</span></b>;
}
