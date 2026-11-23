const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHandler,identity,cleanName}=require('../rankings.cjs');
const context=Buffer.from(JSON.stringify({customUserId:'verified-coach',nickname:'本地教练',applicationId:'app_847cdb589a'})).toString('base64');
test('health exposes only the current public project identity',async()=>{
 const handler=createHandler({rpc:()=>{throw Error('unexpected database call');}});
 assert.deepEqual(await handler({method:'GET',path:'/health'}),{applicationId:'app_847cdb589a',version:'gym-rankings-v1',boards:['player','fame','challenge']});
});
test('authenticated progress submission resolves server facts without accepting client scores',async()=>{
 let received;
 const handler=createHandler({rpc:async(...args)=>{received=args;return {accepted:true};}});
 const body={event:'gym-progress',runId:'1800000000000-23',revision:42};
 assert.deepEqual(await handler({method:'POST',path:'/leaderboard/submit',context,body}),{accepted:true});
 assert.deepEqual(received,['submit_gym_rank',{p_puid:'verified-coach',p_name:'本地教练',p_run:body.runId,p_revision:42}]);
 await assert.rejects(handler({method:'POST',path:'/leaderboard/submit',context,body:{...body,score:999999}}),{statusCode:400});
});
test('private routes reject a missing gateway identity before touching the database',async()=>{
 const handler=createHandler({rpc:()=>{throw Error('unexpected database call');}});
 await assert.rejects(handler({method:'GET',path:'/leaderboard/me',query:{board:'fame'}}),{statusCode:401});
 await assert.rejects(handler({method:'POST',path:'/leaderboard/submit',body:{}}),{statusCode:401});
});
test('public reads use no account ID and reject arbitrary query identities',async()=>{
 let received;
 const handler=createHandler({rpc:async(...args)=>{received=args;return {entries:[]};}});
 assert.deepEqual(await handler({method:'GET',path:'/leaderboard',query:{board:'player',limit:'50'}}),{entries:[]});
 assert.deepEqual(received,['read_gym_rank',{p_board:'player',p_limit:50,p_puid:null}]);
 await assert.rejects(handler({method:'GET',path:'/leaderboard',query:{board:'player',puid:'other'}}),{statusCode:400});
});

test('challenge board supports public reads and scopes private reads to the gateway identity',async()=>{
 const calls=[];
 const handler=createHandler({rpc:async(...args)=>{calls.push(args);return {entries:[]};}});
 const query={board:'challenge',limit:'50'};
 await handler({method:'GET',path:'/leaderboard',query});
 await handler({method:'GET',path:'/leaderboard/me',query,context});
 await assert.rejects(handler({method:'GET',path:'/leaderboard/me',query}),{statusCode:401});
 await assert.rejects(handler({method:'GET',path:'/leaderboard',query:{...query,levels:'extended'}}),{statusCode:400});
 assert.deepEqual(calls,[
  ['read_gym_rank',{p_board:'challenge',p_limit:50,p_puid:null}],
  ['read_gym_rank',{p_board:'challenge',p_limit:50,p_puid:'verified-coach'}],
 ]);
});

