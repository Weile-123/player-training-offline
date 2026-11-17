import {startGymAuthorityRuntime} from './gymAuthorityRuntime.mjs';
const runtime=await startGymAuthorityRuntime();
console.log(JSON.stringify({service:'gym-authority',mode:runtime.mode,port:runtime.port,host:runtime.host,repository:runtime.repository,liveTimeflow:runtime.liveTimeflow}));
for(const event of ['SIGINT','SIGTERM'])process.once(event,()=>runtime.server.close(()=>process.exit(0)));
