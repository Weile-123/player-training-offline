import {afterEach,expect,it,vi} from 'vitest';
import {saveTutorialEnabled,tutorialEnabled} from './tutorialPreference';

afterEach(()=>vi.unstubAllGlobals());
it('enables the tutorial on a fresh device and remembers only an explicit opt-out',()=>{
 const data=new Map<string,string>();
 vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value)});
 expect(tutorialEnabled()).toBe(true);
 saveTutorialEnabled(false);expect(tutorialEnabled()).toBe(false);
 saveTutorialEnabled(true);expect(tutorialEnabled()).toBe(true);
});
it('defaults to enabled when browser storage is unavailable',()=>{
 vi.stubGlobal('localStorage',{getItem:()=>{throw Error('blocked');}});
 expect(tutorialEnabled()).toBe(true);
});
