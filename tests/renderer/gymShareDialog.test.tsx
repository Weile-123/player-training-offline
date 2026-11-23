import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {useState} from 'react';
import {act} from 'preact/test-utils';
import {newGym} from '../../src/game/gym/engine';
import {GymShareDialog} from '../../src/components/GymShareDialog';
const mock = vi.hoisted(() => ({generate: vi.fn(), post: vi.fn()}));
vi.mock('../../src/presentation/gymSharePoster', () => ({generateGymSharePoster: mock.generate, gymShareCopy: () => ({title: '传奇球馆｜预设标题', content: '由游戏提供的固定正文'})}));
vi.mock('../../src/platform/gymPosting', () => ({openGymPost: mock.post}));
let root: Root | null = null;
beforeEach(() => {
 mock.generate.mockReset().mockResolvedValue(new Blob(['png'], {type: 'image/png'}));
 mock.post.mockReset().mockResolvedValue({editorOpened: true, simulated: false});
 vi.stubGlobal('URL', class extends URL {static createObjectURL = vi.fn(() => 'blob:poster-preview'); static revokeObjectURL = vi.fn();});
});
afterEach(() => {if (root) act(() => root!.unmount()); root = null; vi.unstubAllGlobals();});
const click = async (text: string) => {const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === text)!; expect(button).toBeTruthy(); await act(async () => {button.click(); for (let index = 0; index < 10; index++) await Promise.resolve();});};
async function render(onGranted = vi.fn(async () => true), onBeforeOpen?: () => Promise<void>) {
 const player = newGym(Date.now(), 47).player!;
 const onClose = vi.fn();
 function ShareFixture() {
  const [open, setOpen] = useState(true);
  return open ? <GymShareDialog player={player} value="456000" reason="levels" onClose={() => {onClose(); setOpen(false);}} onGranted={onGranted} onBeforeOpen={onBeforeOpen}/> : null;
 }
 root = createRoot(document.getElementById('root')!);
 await act(async () => {root!.render(<ShareFixture/>); for (let index = 0; index < 10; index++) await Promise.resolve();});
 await act(async () => {for (let index = 0; index < 10; index++) await Promise.resolve();});
 return {player, onGranted, onClose};
}
it('shows the frozen poster and closes immediately once the editor acknowledgement and reward both succeed', async () => {
 const {onGranted, onClose} = await render();
 expect(document.querySelector('.gym-share-poster')?.getAttribute('src')).toBe('blob:poster-preview');
 expect(document.querySelector('input,textarea,[contenteditable]')).toBeNull();
 expect(document.querySelector('.poster-share-footer')?.querySelectorAll('button')).toHaveLength(1);
 await click('发帖分享');
 expect(mock.post).toHaveBeenCalledWith('传奇球馆｜预设标题', '由游戏提供的固定正文', expect.any(AbortSignal), expect.objectContaining({blob: expect.any(Blob)}));
 expect(onGranted).toHaveBeenCalledOnce();
 expect(onClose).toHaveBeenCalledOnce();
 expect(document.querySelector('.gym-share-dialog')).toBeNull();
 expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:poster-preview');
});
it('keeps the reward unclaimed and allows an explicit retry when uploading or opening fails', async () => {
 const {onGranted, onClose} = await render(); mock.post.mockRejectedValueOnce(Error('海报上传失败'));
 await click('发帖分享'); expect(onGranted).not.toHaveBeenCalled();
 expect(onClose).not.toHaveBeenCalled();
 expect(document.body.textContent).toContain('海报上传失败');
 expect(document.querySelector('.action-notice.poster-share-notice')?.parentElement).toBe(document.body);
 expect(document.querySelector('.gym-share-dialog .poster-share-notice')).toBeNull();
 await click('发帖分享'); expect(onGranted).toHaveBeenCalledOnce();
 expect(mock.generate).toHaveBeenCalledOnce();
 expect(onClose).toHaveBeenCalledOnce();
 expect(document.querySelector('.gym-share-dialog')).toBeNull();
});
it('waits for the reward to be saved before closing and prevents duplicate submissions in the meantime', async () => {
 let finish!: (granted: boolean) => void;
 const onGranted = vi.fn(() => new Promise<boolean>(resolve => {finish = resolve;}));
 const {onClose} = await render(onGranted);
 await click('发帖分享');
 expect(document.querySelector('.gym-share-dialog')).toBeTruthy();
 expect(onClose).not.toHaveBeenCalled();
 await click('正在打开发帖…');
 expect(mock.post).toHaveBeenCalledOnce(); expect(onGranted).toHaveBeenCalledOnce();
 await act(async () => {finish(true); for (let index = 0; index < 10; index++) await Promise.resolve();});
 expect(onClose).toHaveBeenCalledOnce(); expect(document.querySelector('.gym-share-dialog')).toBeNull();
});
it('keeps the dialog open when the editor opened but the reward is no longer eligible', async () => {
 const {onGranted, onClose} = await render(vi.fn(async () => false));
 await click('发帖分享');
 expect(onGranted).toHaveBeenCalledOnce(); expect(onClose).not.toHaveBeenCalled();
 expect(document.querySelector('.gym-share-dialog')).toBeTruthy();
 expect(document.body.textContent).toContain('球员状态已变化，奖励未领取');
});
it('does not award a late acknowledgement after the share dialog has closed', async () => {
 let finish!: (value: {editorOpened: boolean; simulated: boolean}) => void;
 mock.post.mockImplementation(() => new Promise(resolve => {finish = resolve;}));
 const {onGranted} = await render(); await click('发帖分享');
 act(() => root!.unmount()); root = null;
 await act(async () => {finish({editorOpened: true, simulated: false}); for (let index = 0; index < 10; index++) await Promise.resolve();});
 expect(onGranted).not.toHaveBeenCalled();
});
it('prepares the business challenge before opening the official editor, then grants only after acknowledgement', async () => {
 const order:string[]=[];
 const prepare=vi.fn(async()=>{order.push('prepare');}),grant=vi.fn(async()=>{order.push('grant');return true;});
 mock.post.mockImplementation(async()=>{order.push('editor');return {editorOpened:true,simulated:false};});
 await render(grant,prepare);await click('发帖分享');
 expect(order).toEqual(['prepare','editor','grant']);expect(prepare).toHaveBeenCalledOnce();
});
it('does not open an editor or grant a reward when challenge preparation fails', async () => {
 const prepare=vi.fn(async()=>{throw Error('领取准备失败，请稍后重试');});
 const {onGranted,onClose}=await render(vi.fn(async()=>true),prepare);await click('发帖分享');
 expect(prepare).toHaveBeenCalledOnce();expect(mock.post).not.toHaveBeenCalled();expect(onGranted).not.toHaveBeenCalled();expect(onClose).not.toHaveBeenCalled();
 expect(document.querySelector('.gym-share-dialog')).toBeTruthy();expect(document.body.textContent).toContain('领取准备失败');
});
it('ignores preparation that resolves after the share dialog was dismissed', async () => {
 let finish!:()=>void;const prepare=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));
 const {onGranted}=await render(vi.fn(async()=>true),prepare);await click('发帖分享');
 act(()=>root!.unmount());root=null;
 await act(async()=>{finish();for(let index=0;index<10;index++)await Promise.resolve();});
 expect(mock.post).not.toHaveBeenCalled();expect(onGranted).not.toHaveBeenCalled();
});

it('shows the revival poster above the defeat dialog and refuses simulated posting for real progress',async()=>{
 const onGranted=vi.fn(async()=>true);
 const onClose=vi.fn(),roster=[{id:'caruso',level:2},{id:'jordan',level:1},{id:'curry',level:3}];
 mock.post.mockResolvedValueOnce({editorOpened:true,simulated:true});
 root=createRoot(document.getElementById('root')!);
 await act(async()=>{
  root!.render(<GymShareDialog reason="revive" stage={12} roster={roster} allowSimulated={false} onClose={onClose} onGranted={onGranted}/>);
  for(let index=0;index<10;index++)await Promise.resolve();
 });
 await act(async()=>{for(let index=0;index<10;index++)await Promise.resolve();});
 expect(document.querySelector('.gym-share-dialog')?.getAttribute('data-dialog-depth')).toBe('2');
 expect(document.body.textContent).toContain('必定出现一名巨星');
 expect(mock.generate).toHaveBeenCalledWith({reason:'revive',stage:12,roster});
 await click('发帖分享');
 expect(onGranted).not.toHaveBeenCalled();expect(onClose).not.toHaveBeenCalled();
 expect(document.body.textContent).toContain('测试分享不能领取正式球馆奖励');
});
