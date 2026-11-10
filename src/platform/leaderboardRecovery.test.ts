import {afterEach,it,expect,vi} from 'vitest';
import {createLeaderboardClient,leaderboardQueueKey,finalScore} from './leaderboard';
import {newContract} from '../game/contract/engine';
const memory=()=>{const data=new Map<string,string>();return {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};};
const ended=(id='recovery')=>({...newContract(6),careerId:id,status:'over' as const,credit:0});
afterEach(()=>vi.useRealTimers());
it('persists before identity lookup; reload never assigns unknown scores to a different account without confirmation',async()=>{
 const storage=memory(),request=vi.fn().mockResolvedValue({accepted:true});
 const user=vi.fn(async()=>{expect(JSON.parse(storage.getItem(leaderboardQueueKey)!)).toHaveLength(1);throw Error('identity timeout');});
 const client=createLeaderboardClient({storage,enabled:()=>true,user,request});await client.finish(ended());
 const restored=createLeaderboardClient({storage,enabled:()=>true,user:async()=>({puid:'other'}),request});
 await restored.retry();expect(request).not.toHaveBeenCalled();expect(restored.getUnassignedCount()).toBe(1);
 await expect(restored.claim('original')).rejects.toThrow('账号已切换');expect(request).not.toHaveBeenCalled();
 await restored.claim('other');expect(request).toHaveBeenCalledOnce();expect(restored.getUnassignedCount()).toBe(0);
});
it('does not discard an eleventh ended career',async()=>{
 const storage=memory();storage.setItem(leaderboardQueueKey,JSON.stringify(Array.from({length:10},(_,i)=>({owner:'owner',score:finalScore(ended('old-'+i))}))));
 const client=createLeaderboardClient({storage,enabled:()=>true,user:async()=>{throw Error('offline');},request:vi.fn()});
 await client.finish(ended('eleventh'));expect(JSON.parse(storage.getItem(leaderboardQueueKey)!)).toHaveLength(11);
});
it.each(['identity','personal','switched'])('retains public entries when %s fails',async mode=>{
 const entries=[{id:'one',coach:'Trainer',score:'20',best:null}];let lookups=0;
 const client=createLeaderboardClient({storage:memory(),enabled:()=>true,user:async()=>{if(mode==='identity')throw Error('offline');return {puid:mode==='switched'&&lookups++?'two':'one'};},request:async path=>{if(path.includes('/me')){if(mode==='personal')throw Error('offline');return {me:{rank:1,entry:entries[0]}};}return {entries};}});
 const result=await client.list('endless');expect(result.entries).toEqual(entries);expect(result.me).toBeNull();expect(result.personalError).toBeTruthy();
});
it('drains multiple careers with spacing and shares concurrent retries',async()=>{
 vi.useFakeTimers();const storage=memory(),times:number[]=[];
 storage.setItem(leaderboardQueueKey,JSON.stringify(['one','two','three'].map(id=>({owner:'owner',score:finalScore(ended(id))}))));
 const client=createLeaderboardClient({storage,enabled:()=>true,user:async()=>({puid:'owner'}),request:async()=>{times.push(Date.now());return {accepted:true};}});
 const first=client.retry();expect(client.retry()).toBe(first);await vi.runAllTimersAsync();await first;
 expect(times).toHaveLength(3);expect(times[1]-times[0]).toBeGreaterThanOrEqual(3100);expect(times[2]-times[1]).toBeGreaterThanOrEqual(3100);expect(JSON.parse(storage.getItem(leaderboardQueueKey)!)).toEqual([]);
});
it('retries server rate limits once and keeps records on persistent failure',async()=>{
 vi.useFakeTimers();const storage=memory();storage.setItem(leaderboardQueueKey,JSON.stringify([{owner:'owner',score:finalScore(ended())}]));
 const request=vi.fn().mockRejectedValue(Object.assign(Error('rate limit'),{statusCode:429}));
 const client=createLeaderboardClient({storage,enabled:()=>true,user:async()=>({puid:'owner'}),request});const task=client.retry();await vi.runAllTimersAsync();await task;
 expect(request).toHaveBeenCalledTimes(2);expect(JSON.parse(storage.getItem(leaderboardQueueKey)!)).toHaveLength(1);
});
it('checks account again after rate wait before sending another career',async()=>{
 vi.useFakeTimers();const storage=memory();let owner='one';
 storage.setItem(leaderboardQueueKey,JSON.stringify(['first','second'].map(id=>({owner:'one',score:finalScore(ended(id))}))));
 const request=vi.fn(async()=>{owner='two';return {accepted:true};});
 const client=createLeaderboardClient({storage,enabled:()=>true,user:async()=>({puid:owner}),request});const task=client.retry();await vi.runAllTimersAsync();await task;
 expect(request).toHaveBeenCalledOnce();expect(JSON.parse(storage.getItem(leaderboardQueueKey)!)).toHaveLength(1);
});
it('an initial rate limit recovers automatically without losing the score',async()=>{
 vi.useFakeTimers();const storage=memory();storage.setItem(leaderboardQueueKey,JSON.stringify([{owner:'owner',score:finalScore(ended())}]));
 const request=vi.fn().mockRejectedValueOnce(Object.assign(Error('rate limit'),{statusCode:429})).mockResolvedValue({accepted:true});
 const client=createLeaderboardClient({storage,enabled:()=>true,user:async()=>({puid:'owner'}),request});const task=client.retry();await vi.runAllTimersAsync();expect(await task).toBe(true);
 expect(request).toHaveBeenCalledTimes(2);expect(JSON.parse(storage.getItem(leaderboardQueueKey)!)).toEqual([]);
});
