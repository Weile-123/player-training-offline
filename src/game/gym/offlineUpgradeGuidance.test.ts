import {describe, expect, it} from 'vitest';
import {newGym, requiredExperience, type GymPlayer} from './engine';
import {offlineUpgradeGuidance} from './offlineUpgradeGuidance';

const minute = 60_000;
function state() {
  const result = newGym(1_800_000_000_000, 17);
  result.gymLevel = 8;
  result.player!.autoEnabled = true;
  return result;
}
function almostFinished(player: GymPlayer) {
  player.level = player.peakLevel = 98;
  player.experience = requiredExperience(98) - 1;
}

describe('offline project upgrade guidance', () => {
  it('uses the charged next-tier price and combined project/equipment windows without changing the game', () => {
    const game = state();
    game.projects.offline = 4;
    game.ownedEquipment = ['relic_077'];
    game.equippedEquipment = ['relic_077'];
    const before = JSON.stringify(game);
    const advice = offlineUpgradeGuidance(game)!;
    expect(advice.price).toBe(21);
    expect(advice.currentLimitMs).toBe(180 * minute);
    expect(advice.nextLimitMs).toBe(240 * minute);
    expect(advice.hasExtensionEquipment).toBe(true);
    expect(JSON.stringify(game)).toBe(before);
  });

  it('distinguishes all, some and no automatic athletes expected to finish within the current window', () => {
    const game = state();
    const freshman = {...newGym(game.updatedAt, 23).player!, id: 'bench-2', autoEnabled: true};
    almostFinished(game.player!);
    expect(offlineUpgradeGuidance(game)).toMatchObject({automaticPlayers: 1, predictedFinishedWithinCurrent: 1});
    game.bench = [freshman];
    expect(offlineUpgradeGuidance(game)).toMatchObject({automaticPlayers: 2, predictedFinishedWithinCurrent: 1});
    almostFinished(freshman);
    expect(offlineUpgradeGuidance(game)).toMatchObject({automaticPlayers: 2, predictedFinishedWithinCurrent: 2});
    game.player = newGym(game.updatedAt, 29).player;
    game.player!.autoEnabled = true;
    game.bench = [];
    expect(offlineUpgradeGuidance(game)).toMatchObject({automaticPlayers: 1, predictedFinishedWithinCurrent: 0});
  });

  it('ignores manual athletes and checks the bench even when there is no selected player', () => {
    const game = state();
    almostFinished(game.player!);
    const freshman = {...newGym(game.updatedAt, 23).player!, id: 'bench-2', autoEnabled: false};
    game.bench = [freshman];
    expect(offlineUpgradeGuidance(game)).toMatchObject({automaticPlayers: 1, predictedFinishedWithinCurrent: 1});
    game.bench = [game.player!];
    game.player = null;
    expect(offlineUpgradeGuidance(game)).toMatchObject({automaticPlayers: 1, predictedFinishedWithinCurrent: 1});
    game.bench[0].autoEnabled = false;
    expect(offlineUpgradeGuidance(game)).toMatchObject({automaticPlayers: 0, predictedFinishedWithinCurrent: 0});
  });

  it('includes the last shot exactly at the current cap and distinguishes completion in the extended window', () => {
    const game = state();
    almostFinished(game.player!);
    game.player!.nextShotAt = game.updatedAt + 30 * minute;
    expect(offlineUpgradeGuidance(game)).toMatchObject({predictedFinishedWithinCurrent: 1, predictedFinishedWithinNext: 1});
    game.player!.nextShotAt++;
    expect(offlineUpgradeGuidance(game)).toMatchObject({predictedFinishedWithinCurrent: 0, predictedFinishedWithinNext: 1});
  });

  it('only advises a genuinely available upgrade, excluding gym locks and the project maximum', () => {
    const game = state();
    game.gymLevel = 1;
    expect(offlineUpgradeGuidance(game)).toBeNull();
    game.gymLevel = 2;
    game.projects.offline = 1;
    expect(offlineUpgradeGuidance(game)).toBeNull();
    game.gymLevel = 8;
    game.projects.offline = 5;
    expect(offlineUpgradeGuidance(game)).toBeNull();
  });
});
