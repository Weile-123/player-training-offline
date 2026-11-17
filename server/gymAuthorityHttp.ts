import type {IncomingMessage,ServerResponse} from 'node:http';
import {authorityFailure} from './gymAuthorityRepository';
import type {AuthorityActor,GymAuthorityService} from './gymAuthorityService';

export type GymAuthenticator=(request:IncomingMessage)=>Promise<AuthorityActor|null>;
/** Authentication is supplied by a verified gateway integration, never decoded from a self-reported PUID. */
export function createGymAuthorityHttpHandler({service,authenticate,allowedOrigin}:{service:GymAuthorityService;authenticate:GymAuthenticator;allowedOrigin?:string}){
 if(!service||typeof authenticate!=='function')throw Error('A trusted authenticator is required');
 if(allowedOrigin){const origin=new URL(allowedOrigin);if(!['http:','https:'].includes(origin.protocol)||origin.origin!==allowedOrigin)throw Error('Invalid allowed origin');}
 return async(request:IncomingMessage,response:ServerResponse)=>{
  response.setHeader('Content-Type','application/json; charset=utf-8');response.setHeader('Cache-Control','no-store');
  response.setHeader('X-Content-Type-Options','nosniff');
  const origin=request.headers.origin;
  if(origin&&allowedOrigin&&origin!==allowedOrigin){response.writeHead(403);response.end(JSON.stringify({code:'ORIGIN_DENIED',message:'请求来源不允许',retryable:false}));return;}
  if(origin&&origin===allowedOrigin){response.setHeader('Access-Control-Allow-Origin',origin);response.setHeader('Vary','Origin');response.setHeader('Access-Control-Allow-Headers','Content-Type, X-Gym-Dev-Session');response.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');}
  if(request.method==='OPTIONS'){response.writeHead(204);response.end();return;}
  try{
   const actor=await authenticate(request);if(!actor)throw authorityFailure('AUTH_REQUIRED',401,false,'请先登录虎扑');
   const url=new URL(request.url??'/','http://localhost');
   if(url.search)throw authorityFailure('REQUEST_INVALID',400,false,'不接受查询身份或时间参数');
   const path=url.pathname.replace(/^\/api(?=\/|$)/,'');
   let body:unknown={};
   if(request.method==='POST'){
    let text='',bytes=0;for await(const chunk of request){bytes+=Buffer.byteLength(chunk);if(bytes>6*1024*1024)throw authorityFailure('BODY_TOO_LARGE',413);text+=chunk;}
    try{body=JSON.parse(text);}catch{throw authorityFailure('REQUEST_INVALID',400,false,'请求格式无效');}
   }
   let data;
   if(path==='/gym/session'&&['GET','POST'].includes(request.method??'')){
    if(request.method==='POST'&&(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length))throw authorityFailure('REQUEST_INVALID',400);
    data=await service.session(actor);
   }else if(request.method==='POST'&&path==='/gym/start')data=await service.start(actor,body as Parameters<typeof service.start>[1]);
   else if(request.method==='POST'&&path==='/gym/rewards/prepare')data=await service.prepareReward(actor,body as Parameters<typeof service.prepareReward>[1]);
   else if(request.method==='POST'&&path==='/gym/adopt')data=await service.adopt(actor,body as Parameters<typeof service.adopt>[1]);
   else if(request.method==='POST'&&path==='/gym/actions')data=await service.action(actor,body as Parameters<typeof service.action>[1]);
   else if(request.method==='POST'&&path==='/gym/resume')data=await service.resume(actor,body as Parameters<typeof service.resume>[1]);
   else if(request.method==='POST'&&path==='/gym/suspend')data=await service.suspend(actor,body as Parameters<typeof service.suspend>[1]);
   else if(request.method==='POST'&&path==='/gym/alumni')data=await service.alumni(actor,body as Parameters<typeof service.alumni>[1]);
   else throw authorityFailure('NOT_FOUND',404,false,'接口不存在');
   response.writeHead(200);response.end(JSON.stringify({code:0,data}));
  }catch(error){
   const value=(error&&typeof error==='object'?error:{}) as {code?:unknown;statusCode?:unknown;retryable?:unknown;message?:unknown};
   const safe=typeof value.code==='string'&&/^[A-Z][A-Z0-9_]{0,80}$/.test(value.code)&&Number.isInteger(value.statusCode)&&Number(value.statusCode)>=400&&Number(value.statusCode)<=599;
   const status=safe?Number(value.statusCode):503;
   response.writeHead(status);response.end(JSON.stringify({code:safe?value.code:'SERVICE_UNAVAILABLE',message:safe?String(value.message):'球馆服务暂不可用，已保存进度保留',retryable:safe?value.retryable===true:false}));
  }
 };
}
