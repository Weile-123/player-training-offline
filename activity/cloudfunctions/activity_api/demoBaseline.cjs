const {identity}=require('./rankings.cjs');
/** Preserve the platform-provisioned demo contracts when updating activity_api. */
function createDemoBaselineHandler({rdb,now=Date.now}){
 let cached=null,until=0;
 return async({method,path,context,body})=>{
  if(method==='GET'&&path==='/demo/list'){
   if(cached&&now()<until)return cached;
   const result=await rdb.from('demo_items').select('*').order('created_at',{ascending:false}).limit(50);
   if(result?.error)throw Object.assign(Error('基线服务暂不可用'),{statusCode:503});
   cached=Array.isArray(result)?result:Array.isArray(result?.data)?result.data:Array.isArray(result?.rows)?result.rows:[];until=now()+5000;return cached;
  }
  if(method==='POST'&&path==='/demo/submit'){
   const user=identity(context),value=body??{};
   if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['title','content'].includes(key))||value.title!==undefined&&typeof value.title!=='string'||value.content!==undefined&&typeof value.content!=='string')throw Object.assign(Error('请求参数无效'),{statusCode:400});
   const record={puid:user.puid,title:value.title||'无标题',content:value.content||'',created_at:new Date(now()).toISOString()};
   const result=await rdb.from('demo_items').insert([record]);
   if(result.error)throw Object.assign(Error('基线服务暂不可用'),{statusCode:503});
   cached=null;until=0;return record;
  }
  throw Object.assign(Error('接口不存在'),{statusCode:404});
 };
}
module.exports={createDemoBaselineHandler};
