import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {dispatch,newContract} from '../src/game/contract/engine';
const root='output/balance-audit-20261022';
const examples:any[]=[];
for(const file of readdirSync(root+'/runs-v2').filter(f=>(f.startsWith('focus-')||f.startsWith('heat-'))&&f.includes('-share-')&&!f.includes('-no-share-'))){
 const data=JSON.parse(gunzipSync(readFileSync(root+'/runs-v2/'+file)).toString());
 if(!['relic_028','relic_034','relic_076'].some(id=>data.summary.equipment[id]))continue;
 let state=newContract(data.summary.seed,[],data.profile.collection);
 state.commerce.unlocked=[...data.profile.unlocked];state.careerId=data.finalState.careerId;
 for(const [i,action]of data.actions.entries()){
  const p='playerId' in action?state.players.find(p=>p.id===action.playerId):undefined;
  const eligible=action.type==='share-reward'&&p?.level===0&&p.shots===0&&state.progress.pendingLevel>0;
  const result=dispatch(state,state.revision,action);if(result.error)throw Error(result.error);
  if(eligible){
   const after=result.state.players.find(p=>p.id===action.playerId)!;
   const trained=dispatch(result.state,result.state.revision,{type:'train',playerId:after.id});
   const normalFirst=dispatch(state,state.revision,{type:'train',playerId:after.id});
   examples.push({key:data.summary.key,step:i+1,seed:data.summary.seed,equipment:state.equipment,
    before:{level:p!.level,shots:p!.shots,pendingLevel:state.progress.pendingLevel,pendingHeat:state.progress.pendingHeat,pendingSuccess:state.progress.pendingSuccess},
    afterShare:{level:after.level,shots:after.shots,pendingLevel:result.state.progress.pendingLevel,pendingHeat:result.state.progress.pendingHeat,pendingSuccess:result.state.progress.pendingSuccess},
    afterNextTraining:{error:trained.error??null,pendingLevel:trained.state.progress.pendingLevel,pendingHeat:trained.state.progress.pendingHeat,pendingSuccess:trained.state.progress.pendingSuccess},
    normalFirstControl:{error:normalFirst.error??null,pendingLevel:normalFirst.state.progress.pendingLevel,pendingHeat:normalFirst.state.progress.pendingHeat,pendingSuccess:normalFirst.state.progress.pendingSuccess},
    note:'The player is no longer an untrained level-0 rookie. Pending inheritance remains global and may go to a later rookie; this player cannot claim it after sharing.'});
   break;
  }
  state=result.state;
 }
 if(examples.length>=3)break;
}
writeFileSync(root+'/share-inheritance-finding.json',JSON.stringify({detected:examples.length>0,examples,scope:'Legal natural snapshots; next training is a controlled branch, excluded from population counts.'},null,2));
console.log(JSON.stringify({detected:examples.length>0,examples},null,2));
