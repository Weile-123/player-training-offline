import {describe,expect,it} from 'vitest';
import {NumberTween} from './numberTween';
describe('attribute counter',()=>{
 it('counts smoothly and keeps the gain color after completion and unchanged results',()=>{
  const n=new NumberTween(50);n.retarget(60,1000);
  expect(n.sample(1100)).toBeGreaterThan(50);expect(n.value).toBeLessThan(60);
  expect(n.sample(1420)).toBe(60);expect(n.direction).toBe('up');
  n.retarget(60,2000);expect(n.direction).toBe('up');
 });
 it('retargets a rapid second gain from the current display without resetting',()=>{
  const n=new NumberTween(50);n.retarget(60,1000);
  const midway=n.sample(1100);n.retarget(65,1100);
  expect(n.value).toBe(midway);expect(n.sample(1520)).toBe(65);
 });
 it('updates color based on the actual stat change even before a previous gain finishes',()=>{
  const n=new NumberTween(50);n.retarget(70,1000);n.retarget(65,1050);
  expect(n.direction).toBe('down');expect(n.sample(1470)).toBe(65);
  n.retarget(65,1800);expect(n.direction).toBe('down');
 });
 it('snaps for reduced motion, supports decimals and starts new players neutral',()=>{
  const n=new NumberTween(61.3);n.retarget(62.1,1000,true);
  expect(n.sample(1050)).toBe(62.1);expect(n.direction).toBe('up');
  n.retarget(59.6,1100);n.sample(1150);n.snap();
  expect(n.sample(1160)).toBe(59.6);expect(n.direction).toBe('down');
  expect(new NumberTween(40).direction).toBe('neutral');
 });
});
