import {afterEach, expect, it, vi} from 'vitest';

afterEach(() => {vi.unstubAllGlobals(); vi.unstubAllEnvs();});
function storage(value: string | null = null) {
 const values = new Map(value === null ? [] : [['legend-gym.local-debug.v1', value]]);
 return {getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, next: string) => {values.set(key, next);})};
}
async function setup(hostname: string, development: boolean, saved = storage()) {
 vi.resetModules(); vi.stubEnv('DEV', development); vi.stubGlobal('location', {hostname}); vi.stubGlobal('localStorage', saved);
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
 const saved = storage('{"skipPosting":true,"skipAds":true}');
 const debug = await setup('localhost', false, saved);
 expect(debug.gymDebugAvailable()).toBe(false);
 debug.toggleGymDebug('skipPosting'); debug.toggleGymDebug('skipAds');
 expect(debug.getGymDebug()).toEqual({skipPosting: false, skipAds: false});
 expect(saved.getItem).not.toHaveBeenCalled(); expect(saved.setItem).not.toHaveBeenCalled();
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

it('restores both flags on reload and persists switching either flag back off', async () => {
 const saved = storage(); let debug = await setup('localhost', true, saved);
 debug.toggleGymDebug('skipPosting'); debug.toggleGymDebug('skipAds');
 expect(JSON.parse(saved.getItem(debug.gymDebugStorageKey)!)).toEqual({skipPosting: true, skipAds: true});
 debug = await setup('localhost', true, saved);
 expect(debug.getGymDebug()).toEqual({skipPosting: true, skipAds: true});
 debug.toggleGymDebug('skipPosting'); debug.toggleGymDebug('skipAds');
 debug = await setup('localhost', true, saved);
 expect(debug.getGymDebug()).toEqual({skipPosting: false, skipAds: false});
});

it.each(['{broken', 'null', 'true', '[]', '{"skipPosting":"true","skipAds":1}'])('ignores corrupt or nonboolean persistent flags: %s', async value => {
 const debug = await setup('localhost', true, storage(value));
 expect(debug.getGymDebug()).toEqual({skipPosting: false, skipAds: false});
});

it('restores only explicit booleans and ignores unknown properties', async () => {
 const debug = await setup('localhost', true, storage('{"skipPosting":true,"skipAds":"true","enabled":true}'));
 expect(debug.getGymDebug()).toEqual({skipPosting: true, skipAds: false});
});

it('does not read or enable persisted flags on a nonlocal host', async () => {
 const saved = storage('{"skipPosting":true,"skipAds":true}');
 const debug = await setup('localhost.example.com', true, saved);
 debug.toggleGymDebug('skipAds');
 expect(debug.getGymDebug()).toEqual({skipPosting: false, skipAds: false});
 expect(saved.getItem).not.toHaveBeenCalled(); expect(saved.setItem).not.toHaveBeenCalled();
});

it('keeps local toggles usable if persistent storage cannot be read or written', async () => {
 const saved = storage();
 saved.getItem.mockImplementation(() => {throw Error('blocked storage');});
 saved.setItem.mockImplementation(() => {throw Error('full storage');});
 const debug = await setup('localhost', true, saved);
 expect(debug.getGymDebug()).toEqual({skipPosting: false, skipAds: false});
 expect(() => {debug.toggleGymDebug('skipPosting'); debug.toggleGymDebug('skipAds');}).not.toThrow();
 expect(debug.getGymDebug()).toEqual({skipPosting: true, skipAds: true});
});
