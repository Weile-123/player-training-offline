import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {HomeSettings} from '../../src/components/HomeSettings';
import {cloudSync} from '../../src/platform/cloudSync';
import {gymCloudSync} from '../../src/platform/gymCloudSync';
import {useGym} from '../../src/gymStore';
import {newGym} from '../../src/game/gym/engine';
import {encodeGym} from '../../src/game/gym/save';
import {hupuProject} from '../../src/platform/hupuProject';
import {decodePreferences, presentationConfig} from '../../src/presentation/feedback';
import {saveSoundEnabled} from '../../src/presentation/sampleAudio';

vi.mock('../../src/gymStore', async importOriginal => {
 const actual = await importOriginal<typeof import('../../src/gymStore')>();
 const values = new Map<string, string>();
 return {...actual, useGym: actual.createGymStore({getItem: key => values.get(key) ?? null, setItem: (key, value) => {values.set(key, value);}}, 17, () => 1000)};
});
vi.mock('../../src/platform/cloudSync', () => ({cloudSync: {start: vi.fn(), subscribe: vi.fn(), getSnapshot: vi.fn(), cancelSync: vi.fn()}, cloudProgress: vi.fn()}));
vi.mock('../../src/presentation/audio', () => ({gameAudio: {unlock: vi.fn(), play: vi.fn(async () => {}), mute: vi.fn()}}));

let root: Root | null = null;
let getUser: ReturnType<typeof vi.fn>, load: ReturnType<typeof vi.fn>, save: ReturnType<typeof vi.fn>;
beforeEach(async () => {
 vi.clearAllMocks(); localStorage.clear(); saveSoundEnabled(true); gymCloudSync.cancelSync();
 useGym.setState({authorityMode:undefined,authorityMessage:'',authorityCapabilities:undefined,retryAuthority:undefined});
 await useGym.getState().start();
 getUser = vi.fn(async () => ({code: 200, data: {islogin: 0}}));
 load = vi.fn(async () => ({code: 200, data: null})); save = vi.fn(async () => ({code: 200}));
 window.__COLORBOX_AI_CONFIG__ = {projectId: hupuProject.applicationId};
 window.ColorboxAI = {auth: {getUserInfo: getUser}, cloudSave: {load, save}};
});
afterEach(() => {
 if (root) act(() => root!.unmount()); root = null; gymCloudSync.cancelSync();
 delete window.ColorboxAI; delete window.__COLORBOX_AI_CONFIG__;
});
async function mount(onClose = () => {}) {
 root = createRoot(document.getElementById('root')!);
 await act(async () => {root!.render(<HomeSettings cloudEnabled={false} onClose={onClose}/>); for(let i=0;i<20;i++)await Promise.resolve();});
 await act(async () => {for(let i=0;i<50;i++)await Promise.resolve();});
}
async function press(name: string) {
 const buttons=[...document.querySelectorAll<HTMLButtonElement>('button')];
 const control = buttons.find(button => button.textContent === name || button.getAttribute('aria-label') === name) ?? buttons.find(button=>button.textContent?.includes(name));
 expect(control, name).toBeTruthy(); await act(async () => {control!.click(); for(let i=0;i<20;i++)await Promise.resolve();});
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
}
const loggedIn = () => getUser.mockResolvedValue({code: 200, data: {islogin: 1, puid: 'coach', nickname: '球馆教练'}});

