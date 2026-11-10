export type MonthChange={from:number;to:number};
/** Called only after a successful settlement (or accepting the pending endless mode). */
export function monthChange(from:number,to:number,status:string):MonthChange|null{
 return status==='playing'&&to>from?{from,to}:null;
}
export function monthDigits(from:number,to:number){
 const next=String(to),previous=String(from).padStart(next.length,' ');
 return Array.from(next,(digit,index)=>({from:previous[index],to:digit,changed:previous[index]!==digit}));
}
export const monthTransitionTiming={delay:180,roll:650,stagger:35,total:1500,reduced:700};
