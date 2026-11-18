import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createRoot,type Root} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {useState} from 'react';
import {GymCollectionPanel,GymRosterPanel,GymTrainingPanel} from '../../src/components/GymPanels';
import {GymCooperationPanel} from '../../src/components/GymCooperationPanel';
import {GymRecruitmentControls} from '../../src/components/GymRecruitmentControls';
import {GymPlayerDetails} from '../../src/components/GymPlayerDetails';
import {ComicDialog} from '../../src/components/ComicDialog';
import {equipmentCatalog} from '../../src/game/gym/catalog';
import {newGym} from '../../src/game/gym/engine';
import {resetGymFirstVisitTutorials} from '../../src/presentation/gymFeatureTutorialPreference';

let root:Root|undefined;
beforeEach(()=>{Object.defineProperty(document,'fonts',{configurable:true,value:{ready:Promise.resolve()}});resetGymFirstVisitTutorials();});
afterEach(()=>{if(root)act(()=>root!.unmount());root=undefined;});
const stateAt=(level:number)=>({...newGym(1_800_000_000_000,17),gymLevel:level});
async function mount(content:React.ReactNode,wrap=true){root=createRoot(document.getElementById('root')!);await act(async()=>root!.render(wrap?<ComicDialog title="测试" onClose={()=>{}}>{content}</ComicDialog>:content));}
async function click(button:HTMLButtonElement){await act(async()=>button.click());}

it('makes planning and cooperation available at level one without level-lock masks',async()=>{
 const state=stateAt(1),action=vi.fn();
 await mount(<><GymRosterPanel state={state} onAction={action} tutorialEnabled={false}/><GymTrainingPanel state={state} onAction={action} tutorialEnabled={false}/><GymCooperationPanel state={state} onAction={action} tutorialEnabled={false}/></>);
 expect(document.querySelector('.gm-roster-plan')).toBeTruthy();
 expect(document.querySelector('.gm-feature-locked')).toBeNull();
 expect(document.querySelector('.gm-plan-grid')).toBeTruthy();
 expect(document.querySelector('.gm-cooperation-list')).toBeTruthy();
 expect(action).not.toHaveBeenCalled();
});

it('guides the first roster planning and cooperation visits without showing either close button',async()=>{
 const state=stateAt(1),action=vi.fn();
 function Scene(){const[active,setActive]=useState(false);return <ComicDialog title="测试名册" dismissible={!active} onClose={()=>{}}><GymRosterPanel state={state} onAction={action} onTutorialActiveChange={setActive}/></ComicDialog>;}
 await mount(<Scene/>,false);
 await click(document.querySelector<HTMLButtonElement>('.gm-roster-plan')!);
 expect(document.querySelector('.gym-tutorial-spotlight')?.getAttribute('data-step')).toBe('feature-training-1');
 expect(document.querySelector('[aria-label="关闭面板"]')).toBeNull();
 expect(document.querySelector('.tutorial-skip')).toBeNull();
 await click(document.querySelector<HTMLButtonElement>('.tutorial-next')!);
 expect(document.querySelector('.gym-tutorial-spotlight')?.getAttribute('data-step')).toBe('feature-training-2');
 await click(document.querySelector<HTMLButtonElement>('.tutorial-next')!);
 expect(document.querySelector('.gym-tutorial-spotlight')).toBeNull();
 expect(document.querySelectorAll('[aria-label="关闭面板"]')).toHaveLength(2);
 const cooperation=document.querySelector<HTMLButtonElement>('[aria-label="球员培养分页"] [data-tab-index="1"]')!;
 expect(cooperation.disabled).toBe(false);await click(cooperation);
 expect(document.querySelector('.gym-tutorial-spotlight')?.getAttribute('data-step')).toBe('feature-cooperation-1');
 expect(document.querySelector('[aria-label="关闭面板"]')).toBeNull();
 await click(document.querySelector<HTMLButtonElement>('.tutorial-next')!);
 expect(document.querySelector('.gym-tutorial-spotlight')).toBeNull();
 expect(action).not.toHaveBeenCalled();
});

it('offers all four height choices before selected admission unlocks',async()=>{
 const state=stateAt(1),action=vi.fn();state.player=null;
 await mount(<GymRecruitmentControls state={state} onAction={action}/>);
 const choices=[...document.querySelectorAll<HTMLButtonElement>('.gm-recruit-height button')];
 expect(choices).toHaveLength(4);
 expect(choices[0].getAttribute('aria-pressed')).toBe('true');
 expect(document.querySelector('.gm-recruitment-modes')).toBeNull();
 expect(document.body.textContent).not.toContain('新人免费入馆');
 expect(document.body.textContent).not.toContain('精选招生');
 await click(choices[3]);await click(document.querySelector<HTMLButtonElement>('.gm-recruit-submit')!);
 expect(action).toHaveBeenCalledWith(expect.objectContaining({type:'recruit',preference:'center'}));
});

it('opens selected admission at level four',async()=>{
 const state=stateAt(4);state.credits=8;
 await mount(<GymRecruitmentControls state={state} onAction={()=>{}}/>);
 const selected=[...document.querySelectorAll<HTMLButtonElement>('.gm-recruitment-modes button')].find(button=>button.textContent?.includes('精选招生'))!;
 expect(selected.disabled).toBe(false);await click(selected);
 expect(document.querySelector('[aria-label="精选招生方向"]')).toBeTruthy();
});

it('sorts equipment by increasing rarity and keeps unknown entries inert',async()=>{
 const state=stateAt(1),action=vi.fn(),known=equipmentCatalog.find(item=>item.rarity==='rare')!;
 state.collectedEquipment[known.id]={firstAt:state.updatedAt};
 await mount(<GymCollectionPanel state={state} onAction={action} initialTab={1}/>);
 const cards=[...document.querySelectorAll<HTMLButtonElement>('.equipment-album-card')];
 const order={common:0,rare:1,legendary:2};
 const ranks=cards.map(card=>order[equipmentCatalog.find(item=>item.id===card.dataset.equipmentId)!.rarity]);
 expect(ranks).toEqual([...ranks].sort((a,b)=>a-b));
 const unknown=cards.find(card=>card.disabled)!;await click(unknown);
 expect(document.querySelector('.equipment-detail')).toBeNull();
 const unlocked=cards.find(card=>card.dataset.equipmentId===known.id)!;
 expect(unlocked.disabled).toBe(false);await click(unlocked);
 expect(document.querySelector('.equipment-detail h3')?.textContent).toBe(known.name);
 expect(action).not.toHaveBeenCalled();
});

it('keeps an empty-court roster selection available and hides locked profile course records',async()=>{
 const state=stateAt(2),action=vi.fn();
 await mount(<><GymRosterPanel state={state} onAction={action} selectedPlayerId={null} tutorialEnabled={false}/><GymPlayerDetails player={state.player!} showCourses={false}/></>);
 const select=document.querySelector<HTMLButtonElement>('.contract-roster-actions > button')!;
 expect(select.disabled).toBe(false);await click(select);
 expect(action).toHaveBeenCalledWith({type:'select-player',id:state.player!.id});
 expect(document.querySelector('.gm-profile-training')).toBeNull();
 expect(document.querySelector('.gm-profile-record')?.textContent).not.toContain('完成课程');
});
