const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDemoBaselineHandler}=require('../demoBaseline.cjs');
const context=Buffer.from(JSON.stringify({customUserId:'verified-demo-user'})).toString('base64');
function fixture(){
 let reads=0;const records=[];
 const rdb={from(table){
  assert.equal(table,'demo_items');
  return{
   select(){return{order(name,options){
    assert.equal(name,'created_at');assert.equal(options.ascending,false);
    return{async limit(amount){assert.equal(amount,50);reads++;return{data:[...records]};}};
   }};},
   async insert(rows){records.push(...rows);return{data:rows};}
  };
 }};
 return{handler:createDemoBaselineHandler({rdb,now:()=>100000}),records,get reads(){return reads;}};
}
test('preserves public demo array contract and its short read cache',async()=>{const f=fixture();assert.deepEqual(await f.handler({method:'GET',path:'/demo/list'}),[]);assert.deepEqual(await f.handler({method:'GET',path:'/demo/list'}),[]);assert.equal(f.reads,1);});
test('preserves protected demo writes and invalidates its public cache using gateway identity',async()=>{const f=fixture();await f.handler({method:'GET',path:'/demo/list'});const record=await f.handler({method:'POST',path:'/demo/submit',context,body:{title:'fixture',content:'body'}});assert.equal(record.puid,'verified-demo-user');assert.equal(record.title,'fixture');assert.deepEqual(await f.handler({method:'GET',path:'/demo/list'}),[record]);assert.equal(f.reads,2);});
test('rejects unverified or body-provided identity before inserting a baseline record',async()=>{const f=fixture();await assert.rejects(f.handler({method:'POST',path:'/demo/submit',body:{title:'unverified'}}),{statusCode:401});await assert.rejects(f.handler({method:'POST',path:'/demo/submit',context,body:{puid:'someone-else',title:'spoof'}}),{statusCode:400});assert.equal(f.records.length,0);});
