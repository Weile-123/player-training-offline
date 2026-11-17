import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
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
async function render(onGranted = vi.fn(async () => true)) {
 const player = newGym(Date.now(), 47).player!;
 root = createRoot(document.getElementById('root')!);
 await act(async () => {root!.render(<GymShareDialog player={player} value="456000" reason="levels" onClose={() => {}} onGranted={onGranted}/>); for (let index = 0; index < 10; index++) await Promise.resolve();});
 await act(async () => {for (let index = 0; index < 10; index++) await Promise.resolve();});
 return {player, onGranted};
}
it('shows the frozen generated poster and one share action without editable title or content', async () => {
 const {onGranted} = await render();
 expect(document.querySelector('.gym-share-poster')?.getAttribute('src')).toBe('blob:poster-preview');
 expect(document.querySelector('input,textarea,[contenteditable]')).toBeNull();
 expect(document.querySelector('.poster-share-footer')?.querySelectorAll('button')).toHaveLength(1);
 await click('发帖分享');
 expect(mock.post).toHaveBeenCalledWith('传奇球馆｜预设标题', '由游戏提供的固定正文', expect.any(AbortSignal), expect.objectContaining({blob: expect.any(Blob)}));
 expect(onGranted).toHaveBeenCalledOnce();
 expect(document.querySelector('.poster-share-footer button')?.textContent).toBe('已领取');
});
it('keeps the reward unclaimed and allows an explicit retry when uploading or opening fails', async () => {
 const {onGranted} = await render(); mock.post.mockRejectedValueOnce(Error('海报上传失败'));
 await click('发帖分享'); expect(onGranted).not.toHaveBeenCalled();
 expect(document.body.textContent).toContain('海报上传失败');
 await click('发帖分享'); expect(onGranted).toHaveBeenCalledOnce();
 expect(mock.generate).toHaveBeenCalledOnce();
});
it('does not award a late acknowledgement after the share dialog has closed', async () => {
 let finish!: (value: {editorOpened: boolean; simulated: boolean}) => void;
 mock.post.mockImplementation(() => new Promise(resolve => {finish = resolve;}));
 const {onGranted} = await render(); await click('发帖分享');
 act(() => root!.unmount()); root = null;
 await act(async () => {finish({editorOpened: true, simulated: false}); for (let index = 0; index < 10; index++) await Promise.resolve();});
 expect(onGranted).not.toHaveBeenCalled();
});
