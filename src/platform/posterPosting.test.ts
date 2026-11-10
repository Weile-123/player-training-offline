import {afterEach,expect,it,vi} from 'vitest';
const testPostingTarget=vi.hoisted(()=>({topicId:'topic-test',tagId:'tag-test',topicName:'测试专区',tagName:'测试话题'}));
vi.mock('../data/poster-posting.json',()=>({default:testPostingTarget}));
import {createPosterPosting} from './posterPosting';
const blob=()=>new Blob(['png'],{type:'image/png'});
function fixture(){
 const upload=vi.fn().mockResolvedValue({downloadUrl:'https://cdn.example.com/poster.png'}),open=vi.fn().mockResolvedValue({code:200}),config=vi.fn().mockResolvedValue({bbsTagId:' '});
 const auth=vi.fn().mockResolvedValue({code:200,data:{islogin:1,puid:'test'}});
 vi.stubGlobal('window',{ColorboxAI:{auth:{getUserInfo:auth},oss:{uploadFile:upload},bbsConfig:{get:config},request:{bbs:{openPostEditor:open}}}});
 return {upload,open,config,auth,post:createPosterPosting()};
}
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('uploads the PNG and opens the editor with the specified game topic and tag',async()=>{
 const f=fixture(),image=blob(),stages:string[]=[];await f.post(image,'title','text',s=>stages.push(s));
 expect(f.upload.mock.calls[0][0].file).toBe(image);expect(f.open).toHaveBeenCalledExactlyOnceWith({...testPostingTarget,title:'title',content:'text',imageUrl:'https://cdn.example.com/poster.png'});expect(stages).toEqual(['uploading','opening','done']);expect(f.config).not.toHaveBeenCalled();
});
it('keeps the explicit destination instead of using a different platform topic',async()=>{
 const f=fixture();f.config.mockResolvedValue({bbsTopicId:'85',bbsTagId:'123',bbsTopicName:'专区',bbsTagName:'话题'});await f.post(blob(),'title','text');
 expect(f.open.mock.calls[0][0]).toMatchObject(testPostingTarget);expect(f.config).not.toHaveBeenCalled();
});
it('opens the editor even when the optional platform topic-config capability is absent',async()=>{
 const f=fixture();delete window.ColorboxAI!.bbsConfig;await f.post(blob(),'title','text');
 expect(f.open).toHaveBeenCalledOnce();
});
it('does not open or reward after guest, upload failure, invalid URL, cancellation or platform errors',async()=>{
 const f=fixture();f.auth.mockResolvedValueOnce({code:200,data:{islogin:0}});await expect(f.post(blob(),'','')).rejects.toThrow('登录');expect(f.upload).not.toHaveBeenCalled();
 f.upload.mockRejectedValueOnce(Error('网络失败'));await expect(f.post(blob(),'','')).rejects.toThrow('网络失败');expect(f.open).not.toHaveBeenCalled();
 f.upload.mockResolvedValueOnce({downloadUrl:'javascript:bad'});await expect(f.post(blob(),'','')).rejects.toThrow('无效');expect(f.open).not.toHaveBeenCalled();
 for(const code of [408,429,503,499]){f.open.mockResolvedValueOnce({code,message:'已取消或请求失败'});await expect(f.post(blob(),'','')).rejects.toThrow('已取消或请求失败');}
 expect(f.open).toHaveBeenCalledTimes(4);
});
it('locks repeated clicks and reuses a successfully uploaded image for explicit retries',async()=>{
 const f=fixture(),image=blob();let done!:(v:unknown)=>void;f.upload.mockImplementationOnce(()=>new Promise(resolve=>{done=resolve;}));
 const first=f.post(image,'','');await Promise.resolve();await expect(f.post(image,'','')).rejects.toThrow('正在分享');
 await vi.waitFor(()=>expect(f.upload).toHaveBeenCalledTimes(1));done({downloadUrl:'https://cdn.example.com/poster.png'});await first;
 f.open.mockResolvedValueOnce({code:429,message:'稍后再试'});await expect(f.post(image,'','')).rejects.toThrow('稍后再试');
 await f.post(image,'','');expect(f.upload).toHaveBeenCalledTimes(1);expect(f.open).toHaveBeenCalledTimes(3);
});
it('rejects empty or oversized images before calling any SDK capability',async()=>{
 const f=fixture();await expect(f.post(new Blob([],{type:'image/png'}),'','')).rejects.toThrow('尚未生成');
 await expect(f.post(new Blob([new Uint8Array(10*1024*1024+1)],{type:'image/png'}),'','')).rejects.toThrow('10 MB');expect(f.auth).not.toHaveBeenCalled();
});
it('closing the dialog during upload stops the flow before opening an editor',async()=>{
 const f=fixture(),controller=new AbortController();let finish!:(value:unknown)=>void;
 f.upload.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const pending=f.post(blob(),'title','text',()=>{},controller.signal),rejected=expect(pending).rejects.toThrow('已取消分享');
 await vi.waitFor(()=>expect(f.upload).toHaveBeenCalledTimes(1));controller.abort();finish({downloadUrl:'https://cdn.example.com/poster.png'});await rejected;
 expect(f.open).not.toHaveBeenCalled();expect(f.config).not.toHaveBeenCalled();
});
