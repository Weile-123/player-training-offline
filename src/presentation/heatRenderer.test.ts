import {expect,it} from 'vitest';
import {stepHeat} from './heatRenderer.js';
it('热浪渐入与渐出可从中间强度反向衔接，不跳到端点',()=>{
 let level=stepHeat(0,true,210);
 expect(level).toBeCloseTo(.5);
 level=stepHeat(level,false,190);
 expect(level).toBeCloseTo(.25);
 expect(stepHeat(level,true,42)).toBeCloseTo(.35);
 expect(stepHeat(1,false,759)).toBeGreaterThan(0);
 expect(stepHeat(1,false,760)).toBe(0);
 expect(stepHeat(0,true,500)).toBe(1);
});
it('简化动画即时应用火热状态，负时间不倒放',()=>{
 expect(stepHeat(.2,true,0,true)).toBe(1);
 expect(stepHeat(.8,false,0,true)).toBe(0);
 expect(stepHeat(.3,true,-10)).toBe(.3);
 expect(stepHeat(.3,false,-10)).toBe(.3);
});
