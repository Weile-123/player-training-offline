import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {nbaTemplates} from '../../src/game/templates';
const api = vi.hoisted(() => ({list: vi.fn(), sync: vi.fn(), configured: false, message: '',localMode:false}));
vi.mock('../../src/platform/gymLeaderboard', () => ({gymLeaderboard: {list: api.list, sync: api.sync, subscribe: () => () => {}, getMessage: () => api.message}, gymLeaderboardConfigured: () => api.configured, gymRankReference: () => ({runId: 'run', revision: 1})}));
vi.mock('../../src/gymStore', () => {const getState=()=>({hasSave:true,state:{},authorityMode:api.localMode?'local':undefined});return{useGym:Object.assign((selector:(state:ReturnType<typeof getState>)=>unknown)=>selector(getState()),{getState})};});
import {GymLeaderboard} from '../../src/components/GymLeaderboard';
let root: Root | null = null;
const template = nbaTemplates[0], best = {playerId: 'gym-p1', templateId: template.id, value: '123456789', level: 25, stats: template.stats};
const playerRow = {id: 'first', coach: '虎扑教练', score: best.value, best};
const fameRow = {id: 'first', coach: '虎扑教练', score: '2580', best: null};
beforeEach(() => {api.list.mockReset(); api.sync.mockReset().mockResolvedValue(true); api.configured = false; api.message = '';api.localMode=false;});
afterEach(() => {if (root) act(() => root!.unmount()); root = null;});
async function flush() {await act(async () => {for (let i = 0; i < 15; i++) await Promise.resolve();});}
async function mount() {root = createRoot(document.getElementById('root')!); await act(async () => root!.render(<GymLeaderboard/>)); await flush();}
async function click(name: string) {const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === name)!; await act(async () => button.click()); await flush();}

