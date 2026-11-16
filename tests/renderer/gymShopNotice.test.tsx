import {afterEach, beforeEach, expect, it} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {newGym, type GymState} from '../../src/game/gym/engine';
import {equipmentCatalog} from '../../src/game/gym/catalog';
import {availableEquipmentForNotice, shopNoticeStorageKey, useGymShopNotice} from '../../src/presentation/gymShopNotice';
import {GymScoreboard} from '../../src/components/GymStatus';

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {localStorage.clear(); host = document.createElement('div'); document.body.append(host); root = createRoot(host);});
afterEach(() => {act(() => root.unmount()); host.remove();});

function Notice({state, open}: {state: GymState; open: boolean}) {
  const pending = useGymShopNotice(state, open);
  return <div>{pending && <i aria-label="新器材可购买"/>}</div>;
}
async function render(state: GymState, open = false) {await act(async () => root.render(<Notice state={state} open={open}/>));}
const dot = () => host.querySelector('[aria-label="新器材可购买"]');

it('acknowledges available stock on shop entry and only alerts again for newly unlocked equipment', async () => {
  const state = newGym(1800000000000, 30);
  expect(state.credits).toBe(0);
  await render(state);
  expect(dot()).toBeTruthy();
  await render(state, true);
  expect(dot()).toBeNull();
  await render({...state, credits: 100});
  expect(dot()).toBeNull();
  const upgraded = {...state, gymLevel: 2};
  await render(upgraded);
  expect(dot()).toBeTruthy();
  await render(upgraded, true);
  await render(upgraded);
  expect(dot()).toBeNull();
});

it('persists acknowledgement across remounts but treats a newly opened gym independently', async () => {
  const state = newGym(1800000000000, 31);
  await render(state, true);
  expect(JSON.parse(localStorage.getItem(shopNoticeStorageKey(state))!)).toEqual(availableEquipmentForNotice(state));
  await act(async () => root.render(null));
  await render(state);
  expect(dot()).toBeNull();
  await render(newGym(state.createdAt + 1, 31));
  expect(dot()).toBeTruthy();
});

it('respects collection unlocks, excludes owned stock and never makes a seen item new when it is sold', async () => {
  const state = {...newGym(1800000000000, 32), gymLevel: 8};
  const locked = equipmentCatalog.find(item => item.requiredTemplates > 0)!;
  expect(availableEquipmentForNotice(state)).not.toContain(locked.id);
  await render(state, true);
  state.collection = Object.fromEntries(Array.from({length: 8}, (_, index) => [`template-${index}`, {firstAt: state.createdAt, highestRating: 40, highestValue: '320'}]));
  await render({...state});
  expect(dot()).toBeTruthy();
  await render(state, true);
  await render({...state, ownedEquipment: [locked.id]});
  expect(availableEquipmentForNotice({...state, ownedEquipment: [locked.id]})).not.toContain(locked.id);
  await render({...state, ownedEquipment: []});
  expect(dot()).toBeNull();
});

it('acknowledges unlocks while the shop stays open and tolerates malformed stored data', async () => {
  const state = newGym(1800000000000, 33);
  localStorage.setItem(shopNoticeStorageKey(state), '{broken');
  await render(state, true);
  await render({...state, gymLevel: 2}, true);
  await render({...state, gymLevel: 2});
  expect(dot()).toBeNull();
});

it('renders the approved combined scoreboard with the gym level over its name and both live navigation actions', async () => {
  const state = {...newGym(1800000000000, 34), gymLevel: 3, fame: 1280};
  let club = 0, roster = 0;
  await act(async () => root.render(<GymScoreboard state={state} onClub={() => club++} onPlayer={() => roster++}/>));
  expect(host.querySelector('.gym-score-medal b')?.textContent).toBe('03');
  expect(host.querySelector('.gym-score-medal small')).toBeNull();
  expect(host.querySelector('.gym-score-identity')?.textContent).toBe('球馆等级 3城区训练馆');
  expect(host.querySelector('.gym-score-top')?.textContent).not.toContain('经营');
  const rosterButton = host.querySelector<HTMLButtonElement>('[aria-label="打开球员名册"]')!;
  expect(rosterButton.querySelector('span')?.textContent).toBe('球员');
  expect(rosterButton.textContent).not.toContain('球员名册');
  const arrows = [...host.querySelectorAll<SVGElement>('.gym-score-actions .gym-score-chevron')];
  expect(arrows).toHaveLength(2);
  expect(arrows.map(arrow => arrow.tagName.toLowerCase())).toEqual(['svg', 'svg']);
  expect(arrows[0].getAttribute('viewBox')).toBe(arrows[1].getAttribute('viewBox'));
  expect(arrows[0].querySelector('path')?.getAttribute('d')).toBe(arrows[1].querySelector('path')?.getAttribute('d'));
  expect(host.querySelector('.gym-score-actions i')).toBeNull();
  expect(host.querySelector('.gym-score-progress')?.textContent).toContain('1,280');
  expect(host.querySelector('.gym-score-metrics>span')?.textContent).toBe('声望');
  expect(host.querySelector('.gym-score-progress')?.textContent).not.toContain('还差');
  expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('1280');
  await act(async () => {host.querySelector<HTMLButtonElement>('.gym-score-medal')!.click(); host.querySelector<HTMLButtonElement>('[aria-label="查看球馆"]')!.click(); host.querySelector<HTMLButtonElement>('[aria-label="打开球员名册"]')!.click();});
  expect([club, roster]).toEqual([2, 1]);
});
