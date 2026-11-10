/** 保留增减方向，连续点击时从屏幕上的当前数值接着计数。 */
export class NumberTween {
 value:number;
 target:number;
 direction:'up'|'down'|'neutral'='neutral';
 private from:number;
 private started=0;
 constructor(value:number){this.value=value;this.target=value;this.from=value;}
 snap(){this.value=this.from=this.target;}
 retarget(target:number,now:number,reduced=false){
  if(target===this.target)return;
  this.sample(now);
  this.direction=target>this.target?'up':'down';
  this.from=this.value;this.target=target;this.started=now;
  if(reduced)this.snap();
 }
 sample(now:number){
  const t=Math.min(1,Math.max(0,(now-this.started)/420));
  this.value=t===1?this.target:this.from+(this.target-this.from)*(1-(1-t)**3);
  return this.value;
 }
}
