/** Clone game snapshots without requiring newer WebView globals.
 * Game snapshots contain only arrays, plain records and primitive values.
 * Keep undefined, bigint, shared references and cycles (unlike JSON cloning).
 */
export function cloneData<T>(value:T):T {
 if(typeof globalThis.structuredClone==='function')return globalThis.structuredClone(value);
 const seen=new Map<object,unknown>();
 const copy=(input:any):any=>{
  if(input===null||typeof input!=='object')return input;
  if(seen.has(input))return seen.get(input);
  const result:any=Array.isArray(input)?new Array(input.length):{};
  seen.set(input,result);
  for(const key of Object.keys(input))Object.defineProperty(result,key,{value:copy(input[key]),enumerable:true,writable:true,configurable:true});
  return result;
 };
 return copy(value);
}
