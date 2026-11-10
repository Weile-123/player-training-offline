import {it,expect} from 'vitest';
import {createContractStore} from '../contractStore';
import {rosterPlayers} from './roster';
const memory=()=>{const data=new Map<string,string>();return {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};};
it('休息、重载和继续训练时，球员与休息室名单互斥并保持总人数',()=>{
 const storage=memory(),store=createContractStore(storage,()=>7);store.getState().start();
 const lists=(s:ReturnType<typeof store.getState>)=>[rosterPlayers(s.state.players,s.restingIds),rosterPlayers(s.state.players,s.restingIds,true)];
 expect(lists(store.getState()).map(a=>a.length)).toEqual([3,0]);
 store.getState().select(null);
 const loaded=createContractStore(storage,()=>1),[normal,resting]=lists(loaded.getState());
 expect(normal.map(p=>p.id)).toEqual(['p2','p3']);expect(resting.map(p=>p.id)).toEqual(['p1']);
 expect(new Set([...normal,...resting].map(p=>p.id)).size).toBe(3);
 loaded.getState().select('p1');expect(lists(loaded.getState()).map(a=>a.length)).toEqual([3,0]);
});
it('休息球员加入交付后离开休息室，在球员名单可撤回；签约移除后不残留',()=>{
 const store=createContractStore(memory(),()=>7);store.getState().start();store.getState().select(null);
 store.getState().act({type:'queue',playerId:'p1',queued:true});
 let s=store.getState();expect(rosterPlayers(s.state.players,s.restingIds,true)).toHaveLength(0);
 expect(rosterPlayers(s.state.players,s.restingIds).find(p=>p.id==='p1')?.queued).toBe(true);
 s.act({type:'queue',playerId:'p1',queued:false});store.getState().act({type:'exchange',playerId:'p1'});
 s=store.getState();expect(rosterPlayers(s.state.players,s.restingIds)).toHaveLength(2);expect(s.restingIds).toEqual([]);expect(s.state.credits).toBeGreaterThan(0);
});
