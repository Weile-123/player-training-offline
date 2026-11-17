const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHandler}=require('../rankings.cjs');
const context=Buffer.from(JSON.stringify({customUserId:'verified-coach',nickname:'本地教练',applicationId:'app_847cdb589a'})).toString('base64');
test('health exposes only the current public project identity',async()=>{
 const handler=createHandler({rpc:()=>{throw Error('unexpected database call');}});
 assert.deepEqual(await handler({method:'GET',path:'/health'}),{applicationId:'app_847cdb589a',version:'gym-rankings-v1',boards:['player','fame']});
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
test('the independently locked CloudBase runtime dependency provides the expected auth API',()=>{
 const tcb=require('@cloudbase/node-sdk');
 const app=tcb.init({env:'local-contract-test',accessKey:'local-not-a-real-credential'});
 assert.equal(typeof app.auth().getClientCredential,'function');
});