it('uses the original two-tab layout and highlights the first three positions', async () => {
 const entries = Array.from({length: 4}, (_, index) => ({...playerRow, id: `row-${index}`}));
 api.list.mockResolvedValue({entries, me: {rank: 2, entry: playerRow}}); await mount();
 expect(document.querySelector('.leaderboard-tabs')?.getAttribute('data-index')).toBe('0');
 expect(document.body.textContent).toContain('球员榜'); expect(document.body.textContent).toContain('声望榜');
 expect(document.querySelector('.online-personal.is-player')?.textContent).toContain('第 2 名');
 expect(document.querySelectorAll('.player-ranking > li')).toHaveLength(4);
 expect([...document.querySelectorAll('.leaderboard-rank')].map(node => node.getAttribute('data-place'))).toEqual(['1', '2', '3', '4']);
 expect(document.querySelector('.leaderboard-template')?.textContent).toContain(template.name);
 expect(api.list).toHaveBeenCalledExactlyOnceWith('player');
});
it('switches to the fame board and keeps its count and personal ranking visible', async () => {
 api.list.mockImplementation(async board => board === 'player' ? {entries: [playerRow], me: null} : {entries: [fameRow], me: {rank: 1, entry: fameRow}});
 await mount(); await click('声望榜');
 expect(document.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe('声望榜');
 expect(document.querySelector('.endless-ranking')?.textContent).toContain('2580 声望');
 expect(document.querySelector('.personal-score')?.textContent).toBe('2580 声望');
 expect(document.querySelector('.player-ranking')).toBeNull();
});
it('shows a real connection error and permits an explicit retry', async () => {
 api.list.mockRejectedValueOnce(Error('排行榜服务尚未连接')).mockResolvedValue({entries: [], me: null});
 await mount(); expect(document.querySelector('[role=alert]')?.textContent).toBe('排行榜服务尚未连接');
 await click('刷新排行榜'); expect(document.body.textContent).toContain('暂无已提交的成绩'); expect(api.list).toHaveBeenCalledTimes(2);
});
it('shows public scores and a personal-ranking error without claiming the user has no rank', async () => {
 api.list.mockResolvedValue({entries: [playerRow], me: null, personalError: '个人排名暂不可用，请刷新重试；公开榜单仍可查看。'});
 await mount();
 expect(document.querySelector('.player-ranking > li')?.textContent).toContain('虎扑教练');
 expect(document.querySelector('.online-personal')?.textContent).toContain('暂未获取排名');
 expect(document.querySelector('.action-notice[role=alert]')?.textContent).toContain('个人排名暂不可用');
 expect(document.querySelector('.action-notice')?.parentElement).toBe(document.body);
 expect(document.querySelector('.leaderboard .action-notice')).toBeNull();
});
it('syncs only a reference when a real backend is configured, and still shows public scores with the explicit sync message', async () => {
 api.configured = true; api.message = '暂无已验证的球馆成绩'; api.sync.mockRejectedValue(Error(api.message));
 api.list.mockResolvedValue({entries: [playerRow], me: null});
 await mount(); expect(api.sync).toHaveBeenCalledExactlyOnceWith({runId: 'run', revision: 1});
 expect(document.querySelector('.player-ranking')).toBeTruthy(); expect(document.querySelector('.action-notice[role=alert]')?.textContent).toBe(api.message);
});
it('never replaces the selected tab with a late result from a different board', async () => {
 let release!: (result: unknown) => void;
 api.list.mockImplementationOnce(() => new Promise(resolve => {release = resolve;})).mockResolvedValue({entries: [fameRow], me: null});
 await mount(); await click('声望榜'); await act(async () => release({entries: [playerRow], me: null})); await flush();
 expect(document.querySelector('.endless-ranking')?.textContent).toContain('2580'); expect(document.querySelector('.player-ranking')).toBeNull();
});
it('keeps an explicit synchronization rejection as an alert regardless of message wording while retaining public results',async()=>{
 api.configured=true;api.message='请求次数已用尽';api.sync.mockRejectedValue(Error(api.message));api.list.mockResolvedValue({entries:[playerRow],me:null});
 await mount();
 expect(document.querySelector('.action-notice.leaderboard-action-notice[role=alert]')?.textContent).toBe(api.message);
 expect(document.querySelector('.player-ranking > li')).toBeTruthy();expect(document.querySelector('.leaderboard .action-notice')).toBeNull();
});

it('submits current local-first progress before reading rankings rather than displaying an obsolete cloud branch',async()=>{
 api.localMode=true;api.configured=true;api.sync.mockResolvedValue(true);
 api.list.mockResolvedValue({entries:[playerRow],me:null});await mount();
 expect(api.sync).toHaveBeenCalledExactlyOnceWith({runId:'run',revision:1});expect(api.list).toHaveBeenCalledExactlyOnceWith('player');
 expect(api.sync.mock.invocationCallOrder[0]).toBeLessThan(api.list.mock.invocationCallOrder[0]);
 expect(document.querySelector('.player-ranking > li')?.textContent).toContain('虎扑教练');
 expect(document.body.textContent).toContain('本机培养成果经服务器校验后更新排名');
});

it('shares one confirmed submission across both boards and submits again only on explicit refresh',async()=>{
 api.localMode=true;api.configured=true;
 let confirm!:(accepted:boolean)=>void;
 api.sync.mockImplementationOnce(()=>new Promise(resolve=>{confirm=resolve;}));
 api.list.mockImplementation(async board=>({entries:[board==='player'?playerRow:fameRow],me:null}));
 await mount();await click('声望榜');
 expect(api.sync).toHaveBeenCalledTimes(1);expect(api.list).not.toHaveBeenCalled();
 await act(async()=>confirm(true));await flush();
 expect(document.querySelector('.endless-ranking')?.textContent).toContain('2580');
 await click('球员榜');expect(api.sync).toHaveBeenCalledTimes(1);
 await click('刷新排行榜');expect(api.sync).toHaveBeenCalledTimes(2);
});
