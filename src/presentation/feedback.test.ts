import { describe,it,expect,vi } from 'vitest';
import { newGame,train,seededRandom } from '../game/engine';
import { statKeys,type Stats } from '../game/types';
import { decodePreferences,effectiveReducedMotion,shotFeedback,TrainingGate } from './feedback';
import { GameAudio,soundScore } from './audio';
const roll=(n:number)=>{let i=0;return()=>i++===0?n:.5;};
describe('训练表现与真实结算',()=>{
 it.each([[.05,'minor'],[.2,'hold'],[.5,'success'],[.99,'great'],[0,'severe']] as const)('%s 对应 %s，变化取自真实结果，不额外掷骰', (chance,outcome)=>{
  const g=newGame(seededRandom(123)),after=train(g,roll(chance)),f=shotFeedback(g,after)!;
  expect(f.outcome).toBe(outcome);expect(f.player.id).toBe(g.selectedId);expect(f.id).toBe(after.totalShots);expect(f.message).toBe(after.logs[0]);
  if(outcome==='severe'){expect(f.changes).toEqual({});expect(after.recruits.some(p=>p.id===f.player.id)).toBe(false);expect(after.cash).toBe(5000);expect(f.saleIncome).toBe(after.cash-g.cash);}
  else{const next=after.recruits[0];expect(f.levelGain).toBe(next.level-g.recruits[0].level);for(const k of statKeys)expect(f.changes[k]??0).toBe(next.stats[k]-g.recruits[0].stats[k]);}
 });
 it('跨越模板门槛显示首次匹配；无训练或结束后不产生反馈',()=>{
  const g=newGame(seededRandom(123));g.recruits[0].stats=Object.fromEntries(statKeys.map(k=>[k,44])) as Stats;g.recruits[0].templateId=null;
  expect(shotFeedback(g,train(g,roll(.99)))?.evolution?.kind).toBe('首次匹配');
  expect(shotFeedback(g,g)).toBeNull();expect(shotFeedback({...g,selectedId:null},g)).toBeNull();
 });
 it('动画尚未完成时快速连点，每次都立即独立结算，无时间冷却',()=>{
  let g=newGame(seededRandom(123));const gate=new TrainingGate(),commit=vi.fn(()=>g=train(g,roll(.5)));
  for(let i=0;i<50;i++)expect(gate.run(g,commit)).not.toBeNull();
  expect(commit).toHaveBeenCalledTimes(50);expect(g.totalShots).toBe(50);
 });
 it('重伤后下一次主动点击可训练当前新球员，无效动作和异常不阻塞后续点击',()=>{
  let g=newGame(seededRandom(123));const gate=new TrainingGate();gate.run(g,()=>g=train(g,()=>0));
  const next=g.recruits[0];const result=gate.run(g,()=>g=train(g,roll(.5)));expect(g.totalShots).toBe(2);expect(result?.player.id).toBe(next.id);
  gate.finish();expect(gate.run(g,()=>g)).toBeNull();expect(()=>gate.run(g,()=>{throw Error('failed');})).toThrow('failed');expect(gate.run(g,()=>g=train(g,roll(.5)))).not.toBeNull();
 });
 it('一次同步提交仍拒绝重入，返回后下一次独立点击立即可用',()=>{
  let g=newGame(seededRandom(123));const gate=new TrainingGate(),nested=vi.fn(()=>g=train(g,roll(.5)));
  gate.run(g,()=>{expect(gate.run(g,nested)).toBeNull();return g=train(g,roll(.5));});
  expect(nested).not.toHaveBeenCalled();expect(g.totalShots).toBe(1);
  expect(gate.run(g,nested)).not.toBeNull();expect(g.totalShots).toBe(2);
 });
 it('偏好默认开启音效、非法存档回退、系统减少动态效果优先',()=>{
  for(const raw of [null,'{','{}','{"version":1,"sound":"true","reducedMotion":false}'])expect(decodePreferences(raw)).toEqual({sound:true,reducedMotion:false});
  const p=decodePreferences('{"version":1,"sound":true,"reducedMotion":false}');expect(p.sound).toBe(true);expect(effectiveReducedMotion(p,true)).toBe(true);expect(effectiveReducedMotion(p,false)).toBe(false);
  expect(effectiveReducedMotion({...p,reducedMotion:true},false)).toBe(true);
 });
});
describe('离线合成音效',()=>{
 it('不同结果和解锁使用合法短音符',()=>{
  const cues=['severe','minor','hold','success','great','unlock','evolution','hot'] as const;
  for(const cue of cues)for(const note of soundScore(cue)){expect(note.frequency).toBeGreaterThan(0);expect(note.at).toBeGreaterThanOrEqual(0);expect(note.at+note.duration).toBeLessThan(1);}
  expect(soundScore('success')).not.toEqual(soundScore('severe'));
 });
 it('关闭音效不创建上下文，不支持音频时不抛出',async()=>{
  const create=vi.fn(()=>{throw Error('not supported');}),audio=new GameAudio(create);
  expect(await audio.play('success',false)).toBe(false);expect(create).not.toHaveBeenCalled();expect(await audio.play('great',true)).toBe(false);
 });
 it('用户开启后恢复上下文、复用上下文，静音释放资源',async()=>{
  const node={type:'sine',frequency:{setValueAtTime:vi.fn()},connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn(),onended:null};
  const ctx={state:'suspended',currentTime:1,destination:{},resume:vi.fn(async()=>{ctx.state='running';}),close:vi.fn(async()=>{}),createOscillator:vi.fn(()=>({...node})),createGain:vi.fn(()=>({gain:{setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()},connect:vi.fn(),disconnect:vi.fn()}))};
  const create=vi.fn(()=>ctx as unknown as AudioContext),audio=new GameAudio(create);
  expect(await audio.play('success',true)).toBe(true);expect(await audio.play('great',true)).toBe(true);expect(create).toHaveBeenCalledTimes(1);expect(ctx.resume).toHaveBeenCalledTimes(1);
  expect(ctx.createOscillator).toHaveBeenCalledTimes(5);audio.mute();expect(ctx.close).toHaveBeenCalledTimes(1);
 });
 it('音频恢复期间关闭音效，不在延迟完成后播放',async()=>{
  let resolve=()=>{};const pending=new Promise<void>(r=>{resolve=r;});
  const ctx={state:'suspended',resume:()=>pending,close:vi.fn(async()=>{}),createOscillator:vi.fn()};
  const audio=new GameAudio(()=>ctx as unknown as AudioContext),playing=audio.play('unlock',true);
  audio.mute();ctx.state='running';resolve();expect(await playing).toBe(false);expect(ctx.createOscillator).not.toHaveBeenCalled();
 });
});
