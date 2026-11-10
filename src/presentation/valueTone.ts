/** Value typography follows the current template, independently of its price. */
export function valueTone(tier:string|undefined):'black'|'bronze'|'silver'|'gold'|'red'|'rainbow'{
 switch(tier){
  case 'rotation':return 'bronze';
  case 'starter':return 'silver';
  case 'star':return 'gold';
  case 'superstar':return 'red';
  case 'legend':return 'rainbow';
  default:return 'black';
 }
}