it('reuses original account and cloud settings with a gym coordinator and omits motion and tutorial controls', async () => {
 let closed = 0; await mount(() => {closed++;});
 expect(document.querySelector('.home-settings-dialog')).toBeTruthy(); expect(document.querySelector('.settings-account')).toBeTruthy();
 expect(document.querySelectorAll('.tutorial-switch')).toHaveLength(1);
 expect(document.body.textContent).toContain('云存档'); expect(document.body.textContent).toContain('游戏音效');
 expect(document.body.textContent).not.toContain('减少动态效果'); expect(document.body.textContent).not.toContain('新手教程');
 expect(document.querySelector('[aria-label="离线训练"]')).toBeNull();
 expect(cloudSync.start).not.toHaveBeenCalled(); expect(cloudSync.getSnapshot).not.toHaveBeenCalled();
 expect(getUser).toHaveBeenCalledOnce(); expect(load).not.toHaveBeenCalled();
 await press('关闭面板'); expect(closed).toBe(1);
});
it('preserves the original sound switch and feedback page without exposing a motion preference', async () => {
 await mount(); const sound = document.querySelector<HTMLButtonElement>('[aria-labelledby="sound-switch-label"]')!;
 await act(async () => sound.click()); expect(sound.getAttribute('aria-checked')).toBe('false');
 expect(decodePreferences(localStorage.getItem(presentationConfig.preferenceKey))).toEqual({sound: false, reducedMotion: false});
 expect(document.querySelector('[aria-labelledby="motion-switch-label"]')).toBeNull();
 await press('意见反馈'); expect(document.querySelector('.hupu-feedback-form')).toBeTruthy();
});
it('fetches the actual account and slot snapshot on open, then uploads gym data only after clicking upload', async () => {
 loggedIn(); await mount();
 expect(document.body.textContent).toContain('球馆教练'); expect(document.body.textContent).toContain('暂无云存档');
 expect(load).toHaveBeenCalledExactlyOnceWith({slot: 1}); expect(save).not.toHaveBeenCalled();
 await press('上传'); expect(save).toHaveBeenCalledOnce();
 expect(save.mock.calls[0][0]).toMatchObject({slot: 1});
 const uploaded = JSON.parse(save.mock.calls[0][0].value); expect(uploaded).toMatchObject({format: 'legend-gym-cloud-v1', applicationId: hupuProject.applicationId});
 expect(document.body.textContent).toContain('上传成功'); expect(cloudSync.start).not.toHaveBeenCalled();
 expect(document.querySelector('.action-notice.settings-notice')?.parentElement).toBe(document.body);
 expect(document.querySelector('.home-settings .settings-notice')).toBeNull();
});
it('shows a gym-specific preview and restores cloud progress only after confirmation', async () => {
 loggedIn(); const remote = newGym(900, 88); remote.fame = 345; remote.credits = 37;
 const raw = JSON.stringify({format: 'legend-gym-cloud-v1', applicationId: hupuProject.applicationId, uploadedAt: 2000, gym: encodeGym(remote)});
 load.mockResolvedValue({code: 200, data: raw}); await mount();
 const originalSeed = useGym.getState().state.seed;
 await press('同步'); expect(document.querySelector('.cloud-confirm-dialog')).toBeTruthy();
 expect(document.querySelector('.cloud-confirm-dialog')?.textContent).toContain('声望 345');
 expect(useGym.getState().state.seed).toBe(originalSeed);
 await press('确认同步'); expect(useGym.getState().state).toMatchObject({seed: 88, fame: 345, credits: 37});
 expect(document.querySelector('.cloud-confirm-dialog')).toBeNull(); expect(document.body.textContent).toContain('同步成功');
});
it('keeps malformed cloud data from enabling an upload or replacing the local gym', async () => {
 loggedIn(); load.mockResolvedValue({code: 200, data: 'legacy-or-corrupt'}); const before = useGym.getState().state;
 await mount(); expect(document.body.textContent).toContain('这不是有效的传奇球馆云存档');
 const upload = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '上传')!;
 expect(upload.disabled).toBe(true); expect(useGym.getState().state).toBe(before); expect(save).not.toHaveBeenCalled();
});

it('omits the technical offline connection panel even when legacy connection metadata exists', async () => {
 const retry=vi.fn().mockRejectedValue(Error('SHAPER_TOKEN backend detail'));
 useGym.setState({authorityMode:'error',authorityMessage:'SHAPER_TOKEN config detail',retryAuthority:retry});
 await mount();
 expect(document.querySelector('[aria-label="离线训练"]')).toBeNull();
 expect(document.body.textContent).not.toContain('重新连接');
 expect(document.body.textContent).not.toContain('SHAPER_TOKEN');
 expect(retry).not.toHaveBeenCalled();
});

it('keeps manual cloud backup and restore available without a platform gameplay lock', async () => {
 loggedIn();useGym.setState({authorityMode:'timeflow',authorityMessage:'平台离线训练已连接'});
 await mount();
 const syncButton=[...document.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='同步')!;
 const upload=[...document.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='上传')!;
 expect(syncButton.disabled).toBe(false);expect(upload.disabled).toBe(false);
 expect(document.body.textContent).toContain('进度自动保存在本机');
 expect(document.body.textContent).not.toContain('重新连接');
 await press('上传');expect(save).toHaveBeenCalledOnce();
});

it('refreshes only account/cloud information without awaiting gameplay connection',async()=>{
 const retry=vi.fn(async()=>new Promise<void>(()=>{}));
 useGym.setState({authorityMode:'local',retryAuthority:retry});await mount();
 loggedIn();await press('刷新账号');
 expect(document.body.textContent).toContain('球馆教练');
 expect(retry).not.toHaveBeenCalled();
 const refresh=[...document.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='刷新账号')!;
 expect(refresh.disabled).toBe(false);
});
