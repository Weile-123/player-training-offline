import {afterEach,expect,it,vi} from 'vitest';
import {cloneData} from './cloneData';
afterEach(()=>vi.unstubAllGlobals());
it('preserves snapshot values, aliasing and independence without the native API',()=>{
 vi.stubGlobal('structuredClone',undefined);
 const shared={amount:123n,optional:undefined};
 const source:any={a:shared,b:shared,array:[shared,NaN,Infinity]};source.self=source;
 const result=cloneData(source);
 expect(result).not.toBe(source);expect(result.self).toBe(result);
 expect(result.a).toBe(result.b);expect(result.array[0]).toBe(result.a);
 expect(result.a.amount).toBe(123n);expect('optional' in result.a).toBe(true);
 expect(result.array.slice(1)).toEqual([NaN,Infinity]);
 result.a.amount=4n;expect(shared.amount).toBe(123n);
});
it('boots the store, creates, trains and reloads a persisted career without structuredClone',async()=>{
 vi.stubGlobal('structuredClone',undefined);
 // Import after disabling the API also exercises module-level initial states.
 const {createContractStore}=await import('../contractStore');
 const map=new Map<string,string>();
 const storage={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v);},removeItem:(k:string)=>{map.delete(k);}};
 const store=createContractStore(storage,()=>6);expect(store.getState().start()).toBe(true);
 const id=store.getState().state.players[0].id;
 expect(store.getState().act({type:'train',playerId:id}).error).toBeUndefined();
 store.getState().flush();
 const restored=createContractStore(storage,()=>7);
 expect(restored.getState().hasSave).toBe(true);
 expect(restored.getState().state).toEqual(store.getState().state);
});
