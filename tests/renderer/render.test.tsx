import {afterEach,it,expect,vi} from 'vitest';
import {createRoot} from 'react-dom/client';
import {useState,useSyncExternalStore,lazy,Suspense} from 'react';
import {act} from 'preact/test-utils';
import {ComicDialog} from '../../src/components/ComicDialog';
import {GameIcon} from '../../src/components/GameIcon';
import {ContractLeaderboard} from '../../src/components/ContractLeaderboard';
import {useContract} from '../../src/contractStore';
import ContractHome from '../../src/components/ContractHome';
import {RewardedAdButton} from '../../src/components/RewardedAdButton';
import {MonthTransitionDialog} from '../../src/components/MonthTransitionDialog';
let root:ReturnType<typeof createRoot>;
function mount(node:React.ReactNode){root=createRoot(document.getElementById('root')!);act(()=>root.render(node));}
afterEach(()=>{if(root)act(()=>root.unmount());vi.unstubAllGlobals();});
it('creates SVG instances, updates attributes and nests HTML inside foreignObject',()=>{
 function Scene(){const [n,set]=useState(1);return <><button onClick={()=>set(n+1)}>next</button><svg viewBox="0 0 50 50"><circle r={n}/><foreignObject><div>inside</div></foreignObject></svg><GameIcon name="bag"/></>;}
 mount(<Scene/>);const svg=document.querySelector('#root svg')!,circle=svg.querySelector('circle')!;
 expect(svg).toBeInstanceOf(SVGElement);expect(circle).toBeInstanceOf(SVGElement);expect(svg.querySelector('foreignObject div')).toBeInstanceOf(HTMLElement);
 act(()=>document.querySelector<HTMLButtonElement>('#root button')!.click());expect(circle.getAttribute('r')).toBe('2');
});
it('updates controlled inputs, external stores, and cleans subscriptions',()=>{
 let value=0;const listeners=new Set<()=>void>();const subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
 function Scene(){const n=useSyncExternalStore(subscribe,()=>value),[text,set]=useState('');return <><input value={text} onChange={e=>set(e.currentTarget.value)}/><span>{n}:{text}</span></>;}
 mount(<Scene/>);const input=document.querySelector('input')!;
 act(()=>{input.value='hello';input.dispatchEvent(new Event('input',{bubbles:true}));value=3;listeners.forEach(fn=>fn());});
 expect(document.querySelector('#root span')!.textContent).toBe('3:hello');act(()=>root.unmount());expect(listeners.size).toBe(0);
});
it('opens and closes a real portal dialog and its SVG close button',()=>{
 function Scene(){const [open,set]=useState(true);return open?<ComicDialog title="测试弹窗" onClose={()=>set(false)}><p>内容</p></ComicDialog>:<p>已关闭</p>;}
 mount(<Scene/>);expect(document.querySelector('[role="dialog"]')).toBeTruthy();
 act(()=>document.querySelector<HTMLButtonElement>('[aria-label="关闭面板"]')!.click());expect(document.querySelector('[role="dialog"]')).toBeNull();expect(document.body.textContent).toContain('已关闭');
});
it('resolves lazy content through Suspense',async()=>{
 const Lazy=lazy(async()=>({default:()=> <b>ready</b>}));
 await act(async()=>mount(<Suspense fallback={<i>waiting</i>}><Lazy/></Suspense>));expect(document.querySelector('#root')!.textContent).toBe('ready');
});
it('renders both leaderboard tabs with live store updates',async()=>{
 useContract.getState().debugAct('mock-leaderboard');
 await act(async()=>mount(<ContractLeaderboard/>));expect(document.querySelectorAll('.leaderboard-list li')).toHaveLength(50);
 await act(async()=>document.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click());expect(document.querySelector('.personal-tags')!.textContent).toContain('综评');
});
it('rejects raw HTML instead of using an HTML parsing sink',()=>{
 expect(()=>mount(<div dangerouslySetInnerHTML={{__html:'<img onerror="bad()">'}}/>)).toThrow('Raw HTML rendering is disabled');
 expect(document.querySelector('#root img')).toBeNull();
});
it('opens and closes actual home panels without leaving portal nodes behind',async()=>{
 await act(async()=>mount(<ContractHome/>));
 expect(document.querySelector('[aria-label="公告"]')).toBeNull();
 for(const label of ['设置','球星图鉴','排行榜','生涯']){
  await act(async()=>document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click());
  expect(document.querySelector('[role="dialog"]'),label).toBeTruthy();
  const close=document.querySelector<HTMLButtonElement>('[aria-label="关闭面板"]')??document.querySelector<HTMLButtonElement>('[aria-label="关闭"]');
  expect(close,label).toBeTruthy();await act(async()=>close!.click());expect(document.querySelector('[role="dialog"]'),label).toBeNull();
 }
});
it('enters a saved career and opens inventory, shop and collection using the new renderer',async()=>{
 useContract.getState().start();await act(async()=>mount(<ContractHome/>));
 await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="继续游戏"]')!.click());
 expect(document.querySelector('[aria-label="球员交付制训练营"]')).toBeTruthy();
 const gift=document.querySelector<HTMLButtonElement>('.first-gift-option');if(gift)await act(async()=>gift.click());
 for(const label of ['背包','商店','图鉴']){
  const button=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label);
  expect(button,label).toBeTruthy();await act(async()=>button!.click());
  expect(document.querySelector('[role="dialog"]'),label).toBeTruthy();
  if(label==='背包'){
   expect(document.querySelector('.inventory-career-record')).toBeNull();
   expect(document.querySelector('[role="dialog"]')!.textContent).not.toContain('本局记录');
   expect(document.querySelector('.inventory-home-button')!.textContent).toContain('保存并返回首页');
  }
  const close=document.querySelector<HTMLButtonElement>('[aria-label="关闭面板"]')??document.querySelector<HTMLButtonElement>('[aria-label="关闭"]');
  expect(close,[...document.querySelectorAll('button')].map(b=>b.getAttribute('aria-label')||b.textContent).join('|')).toBeTruthy();await act(async()=>close!.click());
 }
});
it('shows button-only ad loading then applies exactly one heat reward',async()=>{
 useContract.getState().start();const store=useContract.getState();const player=store.state.players[0];
 store.act({type:'buy-equipment',id:store.state.commerce.shop.offers[0]});store.select(player.id);
 if(!useContract.getState().debug.mockRewardedAds)store.debugAct('mock-rewarded-ads');
 await act(async()=>mount(<RewardedAdButton reward="heat" playerId={player.id} label="加速火热"/>));
 const button=document.querySelector<HTMLButtonElement>('#root button')!;
 act(()=>button.click());expect(button.disabled).toBe(true);expect(button.textContent).toContain('加载中');expect(document.querySelector('[role="dialog"]')).toBeNull();
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,1100));});
 expect(useContract.getState().state.players.find(p=>p.id===player.id)!.heat).toBe(3);
 expect(useContract.getState().state.adRewards.heatMonth).toBe(useContract.getState().state.month);
});
it('month transition completes and releases its portal',async()=>{
 function Scene(){const [open,set]=useState(true);return open?<MonthTransitionDialog change={{from:9,to:10}} reduced onComplete={()=>set(false)}/>:<span>继续训练</span>;}
 await act(async()=>mount(<Scene/>));expect(document.querySelector('[role="dialog"]')).toBeTruthy();
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,1300));});
 expect(document.querySelector('[role="dialog"]')).toBeNull();expect(document.querySelector('#root')!.textContent).toBe('继续训练');
});
