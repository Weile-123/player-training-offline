import {afterEach,expect,it,vi} from 'vitest';
import {createRoot,type Root} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {ActionNotice} from '../../src/components/ActionNotice';
let root:Root|null=null;
afterEach(()=>{if(root)act(()=>root!.unmount());root=null;vi.useRealTimers();});

it('puts operation feedback outside the content flow and expires ordinary status messages',async()=>{
 vi.useFakeTimers();root=createRoot(document.getElementById('root')!);
 await act(async()=>root!.render(<section className="panel"><button>继续</button><ActionNotice message="已保存"/></section>));
 expect(document.querySelector('.panel')?.children).toHaveLength(1);
 expect(document.querySelector('[role=status]')?.parentElement).toBe(document.body);
 await act(async()=>vi.advanceTimersByTime(2999));expect(document.querySelector('.action-notice')).toBeTruthy();
 await act(async()=>vi.advanceTimersByTime(1));expect(document.querySelector('.action-notice')).toBeNull();
});

it('expires errors after three seconds and gives each replacement its own timer',async()=>{
 vi.useFakeTimers();root=createRoot(document.getElementById('root')!);
 await act(async()=>root!.render(<ActionNotice message="保存失败，请重试" role="alert"/>));
 await act(async()=>vi.advanceTimersByTime(2999));expect(document.querySelector('[role=alert]')?.textContent).toContain('保存失败');
 await act(async()=>vi.advanceTimersByTime(1));expect(document.querySelector('.action-notice')).toBeNull();
 await act(async()=>root!.render(<ActionNotice message="连接失败，请重试" role="alert"/>));
 await act(async()=>vi.advanceTimersByTime(2000));
 await act(async()=>root!.render(<ActionNotice message="请求超时，请重试" role="alert"/>));
 await act(async()=>vi.advanceTimersByTime(1000));expect(document.querySelector('[role=alert]')?.textContent).toContain('请求超时');
 await act(async()=>vi.advanceTimersByTime(2000));expect(document.querySelector('.action-notice')).toBeNull();
 await act(async()=>root!.render(<ActionNotice message="" role="alert"/>));expect(document.querySelector('.action-notice')).toBeNull();
});
