import {afterEach, expect, it, vi} from 'vitest';

afterEach(() => {vi.unstubAllGlobals(); vi.unstubAllEnvs();});
async function setup(hostname: string, development: boolean) {
 vi.resetModules(); vi.stubEnv('DEV', development); vi.stubGlobal('location', {hostname});
 return import('./gymDebug');
}

it.each(['localhost', '127.0.0.1', '::1', '[::1]'])('allows opt-in skips only on local development host %s', async hostname => {
 const debug = await setup(hostname, true);
 expect(debug.gymDebugAvailable()).toBe(true);
 expect(debug.getGymDebug()).toEqual({skipPosting: false, skipAds: false});
 debug.toggleGymDebug('skipPosting');
 expect(debug.getGymDebug()).toEqual({skipPosting: true, skipAds: false});
 debug.toggleGymDebug('skipAds');
 expect(debug.getGymDebug()).toEqual({skipPosting: true, skipAds: true});
 debug.toggleGymDebug('skipPosting');
 expect(debug.getGymDebug()).toEqual({skipPosting: false, skipAds: true});
});

it.each(['activity.example.com', 'localhost.example.com', '127.0.0.1.example.com', '192.168.1.2'])('refuses debug skips on nonlocal host %s', async hostname => {
 const debug = await setup(hostname, true);
 expect(debug.gymDebugAvailable()).toBe(false);
 debug.toggleGymDebug('skipPosting'); debug.toggleGymDebug('skipAds');
 expect(debug.getGymDebug()).toEqual({skipPosting: false, skipAds: false});
});

it('keeps the debug bypass unavailable in a production build even on localhost', async () => {
 const debug = await setup('localhost', false);
 expect(debug.gymDebugAvailable()).toBe(false);
 debug.toggleGymDebug('skipPosting'); debug.toggleGymDebug('skipAds');
 expect(debug.getGymDebug()).toEqual({skipPosting: false, skipAds: false});
});

it('does not expose previously enabled skip flags after leaving the local development context', async () => {
 const debug = await setup('localhost', true);
 debug.toggleGymDebug('skipPosting'); debug.toggleGymDebug('skipAds');
 vi.stubGlobal('location', {hostname: 'activity.example.com'});
 expect(debug.getGymDebug()).toEqual({skipPosting: false, skipAds: false});
});

it('is unavailable without a browser location', async () => {
 const debug = await setup('localhost', true);
 vi.stubGlobal('location', undefined);
 expect(debug.gymDebugAvailable()).toBe(false);
});
