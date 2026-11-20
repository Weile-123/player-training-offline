import {afterEach, expect, it, vi} from 'vitest';
import {createRoot, type Root} from 'react-dom/client';
import {act} from 'preact/test-utils';
import {newGym, playerLevelCap, requiredExperience, type GymPlayer, type GymState} from '../../src/game/gym/engine';
import {GymClubPanel} from '../../src/components/GymPanels';

let root: Root | null = null;
afterEach(() => {if (root) act(() => root!.unmount()); root = null;});

function state() {
  const game = newGym(1_800_000_000_000, 17);
  game.gymLevel = 8;
  game.credits = 100;
  game.player!.autoEnabled = true;
  return game;
}
function almostFinished(player: GymPlayer) {
  player.level = player.peakLevel = playerLevelCap - 1;
  player.experience = requiredExperience(player.level) - 1;
}
async function mount(game: GymState) {
  const action = vi.fn();
  root = createRoot(document.getElementById('root')!);
  await act(async () => root!.render(<GymClubPanel state={game} onAction={action}/>));
  const projects = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(tab => tab.textContent === '经营项目')!;
  await act(async () => projects.click());
  const toggle = document.querySelector<HTMLButtonElement>('[aria-label="查看离线课表详情"]');
  if (toggle) await act(async () => toggle.click());
  return action;
}
function advice() {return document.querySelector('[aria-label="离线升级收益预估"]')!;}
function offlineCard() {return [...document.querySelectorAll('.gm-project')].find(card => card.querySelector('h4')?.textContent === '离线课表')!;}

it('warns when all automatic athletes may finish before the current cap while leaving the real upgrade available', async () => {
  const game = state();
  almostFinished(game.player!);
  const action = await mount(game);
  expect(advice().textContent).toContain('升级花费 2 券，离线训练上限 30分钟 → 45分钟');
  expect(advice().textContent).toContain('1 名球员预计都可');
  expect(advice().textContent).toContain('延长时长不一定增加本批训练收益');
  expect(advice().textContent).toContain('实际经验结果会波动');
  const upgrade = offlineCard().querySelector('.gm-primary')!;
  expect(upgrade.disabled).toBe(false);
  await act(async () => upgrade.click());
  expect(action).toHaveBeenCalledExactlyOnceWith({type: 'upgrade-project', id: 'offline'});
  expect(game.projects.offline).toBe(0);
});

it('reports partial saturation across the roster rather than only the selected athlete', async () => {
  const game = state();
  almostFinished(game.player!);
  game.bench = [{...newGym(game.updatedAt, 23).player!, id: 'bench-2', autoEnabled: true}];
  await mount(game);
  expect(advice().textContent).toContain('2 名球员中，1 名预计可');
  expect(advice().textContent).toContain('延长时长主要帮助其余球员');
  expect(advice().textContent).not.toContain('预计都可');
});

it('shows the actual combined windows and explains the permanent project can free an extension slot', async () => {
  const game = state();
  almostFinished(game.player!);
  game.projects.offline = 4;
  game.ownedEquipment = ['relic_077'];
  game.equippedEquipment = ['relic_077'];
  await mount(game);
  expect(advice().textContent).toContain('升级花费 21 券，离线训练上限 3小时 → 4小时');
  expect(advice().textContent).toContain('项目永久生效，也适用于后续新人');
  expect(advice().textContent).toContain('可按需要换下离线加时器材');
});

it('explains why no automatic roster yields no current offline training without blocking a permanent purchase', async () => {
  const game = state();
  game.player!.autoEnabled = false;
  await mount(game);
  expect(advice().textContent).toContain('当前没有开启自动的球员');
  expect(advice().textContent).not.toContain('预计都可');
  expect(offlineCard().querySelector('.gm-primary')!.disabled).toBe(false);
});

it('does not present an upgrade forecast when the project is already maxed', async () => {
  const game = state();
  game.projects.offline = 5;
  await mount(game);
  expect(advice()).toBeNull();
  expect(offlineCard().querySelector('.gm-primary')!.disabled).toBe(true);
});
