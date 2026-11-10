import { useEffect, useRef, useState } from 'react';
import { NumberTween } from '../presentation/numberTween';

export function AnimatedNumber({value,decimals=0,reduced=false,tone}:{value:number;decimals?:number;reduced?:boolean;tone?:'up'|'down'|'neutral'}){
 const tween=useRef(new NumberTween(value));
 const [display,setDisplay]=useState(()=>value.toFixed(decimals));
 const [direction,setDirection]=useState(tween.current.direction);
 useEffect(()=>{
  const model=tween.current;
  model.retarget(value,performance.now(),reduced);
  setDirection(model.direction);
  if(reduced){model.snap();setDisplay(value.toFixed(decimals));return;}
  if(model.value===model.target){setDisplay(value.toFixed(decimals));return;}
  let request=0;
  const tick=(now:number)=>{
   setDisplay(model.sample(now).toFixed(decimals));
   if(model.value!==model.target)request=requestAnimationFrame(tick);
  };
  request=requestAnimationFrame(tick);
  return ()=>cancelAnimationFrame(request);
 },[value,reduced,decimals]);
 return <b className={`counting-number ${tone??direction}`} aria-label={value.toFixed(decimals)}>{display}</b>;
}
