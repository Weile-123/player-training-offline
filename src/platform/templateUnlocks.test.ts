import {it,expect,vi} from 'vitest';
import {createTemplateUnlockReporter,unlockStatsKey} from './templateUnlocks';
import {nbaTemplates} from '../game/templates';
const ids=nbaTemplates.slice(0,3).map(t=>t.id);
function setup(){const data=new Map<string,string>(),storage={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
 const deps={storage,enabled:()=>true,user:vi.fn(async()=>({puid:'a'})),send:vi.fn(async(_e:unknown)=>({accepted:true}))};return {deps,make:()=>createTemplateUnlockReporter(deps)};}
it('deduplicates and persists independently of game data, including reload',async()=>{
 const {deps,make}=setup(),r=make();r.observe([ids[0],ids[0],'fake'],'history');r.observe([ids[0],ids[1]],'unlock');await r.flush();
 expect(deps.send).toHaveBeenCalledWith([{templateId:ids[0],source:'history'},{templateId:ids[1],source:'unlock'}]);
 const loaded=make();loaded.observe(ids.slice(0,2),'history');await loaded.flush();expect(deps.send).toHaveBeenCalledTimes(1);
 expect(deps.storage.getItem(unlockStatsKey)).toContain('confirmed');
});
it('retries failures and missing receipts, never reassigns a pending account',async()=>{
 const {deps,make}=setup(),r=make();r.observe([ids[0]],'unlock');deps.send.mockRejectedValueOnce(Error('offline'));await r.flush();
 deps.user.mockResolvedValue({puid:'b'});await make().flush();expect(deps.send).toHaveBeenCalledTimes(1);
 deps.user.mockResolvedValue({puid:'a'});deps.send.mockResolvedValueOnce({accepted:false});await r.flush();await r.flush();expect(deps.send).toHaveBeenCalledTimes(3);
});
it('never sends when disabled or signed out; concurrent retry shares one request',async()=>{
 const {deps,make}=setup();deps.enabled=()=>false;const r=make();r.observe(ids,'unlock');await r.flush();expect(deps.user).not.toHaveBeenCalled();
 deps.enabled=()=>true;r.observe(ids,'unlock');deps.user.mockResolvedValue({puid:''});await r.flush();expect(deps.send).not.toHaveBeenCalled();
 deps.user.mockResolvedValue({puid:'a'});await Promise.all([r.flush(),r.flush()]);expect(deps.send).toHaveBeenCalledTimes(1);
});
it('storage and transport exceptions never propagate to gameplay',async()=>{
 const {deps}=setup();deps.storage={getItem:()=>{throw Error();},setItem:()=>{throw Error();}};deps.send.mockRejectedValue(Error());
 const r=createTemplateUnlockReporter(deps);expect(()=>r.observe(ids,'unlock')).not.toThrow();await expect(r.flush()).resolves.toBeUndefined();
});
