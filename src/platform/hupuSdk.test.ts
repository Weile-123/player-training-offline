import {afterEach,expect,it,vi} from 'vitest';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
async function setup(){
 vi.resetModules();
 const listeners=new Map<string,()=>void>();
 const script={id:'',src:'',async:false,remove:vi.fn(),addEventListener:(event:string,listener:()=>void)=>listeners.set(event,listener),removeEventListener:vi.fn()};
 const append=vi.fn();vi.stubGlobal('window',{});vi.stubGlobal('document',{getElementById:()=>null,createElement:()=>script,head:{append}});
 return {api:await import('./hupuSdk'),script,append,listeners};
}
it('uses the platform-verified SDK version and shares simultaneous loads',async()=>{
 const {api,script,append,listeners}=await setup();
 const first=api.ensureColorboxSdk(),second=api.ensureColorboxSdk();
 expect(first).toBe(second);expect(append).toHaveBeenCalledTimes(1);expect(script.src).toContain('colorbox-ai_v2.2.19.js');
 window.ColorboxAI={cloudSave:{getValue:vi.fn(),setValue:vi.fn()}};listeners.get('load')!();await first;
 await api.ensureColorboxSdk();expect(append).toHaveBeenCalledTimes(1);
});
it('preserves a platform-injected SDK instead of replacing it',async()=>{
 const {api,append}=await setup(),injected={auth:{getUserInfo:vi.fn()}};window.ColorboxAI=injected;
 await api.ensureColorboxSdk();expect(window.ColorboxAI).toBe(injected);expect(append).not.toHaveBeenCalled();
});
it('uses an injected SDK on loopback without loading an external script',async()=>{
 const {api,append}=await setup();
 vi.stubGlobal('window',{location:{hostname:'127.0.0.1'}});
 await expect(api.ensureColorboxSdk()).rejects.toThrow('本地预览');
 window.ColorboxAI={};
 await expect(api.ensureColorboxSdk()).resolves.toBeUndefined();expect(append).not.toHaveBeenCalled();
});
it('allows an explicit retry after a failed script load',async()=>{
 const {api,script,append,listeners}=await setup();
 const first=api.ensureColorboxSdk(),failure=expect(first).rejects.toThrow('加载失败');listeners.get('error')!();await failure;expect(script.remove).toHaveBeenCalled();
 const second=api.ensureColorboxSdk();window.ColorboxAI={};listeners.get('load')!();await second;expect(append).toHaveBeenCalledTimes(2);
});
