import {afterEach, expect, it, vi} from 'vitest';
import activity from '../../hupu-skills/activity.json';
import type {HupuSdk} from './hupuSdk';

afterEach(() => {vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers();});
async function setup() {
 vi.resetModules();
 vi.stubEnv('DEV', true);
 const get = vi.fn<NonNullable<HupuSdk['bbsConfig']>['get']>().mockResolvedValue(null);
 const open = vi.fn<NonNullable<NonNullable<HupuSdk['request']>['bbs']>['openPostEditor']>().mockResolvedValue({code: 200, message: '编辑器已打开'});
 const sdk: HupuSdk = {request: {bbs: {openPostEditor: open}}, bbsConfig: {get}};
 vi.stubGlobal('location', {hostname: 'activity.example.com'});
 vi.stubGlobal('window', {location, ColorboxAI: sdk, __COLORBOX_AI_CONFIG__: {projectId: activity.activityId}});
 return {api: await import('./gymPosting'), sdk, get, open};
}
const deferred = <T,>() => {
 let resolve!: (value: T) => void;
 const promise = new Promise<T>(complete => {resolve = complete;});
 return {promise, resolve};
};

it('acknowledges the opened editor as success without requiring a publish callback', async () => {
 const {api, get, open} = await setup();
 await expect(api.openGymPost('培养纪录', '我培养出了一位球星')).resolves.toEqual({editorOpened: true, simulated: false});
 expect(get).not.toHaveBeenCalled();
 expect(api.gymPostDestination).toEqual({topicId:'871',tagId:'162117',topicName:'AI工坊',tagName:'传奇球馆'});
 expect(open).toHaveBeenCalledExactlyOnceWith({...api.gymPostDestination,title: '培养纪录', content: '我培养出了一位球星'});
 expect(api.gymPostTitle).toContain(activity.activityName);
});

it('never opens another activity editor or reads its BBS configuration', async () => {
 const {api, get, open} = await setup();
 window.__COLORBOX_AI_CONFIG__ = {projectId: 'app_0123456789'};
 await expect(api.openGymPost('培养纪录', '正文')).rejects.toThrow('虎扑活动配置与本项目不一致');
 expect(get).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
});

it.each([null, {}, {bbsTagId: undefined}, {bbsTagId: ''}, {bbsTagId: ' \t '}, {bbsTopicId: 'old-topic', bbsTagId: 'old-tag', bbsTopicName: '旧专区'}])('uses the explicitly requested activity destination regardless of host defaults (%j)', async config => {
 const {api, get, open} = await setup();
 get.mockResolvedValue(config);
 await api.openGymPost('标题', '正文');
 expect(open).toHaveBeenCalledExactlyOnceWith({...api.gymPostDestination,title: '标题', content: '正文'});
 expect(get).not.toHaveBeenCalled();
});

it('never queries or waits for host BBS configuration when the business destination is explicit', async () => {
 const {api, get, open} = await setup();
 get.mockRejectedValue(Error('host configuration unavailable'));
 await api.openGymPost('第一次', '正文');
 expect(open.mock.calls[0][0]).toEqual({...api.gymPostDestination,title: '第一次', content: '正文'});
 await api.openGymPost('第二次', '正文');
 expect(get).not.toHaveBeenCalled();
 expect(open.mock.calls[1][0]).toEqual({...api.gymPostDestination,title: '第二次', content: '正文'});
});

it('rechecks activity identity after awaiting poster upload', async () => {
 const {api, sdk, open} = await setup(), upload = deferred<{downloadUrl:string}>();
 sdk.oss={uploadFile:vi.fn(()=>upload.promise)};
 const result = expect(api.openGymPost('标题', '正文',undefined,{blob:new Blob(['png'],{type:'image/png'})})).rejects.toThrow('虎扑活动配置与本项目不一致');
 await vi.waitFor(() => expect(sdk.oss!.uploadFile).toHaveBeenCalledTimes(1));
 window.__COLORBOX_AI_CONFIG__ = {projectId: 'app_0123456789'};
 upload.resolve({downloadUrl:'https://example.com/poster.png'}); await result;
 expect(open).not.toHaveBeenCalled();
});

