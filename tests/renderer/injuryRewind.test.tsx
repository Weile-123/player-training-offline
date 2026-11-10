import {afterEach,it,expect,vi} from 'vitest';
import {createRoot} from 'react-dom/client';
import {act} from 'preact/test-utils';
import ContractGame from '../../src/components/ContractGame';
import {useContract} from '../../src/contractStore';
import {dispatch,newContract} from '../../src/game/contract/engine';
const scene=vi.hoisted(()=>({props:null as null|{shots:{id:number;outcome:string}[];onFinish:(id?:number)=>void}}));
vi.mock('../../src/components/ShotScene',()=>({ShotScene:(props:NonNullable<typeof scene.props>)=>{scene.props=props;return null;}}));
let root:ReturnType<typeof createRoot>;
afterEach(()=>{if(root)act(()=>root.unmount());vi.unstubAllGlobals();});
function mount(stopwatches:number,adUsed:boolean,reduced=true,outcome='severe'){
 Object.defineProperty(document,'fonts',{configurable:true,value:{ready:Promise.resolve()}});
 Element.prototype.animate=vi.fn(()=>({cancel(){}})) as unknown as typeof Element.prototype.animate;
 Element.prototype.getAnimations=()=>[];
 for(let seed=1;seed<1000;seed++){
  const state=newContract(seed);state.careerId='injury-ui-test';state.commerce.shop.giftAvailable=false;
  state.players[0].level=20;state.players[0].peakLevel=20;state.commerce.inventory.item_002=stopwatches;
  if(adUsed)state.adRewards!.injuryUsed=['p1'];
  if(!dispatch(state,state.revision,{type:'train',playerId:'p1'}).events.some(e=>e.type==='shot'&&e.outcome===outcome))continue;
  useContract.setState({state,hasSave:true,selectedId:'p1',restingIds:[],equipmentNotices:[],lastEvents:[],actionError:'',debug:{...useContract.getState().debug,noSevere:false}});
  vi.stubGlobal('matchMedia',()=>({matches:reduced,addEventListener(){},removeEventListener(){}}));
  root=createRoot(document.getElementById('root')!);act(()=>root.render(<ContractGame onHome={()=>{}}/>));return;
 }
 throw Error('Missing severe injury fixture');
}
const click=(selector:string)=>{const button=document.querySelector<HTMLButtonElement>(selector);expect(button,selector).toBeTruthy();act(()=>button!.click());};
it.each([false,true])('automatically offers and consumes one stopwatch even if the ad was used: %s',used=>{
 mount(2,used);click('.dock-shoot');
 expect(document.querySelector('.injury-rewind-dialog')).toBeTruthy();expect(document.querySelector('.injury-rewind-ad-limit')).toBeNull();
 expect(useContract.getState().state.commerce.inventory.item_002).toBe(2);
 click('.injury-rewind-stopwatch');
 expect(document.querySelector('.injury-rewind-dialog')).toBeNull();expect(useContract.getState().state.commerce.inventory.item_002).toBe(1);
 expect(useContract.getState().selectedId).toBe('p1');expect(useContract.getState().state.players.some(p=>p.id==='p1')).toBe(true);
 expect(useContract.getState().state.adRewards?.injuryUsed).toEqual(used?['p1']:[]);
});
it('dismisses the stopwatch offer without spending it or falling through to an ad dialog',()=>{
 mount(1,false);click('.dock-shoot');click('.injury-rewind-dismiss');
 expect(document.querySelector('.injury-rewind-dialog')).toBeNull();expect(useContract.getState().state.commerce.inventory.item_002).toBe(1);
 expect(useContract.getState().state.adRewards?.injuryUsed).toEqual([]);
});
it.each([false,true])('without a stopwatch, only shows the highlighted ad limit for an unused ad: used=%s',used=>{
 mount(0,used);click('.dock-shoot');
 if(used)expect(document.querySelector('.injury-rewind-dialog')).toBeNull();
 else{
  expect(document.querySelector('.injury-rewind-ad-limit')?.textContent).toBe('每名球员仅可用广告回溯一次');
  expect(document.querySelector('.injury-rewind-stopwatch')).toBeNull();
  expect(document.querySelector('.injury-rewind-actions .reward-ad-button')?.textContent).toContain('回溯并获得保护');
 }
});
it.each([{items:1,used:true,dialog:true},{items:0,used:false,dialog:true},{items:0,used:true,dialog:false}])('locks all interactions until the severe shot finishes: %j',({items,used,dialog})=>{
 mount(items,used,false);click('.dock-shoot');
 const shot=scene.props!.shots.find(s=>s.outcome==='severe')!;expect(shot).toBeDefined();
 expect(document.querySelector('.injury-rewind-dialog')).toBeNull();expect(document.querySelector('.severe-shot-input-lock')).toBeTruthy();
 expect(document.querySelector<HTMLElement>('.game-viewport')!.inert).toBe(true);
 const state=useContract.getState().state;
 for(const button of document.querySelectorAll<HTMLButtonElement>('button'))act(()=>button.click());
 const portalButton=document.createElement('button'),clicked=vi.fn();portalButton.onclick=clicked;document.body.appendChild(portalButton);
 act(()=>portalButton.click());expect(clicked).not.toHaveBeenCalled();
 for(const type of ['pointerdown','touchstart','keydown']){
  const event=new Event(type,{bubbles:true,cancelable:true});portalButton.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);
 }
 expect(useContract.getState().state).toBe(state);expect(document.querySelector('[role="dialog"]')).toBeNull();
 act(()=>scene.props!.onFinish(-1));expect(document.querySelector('.severe-shot-input-lock')).toBeTruthy();
 act(()=>scene.props!.onFinish(shot.id));expect(document.querySelector('.severe-shot-input-lock')).toBeNull();
 expect(!!document.querySelector('.injury-rewind-dialog')).toBe(dialog);
 act(()=>portalButton.click());expect(clicked).toHaveBeenCalledOnce();portalButton.remove();
 if(dialog)click('.injury-rewind-dismiss');
 click('[aria-label="打开背包"]');expect(document.querySelector('.inventory-dialog')).toBeTruthy();
});
it('releases the lock and offers rewind when the animation reports a loading/rendering failure',()=>{
 mount(1,false,false);click('.dock-shoot');expect(document.querySelector('.severe-shot-input-lock')).toBeTruthy();
 act(()=>scene.props!.onFinish());expect(document.querySelector('.severe-shot-input-lock')).toBeNull();
 expect(document.querySelector('.injury-rewind-stopwatch')).toBeTruthy();
});
it.each(['success','great','hold','minor'])('keeps controls usable while a %s animation is playing',outcome=>{
 mount(1,false,false,outcome);click('.dock-shoot');
 expect(scene.props!.shots.some(s=>s.outcome===outcome)).toBe(true);expect(document.querySelector('.severe-shot-input-lock')).toBeNull();
 click('[aria-label="打开背包"]');expect(document.querySelector('.inventory-dialog')).toBeTruthy();
});
