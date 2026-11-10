import {it,expect} from 'vitest';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createContractStore} from '../src/contractStore';
import {recordCareer} from '../src/game/contract/careerStats';

it.skipIf(!process.env.GAME_PERF_LABEL)('profiles identical synchronous training scenarios (not browser INP)',()=>{
 const results=[];
 for(const [players,history] of [[3,0],[30,100],[120,500]]){
  const times:number[]=[],writes:number[]=[],notifications:number[]=[],digests:string[]=[];
  for(let round=0;round<5;round++){
   const data=new Map<string,string>();let writeCount=0,notifyCount=0;
   const storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{writeCount++;data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}};
   const store=createContractStore(storage,()=>6);store.getState().start();
   const state=structuredClone(store.getState().state);state.careerId='perf-fixed';
   state.players=Array.from({length:players},(_,i)=>({...structuredClone(state.players[i%3]),id:'p'+(i+1)}));state.nextId=players+1;
   let careers={};for(let i=0;i<history;i++)careers=recordCareer(careers,{...state,careerId:'history-'+i});
   store.setState({state,careers,debug:{...store.getState().debug,noSevere:true}});store.getState().flush();
   const stop=store.subscribe(()=>notifyCount++);
   for(let i=0;i<30;i++){
    const w=writeCount,n=notifyCount,start=performance.now();
    const result=store.getState().act({type:'train',playerId:'p'+(i%players+1)});
    const elapsed=performance.now()-start;expect(result.error).toBeUndefined();
    if(i>=5){times.push(elapsed);writes.push(writeCount-w);notifications.push(notifyCount-n);}
   }
   digests.push(createHash('sha256').update(JSON.stringify(store.getState().state)).digest('hex'));stop();
  }
  times.sort((a,b)=>a-b);
  results.push({players,history,samples:times.length,p50Ms:times[Math.floor(times.length*.5)],p75Ms:times[Math.floor(times.length*.75)],p95Ms:times[Math.floor(times.length*.95)],meanWrites:writes.reduce((a,b)=>a+b)/writes.length,meanNotifications:notifications.reduce((a,b)=>a+b)/notifications.length,digests});
 }
 mkdirSync('output/performance',{recursive:true});
 writeFileSync('output/performance/'+process.env.GAME_PERF_LABEL+'.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results.map(({digests,...r})=>r)));
},120000);
