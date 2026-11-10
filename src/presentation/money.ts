const units=[{size:1n,label:''},{size:10_000n,label:'万'},{size:100_000_000n,label:'亿'},{size:1_000_000_000_000n,label:'兆'},{size:10_000_000_000_000_000n,label:'京'}] as const;
const scientificThreshold=10n**20n;
function scientific(amount:bigint):string{
 let exponent=amount.toString().length-1;
 const scale=10n**BigInt(exponent-2);
 let coefficient=(amount+scale/2n)/scale;
 if(coefficient>=1000n){coefficient=100n;exponent++;}
 return `${coefficient/100n}.${String(coefficient%100n).padStart(2,'0')}e+${String(exponent).padStart(2,'0')}`;
}
/** Display only: BigInt keeps the game's integer currency exact, including rounding boundaries. */
export function money(value:string|number|bigint):string{
 const signed=BigInt(value),amount=signed<0n?-signed:signed;
 const prefix=`${signed<0n?'−':''}$`;
 if(amount>=scientificThreshold)return prefix+scientific(amount);
 let index=0;
 while(index<units.length-1&&amount>=units[index+1].size)index++;
 let rounded=(amount*100n+units[index].size/2n)/units[index].size;
 if(index<units.length-1&&rounded>=1_000_000n){index++;rounded=(amount*100n+units[index].size/2n)/units[index].size;}
 if(index===units.length-1&&rounded>=1_000_000n)return prefix+scientific(amount);
 const whole=(rounded/100n).toLocaleString('en-US'),decimal=String(rounded%100n).padStart(2,'0');
 return `${prefix}${whole}.${decimal}${units[index].label}`;
}
