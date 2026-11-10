import {useLayoutEffect,useRef,useState} from 'react';

/** Vector border follows the neighbouring shot button's ellipse at any configured size. */
export function DockButtonFrame(){
 const ref=useRef<SVGSVGElement>(null),[shape,setShape]=useState({width:1,height:1,outer:'',inner:''});
 useLayoutEffect(()=>{
  const svg=ref.current,button=svg?.parentElement,dock=button?.closest('.dock-canvas'),shot=dock?.querySelector('.dock-shoot');
  if(!svg||!button||!shot)return;
  const update=()=>{
   const b=button.getBoundingClientRect(),s=shot.getBoundingClientRect(),left=b.x<s.x,w=b.width,h=b.height;
   const cx=s.x+s.width/2-b.x,cy=s.y+s.height/2-b.y,rx=s.width/2+7,ry=s.height/2+7;
   const edge=(y:number,inset:number)=>{
    const extent=rx*Math.sqrt(Math.max(0,1-((y-cy)/ry)**2));
    return left?Math.min(w-inset,cx-extent-inset):Math.max(inset,cx+extent+inset);
   };
   const path=(inset:number)=>{
    const radius=Math.min(10,h/5),top=inset,bottom=h-inset;
    const curve=Array.from({length:17},(_,i)=>{const y=top+(bottom-top)*i/16;return `${i?'L':'M'}${edge(y,inset)},${y}`;}).join(' ');
    return left?`${curve} L${inset+radius},${bottom} Q${inset},${bottom} ${inset},${bottom-radius} L${inset},${top+radius} Q${inset},${top} ${inset+radius},${top} Z`:
     `${curve} L${w-inset-radius},${bottom} Q${w-inset},${bottom} ${w-inset},${bottom-radius} L${w-inset},${top+radius} Q${w-inset},${top} ${w-inset-radius},${top} Z`;
   };
   setShape({width:w,height:h,outer:path(4),inner:path(9)});
  };
  const observer=new ResizeObserver(update);observer.observe(button);observer.observe(shot);update();return()=>observer.disconnect();
 },[]);
 return <svg ref={ref} className="dock-button-frame" viewBox={`0 0 ${shape.width} ${shape.height}`} aria-hidden="true"><path d={shape.outer} className="dock-frame-rim"/><path d={shape.outer} className="dock-frame-paper"/><path d={shape.inner} className="dock-frame-line"/></svg>;
}
