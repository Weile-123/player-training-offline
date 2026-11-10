import {it,expect} from 'vitest';
import {writeProfile,readProfile,profileKey} from './profile';
import {writeContract,readContract,contractSaveKeys,encodeContract,decodeContract} from './save';
import {newContract} from './engine';
const memory=()=>{const data=new Map<string,string>();return {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};};
it('profile cache merges an external update instead of overwriting new discoveries',()=>{
 const storage=memory(),first={collection:{curry:{firstMonth:1,highestRating:50,highestValue:'100'}},unlocked:[]};
 expect(writeProfile(storage,first)).toBe(true);
 const other=memory();writeProfile(other,{collection:{curry:{firstMonth:1,highestRating:90,highestValue:'900'}},unlocked:[]});
 storage.setItem(profileKey,other.getItem(profileKey)!);
 writeProfile(storage,first);expect(readProfile(storage).collection.curry.highestValue).toBe('900');
 storage.setItem(profileKey+'.backup','corrupt');writeProfile(storage,first);
 expect(readProfile(storage).collection.curry.highestValue).toBe('900');expect(storage.getItem(profileKey+'.backup')).toBe(storage.getItem(profileKey));
});
it('save cache detects an external main-file change and preserves the valid backup on corruption',()=>{
 const storage=memory(),a=newContract(6),b=newContract(9);
 writeContract(storage,a);storage.setItem(contractSaveKeys.main,encodeContract(b));writeContract(storage,a);
 expect(decodeContract(storage.getItem(contractSaveKeys.backup))?.seed).toBe(9);
 const backup=storage.getItem(contractSaveKeys.backup);storage.setItem(contractSaveKeys.main,'broken');writeContract(storage,a);
 expect(storage.getItem(contractSaveKeys.backup)).toBe(backup);expect(readContract(storage).state?.seed).toBe(6);
});
