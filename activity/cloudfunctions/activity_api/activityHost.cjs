function createActivityRequestHandler({legacyHandle,authorityHandle}){
 return async(req,res)=>{
  let url;
  try{url=new URL(req.url||'/','http://localhost');}
  catch{res.writeHead(400,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({code:400,message:'请求地址无效'}));return;}
  // Must run before the legacy 16KiB parser consumes a portable migration body.
  if(/^\/(?:api\/)?gym(?:\/|$)/.test(url.pathname)){
   if(authorityHandle)return authorityHandle(req,res);
   res.writeHead(503,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
   res.end(JSON.stringify({code:'GYM_AUTHORITY_NOT_CONFIGURED',message:'球馆云端服务尚未启用',retryable:false}));return;
  }
  // Gateway owns CORS. Direct public function access must be disabled.
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  try{
   let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>16384)throw Object.assign(Error('请求内容过大'),{statusCode:413});}
   let body;try{body=text?JSON.parse(text):undefined;}catch{throw Object.assign(Error('请求格式无效'),{statusCode:400});}
   const data=await legacyHandle({method:req.method,path:url.pathname.replace(/^\/api(?=\/|$)/,''),query:Object.fromEntries(url.searchParams),context:req.headers['x-cloudbase-context'],body});
   const message=url.pathname.endsWith('/health')?'ok':url.pathname.includes('/demo/')?'success':undefined;
   res.writeHead(200);res.end(JSON.stringify({code:0,...(message?{message}:{}),data}));
  }catch(error){const status=error.statusCode||503;res.writeHead(status);res.end(JSON.stringify({code:status,message:error.statusCode?error.message:'排行榜服务暂不可用'}));}
 };
}
module.exports={createActivityRequestHandler};
