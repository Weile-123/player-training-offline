import {afterEach, expect, it, vi} from 'vitest';
import activity from '../../hupu-skills/activity.json';

afterEach(() => {vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers();});
async function setup(hostname = 'activity.example.com') {
 vi.resetModules();
 const append = vi.fn(), createElement = vi.fn();
 vi.stubGlobal('window', {location: {hostname}, __COLORBOX_AI_CONFIG__: {projectId: activity.activityId}});
 vi.stubGlobal('document', {createElement, head: {append}});
 return {api: await import('./hupuSdk'), append, createElement};
}

it('uses this project host SDK without replacing it or loading a legacy script', async () => {
 const {api, append, createElement} = await setup();
 const injected = {auth: {getUserInfo: vi.fn()}};
 window.ColorboxAI = injected;
 await Promise.all([api.ensureColorboxSdk(), api.ensureColorboxSdk()]);
 expect(window.ColorboxAI).toBe(injected);
 expect(createElement).not.toHaveBeenCalled(); expect(append).not.toHaveBeenCalled();
});

it('fails clearly until the host injects its SDK, then permits an explicit retry', async () => {
 const {api, append, createElement} = await setup();
 await expect(api.ensureColorboxSdk()).rejects.toThrow('虎扑服务尚未就绪');
 expect(createElement).not.toHaveBeenCalled(); expect(append).not.toHaveBeenCalled();
 window.ColorboxAI = {};
 await expect(api.ensureColorboxSdk()).resolves.toBeUndefined();
});

it.each(['localhost', '127.0.0.1', '::1', '[::1]'])('keeps a %s preview offline unless an SDK is explicitly injected', async hostname => {
 const {api, append} = await setup(hostname);
 await expect(api.ensureColorboxSdk()).rejects.toThrow('本地预览不连接虎扑服务');
 window.ColorboxAI = {};
 await expect(api.ensureColorboxSdk()).resolves.toBeUndefined();
 expect(append).not.toHaveBeenCalled();
});

it('refuses an SDK from a different activity even when available', async () => {
 const {api, append} = await setup();
 window.ColorboxAI = {auth: {getUserInfo: vi.fn()}};
 window.__COLORBOX_AI_CONFIG__ = {projectId: 'app_0123456789'};
 await expect(api.ensureColorboxSdk()).rejects.toThrow('虎扑活动配置与本项目不一致');
 expect(append).not.toHaveBeenCalled();
});

it('uses the skill package public activity identity instead of an old environment override', async () => {
 vi.stubEnv('VITE_HUPU_ACTIVITY_ID', 'app_0123456789');
 await setup();
 const {hupuProject} = await import('./hupuProject');
 expect(hupuProject).toEqual({applicationId: activity.activityId, name: activity.activityName});
 expect(Object.isFrozen(hupuProject)).toBe(true);
});

it('does not leave a deadline timer running after a successful SDK response', async () => {
 vi.useFakeTimers(); const {api} = await setup();
 await expect(api.sdkDeadline(Promise.resolve({code: 200}))).resolves.toEqual({code: 200});
 expect(vi.getTimerCount()).toBe(0);
});

it('surfaces an explicit deadline once without retrying the SDK operation', async () => {
 vi.useFakeTimers(); const {api} = await setup();
 const call = vi.fn(() => new Promise<never>(() => {}));
 const result = expect(api.sdkDeadline(call(), '编辑器响应超时')).rejects.toThrow('编辑器响应超时');
 await vi.advanceTimersByTimeAsync(20_001); await result;
 expect(call).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
});
