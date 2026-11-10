export const animationDefaults={shotAnimationDurationSeconds:3.43,gameMaxWidthPx:960,hoopScale:.85,shootButtonScale:1};
let current={...animationDefaults};
export const getAnimationConfig=()=>current;
const listeners=new Set<()=>void>();
export function subscribeAnimationConfig(listener:()=>void){listeners.add(listener);return ()=>{listeners.delete(listener);};}
/** Invalid/partially saved files keep the last valid configuration. */
export function applyAnimationConfig(value:unknown){
 const candidate=value as Partial<typeof animationDefaults>|null;
 const duration=candidate?.shotAnimationDurationSeconds,width=candidate?.gameMaxWidthPx,hoopScale=candidate?.hoopScale??current.hoopScale;
 const shootButtonScale=candidate?.shootButtonScale??current.shootButtonScale;
 if(typeof duration!=='number'||!Number.isFinite(duration)||duration<.2||duration>30||typeof width!=='number'||!Number.isFinite(width)||width<320||width>2560)return false;
 if(typeof hoopScale!=='number'||!Number.isFinite(hoopScale)||hoopScale<.5||hoopScale>1.25)return false;
 if(typeof shootButtonScale!=='number'||!Number.isFinite(shootButtonScale)||shootButtonScale<.5||shootButtonScale>2)return false;
 if(duration!==current.shotAnimationDurationSeconds||width!==current.gameMaxWidthPx||hoopScale!==current.hoopScale||shootButtonScale!==current.shootButtonScale){
  current={shotAnimationDurationSeconds:duration,gameMaxWidthPx:width,hoopScale,shootButtonScale};
  listeners.forEach(listener=>listener());
 }
 return true;
}
// Live file polling is an editor aid; production already loads this once at startup.
export function watchAnimationConfig(enabled=import.meta.env.DEV){
 if(import.meta.env.PROD)return()=>{};
 if(!enabled)return()=>{};
 let stopped=false,pending=false;
 const controller=new AbortController();
 const refresh=async()=>{
  if(pending||stopped)return;pending=true;
  try{
   const response=await fetch(`${import.meta.env.BASE_URL}config/animation.json`,{cache:'no-store',signal:controller.signal});
   if(response.ok){const value=await response.json();if(!stopped)applyAnimationConfig(value);}
  }catch{/* 保存中或网络失败时保留最后一次有效参数。 */}
  finally{pending=false;}
 };
 void refresh();const interval=setInterval(refresh,1000);
 return ()=>{stopped=true;clearInterval(interval);controller.abort();};
}
