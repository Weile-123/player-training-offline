import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createServer,request as httpRequest} from 'node:http';
import {createHash} from 'node:crypto';
import {expect,it,vi} from 'vitest';
import {newGym,playerValue,type GymState} from '../src/game/gym/engine';
import {encodeGym,validGym} from '../src/game/gym/save';
import {validateLocalGymRankingArchive} from '../server/gymLocalRankProgress';
import {createGymLeaderboardClient} from '../src/platform/gymLeaderboard';
import {verifiedOfficialSdkBytes} from './prepare-gym-authority.mjs';
const {createHandler}=createRequire(import.meta.url)('../activity/cloudfunctions/activity_api/rankings.cjs');
const {createActivityRequestHandler}=createRequire(import.meta.url)('../activity/cloudfunctions/activity_api/activityHost.cjs');
const app='app_847cdb589a',now=1_800_000_000_000;
const context=Buffer.from(JSON.stringify({applicationId:app,customUserId:'authenticated-coach',nickname:'虎扑昵称'})).toString('base64');
const reference=(state:GymState)=>({runId:`${state.createdAt}-${state.seed}`,revision:state.revision});
function archive(state:GymState,applicationId=app){return JSON.stringify({format:'legend-gym-cloud-v1',applicationId,uploadedAt:now,gym:encodeGym(state)});}
function fixture(){
 let state=newGym(now-1_000_000,23);state.updatedAt=now;state.gymLevel=2;
 Object.assign(state.player!,{templateId:'bryant',highestTier:'legend',level:32,peakLevel:32});
 const old=structuredClone(state.player!);old.id='gym-old';old.level=old.peakLevel=12;old.templateId='haslem';old.highestTier='rotation';
 state.alumni=[{...old,recommendedAt:now,rewardCredits:1,rewardFame:420,finalValue:(320n*13n**3n).toString()}];
 state.fame=420;state.nextPlayer=3;
 expect(validGym(state)).toBe(true);return state;
}
it('submits the current local game as a business archive; the server derives both scores and never reads the stale authority game',async()=>{
 const state=fixture(),raw=archive(state),rpc=vi.fn().mockResolvedValue({accepted:true,source:'local-validated',duplicate:false});
 const handler=createHandler({rpc,now:()=>now,validateLocalProgress:validateLocalGymRankingArchive});
 const client=createGymLeaderboardClient({enabled:()=>true,user:async()=>({puid:'not-sent',nickname:'SDK昵称'}),
  localProgress:async()=>({...reference(state),archive:raw}),
  request:async(path,method,body)=>handler({path,method,body,context})});
 await expect(client.sync(reference(state))).resolves.toBe(true);
 expect(rpc).toHaveBeenCalledExactlyOnceWith('submit_local_gym_rank',expect.objectContaining({p_puid:'authenticated-coach',p_name:'虎扑昵称',p_fame:420,p_best:expect.objectContaining({templateId:'bryant',value:playerValue(state)})}));
 const data=rpc.mock.calls[0][1];expect(data.p_revision).toBe(state.revision);expect(data.p_evidence).toMatch(/^[a-f0-9]{64}$/);
});
it('includes cold alumni after the portable archive export and retains a more valuable historical final value',()=>{
 const state=fixture();state.alumni[0].level=state.alumni[0].peakLevel=40;state.alumni[0].finalValue=(320n*41n**3n*110n/100n).toString();
 const result=validateLocalGymRankingArchive(archive(state),reference(state),now);
 expect(result.best).toMatchObject({playerId:'gym-old',value:state.alumni[0].finalValue});expect(result.source).toBe('local-validated');
});
it('does not apply today’s gear to historical value, but verifies that saved value against the engine formula',()=>{
 const state=fixture();state.alumni[0].level=state.alumni[0].peakLevel=40;state.alumni[0].finalValue=(320n*41n**3n*110n/100n).toString();
 expect(validateLocalGymRankingArchive(archive(state),reference(state),now).best?.value).toBe(state.alumni[0].finalValue);
 state.alumni[0].finalValue='999999999999999999';
 expect(()=>validateLocalGymRankingArchive(archive(state),reference(state),now)).toThrow('最终身价');
});
it.each([{puid:'victim'},{score:'99999999'},{best:{}},{fame:99999}])('rejects direct score or identity injection (%j)',async extra=>{
 const state=fixture(),rpc=vi.fn(),handler=createHandler({rpc,now:()=>now,validateLocalProgress:validateLocalGymRankingArchive});
 await expect(handler({method:'POST',path:'/leaderboard/submit',context,body:{event:'gym-local-progress',...reference(state),archive:archive(state),...extra}})).rejects.toMatchObject({statusCode:400});expect(rpc).not.toHaveBeenCalled();
});
it('rejects an anonymous caller before parsing or deriving private game data',async()=>{
 const validate=vi.fn(),rpc=vi.fn(),handler=createHandler({rpc,validateLocalProgress:validate});
 await expect(handler({method:'POST',path:'/leaderboard/submit',body:{event:'gym-local-progress'}})).rejects.toMatchObject({statusCode:401});expect(validate).not.toHaveBeenCalled();
});
it('rejects different project/run, incomplete archive, impossible fame and future snapshots',()=>{
 const state=fixture();
 expect(()=>validateLocalGymRankingArchive(archive(state,'app_0123456789'),reference(state),now)).toThrow('云存档');
 expect(()=>validateLocalGymRankingArchive(archive(state),{...reference(state),revision:state.revision+1},now)).toThrow('不一致');
 state.fame=10;expect(()=>validateLocalGymRankingArchive(archive(state),reference(state),now)).toThrow('声望');
 state.fame=1001;expect(()=>validateLocalGymRankingArchive(archive(state),reference(state),now)).toThrow('声望');
 state.fame=420;state.updatedAt=now+300001;expect(()=>validateLocalGymRankingArchive(archive(state),reference(state),now)).toThrow('不一致');
});
it('keeps legitimate unarchived recommendations’ cooperation fame rather than resetting it to alumni totals',()=>{
 const state=fixture();state.nextPlayer=4;state.fame=640;
 expect(validateLocalGymRankingArchive(archive(state),reference(state),now).fame).toBe(640);
});
it('fails explicitly when the server has not been updated and never reports a bare acknowledgement as local success',async()=>{
 const state=fixture(),handler=createHandler({rpc:vi.fn()});
 await expect(handler({method:'POST',path:'/leaderboard/submit',context,body:{event:'gym-local-progress',...reference(state),archive:archive(state)}})).rejects.toMatchObject({statusCode:503});
 const client=createGymLeaderboardClient({enabled:()=>true,user:async()=>({puid:'one'}),localProgress:async()=>({...reference(state),archive:archive(state)}),request:async()=>({accepted:true})});
 await expect(client.sync(reference(state))).rejects.toThrow('未确认');
});
it('creates an independent monotonic/idempotent local checkpoint and only increases lifetime leaderboard highs',()=>{
 const sql=readFileSync('activity/migrations/20261117000500_gym_local_rank_progress.sql','utf8');
 expect(sql).toContain('gym_local_rank_checkpoints');expect(sql).toContain("source='local-validated'");expect(sql).toContain('p_revision<previous.revision');expect(sql).toContain('local-progress-conflict');expect(sql).toContain("interval '3 seconds'");expect(sql).toContain('unchanged_scores:=p_fame=previous.fame and p_best is not distinct from previous.best');expect(sql).toContain('if not duplicate and not unchanged_scores and exists');expect(sql).toContain('where leaderboard_entries.score<excluded.score');
 expect(sql).not.toMatch(/(?:update|delete from)\s+gym_authority_(?:documents|actors|history)/i);
});
it('accepts a complete >16KiB portable history through the actual HTTP host and keeps split UTF-8 nicknames intact',async()=>{
 const state=fixture(),record=state.alumni[0];state.alumni=Array.from({length:110},(_,index)=>({...structuredClone(record),id:`old-${index}`,rewardFame:0}));state.fame=420;state.nextPlayer=112;
 const raw=archive(state),rpc=vi.fn().mockResolvedValue({accepted:true,source:'local-validated'});
 expect(Buffer.byteLength(raw)).toBeGreaterThan(16384);
 const handler=createHandler({rpc,now:()=>now,validateLocalProgress:validateLocalGymRankingArchive});
 const server=createServer(createActivityRequestHandler({legacyHandle:handler}));
 await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
 try{
  const port=(server.address() as {port:number}).port,body=Buffer.from(JSON.stringify({event:'gym-local-progress',...reference(state),archive:raw,nickname:'中文昵称🏀'}));
  const response=await new Promise<{status:number;text:string}>((resolve,reject)=>{
   const request=httpRequest({hostname:'127.0.0.1',port,path:'/api/leaderboard/submit',method:'POST',headers:{'Content-Type':'application/json','x-cloudbase-context':context}},res=>{const chunks:Buffer[]=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode!,text:Buffer.concat(chunks).toString('utf8')}));});request.on('error',reject);
   for(let offset=0;offset<body.length;offset+=137)request.write(body.subarray(offset,offset+137));request.end();
  });
  expect(response.status).toBe(200);expect(JSON.parse(response.text).data.source).toBe('local-validated');expect(rpc).toHaveBeenCalledOnce();
 }finally{await new Promise<void>(done=>{server.close(()=>done());server.closeAllConnections();});}
});
it('restores CRLF checkouts only when the exact original bytes match the official SDK checksum',()=>{
 const original=Buffer.from('official\nsource\n'),hash=createHash('sha256').update(original).digest('hex');
 expect(verifiedOfficialSdkBytes(Buffer.from('official\r\nsource\r\n'),hash)).toEqual(original);
 expect(verifiedOfficialSdkBytes(original,hash)).toBe(original);
 expect(()=>verifiedOfficialSdkBytes(Buffer.from('modified\r\nsource\r\n'),hash)).toThrow('integrity');
});
it('passes official webfn transport through both ranking reads without permitting forged query fields',async()=>{
 const rpc=vi.fn(async(_name:string,data:{p_board:string;p_puid:string|null})=>({entries:[],me:data.p_puid?{board:data.p_board}:null}));
 const handler=createHandler({rpc}),server=createServer(createActivityRequestHandler({legacyHandle:handler}));
 await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
 try{
  const port=(server.address() as {port:number}).port;
  for(const path of ['/leaderboard','/leaderboard/me'])for(const board of ['player','fame']){
   const response=await fetch(`http://127.0.0.1:${port}/api${path}?board=${board}&webfn=true`,{headers:{'x-cloudbase-context':context}});
   expect(response.status).toBe(200);
   expect((await response.json()).code).toBe(0);
   expect(rpc).toHaveBeenLastCalledWith('read_gym_rank',{p_board:board,p_limit:50,p_puid:path.endsWith('/me')?'authenticated-coach':null});
  }
  const before=rpc.mock.calls.length;
  for(const suffix of ['webfn=false','webfn=True','webfn=1','webfn=true&score=999','webfn=false&webfn=true','webfn=true&webfn=true']){
   const response=await fetch(`http://127.0.0.1:${port}/api/leaderboard/me?board=fame&${suffix}`,{headers:{'x-cloudbase-context':context}});
   expect(response.status).toBe(400);
  }
  expect(rpc).toHaveBeenCalledTimes(before);
 }finally{await new Promise<void>(done=>{server.close(()=>done());server.closeAllConnections();});}
});
it('bypasses another function instance’s short public cache on the first post-submit read of each board',async()=>{
 const player=fixture().player!,row={id:'public-one',coach:'教练',score:playerValue(fixture()),best:{playerId:player.id,templateId:player.templateId!,level:player.level,stats:player.stats,value:playerValue(fixture())}};
 const calls:string[]=[],client=createGymLeaderboardClient({enabled:()=>true,user:async()=>({puid:'one'}),request:async(path)=>{calls.push(path);return path.endsWith('/submit')?{accepted:true}:path.includes('/me?')?{me:null}:{entries:path.includes('board=player')?[row]:[]};}});
 await client.sync({runId:'1800000000000-23',revision:1});await client.list('player');await client.list('fame');await client.list('player');
 expect(calls.filter(path=>path.includes('limit=50'))).toEqual(['/leaderboard?board=player&limit=50&fresh=1','/leaderboard?board=fame&limit=50&fresh=1','/leaderboard?board=player&limit=50']);
 let score='121';const handler=createHandler({rpc:async()=>({entries:[{score}]}),now:()=>now});
 const query={method:'GET',path:'/leaderboard',query:{board:'fame',limit:'50'}};
 await handler(query);score='420';expect((await handler(query)).entries[0].score).toBe('121');
 expect((await handler({...query,query:{...query.query,fresh:'1'}})).entries[0].score).toBe('420');
});