test('uses separate caches and consistently routes level-aware public and personal reads',async()=>{
 const calls=[];
 const handler=createHandler({rpc:async(name,params)=>{calls.push([name,params]);return {entries:[name]};}});
 const legacy={method:'GET',path:'/leaderboard',query:{board:'player',limit:'50'}};
 const extended={...legacy,query:{...legacy.query,levels:'extended'}};
 assert.deepEqual(await handler(legacy),{entries:['read_gym_rank']});
 assert.deepEqual(await handler(extended),{entries:['read_gym_rank_v2']});
 assert.deepEqual(await handler(legacy),{entries:['read_gym_rank']});
 assert.deepEqual(await handler(extended),{entries:['read_gym_rank_v2']});
 assert.equal(calls.length,2);
 await handler({...extended,path:'/leaderboard/me',context});
 assert.deepEqual(calls[2],['read_gym_rank_v2',{p_board:'player',p_limit:50,p_puid:'verified-coach',p_extended:true}]);
 await assert.rejects(handler({...extended,query:{...extended.query,board:'fame'}}),{statusCode:400});
});
test('the independently locked CloudBase runtime dependency provides the expected auth API',()=>{
 const tcb=require('@cloudbase/node-sdk');
 const app=tcb.init({env:'local-contract-test',accessKey:'local-not-a-real-credential'});
 assert.equal(typeof app.auth().getClientCredential,'function');
});
const noNickname=Buffer.from(JSON.stringify({customUserId:'verified-coach',applicationId:'app_847cdb589a'})).toString('base64');
test('uses an SDK display nickname when the authenticated gateway has no nickname, retaining gateway identity',async()=>{
 let received;const handler=createHandler({rpc:async(...args)=>{received=args;return{accepted:true};}});
 const body={event:'gym-progress',runId:'1800000000000-23',revision:42,nickname:'  JR\u0000\u202e昵称🏀  '};
 await handler({method:'POST',path:'/leaderboard/submit',context:noNickname,body});
 assert.deepEqual(received,['submit_gym_rank',{p_puid:'verified-coach',p_name:'JR昵称🏀',p_run:body.runId,p_revision:42}]);
 assert.equal(identity(noNickname).name,'');
});
test('prefers a real gateway nickname and uses an explicit anonymous fallback only when both sources are absent',async()=>{
 const calls=[],handler=createHandler({rpc:async(...args)=>{calls.push(args);return{accepted:true};}});
 const body={event:'gym-progress',runId:'1800000000000-23',revision:42};
 await handler({method:'POST',path:'/leaderboard/submit',context,body:{...body,nickname:'SDK昵称'}});
 await handler({method:'POST',path:'/leaderboard/submit',context:noNickname,body});
 assert.equal(calls[0][1].p_name,'本地教练');assert.equal(calls[1][1].p_name,'匿名训练师');
});
test('profile sync calls only the name-maintenance RPC using authenticated actor identity',async()=>{
 let received;const handler=createHandler({rpc:async(...args)=>{received=args;return{accepted:true,updated:2};}});
 assert.deepEqual(await handler({method:'POST',path:'/leaderboard/submit',context:noNickname,body:{event:'gym-profile',nickname:'我的虎扑昵称'}}),{accepted:true,updated:2});
 assert.deepEqual(received,['update_gym_rank_name',{p_puid:'verified-coach',p_name:'我的虎扑昵称'}]);
});
test('profile sync rejects identity, score and progress injection without executing any RPC',async()=>{
 let called=0;const handler=createHandler({rpc:async()=>{called++;return{accepted:true};}});
 for(const extra of [{puid:'victim'},{actor:'victim'},{score:999},{best:{}},{runId:'1800000000000-23'},{revision:99}]){
  await assert.rejects(handler({method:'POST',path:'/leaderboard/submit',context:noNickname,body:{event:'gym-profile',nickname:'JR',...extra}}),{statusCode:400});
 }
 for(const nickname of ['', ' \u202e\u0000 ', {}, ['JR'], 3])await assert.rejects(handler({method:'POST',path:'/leaderboard/submit',context:noNickname,body:{event:'gym-profile',nickname}}),{statusCode:400});
 await assert.rejects(handler({method:'POST',path:'/leaderboard/submit',body:{event:'gym-profile',nickname:'JR'}}),{statusCode:401});
 assert.equal(called,0);
});
test('a successful profile update invalidates public cache and never submits a score',async()=>{
 const calls=[],handler=createHandler({rpc:async(name,args)=>{calls.push([name,args]);return name==='update_gym_rank_name'?{accepted:true,updated:0}:{entries:[]};}});
 const query={method:'GET',path:'/leaderboard',query:{board:'fame',limit:'50'}};
 await handler(query);await handler(query);
 await handler({method:'POST',path:'/leaderboard/submit',context:noNickname,body:{event:'gym-profile',nickname:'JR'}});
 await handler(query);
 assert.deepEqual(calls.map(([name])=>name),['read_gym_rank','update_gym_rank_name','read_gym_rank']);
});
test('display nickname cleanup preserves emoji while removing control and directional spoofing characters',()=>{
 assert.equal(cleanName(' \ud800\u0085\u2066'+'🏀'.repeat(70)+'\u2069 '),'🏀'.repeat(60));
});
