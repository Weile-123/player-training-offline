import {describe,it,expect,vi} from 'vitest';
import {createLeaderboardClient,finalScore,leaderboardQueueKey,leaderboardRequest} from './leaderboard';
import {newContract,type Contract} from '../game/contract/engine';
import {createContractStore} from '../contractStore';
const memory=()=>{const data=new Map<string,string>();return {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}};};
const ended=()=>{const s=newContract(7);s.careerId='rank-test';s.status='over';s.credit=0;return s;};
describe('rank finalization boundary',()=>{
 it('does not rank playing, contract completion, automatic save or a recoverable loss',()=>{
  const notify=vi.fn(),store=createContractStore(memory(),()=>7,notify);store.getState().start();
  store.getState().flush();store.getState().finish();expect(notify).not.toHaveBeenCalled();
  store.setState({state:{...store.getState().state,completed:true,completion:{month:21,delivered:'0',totalShots:0,bestPlayer:null,equipment:[],acknowledged:false}}});
  store.getState().finish();expect(notify).not.toHaveBeenCalled();
  store.setState({state:ended()});expect(notify).not.toHaveBeenCalled();
 });
 it('revives without submitting, and final home confirmation submits exactly once',()=>{
  const notify=vi.fn(),storage=memory(),store=createContractStore(storage,()=>7,notify);store.getState().start();
  for(let i=0;i<3;i++)store.getState().act({type:'settle'});
  const s=store.getState().state;expect(s.status).toBe('over');expect(notify).not.toHaveBeenCalled();
  expect(store.getState().act({type:'ad-reward',reward:'revive',careerId:s.careerId!,revision:s.revision}).error).toBeUndefined();
  store.getState().finish();expect(notify).not.toHaveBeenCalled();
  for(let i=0;i<3;i++)store.getState().act({type:'settle'});
  store.getState().finish();store.getState().finish();expect(notify).toHaveBeenCalledTimes(1);expect(store.getState().hasSave).toBe(false);
 });
 it('a throwing submission cannot prevent local finalization',()=>{
  const store=createContractStore(memory(),()=>7,()=>{throw Error('network');});store.getState().start();store.setState({state:ended()});
  expect(()=>store.getState().finish()).not.toThrow();expect(store.getState().hasSave).toBe(false);
 });
 it.each(['local','cloud'] as const)('keeps an unconfirmed final loss after %s restore, without allowing a second revive',mode=>{
  const storage=memory(),notify=vi.fn(),store=createContractStore(storage,()=>7,notify);store.getState().start();
  for(let i=0;i<3;i++)store.getState().act({type:'settle'});
  const firstLoss=store.getState().state;
  expect(store.getState().act({type:'ad-reward',reward:'revive',careerId:firstLoss.careerId!,revision:firstLoss.revision}).error).toBeUndefined();
  for(let i=0;i<3;i++)store.getState().act({type:'settle'});
  const final=structuredClone(store.getState().state);expect(final.status).toBe('over');
  const target=mode==='local'?storage:memory();
  if(mode==='cloud'){
   const cloud=createContractStore(target,()=>8,notify);cloud.getState().restoreCloudArchive(store.getState().exportCloudArchive());
   expect(cloud.getState().hasSave).toBe(true);expect(cloud.getState().state).toEqual(final);
  }
  const restored=createContractStore(target,()=>9,notify);
  expect(restored.getState().hasSave).toBe(true);expect(restored.getState().state).toEqual(final);expect(notify).not.toHaveBeenCalled();
  expect(restored.getState().act({type:'ad-reward',reward:'revive',careerId:final.careerId!,revision:final.revision}).error).toBe('ad-already-used');
  restored.getState().finish();restored.getState().finish();
  expect(notify).toHaveBeenCalledExactlyOnceWith(final);expect(createContractStore(target,()=>10).getState().hasSave).toBe(false);
 });
});
describe('rank outbox isolated from local saves',()=>{
 it('local-only mode makes no account, network or storage writes',async()=>{
  const storage=memory(),write=vi.spyOn(storage,'setItem'),user=vi.fn(),request=vi.fn();
  const client=createLeaderboardClient({storage,enabled:()=>false,user,request});await client.finish(ended());
  expect(user).not.toHaveBeenCalled();expect(request).not.toHaveBeenCalled();expect(write).not.toHaveBeenCalled();
 });
 it('retains failures across reload, skips a different account, and removes only after confirmed success',async()=>{
  const storage=memory();storage.setItem('game-save','untouched');let owner='one';
  const request=vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue({accepted:true});
  const deps={storage,enabled:()=>true,user:async()=>({puid:owner}),request};
  await createLeaderboardClient(deps).finish(ended());expect(JSON.parse(storage.getItem(leaderboardQueueKey)!)).toHaveLength(1);
  const restored=createLeaderboardClient(deps);owner='two';await restored.retry();expect(request).toHaveBeenCalledTimes(1);
  owner='one';await restored.retry();expect(JSON.parse(storage.getItem(leaderboardQueueKey)!)).toEqual([]);
  expect(storage.getItem('game-save')).toBe('untouched');expect(request.mock.calls[1][2]).not.toHaveProperty('puid');
 });
 it('snapshots the final peak before any async work and ignores non-final states',async()=>{
  const s=ended();const p=finalScore(s)!;s.month=20;expect(p.month).toBe(1);
  expect(finalScore({...s,status:'playing',completed:true} as Contract)).toBeNull();
 });
 it('checks transport and business errors rather than assuming success',async()=>{
  for(const response of [{statusCode:500,code:0,message:'维护中'},{statusCode:200,code:400,message:'数据无效'}]){
   await expect(leaderboardRequest('/test','GET',undefined,false,{request:async()=>response})).rejects.toThrow(response.message);
  }
 });
 it('rejects malformed public rows rather than letting invalid values reach the UI',async()=>{
  const request=vi.fn().mockResolvedValue({entries:[{id:'one',coach:'name',score:'NaN',best:null}]});
  const client=createLeaderboardClient({storage:memory(),enabled:()=>true,user:async()=>null,request});
  await expect(client.list('endless')).rejects.toThrow('格式异常');
 });
 it('does not turn a missing acknowledgement into successful upload',async()=>{
  const storage=memory(),client=createLeaderboardClient({storage,enabled:()=>true,user:async()=>({puid:'one'}),request:async()=>({})});
  await client.finish(ended());expect(JSON.parse(storage.getItem(leaderboardQueueKey)!)).toHaveLength(1);
  expect(client.getMessage()).toContain('未确认');
 });
});
describe('ranking display names',()=>{
 const mine={id:'my-row',coach:'虎扑训练师',score:'24',best:null};
 const other={id:'other-row',coach:'虎扑训练师',score:'25',best:null};
 const rankingResponse=(path:string)=>path.includes('/me?')?{me:{rank:2,entry:mine}}:{entries:[other,mine]};
 it('only reads rankings and displays persisted names consistently for every viewer',async()=>{
  const request=vi.fn(async(path:string)=>rankingResponse(path));
  const client=createLeaderboardClient({storage:memory(),enabled:()=>true,user:async()=>({puid:'one',nickname:'UndEf1nEd1'}),request});
  const result=await client.list('endless');
  expect(request.mock.calls).toEqual([['/leaderboard?board=endless&limit=50','GET'],['/leaderboard/me?board=endless','GET',undefined,true]]);
  expect(result.me?.entry).toEqual(mine);expect(result.entries).toEqual([other,mine]);
 });
 it('retries a queued score with the current SDK nickname without changing its score snapshot',async()=>{
  const storage=memory(),request=vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue({accepted:true});
  let nickname='旧昵称';const deps={storage,enabled:()=>true,user:async()=>({puid:'one',nickname}),request};
  await createLeaderboardClient(deps).finish(ended());nickname='UndEf1nEd1';
  await createLeaderboardClient(deps).retry();
  expect(request.mock.calls[1][2]).toEqual({...request.mock.calls[0][2],nickname:'UndEf1nEd1'});
  expect(JSON.parse(storage.getItem(leaderboardQueueKey)!)).toEqual([]);
 });
 it('sends the SDK nickname with the score in exactly one authenticated submission',async()=>{
  const storage=memory(),request=vi.fn().mockResolvedValue({accepted:true});
  const client=createLeaderboardClient({storage,enabled:()=>true,user:async()=>({puid:'one',nickname:'UndEf1nEd1'}),request});
  await client.finish(ended());await client.retry();
  expect(JSON.parse(storage.getItem(leaderboardQueueKey)!)).toEqual([]);expect(client.getMessage()).toBe('排行榜成绩已提交');
  expect(request).toHaveBeenCalledExactlyOnceWith('/leaderboard/submit','POST',{event:'career-finished',...finalScore(ended()),nickname:'UndEf1nEd1'},true);
  expect(request.mock.calls[0][2]).not.toHaveProperty('puid');
 });
 it('does not apply one account nickname to another account personal rank',async()=>{
  const user=vi.fn().mockResolvedValueOnce({puid:'one',nickname:'UndEf1nEd1'}).mockResolvedValue({puid:'two',nickname:'其他玩家'});
  const client=createLeaderboardClient({storage:memory(),enabled:()=>true,user,request:async path=>rankingResponse(path)});
  const result=await client.list('endless');expect(result.me).toBeNull();expect(result.entries).toEqual([other,mine]);expect(result.personalError).toBeTruthy();
 });
});