it('rejects an old editor acknowledgement if the host activity changed while opening it', async () => {
 const {api, open} = await setup(), editor = deferred<{code: number}>();
 open.mockReturnValueOnce(editor.promise);
 const result = expect(api.openGymPost('标题', '正文')).rejects.toThrow('虎扑活动配置与本项目不一致');
 await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
 window.__COLORBOX_AI_CONFIG__ = {projectId: 'app_0123456789'};
 editor.resolve({code: 200}); await result;
 expect(open).toHaveBeenCalledTimes(1);
});

it.each([403, 408, 429, 503])('surfaces editor failure %s without inventing a reward or retrying', async code => {
 const {api, open} = await setup();
 open.mockResolvedValueOnce({code, message: '请返回活动后重试'});
 await expect(api.openGymPost('标题', '正文')).rejects.toThrow('请返回活动后重试');
 expect(open).toHaveBeenCalledTimes(1);
});

it('needs no BBS configuration method but rejects an unavailable editor', async () => {
 const {api, sdk, open} = await setup();
 delete sdk.bbsConfig;
 await expect(api.openGymPost('标题', '正文')).resolves.toEqual({editorOpened:true,simulated:false});
 expect(open).toHaveBeenCalledExactlyOnceWith({...api.gymPostDestination,title:'标题',content:'正文'});
 delete sdk.request;
 await expect(api.openGymPost('标题', '正文')).rejects.toThrow('虎扑 App');
});

it('cancels before starting without making any host request', async () => {
 const {api, get, open} = await setup(), controller = new AbortController();
 controller.abort();
 await expect(api.openGymPost('标题', '正文', controller.signal)).rejects.toThrow('已取消分享');
 expect(get).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
});

it('cancels before starting and allows a later explicit retry with the fixed destination', async () => {
 const {api, open} = await setup(), controller = new AbortController();
 controller.abort();
 const result = expect(api.openGymPost('标题', '正文', controller.signal)).rejects.toThrow('已取消分享');
 await result;
 expect(open).not.toHaveBeenCalled();
 await expect(api.openGymPost('重试标题', '正文')).resolves.toEqual({editorOpened: true, simulated: false});
 expect(open).toHaveBeenCalledTimes(1);
});

it('does not return a reward receipt after the editor flow is cancelled while awaiting acknowledgement', async () => {
 const {api, open} = await setup(), editor = deferred<{code: number}>(), controller = new AbortController();
 open.mockReturnValueOnce(editor.promise);
 const result = expect(api.openGymPost('标题', '正文', controller.signal)).rejects.toThrow('已取消分享');
 await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
 controller.abort(); editor.resolve({code: 200}); await result;
 expect(open).toHaveBeenCalledTimes(1);
});

it('does not silently retry a rejected editor and releases the in-flight guard', async () => {
 const {api, open} = await setup();
 open.mockRejectedValueOnce(Error('编辑器请求失败'));
 await expect(api.openGymPost('标题', '正文')).rejects.toThrow('编辑器请求失败');
 expect(open).toHaveBeenCalledTimes(1);
 await expect(api.openGymPost('重试标题', '正文')).resolves.toEqual({editorOpened: true, simulated: false});
 expect(open).toHaveBeenCalledTimes(2);
});

it('times out an unacknowledged editor without a reward or automatic second invocation', async () => {
 vi.useFakeTimers();
 const {api, open} = await setup();
 open.mockImplementationOnce(() => new Promise(() => {}));
 const result = expect(api.openGymPost('标题', '正文')).rejects.toThrow('发帖编辑器响应超时');
 await vi.advanceTimersByTimeAsync(20_001); await result;
 expect(open).toHaveBeenCalledTimes(1);
 await expect(api.openGymPost('重试标题', '正文')).resolves.toEqual({editorOpened: true, simulated: false});
 expect(open).toHaveBeenCalledTimes(2);
 expect(vi.getTimerCount()).toBe(0);
});

it('blocks a simultaneous editor flow and releases its guard after completion', async () => {
 const {api, open} = await setup(), editor = deferred<{code: number}>();
 open.mockReturnValueOnce(editor.promise);
 const first = api.openGymPost('第一次', '正文');
 await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
 await expect(api.openGymPost('重复点击', '正文')).rejects.toThrow('发帖正在处理中');
 editor.resolve({code: 200}); await first;
 await api.openGymPost('第二次', '正文');
 expect(open).toHaveBeenCalledTimes(2);
});

