import ball1 from '../videos/ball1.wav?url';
import ball2 from '../videos/ball2.mp3?url';
import ball3 from '../videos/ball3.wav?url';
import ball4 from '../videos/ball4.wav?url';
import ball5 from '../videos/ball5.wav?url';
import click from '../videos/optimized/click-responsive.wav?url';
import month from '../videos/new_month.wav?url';
import upgrade from '../videos/upgrade.wav?url';
import type {StaticAudioKey} from './staticAudioData';

// These URLs remain the media-fallback identities. WebAudio reads the same
// packaged bytes from a separate, statically imported data chunk instead.
const keys=new Map<string,StaticAudioKey>([
 [ball1,'ball1'],[ball2,'ball2'],[ball3,'ball3'],[ball4,'ball4'],
 [ball5,'ball5'],[click,'click'],[month,'month'],[upgrade,'upgrade'],
]);
let dataTask:Promise<typeof import('./staticAudioData')>|null=null;
const byteCache=new Map<StaticAudioKey,Uint8Array>();

function bytesFromDataUrl(value:string):Uint8Array{
 const comma=value.indexOf(',');
 if(!value.startsWith('data:audio/')||comma<0||!value.slice(0,comma).endsWith(';base64'))throw Error('音效数据格式无效');
 const binary=atob(value.slice(comma+1)),bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return bytes;
}

export async function loadStaticAudio(source:string):Promise<ArrayBuffer>{
 const key=keys.get(source);
 if(!key)throw Error('不是已打包的音效资源');
 if(!dataTask){
  const task:Promise<typeof import('./staticAudioData')>=import('./staticAudioData').catch(error=>{
   // An actual import failure may be transient. A caller's read timeout does
   // not reach this branch, so a slow in-flight chunk remains shared/cached.
   if(dataTask===task)dataTask=null;
   throw error;
  });
  dataTask=task;
 }
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const module=await Promise.race([
   dataTask,
   new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('音效数据读取超时，请稍后重试')),10_000);}),
  ]);
  let bytes=byteCache.get(key);
  if(!bytes){bytes=bytesFromDataUrl(module.staticAudioData[key]);byteCache.set(key,bytes);}
  // decodeAudioData can detach its input. Always return a fresh owned buffer.
  const copy=new ArrayBuffer(bytes.byteLength);new Uint8Array(copy).set(bytes);return copy;
 }finally{clearTimeout(timer);}
}
