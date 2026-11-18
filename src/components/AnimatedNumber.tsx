import { memo, useLayoutEffect, useRef, useState } from 'react';
import { NumberTween } from '../presentation/numberTween';

export const AnimatedNumber=memo(function AnimatedNumber({value,decimals=0,reduced=false,tone}:{value:number;decimals?:number;reduced?:boolean;tone?:'up'|'down'|'neutral'}){
 const tween=useRef(new NumberTween(value));
 const initial=useRef(value.toFixed(decimals)),label=useRef<HTMLElement>(null);
 const [direction,setDirection]=useState(tween.current.direction);
 useLayoutEffect(()=>{
  const model=tween.current;
  const display=(text:string)=>{if(label.current&&label.current.textContent!==text)label.current.textContent=text;};
  model.retarget(value,performance.now(),reduced);
  setDirection(model.direction);
  if(reduced){model.snap();display(value.toFixed(decimals));return;}
  if(model.value===model.target){display(value.toFixed(decimals));return;}
  let request=0;
  const tick=(now:number)=>{
   display(model.sample(now).toFixed(decimals));
   if(model.value!==model.target)request=requestAnimationFrame(tick);
  };
  request=requestAnimationFrame(tick);
  return ()=>cancelAnimationFrame(request);
 },[value,reduced,decimals]);
 return <b ref={label} className={`counting-number ${tone??direction}`} aria-label={value.toFixed(decimals)}>{initial.current}</b>;
});
