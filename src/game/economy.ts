import { config } from './config';
import { assetEffects, initialAssets } from './assets';
import { equipmentEffects } from './equipment';
import { statKeys, type AssetLevels, type Game, type Player } from './types';

export const rating = (player: Player) => statKeys.reduce((sum,key) => sum + player.stats[key],0) / statKeys.length;
export function saleBreakdown(player: Player, equipped: readonly string[] = [], levels: AssetLevels = initialAssets()) {
  const levelBonus = Math.min(config.economy.levelBonusCap, player.level * config.economy.levelBonus);
  const base = Math.min(config.economy.maximumSale, Math.max(config.economy.minimumSale, Math.round(rating(player) ** 3 * config.economy.valueMultiplier * (1 + levelBonus))));
  const bonusRate = Math.min(config.economy.saleBonusCap, equipmentEffects(equipped).saleBonus + assetEffects(levels).saleBonus);
  const total = Math.min(config.economy.maximumSale, Math.round(base * (1 + bonusRate)));
  return { base, bonusRate, bonus:total-base, total };
}
export const saleValue = (player: Player, equipped: readonly string[] = [], levels: AssetLevels = initialAssets()) => saleBreakdown(player,equipped,levels).total;
export const gameSaleValue = (game: Game, player: Player) => saleValue(player,game.equippedEquipment,game.assetLevels);
export const monthlyInterest = (game: Game) => game.debt === 0 ? 0 : Math.min(config.economy.debtCap-game.debt, Math.ceil(game.debt * config.economy.monthlyInterestRate));
export const requiredPayment = (game: Game) => Math.min(game.debt + monthlyInterest(game),config.economy.paymentCap,config.economy.firstPayment + (game.month-1)*config.economy.paymentGrowth);
export function monthPreview(game: Game) {
  const outgoing=[...game.recruits,...(game.activePlayer?[game.activePlayer]:[])];
  const saleIncome = outgoing.reduce((sum,player) => sum + gameSaleValue(game,player),0);
  const passiveIncome = assetEffects(game.assetLevels).monthlyIncome;
  const income = saleIncome + passiveIncome;
  const interest = monthlyInterest(game), debtBeforePayment = game.debt + interest, payment = requiredPayment(game);
  const availableCash = game.cash + income, canPay = availableCash >= payment;
  return { saleIncome, passiveIncome, income, interest, debtBeforePayment, payment, canPay,
    autoSales:outgoing.length, shortfall:Math.max(0,payment-availableCash),
    cashAfter:availableCash-(canPay ? payment : 0), debtAfter:debtBeforePayment-(canPay ? payment : 0),
    creditAfter:game.credit-(canPay ? 0 : 1), paid:canPay ? payment : 0 };
}
