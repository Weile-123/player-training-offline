/** Display-only provenance. Legacy totals remain valid without inventing their source. */
export type StatusSources = {ids:string[];legacy?:boolean};
export function addStatusSource(current:StatusSources|undefined,id:string,previousTotal:number):StatusSources {
 return {ids:[...new Set([...(current?.ids??[]),id])],...(current?.legacy||(!current&&previousTotal>0)?{legacy:true}:{})};
}
export function validStatusSources(value:unknown,allowed:readonly string[]):boolean {
 if(value===undefined)return true;
 if(!value||typeof value!=='object')return false;
 const v=value as StatusSources;
 return Array.isArray(v.ids)&&v.ids.length<=allowed.length&&new Set(v.ids).size===v.ids.length&&v.ids.every(id=>allowed.includes(id))&&(v.legacy===undefined||typeof v.legacy==='boolean');
}