it('clips title and content by Unicode code point rather than breaking emoji', async () => {
 const {api, open} = await setup();
 await api.openGymPost('🏀'.repeat(100), '🏀'.repeat(1600));
 expect(open.mock.calls[0][0]).toEqual({...api.gymPostDestination,title: '🏀'.repeat(80), content: '🏀'.repeat(1500)});
});

it('uses a local-only explicit posting bypass without calling the host', async () => {
 const {api, get, open} = await setup();
 vi.stubGlobal('location', {hostname: 'localhost'});
 const debug = await import('./gymDebug'); debug.toggleGymDebug('skipPosting');
 await expect(api.openGymPost('标题', '正文')).resolves.toEqual({editorOpened: true, simulated: true});
 expect(get).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
});

it('uploads a PNG with the official OSS method before opening the configured editor', async () => {
 const {api, sdk, open} = await setup(), order: string[] = [], stage = vi.fn();
 sdk.oss = {uploadFile: vi.fn(async () => {order.push('upload'); return {downloadUrl: 'https://i2.hoopchina.com.cn/my-gym-poster.png'};})};
 open.mockImplementation(async () => {order.push('open'); return {code: 200};});
 const blob = new Blob(['poster'], {type: 'image/png'});
 await api.openGymPost('固定标题', '固定正文', undefined, {blob, onStage: stage});
 expect(order).toEqual(['upload', 'open']);
 expect(sdk.oss.uploadFile).toHaveBeenCalledWith({file: blob, filename: expect.stringMatching(/^legend-gym-\d+\.png$/)});
 expect(open).toHaveBeenCalledWith({...api.gymPostDestination,title: '固定标题', content: '固定正文', imageUrl: 'https://i2.hoopchina.com.cn/my-gym-poster.png'});
 expect(stage.mock.calls.map(call => call[0])).toEqual(['uploading', 'opening']);
});

it('reuses an uploaded poster after an editor failure and never reuploads on an explicit retry', async () => {
 const {api, sdk, open} = await setup();
 sdk.oss = {uploadFile: vi.fn(async () => ({downloadUrl: 'https://i2.hoopchina.com.cn/poster.png'}))};
 const blob = new Blob(['poster'], {type: 'image/png'});
 open.mockResolvedValueOnce({code: 503, message: '稍后再试'});
 await expect(api.openGymPost('标题', '正文', undefined, {blob})).rejects.toThrow('稍后再试');
 await api.openGymPost('标题', '正文', undefined, {blob});
 expect(sdk.oss.uploadFile).toHaveBeenCalledOnce(); expect(open).toHaveBeenCalledTimes(2);
});

it.each(['http://example.com/image.png', 'data:image/png;base64,eA==', 'https://user:pass@example.com/image.png', 'not-a-url'])('rejects an invalid uploaded poster URL %s before opening an editor', async url => {
 const {api, sdk, open} = await setup(); sdk.oss = {uploadFile: vi.fn(async () => ({downloadUrl: url}))};
 await expect(api.openGymPost('标题', '正文', undefined, {blob: new Blob(['png'], {type: 'image/png'})})).rejects.toThrow();
 expect(open).not.toHaveBeenCalled();
});

it('never opens an editor or grants a receipt when poster upload fails or is cancelled', async () => {
 const {api, sdk, open} = await setup(), upload = deferred<{downloadUrl: string}>(), controller = new AbortController();
 sdk.oss = {uploadFile: vi.fn(() => upload.promise)};
 const task = expect(api.openGymPost('标题', '正文', controller.signal, {blob: new Blob(['png'], {type: 'image/png'})})).rejects.toThrow('已取消分享');
 await vi.waitFor(() => expect(sdk.oss!.uploadFile).toHaveBeenCalledOnce());
 controller.abort(); upload.resolve({downloadUrl: 'https://example.com/poster.png'}); await task;
 expect(open).not.toHaveBeenCalled();
 sdk.oss.uploadFile = vi.fn(async () => {throw Error('上传失败');});
 await expect(api.openGymPost('标题', '正文', undefined, {blob: new Blob(['png'], {type: 'image/png'})})).rejects.toThrow('上传失败');
 expect(open).not.toHaveBeenCalled();
});
