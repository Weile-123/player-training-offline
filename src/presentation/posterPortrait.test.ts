import {afterEach,expect,it,vi} from 'vitest';
import {nbaTemplates} from '../game/templates';
import paths from '../data/poster-portraits.json';
import {loadPosterPortrait,posterPortrait} from './posterPortrait';

afterEach(()=>vi.unstubAllGlobals());
it('every template has a bundled PNG and its current tier, without cross-origin export dependencies',()=>{
 for(const template of nbaTemplates){
  const portrait=posterPortrait(template.id),path=(paths as Record<string,string>)[template.id];
  expect(portrait.src).not.toMatch(/^https?:/);expect(portrait.tier).toBe(template.tier);
  expect(path,template.id).toBe(`art/poster-portraits/${template.id}.png`);
 }
});
it('uses the exact in-game rookie atlas region and distinct high-potential artwork',()=>{
 expect(posterPortrait(null).crop).toEqual([62,922,233,255]);
 expect(posterPortrait(null).src).toContain('rookie-atlas.png');
 expect(posterPortrait(null,true).src).toContain('high-potential.png');
 expect(posterPortrait(null,true).crop).toBeUndefined();
});
it('stops export on a missing portrait instead of silently replacing a known player with a silhouette',async()=>{
 vi.stubGlobal('Image',class {onerror?:()=>void;set src(_value:string){queueMicrotask(()=>this.onerror?.());}});
 await expect(loadPosterPortrait('beverley')).rejects.toThrow('头像加载失败');
});
