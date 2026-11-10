export function ShootButton({disabled,reduced,onShoot}:{disabled:boolean;reduced:boolean;onShoot:()=>void}){
 return <button className="dock-control dock-shoot" aria-label="投篮训练" disabled={disabled} onClick={event=>{
  const face=event.currentTarget.firstElementChild;
  if(!reduced&&face&&typeof face.animate==='function'){
   face.getAnimations().forEach(animation=>animation.cancel());
   face.animate([
    {transform:'translateY(6px) scale(.93)',filter:'brightness(.72)'},
    {transform:'translateY(6px) scale(.93)',filter:'brightness(.72)',offset:.23},
    {transform:'translateY(-1px) scale(1.015)',filter:'brightness(1.05)',offset:.75},
    {transform:'translateY(0) scale(1)',filter:'brightness(1)'},
   ],{duration:230,easing:'ease-out'});
  }
  onShoot();
 }}><span className="dock-shoot-face" aria-hidden="true"/></button>;
}
