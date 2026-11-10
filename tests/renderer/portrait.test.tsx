import {afterEach,expect,it,vi} from 'vitest';
import {createRoot} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {StarPortrait} from '../../src/components/PlayerTemplatePanel';
let root:ReturnType<typeof createRoot>;
afterEach(()=>{if(root)act(()=>root.unmount());vi.useRealTimers();});
const render=(src:string,fallbackSrc?:string)=>{
 if(!root)root=createRoot(document.getElementById('root')!);
 act(()=>root.render(<StarPortrait src={src} fallbackSrc={fallbackSrc} name="球员"/>));
};
const fail=()=>act(()=>document.querySelector('img')!.dispatchEvent(new Event('error')));
const exhaust=()=>{fail();act(()=>vi.advanceTimersByTime(500));fail();};
it('retries a bundled portrait when the platform image fails, without retrying forever',()=>{
 root=createRoot(document.getElementById('root')!);
 vi.useFakeTimers();
 render('https://example.invalid/photo.png','./art/poster-portraits/battier.png');
 exhaust();expect(document.querySelector('img')!.getAttribute('src')).toBe('./art/poster-portraits/battier.png');
 exhaust();expect(document.querySelector('img')).toBeNull();expect(document.querySelector('.template-silhouette')).toBeTruthy();
});
it('a failed player image does not suppress a new player image in the same list slot',()=>{
 root=createRoot(document.getElementById('root')!);
 vi.useFakeTimers();
 render('./failed.png');exhaust();expect(document.querySelector('img')).toBeNull();
 render('./next.png');expect(document.querySelector('img')!.getAttribute('src')).toBe('./next.png');
});
it('remounts the same image once after a transient failure and cancels pending retries on unmount',()=>{
 vi.useFakeTimers();root=createRoot(document.getElementById('root')!);
 render('./art/poster-portraits/tucker.png');const first=document.querySelector('img');
 fail();act(()=>vi.advanceTimersByTime(500));
 expect(document.querySelector('img')).not.toBe(first);
 expect(document.querySelector('img')!.getAttribute('src')).toBe('./art/poster-portraits/tucker.png');
 render('./other.png');fail();act(()=>root.unmount());expect(vi.getTimerCount()).toBe(0);
});
