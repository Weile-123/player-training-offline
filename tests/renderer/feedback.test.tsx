import {afterEach,expect,it,vi} from 'vitest';
const testApplicationId=vi.hoisted(()=>{
 const id='app_0123456789';
 vi.stubEnv('VITE_HUPU_ACTIVITY_ID',id);
 return id;
});
import {createRoot} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {FeedbackPage} from '../../src/components/HomeSettings';
import {feedbackConfig} from '../../src/platform/hupuAccount';

let root:ReturnType<typeof createRoot>;
afterEach(()=>{if(root)act(()=>root.unmount());vi.unstubAllGlobals();});
function mount(){
 const request=vi.fn().mockResolvedValue({statusCode:201,code:0,data:{id:'feedback-test-1',createdAt:'2026-10-25T11:20:00Z'}});
 const checkAudit=vi.fn().mockResolvedValue({code:200,data:true});
 vi.stubGlobal('window',{...window,ColorboxAI:{auth:{getUserInfo:async()=>({code:200,data:{islogin:1,puid:'test-account',nickname:'测试玩家'}})},security:{checkAudit},cloud:{request}}});
 root=createRoot(document.getElementById('root')!);act(()=>root.render(<FeedbackPage onClose={()=>{}}/>));
 const input=document.querySelector('textarea')!;
 act(()=>{input.value='反馈测试内容';input.dispatchEvent(new Event('input',{bubbles:true}));});
 expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
 expect(document.querySelector('form')).toBeInstanceOf(HTMLFormElement);
 expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')!.form).toBe(document.querySelector('form'));
 return {input,request,checkAudit,submit:async()=>{document.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();await new Promise(resolve=>setTimeout(resolve,0));}};
}
it('sends the entered feedback to the shared service through the actual form and clears only after success',async()=>{
 const {input,request,checkAudit,submit}=mount();
 const formSubmit=vi.fn();document.querySelector('form')!.addEventListener('submit',formSubmit);
 await act(async()=>submit());
 expect(formSubmit).toHaveBeenCalledTimes(1);
 expect(formSubmit.mock.calls[0][0].defaultPrevented).toBe(true);
 expect(checkAudit).toHaveBeenCalledExactlyOnceWith('反馈测试内容');
 expect(request).toHaveBeenCalledExactlyOnceWith({url:feedbackConfig.apiBase+'/feedback',method:'POST',envId:feedbackConfig.envId,auth:true,data:{applicationId:testApplicationId,content:'反馈测试内容',nickname:'测试玩家'}});
 expect(document.querySelector('[role="status"]')?.textContent).toContain('反馈已提交');
 expect(document.querySelector('[role="status"]')?.textContent).toContain('反馈编号：feedback-test-1');expect(input.value).toBe('');
});
it('keeps the entered feedback and never submits when text detection fails',async()=>{
 const {input,request,checkAudit,submit}=mount();checkAudit.mockResolvedValue({code:500,data:null});await act(async()=>submit());
 expect(request).not.toHaveBeenCalled();expect(input.value).toBe('反馈测试内容');
 expect(document.querySelector('[role="status"]')?.textContent).toContain('内容检测暂不可用');
});
it('retains text after a service failure and does not auto retry or show success',async()=>{
 const {input,request,submit}=mount();request.mockResolvedValue({statusCode:500,code:500});await act(async()=>submit());
 expect(request).toHaveBeenCalledTimes(1);expect(input.value).toBe('反馈测试内容');
 expect(document.querySelector('[role="status"]')?.textContent).not.toContain('反馈已提交');
});
it('keeps the feedback text when a nominal success has no service receipt',async()=>{
 const {input,request,submit}=mount();request.mockResolvedValue({statusCode:201,code:0,data:{}});await act(async()=>submit());
 expect(input.value).toBe('反馈测试内容');expect(document.querySelector('[role="status"]')?.textContent).toContain('未收到反馈编号');
});
